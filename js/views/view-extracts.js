// ============================================================================
// view-extracts.js — zakładki menu bocznego, które są WYCIĄGIEM Z WIZYT:
// Leki, Testy, Zalecenia, Plan leczenia, Diagnozy, Parametry, Dokumenty.
//
// Jedna zasada dla wszystkich siedmiu:
//   • dane wpisuje się wyłącznie w wizycie — tutaj są tylko do odczytu,
//   • każdy rekord zaczyna się od daty i rodzaju wizyty, z której pochodzi,
//   • kliknięcie rekordu otwiera tę wizytę,
//   • kolejność: od najnowszej wizyty.
//
// „Bez wizyty": wyniki testów i zalecenia zapisane, zanim trafiły do wizyt,
// oraz pliki leżące w folderze pacjenta, których nie wskazuje żadna wizyta.
// Widać je na końcu listy i można je stąd usunąć (to jedyna akcja zapisu).
// ============================================================================

import { Store } from './_store.js';
import { el, toast } from './_dom.js';
import { openConfirm } from './_modal.js';
import { visitTypeLabel } from './_visit-types.js';
import { medDoseText } from './_visit-describe.js';
import { iconForFile, formatSize, formatDate } from './_documents-store.js';
import {
    attachmentsAvailable, listAttachments, openAttachment, downloadAttachment, removeAttachment
} from './_attachments.js';

/* ==========================================================================
   Wspólny układ
   ========================================================================== */

function plural(n, one, few, many) {
    if (n === 1) return one;
    const d = n % 10;
    const h = n % 100;
    return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? few : many;
}

function patientName(p) {
    return ((p.imie || '') + ' ' + (p.nazwisko || '')).trim();
}

function noPatient(title) {
    return el('div', { class: 'psy-new-view' }, [
        el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, [title])])
        ]),
        el('div', { class: 'psy-new-view__body' }, [
            el('div', { class: 'psy-new-hint' }, ['Wybierz pacjenta, aby zobaczyć tę zakładkę.'])
        ])
    ]);
}

function header(title, patient, count, forms) {
    const subtitle = el('div', { class: 'psy-new-view__subtitle' });
    const setCount = (n) => {
        subtitle.textContent = patientName(patient) + ' · ' + n + ' ' + plural(n, forms[0], forms[1], forms[2])
            + ' · wyciąg z wizyt, od najnowszej';
    };
    setCount(count);
    const node = el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [el('h1', { class: 'psy-new-view__title' }, [title]), subtitle])
    ]);
    node.setCount = setCount;
    return node;
}

function emptyState(icon, title, description) {
    return el('div', { class: 'psy-new-empty' }, [
        el('div', { class: 'psy-new-empty__icon' }, [icon]),
        el('div', { class: 'psy-new-empty__title' }, [title]),
        el('div', { class: 'psy-new-empty__description' }, [description]),
        el('div', { class: 'psy-new-empty__actions' }, [
            el('button', { class: 'btn btn--primary', onclick: () => { window.location.hash = '#/history'; } },
                ['🗓️ Przejdź do wizyt'])
        ])
    ]);
}

/** Komórka z tekstem wielowierszowym (zalecenia, ustalenia). */
function text(value) {
    return el('div', { class: 'psy-extract__text' }, [value || '']);
}

function removeButton(title, onRemove) {
    return el('button', {
        class: 'btn btn--danger btn--sm btn--icon', title,
        onclick: (ev) => { ev.stopPropagation(); onRemove(); }
    }, ['🗑']);
}

/**
 * Tabela wyciągu. Dwie pierwsze kolumny są zawsze takie same: data i rodzaj wizyty.
 * @param {Array<{label: string, width?: string, align?: string}>} columns — kolumny treści
 * @param {Array<{visit: object|null, when?: string, cells: Array}>} rows
 *        visit = null → rekord „bez wizyty" (`when` = jego własna data)
 */
function extractTable(columns, rows) {
    const th = (label, width, align) => el('th', { style: { width: width || null, textAlign: align || null } }, [label]);
    const tbody = el('tbody', {});
    for (const row of rows) {
        const v = row.visit;
        const cells = row.cells.map((c, i) => el('td', {
            style: { textAlign: (columns[i] && columns[i].align) || null }
        }, Array.isArray(c) ? c : [c]));
        if (v) {
            tbody.appendChild(el('tr', {
                class: 'psy-extract__row',
                title: 'Kliknij, aby otworzyć wizytę',
                dataset: { visitId: v.id },
                onclick: () => { window.location.hash = '#/visit/form/' + v.id; }
            }, [
                el('td', { class: 'psy-extract__when' }, [(v.date || '—') + (v.time ? ' ' + v.time : '')]),
                el('td', { class: 'psy-extract__type' }, [visitTypeLabel(v.type)]),
                ...cells
            ]));
        } else {
            tbody.appendChild(el('tr', { class: 'psy-extract__row psy-extract__row--loose' }, [
                el('td', { class: 'psy-extract__when' }, [row.when || '—']),
                el('td', { class: 'psy-extract__type' }, [
                    el('span', { class: 'psy-new-badge psy-new-badge--neutral', title: 'Ten rekord nie należy do żadnej wizyty' },
                        ['bez wizyty'])
                ]),
                ...cells
            ]));
        }
    }
    return el('table', { class: 'psy-new-table psy-new-table--clickrows psy-extract' }, [
        el('thead', {}, [el('tr', {}, [
            th('Data wizyty', '132px'), th('Rodzaj wizyty', '170px'),
            ...columns.map((c) => th(c.label, c.width, c.align))
        ])]),
        tbody
    ]);
}

/**
 * Cała zakładka: nagłówek + tabela albo stan pusty.
 * @param {object} page — { title, icon, forms, emptyTitle, emptyHint, columns, rows }
 */
function extractView(patient, page) {
    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(header(page.title, patient, page.rows.length, page.forms));
    const body = el('div', { class: 'psy-new-view__body psy-new-view__body--plain' });
    body.appendChild(page.rows.length
        ? extractTable(page.columns, page.rows)
        : emptyState(page.icon, page.emptyTitle, page.emptyHint));
    root.appendChild(body);
    return root;
}

/* ==========================================================================
   Leki
   ========================================================================== */
export function renderMedsExtract() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatient('Leki');
    return extractView(patient, {
        title: 'Leki', icon: '💊', forms: ['wpis', 'wpisy', 'wpisów'],
        emptyTitle: 'Brak leków',
        emptyHint: 'Leki wpisuje się w wizycie, w sekcji „Ogólna farmakoterapia".',
        columns: [
            { label: 'Nazwa handlowa' }, { label: 'Substancja' },
            { label: 'Dawka', width: '120px' }, { label: 'Dawka maksymalna', width: '170px' }
        ],
        rows: Store.getMedsTimeline(patient.id).map(({ visit, med }) => ({
            visit,
            cells: [
                el('strong', {}, [med.name || '(bez nazwy)']),
                med.substance || '—',
                medDoseText(med) || '—',
                el('span', { class: 'psy-extract__max' }, [med.maxDose || '—'])
            ]
        }))
    });
}

/* ==========================================================================
   Diagnozy
   ========================================================================== */
export function renderDiagnosesExtract() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatient('Diagnozy');
    return extractView(patient, {
        title: 'Diagnozy', icon: '🏥', forms: ['rozpoznanie', 'rozpoznania', 'rozpoznań'],
        emptyTitle: 'Brak rozpoznań',
        emptyHint: 'Rozpoznania ICD-10 wpisuje się w wizycie, w sekcji „Rozpoznanie (ICD-10)".',
        columns: [{ label: 'Kod ICD-10', width: '110px' }, { label: 'Rozpoznanie' }],
        rows: Store.getDiagnosesTimeline(patient.id).map(({ visit, diagnosis }) => ({
            visit,
            cells: [
                el('strong', { class: 'psy-extract__code' }, [diagnosis.code || '—']),
                diagnosis.description || '(kod spoza słownika)'
            ]
        }))
    });
}

/* ==========================================================================
   Parametry
   ========================================================================== */

/** Interpretacja BMI wg WHO. */
function bmiCategory(bmi) {
    const v = parseFloat(bmi);
    if (!v) return '';
    if (v < 18.5) return 'niedowaga';
    if (v < 25) return 'norma';
    if (v < 30) return 'nadwaga';
    if (v < 35) return 'otyłość I°';
    if (v < 40) return 'otyłość II°';
    return 'otyłość III°';
}

export function renderParametersExtract() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatient('Parametry');
    return extractView(patient, {
        title: 'Parametry', icon: '📈', forms: ['pomiar', 'pomiary', 'pomiarów'],
        emptyTitle: 'Brak pomiarów',
        emptyHint: 'Wzrost i wagę wpisuje się w wizycie, w sekcji „Parametry somatyczne".',
        columns: [
            { label: 'Wzrost (cm)', width: '110px' }, { label: 'Waga (kg)', width: '110px' },
            { label: 'BMI', width: '150px' }, { label: 'Komentarz' }
        ],
        rows: Store.getParametersTimeline(patient.id).map((e) => {
            const category = bmiCategory(e.bmi);
            return {
                visit: e.visit,
                cells: [
                    e.wzrost || '—',
                    e.masa || '—',
                    [el('strong', {}, [e.bmi || '—']), category ? el('span', { class: 'psy-new-hint' }, [' · ' + category]) : null],
                    text(e.komentarz)
                ]
            };
        })
    });
}

/* ==========================================================================
   Plan leczenia
   ========================================================================== */
export function renderTreatmentPlanExtract() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatient('Plan leczenia');
    return extractView(patient, {
        title: 'Plan leczenia', icon: '🎯', forms: ['wpis', 'wpisy', 'wpisów'],
        emptyTitle: 'Brak ustaleń planu leczenia',
        emptyHint: 'Ustalenia, ewaluację i termin kontroli wpisuje się w wizycie, w sekcji „Podjęte oddziaływania podczas wizyty".',
        columns: [
            { label: 'Ustalenia i plan leczenia' }, { label: 'Ewaluacja' }, { label: 'Wizyta kontrolna', width: '170px' }
        ],
        rows: Store.getTreatmentPlanTimeline(patient.id).map((e) => ({
            visit: e.visit,
            cells: [
                text(e.ustalenia),
                text(e.ewaluacja),
                [e.kontrolna || '', e.notes ? el('div', { class: 'psy-new-hint' }, [e.notes]) : null]
            ]
        }))
    });
}

/* ==========================================================================
   Zalecenia
   ========================================================================== */
export function renderRecommendationsExtract() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatient('Zalecenia');
    const loose = Store.getStandaloneRecommendations(patient.id);
    // Kolumna z koszem pojawia się tylko wtedy, gdy jest co usuwać (rekordy „bez wizyty").
    const rows = Store.getRecommendationsTimeline(patient.id).map(({ visit, text: value }) => ({
        visit, cells: loose.length ? [text(value), ''] : [text(value)]
    }));
    for (const r of loose) {
        rows.push({
            visit: null,
            when: r.createdAt || '—',
            cells: [
                [r.title ? el('strong', {}, [r.title]) : null, text(r.content)],
                removeButton('Usuń zalecenie', async () => {
                    const ok = await openConfirm({
                        title: 'Usunąć zalecenie?',
                        message: 'Zalecenie „' + (r.title || r.content || '') + '" zostanie usunięte.',
                        confirmLabel: 'Usuń',
                        variant: 'danger'
                    });
                    if (ok) Store.removeStandaloneRecommendation(r.id);
                })
            ]
        });
    }
    return extractView(patient, {
        title: 'Zalecenia', icon: '📋', forms: ['zalecenie', 'zalecenia', 'zaleceń'],
        emptyTitle: 'Brak zaleceń',
        emptyHint: 'Zalecenia wpisuje się w wizycie, w sekcji „Zalecenia".',
        columns: loose.length ? [{ label: 'Zalecenia' }, { label: '', width: '48px', align: 'right' }] : [{ label: 'Zalecenia' }],
        rows
    });
}

/* ==========================================================================
   Testy
   ========================================================================== */
function testCells(t) {
    return [
        [el('strong', {}, [t.code || 'test']), t.name ? el('div', { class: 'psy-new-hint' }, [t.name]) : null],
        el('strong', {}, [t.score == null ? '—' : String(t.score)]),
        [t.redFlag ? el('span', { class: 'psy-extract__flag', title: 'Czerwona flaga' }, ['🚨 ']) : null, t.interpretation || '']
    ];
}

export function renderTestsExtract() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatient('Testy');
    const loose = Store.getStandaloneTests(patient.id);
    const rows = Store.getTestsTimeline(patient.id).map(({ visit, test }) => ({
        visit, cells: loose.length ? [...testCells(test), ''] : testCells(test)
    }));
    for (const t of loose) {
        rows.push({
            visit: null,
            when: t.date || '—',
            cells: [...testCells(t), removeButton('Usuń wynik', async () => {
                const ok = await openConfirm({
                    title: 'Usunąć wynik testu?',
                    message: 'Wynik testu „' + (t.code || '') + '" z dnia ' + (t.date || '?') + ' zostanie usunięty.',
                    confirmLabel: 'Usuń',
                    variant: 'danger'
                });
                if (ok) Store.removeStandaloneTest(t.id);
            })]
        });
    }
    const columns = [{ label: 'Test' }, { label: 'Wynik', width: '80px', align: 'right' }, { label: 'Interpretacja' }];
    if (loose.length) columns.push({ label: '', width: '48px', align: 'right' });
    return extractView(patient, {
        title: 'Testy', icon: '📊', forms: ['wynik', 'wyniki', 'wyników'],
        emptyTitle: 'Brak wyników testów',
        emptyHint: 'Test uruchamia się w wizycie, w sekcji „Testy" — wynik zapisuje się w tej wizycie.',
        columns,
        rows
    });
}

/* ==========================================================================
   Dokumenty
   - wiersze pochodzą z wizyt; lista plików z magazynu (asynchronicznie)
     uzupełnia rozmiar / datę i ujawnia pliki „bez wizyty",
   - widok „live": nie przerysowuje się przy zmianach Store (nie pytałby wtedy
     magazynu o listę plików przy każdym zapisie).
   ========================================================================== */
export function renderDocumentsExtract() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatient('Dokumenty');

    const timeline = Store.getDocumentsTimeline(patient.id);
    const root = el('div', { class: 'psy-new-view', dataset: { live: 'true' } });
    const head = header('Dokumenty', patient, timeline.length, ['plik', 'pliki', 'plików']);
    const body = el('div', { class: 'psy-new-view__body psy-new-view__body--plain' });
    const note = el('div', { class: 'psy-new-hint psy-extract__note' });
    root.appendChild(head);
    root.appendChild(body);
    root.appendChild(note);

    const fileLink = (entry) => el('a', {
        href: '#', class: 'psy-extract__file', title: 'Otwórz plik',
        onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); openAttachment(patient.id, entry); }
    }, [iconForFile(entry.name || '') + ' ' + (entry.name || '(plik bez nazwy)')]);
    const downloadButton = (entry) => el('button', {
        class: 'btn btn--secondary btn--sm btn--icon', title: 'Pobierz',
        onclick: (ev) => { ev.stopPropagation(); downloadAttachment(patient.id, entry); }
    }, ['⬇']);

    /** @param {Array|null} files — pliki w magazynie (null: jeszcze nie wczytane albo brak magazynu) */
    function draw(files) {
        const stored = new Map((files || []).map((f) => [f.id, f]));
        const attached = new Set(timeline.map((e) => e.doc.id));
        const rows = timeline.map(({ visit, doc }) => {
            const file = stored.get(doc.id);
            const missing = !!files && !file;
            const entry = file || doc;
            return {
                visit,
                cells: [
                    missing
                        ? [iconForFile(doc.name || '') + ' ' + (doc.name || ''), el('div', { class: 'psy-new-hint' }, ['pliku nie ma już w folderze pacjenta'])]
                        : (attachmentsAvailable() ? fileLink(entry) : iconForFile(doc.name || '') + ' ' + (doc.name || '')),
                    entry.size ? formatSize(entry.size) : '',
                    file && file.lastModified ? formatDate(file.lastModified) : '',
                    missing || !attachmentsAvailable() ? '' : downloadButton(entry)
                ]
            };
        });
        for (const f of (files || []).filter((x) => !attached.has(x.id))
            .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))) {
            rows.push({
                visit: null,
                when: f.lastModified ? new Date(f.lastModified).toISOString().slice(0, 10) : '—',
                cells: [
                    fileLink(f),
                    f.size ? formatSize(f.size) : '',
                    f.lastModified ? formatDate(f.lastModified) : '',
                    [downloadButton(f), ' ', removeButton('Usuń plik', async () => {
                        const ok = await openConfirm({
                            title: 'Usunąć plik?',
                            message: 'Plik „' + f.name + '" nie należy do żadnej wizyty. Zostanie usunięty z folderu pacjenta.',
                            confirmLabel: 'Usuń',
                            variant: 'danger'
                        });
                        if (!ok) return;
                        try {
                            await removeAttachment(patient.id, f);
                            toast('info', 'Usunięto plik', f.name);
                        } catch (e) {
                            toast('error', 'Nie udało się usunąć pliku', String(e && e.message || e));
                        }
                        load();
                    })]
                ]
            });
        }

        head.setCount(rows.length);
        body.innerHTML = '';
        body.appendChild(rows.length
            ? extractTable([
                { label: 'Plik' }, { label: 'Rozmiar', width: '100px' },
                { label: 'Zmieniony', width: '140px' }, { label: '', width: '96px', align: 'right' }
            ], rows)
            : emptyState('📂', 'Brak dokumentów', attachmentsAvailable()
                ? 'Pliki (skierowania, wyniki badań, skany) dołącza się w wizycie, w sekcji „Dokumenty".'
                : 'Załączniki wymagają podłączonego magazynu — w trybie demo nie ma gdzie przechowywać plików. '
                    + 'Po połączeniu z Dyskiem Google pliki dołącza się w wizycie, w sekcji „Dokumenty".'));
    }

    async function load() {
        if (!attachmentsAvailable()) { draw(null); return; }
        note.textContent = '⏳ Sprawdzam pliki w folderze pacjenta…';
        try {
            const files = await listAttachments(patient.id);
            note.textContent = '';
            draw(files);
        } catch (e) {
            console.error('[documents] list', e);
            note.textContent = '⚠ Nie udało się odczytać folderu z plikami (' + String(e && e.message || e)
                + '). Lista pokazuje tylko to, co zapisano w wizytach.';
        }
    }

    draw(null);
    load();
    return root;
}
