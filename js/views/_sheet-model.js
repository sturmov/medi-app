// ============================================================================
// _sheet-model.js — układ arkusza pacjenta (ten sam dla Google Sheets i XLSX).
//
// Arkusz pacjenta ma dwie warstwy:
//
//   1) ZAKŁADKI CZYTELNE (Pacjent, Wizyty, Leki, Diagnozy, Parametry,
//      Plan leczenia, Zalecenia, Testy) — zwykłe tabele z nagłówkiem, które
//      terapeuta może otworzyć, filtrować i wydrukować bez aplikacji.
//      Są GENEROWANE przy każdym zapisie; aplikacja nigdy ich nie czyta.
//
//   2) ZAKŁADKA `_dane` (ukryta) — kompletny dokument pacjenta jako JSON,
//      pocięty na kawałki (limit znaków w komórce). To jedyne źródło, z którego
//      aplikacja wczytuje dane, więc zapis → odczyt jest bezstratny.
//
// Czyste funkcje (bez DOM, bez bibliotek) — działają też w Node.
// ============================================================================

import { describeVisit, sortVisitsDesc, medDoseText,
         medsTimeline, diagnosesTimeline, parametersTimeline, treatmentPlanTimeline } from './_visit-describe.js';
import { visitTypeLabel } from './_visit-types.js';
import { parsePatientDoc } from './_patient-doc.js';

export const DATA_TAB = '_dane';
export const DATA_TAB_HEADER =
    'PsychoApp — dane aplikacji. NIE EDYTUJ tej zakładki: aplikacja wczytuje pacjenta właśnie stąd. '
    + 'Pozostałe zakładki są czytelną kopią i odświeżają się przy każdym zapisie.';

/** Limit znaków w jednej komórce: XLSX 32 767, Google Sheets 50 000. */
const CELL_LIMIT = 30000;

function cell(v) {
    if (v == null) return '';
    if (v === true) return 'TAK';
    if (v === false) return 'NIE';
    if (typeof v === 'number') return v;
    const s = String(v);
    return s.length > CELL_LIMIT ? s.slice(0, CELL_LIMIT - 20) + ' …[skrócono]' : s;
}

function visitWhen(v) { return [v.date || '', v.time || '']; }

/* ---------------------------------------------------------------------------
   Zakładka „Pacjent" — Sekcja | Pole | Wartość
   --------------------------------------------------------------------------- */
const PATIENT_FIELDS = [
    ['Ogólne', [
        ['id', 'Kod pacjenta'], ['imie', 'Imię'], ['drugieImie', 'Drugie imię'], ['nazwisko', 'Nazwisko'],
        ['pesel', 'PESEL'], ['plec', 'Płeć'], ['dataUrodzenia', 'Data urodzenia'],
        ['minor', 'Niepełnoletni'], ['obywatelstwo', 'Obywatelstwo'],
        ['lekarz', 'Lekarz prowadzący'], ['placowka', 'Placówka'], ['uwagi', 'Uwagi'],
        ['archived', 'W archiwum']
    ]],
    ['Kontakt', [
        ['telefon', 'Telefon'], ['email', 'E-mail'],
        ['ulica', 'Ulica'], ['kodPocztowy', 'Kod pocztowy'], ['miasto', 'Miasto'], ['adres', 'Adres (opis)'],
        ['korespUlica', 'Adres korespondencyjny — ulica'],
        ['korespKodPocztowy', 'Adres korespondencyjny — kod pocztowy'],
        ['korespMiasto', 'Adres korespondencyjny — miasto']
    ]],
    ['Osoby upoważnione', [
        ['matkaImie', 'Matka — imię i nazwisko'], ['matkaTelefon', 'Matka — telefon'], ['matkaEmail', 'Matka — e-mail'],
        ['ojciecImie', 'Ojciec — imię i nazwisko'], ['ojciecTelefon', 'Ojciec — telefon'], ['ojciecEmail', 'Ojciec — e-mail'],
        ['kontaktNaglyImie', 'Kontakt awaryjny — imię i nazwisko'],
        ['kontaktNaglyTelefon', 'Kontakt awaryjny — telefon'],
        ['kontaktNaglyRelacja', 'Kontakt awaryjny — relacja']
    ]],
    ['Zgoda RODO', [
        ['zgodaRodo', 'Zgoda wyrażona'], ['zgodaRodoData', 'Data wyrażenia'], ['zgodaRodoKomentarz', 'Komentarz']
    ]],
    ['Inne', [['innePole', 'Dodatkowe informacje']]],
    ['Opieka medyczna', [['opiekaMedycznaHistoria', 'Historia kontaktów medycznych']]]
];

// Pola pochodne / techniczne — nie trafiają do sekcji „Pozostałe".
const PATIENT_SKIP = new Set(['kodPacjenta', 'wiek', 'korespRozny']);

function patientRows(patient) {
    const rows = [];
    const known = new Set();
    for (const [section, fields] of PATIENT_FIELDS) {
        for (const [key, label] of fields) {
            known.add(key);
            const v = patient[key];
            // Pola logiczne pokazujemy tylko gdy mają sens (TAK), reszta — gdy niepusta.
            if (v == null || v === '' || v === false) continue;
            rows.push([section, label, cell(v)]);
        }
    }
    for (const [key, v] of Object.entries(patient)) {
        if (known.has(key) || PATIENT_SKIP.has(key) || key.startsWith('_')) continue;
        if (v == null || v === '' || v === false || typeof v === 'object') continue;
        rows.push(['Pozostałe', key, cell(v)]);
    }
    return rows;
}

/* ---------------------------------------------------------------------------
   Zakładka „Wizyty" — jeden wiersz = jedno wypełnione pole jednej wizyty
   (tabela „długa": łatwo filtrować po dacie, sekcji albo polu).
   --------------------------------------------------------------------------- */
function visitRows(visits) {
    const rows = [];
    for (const v of sortVisitsDesc(visits)) {
        const head = [...visitWhen(v), visitTypeLabel(v.type)];
        const tail = [cell(v.paid === true), v.id || ''];
        const d = describeVisit(v);
        let any = false;
        for (const s of d.sections) {
            if (s.comment) { rows.push([...head, s.title, 'Komentarz / opis', cell(s.comment), '', ...tail]); any = true; }
            for (const f of s.fields) {
                rows.push([...head, s.title, f.label, cell(f.value), cell(f.notes), ...tail]);
                any = true;
            }
        }
        for (const o of d.other) { rows.push([...head, 'Pozostałe', o.label, cell(o.value), '', ...tail]); any = true; }
        if (!any) rows.push([...head, '', '(notatka pusta)', '', '', ...tail]);
    }
    return rows;
}

/* ---------------------------------------------------------------------------
   Wszystkie zakładki
   --------------------------------------------------------------------------- */

/**
 * @returns {Array<{title: string, hidden?: boolean,
 *                  columns: Array<{label: string, width: number}>,
 *                  rows: Array<Array<string|number>>}>}
 *   `rows` NIE zawiera wiersza nagłówka (nagłówek = columns[].label).
 *   `width` w znakach (XLSX) — Google Sheets przelicza na piksele.
 */
export function buildTabs(doc) {
    const visits = doc.visits || [];
    const col = (label, width) => ({ label, width });

    return [
        {
            title: 'Pacjent',
            columns: [col('Sekcja', 22), col('Pole', 36), col('Wartość', 70)],
            rows: patientRows(doc.patient || {})
        },
        {
            title: 'Wizyty',
            columns: [col('Data', 12), col('Godzina', 9), col('Typ wizyty', 22), col('Sekcja', 30),
                      col('Pole', 34), col('Wartość', 70), col('Uwagi', 40), col('Zapłacono', 11), col('ID wizyty', 16)],
            rows: visitRows(visits)
        },
        {
            title: 'Leki',
            columns: [col('Data wizyty', 12), col('Nazwa handlowa', 28), col('Substancja', 24), col('Grupa', 28),
                      col('Aktualna dawka', 16), col('Dawka maksymalna', 22), col('Typ wizyty', 22)],
            rows: medsTimeline(visits).map(({ visit, med }) => [
                visit.date || '', cell(med.name), cell(med.substance), cell(med.group),
                cell(medDoseText(med)), cell(med.maxDose), visitTypeLabel(visit.type)
            ])
        },
        {
            title: 'Diagnozy',
            columns: [col('Data wizyty', 12), col('Kod ICD-10', 12), col('Rozpoznanie', 60), col('Typ wizyty', 22)],
            rows: diagnosesTimeline(visits).map(({ visit, diagnosis }) => [
                visit.date || '', cell(diagnosis.code), cell(diagnosis.description), visitTypeLabel(visit.type)
            ])
        },
        {
            title: 'Parametry',
            columns: [col('Data wizyty', 12), col('Wzrost (cm)', 12), col('Waga (kg)', 12), col('BMI', 10), col('Komentarz', 60)],
            rows: parametersTimeline(visits).map((e) => [
                e.visit.date || '', cell(e.wzrost), cell(e.masa), cell(e.bmi), cell(e.komentarz)
            ])
        },
        {
            title: 'Plan leczenia',
            columns: [col('Data wizyty', 12), col('Ustalenia i plan leczenia', 70), col('Ewaluacja', 50), col('Wizyta kontrolna', 24)],
            rows: treatmentPlanTimeline(visits).map((e) => [
                e.visit.date || '', cell(e.ustalenia), cell(e.ewaluacja),
                cell(e.kontrolna + (e.notes ? ' (' + e.notes + ')' : ''))
            ])
        },
        {
            title: 'Zalecenia',
            columns: [col('Data', 12), col('Tytuł', 32), col('Treść', 70), col('Typ', 24), col('Termin', 22), col('Zrealizowane', 13)],
            rows: (doc.recommendations || []).slice()
                .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
                .map((r) => [
                    r.createdAt || '', cell(r.title), cell(r.content), cell(r.type),
                    cell(r.dueDate || r.dueWhen), cell(r.done === true)
                ])
        },
        {
            title: 'Testy',
            columns: [col('Data', 12), col('Test', 12), col('Nazwa', 40), col('Wynik', 9), col('Interpretacja', 44), col('Czerwona flaga', 15)],
            rows: (doc.tests || []).slice()
                .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
                .map((t) => [
                    t.date || '', cell(t.code), cell(t.name), cell(t.score), cell(t.interpretation),
                    t.redFlag ? 'TAK' : ''
                ])
        },
        {
            title: DATA_TAB,
            hidden: true,
            columns: [col(DATA_TAB_HEADER, 120)],
            rows: docToChunks(doc).map((chunk) => [chunk])
        }
    ];
}

/* ---------------------------------------------------------------------------
   Zakładka `_dane` — dokument pacjenta w kawałkach
   --------------------------------------------------------------------------- */

export function docToChunks(doc) {
    const json = JSON.stringify(doc);
    const chunks = [];
    const isSpace = (ch) => ch === ' ' || ch === '\t';
    let start = 0;
    while (start < json.length) {
        let end = Math.min(start + CELL_LIMIT, json.length);
        // Granica kawałka nie może przeciąć pary surogatów (emoji) ani wypaść
        // na spacji — arkusz mógłby uszkodzić taki znak albo obciąć odstęp.
        while (end < json.length) {
            const last = json.charCodeAt(end - 1);
            const cutsPair = last >= 0xD800 && last <= 0xDBFF;
            if (!cutsPair && !isSpace(json[end - 1]) && !isSpace(json[end])) break;
            end++;
        }
        chunks.push(json.slice(start, end));
        start = end;
    }
    return chunks.length ? chunks : ['{}'];
}

/** @param {string[]} chunks — komórki kolumny A zakładki `_dane` (bez nagłówka). */
export function chunksToDoc(chunks) {
    const json = (chunks || []).map((c) => (c == null ? '' : String(c))).join('');
    if (!json.trim()) throw new Error('Zakładka „' + DATA_TAB + '" jest pusta.');
    return parsePatientDoc(json);
}
