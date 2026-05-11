// ============================================================================
// _local-folder-store.js — operacje na folderze lokalnym z plikami pacjentów.
//
// Paczka K2 (2026-05-11):
//   Cienka warstwa nad `_folder-handle.js` + `_xlsx-codec.js`, oferująca
//   CRUD na pacjentach jako plikach XLSX w strukturze:
//
//     {rootHandle = wybrany folder, np. „pacjenci"}
//       ├── P001_Bogusz_Michał/
//       │   ├── pacjent.xlsx
//       │   └── dokumenty/    (tworzony przy uploadzie w K4)
//       ├── P002_Janas_Katarzyna/
//       │   └── pacjent.xlsx
//       └── …
//
// Kontrakt API:
//   scanPatientFolders(rootHandle)
//     → Promise<Array<{kod, folderName, folderHandle, ...metadata}>>
//
//   loadPatient(rootHandle, folderName)
//     → Promise<FullPatient | null>
//
//   savePatient(rootHandle, fullPatient)
//     → Promise<{folderName, folderHandle}>
//
//   deletePatientFolder(rootHandle, folderName)
//     → Promise<boolean>
//
// Czyste funkcje — bez Store. Store wywołuje te funkcje w paczce K3.
// ============================================================================

import {
    readBinaryFile,
    writeBinaryFile,
    ensureSubfolder,
    openSubfolder,
    listSubfolders,
    deleteEntry,
    listFiles
} from './_folder-handle.js';

import {
    writePatientWorkbook,
    readPatientWorkbook
} from './_xlsx-codec.js';

import { patientFolderName } from './_storage-format.js';

/** Nazwa pliku z danymi pacjenta wewnątrz subfolderu. */
const PATIENT_FILE = 'pacjent.xlsx';

/** Nazwa podfolderu z załącznikami (PR-K4). */
const DOCUMENTS_FOLDER = 'dokumenty';


// ============================================================================
// SCAN — szybki przegląd całego folderu pacjentów
// ============================================================================

/**
 * Skanuje folder root i zwraca listę „lekkich" metadanych pacjentów.
 * Otwiera każdy subfolder `{KOD}_{Naz}_{Imię}/pacjent.xlsx`, parsuje TYLKO
 * zakładkę Pacjent i wyciąga klucze do listy startowej.
 *
 * Pominięte subfoldery:
 *   - bez `pacjent.xlsx` (np. ręcznie utworzony pusty folder)
 *   - zaczynające się od `_` (zarezerwowane np. `_archive/`, `_backup/`)
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @returns {Promise<Array<{kod, folderName, folderHandle, imie, nazwisko, pesel,
 *                          telefon, email, dataUrodzenia, archived, lastModified}>>}
 */
export async function scanPatientFolders(rootHandle) {
    if (!rootHandle) return [];
    const subfolders = await listSubfolders(rootHandle);
    const results = [];

    for (const { name, handle } of subfolders) {
        if (name.startsWith('_')) continue;   // zarezerwowane

        try {
            const buf = await readBinaryFile(handle, PATIENT_FILE);
            if (!buf) {
                console.warn('[scanPatientFolders] brak pacjent.xlsx w', name);
                continue;
            }

            const full = readPatientWorkbook(buf);
            const p = full.patient || {};

            // Wyciągnij ostatnią modyfikację z systemu plików (lastModified)
            let lastModified = 0;
            try {
                const fh = await handle.getFileHandle(PATIENT_FILE);
                const file = await fh.getFile();
                lastModified = file.lastModified;
            } catch (_) { /* ignore */ }

            results.push({
                kod: p.id || _parseKodFromFolderName(name),
                folderName: name,
                folderHandle: handle,
                imie: p.imie || '',
                nazwisko: p.nazwisko || '',
                pesel: p.pesel || '',
                telefon: p.telefon || '',
                email: p.email || '',
                dataUrodzenia: p.dataUrodzenia || '',
                archived: p.archived === true,
                lastModified
            });
        } catch (e) {
            console.warn('[scanPatientFolders] błąd parsowania', name, e);
            // best-effort: pomijamy zepsute pliki, ale dodajemy szkielet wiersza,
            // żeby pacjent nie zniknął z listy.
            results.push({
                kod: _parseKodFromFolderName(name),
                folderName: name,
                folderHandle: handle,
                imie: '(błąd odczytu)',
                nazwisko: name,
                pesel: '',
                telefon: '',
                email: '',
                dataUrodzenia: '',
                archived: false,
                lastModified: 0,
                _parseError: String(e && e.message || e)
            });
        }
    }

    // Sortuj po kodzie (P001 < P002 < ...)
    results.sort((a, b) => (a.kod || '').localeCompare(b.kod || ''));
    return results;
}

/** Wyciąga prefiks kodu z nazwy folderu (`P001_Bogusz_Michal` → `P001`). */
function _parseKodFromFolderName(folderName) {
    const m = String(folderName).match(/^([A-Z]\d+)_/);
    return m ? m[1] : folderName;
}


// ============================================================================
// LOAD — pełen odczyt pacjenta z dysku
// ============================================================================

/**
 * Ładuje pełen `FullPatient` z folderu pacjenta.
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} folderName  — nazwa subfolderu (np. „P001_Bogusz_Michal")
 * @returns {Promise<FullPatient | null>}
 */
export async function loadPatient(rootHandle, folderName) {
    if (!rootHandle || !folderName) return null;
    const sub = await openSubfolder(rootHandle, folderName);
    if (!sub) {
        console.warn('[loadPatient] brak folderu', folderName);
        return null;
    }
    const buf = await readBinaryFile(sub, PATIENT_FILE);
    if (!buf) {
        console.warn('[loadPatient] brak pacjent.xlsx w', folderName);
        return null;
    }
    try {
        return readPatientWorkbook(buf);
    } catch (e) {
        console.error('[loadPatient] błąd parsowania', folderName, e);
        return null;
    }
}


// ============================================================================
// SAVE — zapis pełnego pacjenta do folderu
// ============================================================================

/**
 * Zapisuje pełnego pacjenta do `{rootHandle}/{folderName}/pacjent.xlsx`.
 * Tworzy folder pacjenta gdy nie istnieje.
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {object} fullPatient
 * @returns {Promise<{folderName, folderHandle} | null>}
 */
export async function savePatient(rootHandle, fullPatient) {
    if (!rootHandle || !fullPatient || !fullPatient.patient) return null;

    const folderName = patientFolderName(fullPatient.patient);
    const sub = await ensureSubfolder(rootHandle, folderName);
    if (!sub) {
        console.error('[savePatient] nie udało się utworzyć folderu', folderName);
        return null;
    }

    try {
        const buf = writePatientWorkbook(fullPatient);
        const ok = await writeBinaryFile(sub, PATIENT_FILE, buf);
        if (!ok) {
            console.error('[savePatient] writeBinaryFile fail', folderName);
            return null;
        }
        return { folderName, folderHandle: sub };
    } catch (e) {
        console.error('[savePatient]', folderName, e);
        return null;
    }
}


// ============================================================================
// MOVE / RENAME — gdy pacjent zmienia nazwisko/imię, folder powinien się zmienić.
// ============================================================================

/**
 * Sprawdza czy aktualna nazwa folderu zgadza się z `patientFolderName(patient)`.
 * Jeśli nie — kopiuje plik do nowego folderu i usuwa stary.
 *
 * File System Access API nie ma natywnego `rename`/`move`, więc robimy
 * copy + delete. Operacja best-effort: gdy się nie uda, zostaje stary folder.
 *
 * F5.3 (2026-05-11): kopiuje również podfolder `dokumenty/` (załączniki
 * pacjenta) — żeby zmiana nazwiska nie kasowała PDF-ów / skanów wgranych
 * w widoku Dokumenty (paczka K4).
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} oldFolderName
 * @param {object} fullPatient   — pacjent z aktualnymi danymi
 * @returns {Promise<{folderName, folderHandle, renamed} | null>}
 */
export async function renamePatientFolderIfNeeded(rootHandle, oldFolderName, fullPatient) {
    const expectedName = patientFolderName(fullPatient.patient);
    if (oldFolderName === expectedName) {
        // Nazwa OK — zwracamy standardowy zapis
        const saved = await savePatient(rootHandle, fullPatient);
        return saved ? { ...saved, renamed: false } : null;
    }

    // Konflikt: nowa nazwa już istnieje? (rzadkie — ten sam KOD u 2 pacjentów)
    const oldHandle = await openSubfolder(rootHandle, oldFolderName);
    const newAlreadyExists = (await openSubfolder(rootHandle, expectedName)) !== null;
    if (newAlreadyExists && oldHandle) {
        console.warn('[renamePatientFolderIfNeeded] folder docelowy już istnieje:', expectedName);
        // Nie nadpisuj — zapisz do starego folderu i zostaw nazwę
        const saved = await savePatient(rootHandle, { ...fullPatient,
            patient: { ...fullPatient.patient, _folderName: oldFolderName } });
        return saved ? { ...saved, renamed: false, conflict: true } : null;
    }

    // Zapisz pod nową nazwą
    const saved = await savePatient(rootHandle, fullPatient);
    if (!saved) return null;

    // F5.3: skopiuj zawartość `dokumenty/` ze starego folderu (jeśli istnieje)
    if (oldHandle) {
        try {
            const oldDocs = await openSubfolder(oldHandle, DOCUMENTS_FOLDER);
            if (oldDocs) {
                const newDocs = await ensureSubfolder(saved.folderHandle, DOCUMENTS_FOLDER);
                if (newDocs) {
                    await _copyDirectoryContents(oldDocs, newDocs);
                }
            }
        } catch (e) {
            console.warn('[renamePatientFolderIfNeeded] błąd kopiowania dokumentów',
                oldFolderName, '→', expectedName, e);
            // best-effort — kontynuuj usuwanie starego folderu
        }
    }

    // Usuń stary folder
    try {
        await deleteEntry(rootHandle, oldFolderName, { recursive: true });
    } catch (e) {
        console.warn('[renamePatientFolderIfNeeded] nie udało się usunąć starego folderu',
            oldFolderName, e);
        // Nie krytyczne — nowy folder już istnieje
    }

    return { ...saved, renamed: true, oldFolderName };
}

/**
 * F5.3 helper: rekursywne kopiowanie zawartości katalogu (top-level + subfoldery).
 * Używane przy rename'ie folderu pacjenta do skopiowania `dokumenty/`.
 *
 * @param {FileSystemDirectoryHandle} srcDir
 * @param {FileSystemDirectoryHandle} destDir
 */
async function _copyDirectoryContents(srcDir, destDir) {
    // Browser FSAA API: iteracja `for await (... of dirHandle.entries())`
    // zwraca [name, FileSystemHandle].
    for await (const [name, entry] of srcDir.entries()) {
        if (entry.kind === 'file') {
            const file = await entry.getFile();
            const buf = await file.arrayBuffer();
            const destFh = await destDir.getFileHandle(name, { create: true });
            const writable = await destFh.createWritable();
            try {
                await writable.write(buf);
            } finally {
                await writable.close();
            }
        } else if (entry.kind === 'directory') {
            const subDest = await destDir.getDirectoryHandle(name, { create: true });
            await _copyDirectoryContents(entry, subDest);
        }
    }
}


// ============================================================================
// DELETE — usuwa cały folder pacjenta
// ============================================================================

/**
 * Usuwa folder pacjenta z systemu plików (rekursywnie — `pacjent.xlsx` +
 * `dokumenty/` + wszystko inne wewnątrz).
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} folderName
 * @returns {Promise<boolean>}
 */
export async function deletePatientFolder(rootHandle, folderName) {
    if (!rootHandle || !folderName) return false;
    return await deleteEntry(rootHandle, folderName, { recursive: true });
}


// ============================================================================
// DOCUMENTS — zarządzanie podfolderem `dokumenty/` (przygotowane dla K4)
// ============================================================================

/**
 * Zwraca handle do `{folderName}/dokumenty/` (tworzy gdy nie istnieje).
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} folderName
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
export async function ensureDocumentsFolder(rootHandle, folderName) {
    const sub = await openSubfolder(rootHandle, folderName);
    if (!sub) return null;
    return await ensureSubfolder(sub, DOCUMENTS_FOLDER);
}

/**
 * Zwraca handle do `{folderName}/dokumenty/` BEZ tworzenia (null gdy nie ma).
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} folderName
 * @returns {Promise<FileSystemDirectoryHandle | null>}
 */
export async function openDocumentsFolder(rootHandle, folderName) {
    const sub = await openSubfolder(rootHandle, folderName);
    if (!sub) return null;
    return await openSubfolder(sub, DOCUMENTS_FOLDER);
}
