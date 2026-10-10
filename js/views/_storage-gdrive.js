// ============================================================================
// _storage-gdrive.js — magazyn „Dysk Google terapeuty".
//
// UKŁAD NA DYSKU (wszystko zakłada aplikacja, na koncie zalogowanej osoby):
//
//   pacjenci/                              ← folder główny (można go przenieść
//     P001_Nazwisko_Imie/                     lub zmienić mu nazwę na Dysku)
//       P001_Nazwisko_Imie                 ← Arkusz Google pacjenta
//       dokumenty/                         ← załączniki (PDF, skany…)
//     P002_…/
//
// ARKUSZ PACJENTA = czytelne zakładki (Pacjent, Wizyty, Leki, …) + ukryta
// zakładka `_dane` z kompletnym dokumentem (patrz `_sheet-model.js`).
// Aplikacja czyta wyłącznie `_dane`; zakładki czytelne odświeża przy zapisie.
//
// PRYWATNOŚĆ: brak serwera aplikacji. Przeglądarka rozmawia bezpośrednio
// z Google. Zakres `drive.file` = dostęp tylko do plików utworzonych przez
// tę aplikację. Token dostępu żyje wyłącznie w pamięci karty (~1 h).
//
// LISTA PACJENTÓW bez otwierania arkuszy: podstawowe dane (kod, nazwisko,
// PESEL, ostatnia wizyta…) są zapisane we właściwościach pliku na Dysku
// (`appProperties`), więc start aplikacji to jedno zapytanie.
//
// Kontrakt taki sam jak `_storage-local.js`.
// ============================================================================

import { DRIVE_ROOT_FOLDER_NAME, googleEndpoints } from './_config.js';
import { googleAuth as auth, googleCall as call } from './_google-auth.js';
import { buildTabs, chunksToDoc, DATA_TAB } from './_sheet-model.js';
import { patientFolderName, patientSummary, parsePatientDoc, DOC_FORMAT, DOC_VERSION } from './_patient-doc.js';
import { StorageError } from './_storage-errors.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const DOCS_FOLDER = 'dokumenty';

/* ==========================================================================
   Pomocnicze
   ========================================================================== */

/** appProperties: maks. 124 bajty UTF-8 na parę klucz+wartość. */
function clipBytes(value, maxBytes) {
    let s = String(value == null ? '' : value);
    const enc = new TextEncoder();
    while (s && enc.encode(s).length > maxBytes) s = s.slice(0, -1);
    return s;
}

function indexProps(summary) {
    return {
        psyKind: 'patient',
        kod: clipBytes(summary.id, 40),
        imie: clipBytes(summary.imie, 100),
        nazwisko: clipBytes(summary.nazwisko, 100),
        pesel: clipBytes(summary.pesel, 40),
        tel: clipBytes(summary.telefon, 60),
        email: clipBytes(summary.email, 100),
        ur: clipBytes(summary.dataUrodzenia, 20),
        plec: clipBytes(summary.plec, 40),
        minor: summary.minor ? '1' : '',
        arch: summary.archived ? '1' : '',
        last: clipBytes(summary.lastVisit, 20),
        n: String(summary.visitCount || 0)
    };
}

function summaryFromProps(props) {
    const p = props || {};
    return {
        id: p.kod || '', kodPacjenta: p.kod || '',
        imie: p.imie || '', nazwisko: p.nazwisko || '', pesel: p.pesel || '',
        telefon: p.tel || '', email: p.email || '', dataUrodzenia: p.ur || '', plec: p.plec || '',
        minor: p.minor === '1', archived: p.arch === '1',
        lastVisit: p.last || '', visitCount: Number(p.n) || 0
    };
}

function sameProps(a, b) {
    const ka = Object.keys(a || {});
    return ka.length === Object.keys(b || {}).length && ka.every((k) => String(a[k]) === String((b || {})[k]));
}

function hashRows(rows) {
    const s = JSON.stringify(rows);
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return s.length + ':' + h;
}

function cellData(v) {
    if (v === '' || v == null) return {};
    if (typeof v === 'number' && isFinite(v)) return { userEnteredValue: { numberValue: v } };
    // stringValue = zawsze zwykły tekst (wpis zaczynający się od „=" nie stanie się formułą).
    return { userEnteredValue: { stringValue: String(v) } };
}

const rgb = (hex) => ({
    red: parseInt(hex.slice(0, 2), 16) / 255,
    green: parseInt(hex.slice(2, 4), 16) / 255,
    blue: parseInt(hex.slice(4, 6), 16) / 255
});

/** Jednorazowe formatowanie nowej zakładki (nagłówek, szerokości, zawijanie). */
function formatRequests(sheetId, tab) {
    if (tab.hidden) {
        return [{
            repeatCell: {
                range: { sheetId },
                cell: { userEnteredFormat: { wrapStrategy: 'CLIP' } },
                fields: 'userEnteredFormat.wrapStrategy'
            }
        }];
    }
    const reqs = [
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 1 },
                cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
                fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)'
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                    userEnteredFormat: {
                        backgroundColor: rgb('1F4E78'),
                        textFormat: { bold: true, foregroundColor: rgb('FFFFFF') },
                        wrapStrategy: 'WRAP',
                        verticalAlignment: 'MIDDLE'
                    }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)'
            }
        }
    ];
    tab.columns.forEach((c, i) => {
        reqs.push({
            updateDimensionProperties: {
                range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
                properties: { pixelSize: Math.round(c.width * 7 + 14) },
                fields: 'pixelSize'
            }
        });
    });
    return reqs;
}

/* ==========================================================================
   Magazyn
   ========================================================================== */

export function createGDriveBackend() {
    const E = googleEndpoints();

    let rootId = null;
    let rootProps = {};             // ustawienia aplikacji zapisane na folderze głównym
    let account = '';
    const tabMeta = new Map();      // spreadsheetId → Map(tytuł → { sheetId, rowCount, columnCount })
    const written = new Map();      // spreadsheetId → Map(tytuł → hash ostatnio zapisanych wierszy)
    const fresh = new Set();        // arkusze utworzone w tej sesji (wolno usunąć domyślną zakładkę)
    const created = new Map();      // kod pacjenta → ref pliku założonego w tej sesji

    async function driveList(q, fields) {
        const out = [];
        let pageToken = '';
        do {
            const url = E.drive + '/files?spaces=drive&pageSize=1000'
                + '&q=' + encodeURIComponent(q)
                + '&fields=' + encodeURIComponent('nextPageToken,files(' + fields + ')')
                + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
            const page = await call('GET', url);
            out.push(...(page.files || []));
            pageToken = page.nextPageToken || '';
        } while (pageToken);
        return out;
    }

    const driveCreate = (meta) => call('POST', E.drive + '/files?fields=id', { json: meta });
    const drivePatch = (id, meta) => call('PATCH', E.drive + '/files/' + encodeURIComponent(id) + '?fields=id', { json: meta });

    /* ---------------- folder główny ---------------- */
    async function ensureRoot() {
        if (rootId) return rootId;
        const found = await driveList(
            "mimeType='" + FOLDER_MIME + "' and trashed=false and appProperties has { key='psyKind' and value='root' }",
            'id,name,createdTime,appProperties');
        if (found.length) {
            found.sort((a, b) => String(a.createdTime || '').localeCompare(String(b.createdTime || '')));
            rootId = found[0].id;
            rootProps = found[0].appProperties || {};
        } else {
            rootId = (await driveCreate({
                name: DRIVE_ROOT_FOLDER_NAME,
                mimeType: FOLDER_MIME,
                appProperties: { psyKind: 'root' }
            })).id;
        }
        return rootId;
    }

    /* ---------------- zakładki arkusza ---------------- */
    async function loadTabMeta(spreadsheetId) {
        const r = await call('GET', E.sheets + '/' + encodeURIComponent(spreadsheetId) + '?fields='
            + encodeURIComponent('sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))'));
        const map = new Map();
        for (const s of (r.sheets || [])) {
            const p = s.properties || {};
            const g = p.gridProperties || {};
            map.set(p.title, { sheetId: p.sheetId, rowCount: g.rowCount || 0, columnCount: g.columnCount || 0 });
        }
        tabMeta.set(spreadsheetId, map);
        return map;
    }

    /** Jeden atomowy zapis: brakujące zakładki + powiększenie siatki + wartości. */
    async function writeTabs(spreadsheetId, tabs, retried = false) {
        const meta = tabMeta.get(spreadsheetId) || await loadTabMeta(spreadsheetId);
        const hashes = written.get(spreadsheetId) || new Map();
        const requests = [];
        const usedIds = new Set(Array.from(meta.values()).map((m) => m.sheetId));
        const newHashes = new Map();
        let nextId = 1000;

        for (const tab of tabs) {
            const needRows = tab.rows.length + 1;
            const needCols = tab.columns.length;
            let m = meta.get(tab.title);
            const isNew = !m;

            if (isNew) {
                while (usedIds.has(nextId)) nextId++;
                usedIds.add(nextId);
                m = { sheetId: nextId, rowCount: Math.max(needRows + 200, 500), columnCount: needCols };
                requests.push({
                    addSheet: {
                        properties: {
                            sheetId: m.sheetId,
                            title: tab.title,
                            hidden: !!tab.hidden,
                            gridProperties: {
                                rowCount: m.rowCount,
                                columnCount: m.columnCount,
                                frozenRowCount: tab.hidden ? 0 : 1
                            }
                        }
                    }
                });
                requests.push(...formatRequests(m.sheetId, tab));
                meta.set(tab.title, m);
            } else {
                if (m.rowCount < needRows) {
                    const add = needRows - m.rowCount + 500;
                    requests.push({ appendDimension: { sheetId: m.sheetId, dimension: 'ROWS', length: add } });
                    m.rowCount += add;
                }
                if (m.columnCount < needCols) {
                    const add = needCols - m.columnCount;
                    requests.push({ appendDimension: { sheetId: m.sheetId, dimension: 'COLUMNS', length: add } });
                    m.columnCount += add;
                }
            }

            const header = tab.columns.map((c) => c.label);
            const allRows = [header, ...tab.rows];
            const h = hashRows(allRows);
            newHashes.set(tab.title, h);
            if (!isNew && hashes.get(tab.title) === h) continue;      // zakładka bez zmian

            // Zakres = cała zakładka: komórki poza przesłanymi wierszami są czyszczone
            // (tylko wartości — formatowanie i szerokości zostają).
            requests.push({
                updateCells: {
                    range: { sheetId: m.sheetId },
                    fields: 'userEnteredValue',
                    rows: allRows.map((r) => ({ values: r.map(cellData) }))
                }
            });
        }

        // Świeżo utworzony arkusz ma domyślną pustą zakładkę („Arkusz1") — usuwamy ją.
        // W istniejących arkuszach NIE ruszamy zakładek dodanych ręcznie przez terapeutę.
        if (fresh.has(spreadsheetId)) {
            const ours = new Set(tabs.map((t) => t.title));
            for (const [title, m] of Array.from(meta.entries())) {
                if (!ours.has(title)) {
                    requests.push({ deleteSheet: { sheetId: m.sheetId } });
                    meta.delete(title);
                }
            }
        }

        if (!requests.length) return;
        try {
            await call('POST', E.sheets + '/' + encodeURIComponent(spreadsheetId) + ':batchUpdate', { json: { requests } });
            fresh.delete(spreadsheetId);
            written.set(spreadsheetId, newHashes);
        } catch (e) {
            // Ktoś zmienił układ arkusza ręcznie (usunięta zakładka, mniej wierszy) —
            // odczytujemy stan faktyczny i próbujemy jeszcze raz.
            tabMeta.delete(spreadsheetId);
            written.delete(spreadsheetId);
            if (!retried && e.status === 400) return writeTabs(spreadsheetId, tabs, true);
            throw e;
        }
    }

    /* ---------------- załączniki ---------------- */
    async function docsFolderId(ref, create) {
        if (ref.docsId) return ref.docsId;
        const found = await driveList(
            "'" + ref.folderId + "' in parents and name='" + DOCS_FOLDER + "' and mimeType='" + FOLDER_MIME + "' and trashed=false",
            'id');
        if (found.length) ref.docsId = found[0].id;
        else if (create) {
            ref.docsId = (await driveCreate({ name: DOCS_FOLDER, mimeType: FOLDER_MIME, parents: [ref.folderId] })).id;
        }
        return ref.docsId || null;
    }

    function requireSaved(ref) {
        if (!ref || !ref.folderId) throw new StorageError('io', 'Pacjent nie został jeszcze zapisany na Dysku.');
    }

    /* ---------------- API magazynu ---------------- */
    return {
        kind: 'gdrive',
        get label() { return account ? 'Google Drive · ' + account : 'Google Drive'; },
        get account() { return account; },
        saveDebounceMs: 2500,

        /** Logowanie (wymaga kliknięcia użytkownika) + przygotowanie folderu głównego. */
        async connect({ loginHint } = {}) {
            auth.setLoginHint(loginHint);
            auth.invalidate();
            await auth.getToken();
            try {
                const about = await call('GET', E.drive + '/about?fields=' + encodeURIComponent('user(emailAddress)'));
                account = (about && about.user && about.user.emailAddress) || '';
                if (account) auth.setLoginHint(account);
            } catch (_) { /* adres konta jest tylko informacją na pasku */ }
            await ensureRoot();
        },

        /** Odnowienie sesji po kliknięciu „Połącz ponownie". */
        async reauthorize() {
            auth.invalidate();
            await auth.getToken();
        },

        signOut() { auth.signOut(); },

        /** Drobne ustawienia aplikacji (np. identyfikator kalendarza) — na folderze głównym,
         *  żeby były wspólne dla wszystkich urządzeń terapeuty. */
        async getSetting(key) {
            await ensureRoot();
            return rootProps['cfg_' + key] || '';
        },
        async setSetting(key, value) {
            await ensureRoot();
            rootProps['cfg_' + key] = value;
            await drivePatch(rootId, { appProperties: { ['cfg_' + key]: value } });
        },

        async listPatients() {
            await ensureRoot();
            const files = await driveList(
                "mimeType='" + SHEET_MIME + "' and trashed=false and appProperties has { key='psyKind' and value='patient' }",
                'id,name,parents,appProperties');
            return files
                .filter((f) => f.appProperties && f.appProperties.kod)
                .map((f) => ({
                    ref: { sheetId: f.id, folderId: (f.parents && f.parents[0]) || null, name: f.name, props: f.appProperties },
                    summary: summaryFromProps(f.appProperties)
                }));
        },

        async loadPatient(ref) {
            const range = encodeURIComponent("'" + DATA_TAB + "'!A2:A");
            let chunks = [];
            try {
                const r = await call('GET', E.sheets + '/' + encodeURIComponent(ref.sheetId) + '/values/' + range
                    + '?majorDimension=COLUMNS&valueRenderOption=UNFORMATTED_VALUE');
                chunks = (r.values && r.values[0]) || [];
            } catch (e) {
                // 400 = w arkuszu nie ma zakładki `_dane` (np. zapis przerwany tuż po utworzeniu pliku)
                if (e.status !== 400) throw e;
            }
            if (!chunks.join('').trim()) {
                const s = summaryFromProps(ref.props);
                if (s.visitCount === 0) {
                    // Arkusz dopiero założony, nic w nim jeszcze nie było — odtwarzamy kartę z indeksu.
                    return parsePatientDoc({
                        format: DOC_FORMAT, version: DOC_VERSION,
                        patient: {
                            id: s.id, imie: s.imie, nazwisko: s.nazwisko, pesel: s.pesel, telefon: s.telefon,
                            email: s.email, dataUrodzenia: s.dataUrodzenia, plec: s.plec,
                            minor: s.minor, archived: s.archived
                        },
                        visits: [], recommendations: [], tests: []
                    });
                }
                throw new StorageError('format',
                    'Arkusz pacjenta nie zawiera danych aplikacji (zakładka „' + DATA_TAB + '" jest pusta lub usunięta).');
            }
            try {
                return chunksToDoc(chunks);
            } catch (e) {
                throw new StorageError('format', 'Nie udało się odczytać danych z arkusza pacjenta: ' + (e && e.message || e));
            }
        },

        async savePatient(doc, existingRef) {
            await ensureRoot();
            const summary = patientSummary(doc);
            const name = patientFolderName(doc.patient);
            const props = indexProps(summary);
            // Jeśli poprzednia próba założyła już pliki, ale pierwszy zapis się nie udał,
            // używamy ich ponownie — inaczej ponowienie stworzyłoby duplikat pacjenta.
            let ref = existingRef || created.get(doc.patient.id) || null;
            let renamed = false;

            if (!ref) {
                const folder = await driveCreate({
                    name, mimeType: FOLDER_MIME, parents: [rootId],
                    appProperties: { psyKind: 'patientFolder', kod: props.kod }
                });
                const sheet = await driveCreate({
                    name, mimeType: SHEET_MIME, parents: [folder.id], appProperties: props
                });
                ref = { sheetId: sheet.id, folderId: folder.id, name, props };
                fresh.add(sheet.id);
                created.set(doc.patient.id, ref);
            }

            await writeTabs(ref.sheetId, buildTabs(doc));

            // Indeks listy pacjentów + nazwy plików (tylko gdy coś się zmieniło).
            if (ref.name !== name) {
                await drivePatch(ref.sheetId, { name, appProperties: props });
                if (ref.folderId) await drivePatch(ref.folderId, { name });
                renamed = true;
            } else if (!sameProps(ref.props, props)) {
                await drivePatch(ref.sheetId, { appProperties: props });
            }
            return { ref: Object.assign({}, ref, { name, props }), renamed, label: name };
        },

        docs: {
            pathHint: (ref) => (ref && ref.name ? ref.name : '…') + '/' + DOCS_FOLDER + '/ (Dysk Google)',

            async list(ref) {
                if (!ref || !ref.folderId) return [];
                const id = await docsFolderId(ref, false);
                if (!id) return [];
                const files = await driveList("'" + id + "' in parents and trashed=false", 'id,name,size,modifiedTime');
                return files.map((f) => ({
                    id: f.id,
                    name: f.name,
                    size: Number(f.size) || 0,
                    lastModified: f.modifiedTime ? Date.parse(f.modifiedTime) : 0
                }));
            },

            async upload(ref, file) {
                requireSaved(ref);
                const id = await docsFolderId(ref, true);
                const form = new FormData();
                form.append('metadata', new Blob(
                    [JSON.stringify({ name: file.name, parents: [id] })], { type: 'application/json' }));
                form.append('file', file);
                const r = await call('POST', E.upload + '/files?uploadType=multipart&fields=id,name', { body: form });
                return { name: (r && r.name) || file.name, size: file.size };
            },

            /** Usunięcie = przeniesienie do Kosza na Dysku (można przywrócić przez 30 dni). */
            async remove(ref, entry) {
                await drivePatch(entry.id, { trashed: true });
                return true;
            },

            async rename(ref, entry, newName) {
                await drivePatch(entry.id, { name: newName });
                return true;
            },

            async blobUrl(ref, entry) {
                const blob = await call('GET', E.drive + '/files/' + encodeURIComponent(entry.id) + '?alt=media',
                    { expect: 'blob' });
                return URL.createObjectURL(blob);
            }
        }
    };
}
