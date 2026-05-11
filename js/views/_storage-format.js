// ============================================================================
// _storage-format.js — specyfikacja formatu lokalnego pliku `pacjent.xlsx`
//
// Paczka K1 (2026-05-11):
//   Każdy pacjent = 1 plik `pacjent.xlsx` w folderze `pacjenci/{KOD}_{Naz}_{Imię}/`
//   Plik ma 8 ZAKŁADEK (arkuszy) w środku, mapujących się 1:1 z pozycjami menu apki
//   (poza akcją „+ Nowa wizyta" — to akcja, nie sekcja danych).
//
// Cel formatu:
//   1. **Czytelność dla człowieka** — gdyby klientka porzuciła aplikację, ma
//      czytelną bazę pacjentów w plikach Excel.
//   2. **Identyczność z przyszłym Google Sheets** — w Fazie 4 dokładnie ten sam
//      układ zakładek trafia do Drive jako Google Sheet (zmiana tylko backendu,
//      nie modelu danych).
//   3. **Round-trip** — zapis → odczyt → zapis musi dawać identyczny rezultat.
//
// Ten plik definiuje TYLKO MAPOWANIE semantyczne (klucze → etykiety, sekcje,
// kolejność pól, kolumny tabel). Renderowanie XLSX (merged cells, kolory,
// stylowanie) jest w `_xlsx-codec.js` — to celowe rozdzielenie.
// ============================================================================

/* ============================================================================
   ZAKŁADKA 1 — `Pacjent`
   Sześć sekcji (Ogólne, Dodatkowe, Kontakt, Osoby upoważnione, Zgoda RODO,
   Inne, Opieka medyczna) — każda separowana nagłówkiem merged-cell.
   ============================================================================ */

export const PATIENT_SECTIONS = [
    {
        id: 'ogolne',
        title: 'OGÓLNE',
        format: 'kv',                 // tabela klucz → wartość
        fields: [
            { key: 'kodPacjenta',  label: 'Kod pacjenta',     type: 'text',     readonly: true },
            { key: 'tytul',         label: 'Tytuł',            type: 'text' },
            { key: 'imie',          label: 'Imię',             type: 'text' },
            { key: 'drugieImie',    label: 'Drugie imię',      type: 'text' },
            { key: 'nazwisko',      label: 'Nazwisko',         type: 'text' },
            { key: 'pesel',         label: 'PESEL',            type: 'text' },
            { key: 'plec',          label: 'Płeć',             type: 'text' },
            { key: 'dataUrodzenia', label: 'Data urodzenia',   type: 'date' },
            { key: 'wiek',          label: 'Wiek',             type: 'number',  readonly: true },
            { key: 'minor',         label: 'Niepełnoletni',    type: 'boolean' },
            { key: 'archived',      label: 'W archiwum',       type: 'boolean' }
        ]
    },
    {
        id: 'dodatkowe',
        title: 'DODATKOWE',
        format: 'kv',
        fields: [
            { key: 'obywatelstwo',  label: 'Obywatelstwo',     type: 'text' },
            { key: 'lekarz',        label: 'Lekarz prowadzący', type: 'text' },
            { key: 'placowka',      label: 'Placówka',         type: 'text' },
            { key: 'grupa',         label: 'Grupa',            type: 'text' },
            { key: 'uwagi',         label: 'Uwagi',            type: 'textarea' }
        ]
    },
    {
        id: 'kontakt',
        title: 'KONTAKT',
        format: 'kv',
        fields: [
            { key: 'telefon',       label: 'Telefon',          type: 'text' },
            { key: 'email',         label: 'E-mail',           type: 'text' },
            { key: 'adres',         label: 'Adres',            type: 'textarea' }
        ]
    },
    {
        id: 'osobyUpowaznione',
        title: 'OSOBY UPOWAŻNIONE',
        format: 'table-from-fields', // generowana z pól patient.matka*/ojciec*/kontaktNagly*
        // Każdy wiersz tabeli = 4 pola pacjenta (imie/nazwisko/telefon/relacja)
        // zmapowane na 1 osobę. W przyszłości to będzie osobna tablica
        // `patient.authorizedPersons[]`. Obecnie zapisujemy „matka", „ojciec",
        // „kontakt awaryjny" jako 3 wiersze tabeli.
        rows: [
            {
                relacja: 'Matka',
                imieField:    'matkaImie',
                telefonField: 'matkaTelefon',
                emailField:   'matkaEmail'
            },
            {
                relacja: 'Ojciec',
                imieField:    'ojciecImie',
                telefonField: 'ojciecTelefon',
                emailField:   'ojciecEmail'
            },
            {
                relacja: 'Kontakt awaryjny',
                imieField:    'kontaktNaglyImie',
                telefonField: 'kontaktNaglyTelefon',
                relacjaField: 'kontaktNaglyRelacja'  // tu zamiast email mamy relację
            }
        ],
        columns: [
            { label: 'Relacja',  width: 22 },
            { label: 'Imię i nazwisko', width: 32 },
            { label: 'Telefon',  width: 20 },
            { label: 'E-mail / Doprecyzowanie', width: 30 }
        ]
    },
    {
        id: 'rodo',
        title: 'ZGODA NA PRZETWARZANIE DANYCH (RODO)',
        format: 'kv',
        fields: [
            { key: 'zgodaRodo',          label: 'Zgoda wyrażona', type: 'boolean' },
            { key: 'zgodaRodoData',      label: 'Data wyrażenia', type: 'date' },
            { key: 'zgodaRodoKomentarz', label: 'Komentarz',      type: 'textarea' }
        ]
    },
    {
        id: 'inne',
        title: 'INNE INFORMACJE',
        format: 'kv',
        fields: [
            { key: 'innePole', label: 'Dodatkowe informacje', type: 'textarea' }
        ]
    },
    {
        id: 'opiekaMedyczna',
        title: 'OPIEKA MEDYCZNA — historia kontaktów',
        format: 'kv',
        fields: [
            { key: 'opiekaMedycznaHistoria', label: 'Historia kontaktów medycznych', type: 'textarea' }
        ]
        // TODO PR-J cd: zamiana wolnego tekstu na strukturalną listę rekordów
        // (Imię, Nazwisko, Specjalność, Data od, Data do, Komentarz).
    }
];


/* ============================================================================
   ZAKŁADKA 2 — `Wizyty`
   Format: akapity drzewkowe. Każda wizyta = blok:
     [Nagłówek wizyty: id · typ · data · godzina · czas · stan płatności]
     [Sekcja: Dane wizyty]   (KV — typ, czas, osoby)
     [Sekcja: Treść notatki] (KV — wszystkie wypełnione pola z visit.data._raw)
   Wizyty od najnowszej do najstarszej (jak w UI).
   ============================================================================ */

export const VISIT_SHEET = {
    title: 'Wizyty',
    // Header bloku wizyty (1 wiersz, merged):
    //   "V001 · 1sze spotkanie · 2026-05-08 14:00 · 60 min · ZAPŁACONO"
    // Kolejność sekcji w bloku:
    sections: [
        {
            id: 'meta',
            title: 'Dane wizyty',
            fields: [
                { key: 'id',         label: 'ID wizyty' },
                { key: 'type',       label: 'Typ wizyty' },
                { key: 'date',       label: 'Data' },
                { key: 'time',       label: 'Godzina rozpoczęcia' },
                { key: 'duration',   label: 'Czas trwania (min)' },
                { key: 'paid',       label: 'Zapłacono' },
                { key: 'summary',    label: 'Podsumowanie (skrót)' }
            ]
        },
        {
            id: 'content',
            title: 'Treść notatki',
            // Dynamiczne — wszystkie wypełnione pola z `visit.data._raw`.
            // Etykiety pól mapuje `prettyVisitFieldLabel()` w `app-new.js`.
            dynamic: true
        }
    ]
};

// Etykiety dla pól wizyty (do reuse w codec). Skopiowane mapowanie z
// `_prettyVisitFieldLabel` w app-new.js (DRY — TODO: wyciągnąć do osobnego pliku).
export const VISIT_FIELD_LABELS = {
    rodzajWizyty:           'Rodzaj wizyty',
    osobyObecne:            'Osoby obecne',
    powodKonsultacji:       'Powód konsultacji',
    objawyDepresyjne:       'Objawy depresyjne',
    objawyLekowe:           'Objawy lękowe',
    hipotezaDiagnostyczna:  'Hipoteza diagnostyczna',
    plan:                   'Plan',
    planNaNastepne:         'Plan na następne spotkanie',
    cosWaznego:             'Co ważnego',
    historiaEdukacji:       'Historia edukacji',
    historiaRodzinna:       'Historia rodzinna',
    zasoby:                 'Zasoby pacjenta',
    data:                   'Data',
    czasOd:                 'Godzina rozpoczęcia',
    czasTrwania:            'Czas trwania (min)',
    osoby:                  'Osoby',
    uczestnicy:             'Uczestnicy'
};


/* ============================================================================
   ZAKŁADKI 3-8 — proste tabele 2D (jeden wiersz = jeden rekord)
   Każda definicja: title + columns[] (key, label, width, type).
   ============================================================================ */

export const MEDS_SHEET = {
    title: 'Leki',
    columns: [
        { key: 'id',           label: 'ID',                width: 8 },
        { key: 'name',         label: 'Nazwa handlowa',    width: 28 },
        { key: 'substance',    label: 'Substancja',        width: 24 },
        { key: 'dose',         label: 'Dawka aktualna',    width: 18 },
        { key: 'maxDose',      label: 'Dawka maksymalna',  width: 18 },
        { key: 'prescribedAt', label: 'Od kiedy',          width: 14 },
        { key: 'prescribedBy', label: 'Kto przepisał',     width: 22 },
        { key: 'notes',        label: 'Notatki',           width: 36 },
        { key: 'linkedVisitId', label: 'Powiązana wizyta', width: 14 }
    ]
};

export const DIAGNOSES_SHEET = {
    title: 'Diagnozy',
    columns: [
        { key: 'id',            label: 'ID',          width: 8 },
        { key: 'code',          label: 'Kod ICD-10',  width: 14 },
        { key: 'description',   label: 'Opis',        width: 42 },
        { key: 'status',        label: 'Status',      width: 14 },
        { key: 'assignedAt',    label: 'Data',        width: 14 },
        { key: 'author',        label: 'Autor',       width: 22 },
        { key: 'notes',         label: 'Notatki',     width: 32 },
        { key: 'linkedVisitId', label: 'Powiązana wizyta', width: 14 }
    ]
};

export const RECOMMENDATIONS_SHEET = {
    title: 'Zalecenia',
    columns: [
        { key: 'id',            label: 'ID',                  width: 8 },
        { key: 'title',         label: 'Tytuł',               width: 32 },
        { key: 'content',       label: 'Treść',               width: 48 },
        { key: 'type',          label: 'Typ',                 width: 16 },
        { key: 'dueWhen',       label: 'Termin (kategoria)',  width: 18 },
        { key: 'dueDate',       label: 'Data konkretna',      width: 14 },
        { key: 'done',          label: 'Zrealizowane',        width: 12 },
        { key: 'createdAt',     label: 'Data utworzenia',     width: 14 },
        { key: 'linkedVisitId', label: 'Powiązana wizyta',    width: 14 }
    ]
};

export const TESTS_SHEET = {
    title: 'Testy',
    columns: [
        { key: 'id',             label: 'ID',             width: 8 },
        { key: 'code',           label: 'Kod testu',      width: 12 },
        { key: 'name',           label: 'Nazwa',          width: 32 },
        { key: 'date',           label: 'Data',           width: 14 },
        { key: 'score',          label: 'Wynik',          width: 10 },
        { key: 'interpretation', label: 'Interpretacja',  width: 40 },
        { key: 'redFlag',        label: 'Czerwona flaga', width: 12 },
        { key: 'raw',            label: 'Surowe dane (JSON)', width: 50 }
    ]
};

export const PARAMETERS_SHEET = {
    title: 'Parametry',
    columns: [
        { key: 'data',              label: 'Data pomiaru',         width: 14 },
        { key: 'wzrost',            label: 'Wzrost (cm)',          width: 12 },
        { key: 'waga',              label: 'Waga (kg)',            width: 12 },
        { key: 'bmi',               label: 'BMI (auto)',           width: 12 },
        { key: 'cisnienieSkurcz',   label: 'Ciśnienie skurczowe',  width: 18 },
        { key: 'cisnienieRozkurcz', label: 'Ciśnienie rozkurczowe', width: 18 },
        { key: 'tetno',             label: 'Tętno (bpm)',          width: 12 },
        { key: 'komentarz',         label: 'Komentarz',            width: 32 }
    ]
};


/* ============================================================================
   ZAKŁADKA `PlanLeczenia` — tabela hierarchiczna.
   Każdy wiersz = cel (L1) LUB zadanie (L2). Hierarchia przez kolumnę „Poziom".
   ============================================================================ */

export const TREATMENT_PLAN_SHEET = {
    title: 'PlanLeczenia',
    columns: [
        { key: 'poziom',     label: 'Poziom',         width: 10 },   // 'CEL' | 'ZADANIE'
        { key: 'id',         label: 'ID',             width: 12 },
        { key: 'parentId',   label: 'ID nadrzędne',   width: 14 },
        { key: 'tytul',      label: 'Tytuł',          width: 40 },
        { key: 'priorytet',  label: 'Priorytet',      width: 14 },   // tylko dla CEL
        { key: 'done',       label: 'Zrealizowane',   width: 14 },   // tylko dla ZADANIE
        { key: 'dueDate',    label: 'Termin',         width: 14 },
        { key: 'komentarz',  label: 'Komentarz',      width: 32 }
    ]
};


/* ============================================================================
   META — stała informacyjna do zaszycia w pliku (do round-tripa).
   Trafi do `Pacjent` → sekcja „Ogólne" jako _meta lub osobny niewidoczny
   nagłówek; alternatywnie do PropertiesWorkbook (Custom Property).
   ============================================================================ */

export const STORAGE_FORMAT = {
    version: 1,                          // dla przyszłej migracji
    appName: 'PsychoApp',
    fileName: 'pacjent.xlsx',
    folderPattern: '{KOD}_{Nazwisko}_{Imie}',
    sheets: [
        'Pacjent', 'Wizyty', 'Leki', 'Testy', 'Zalecenia',
        'PlanLeczenia', 'Diagnozy', 'Parametry'
    ]
};


/* ============================================================================
   HELPER: nazwa folderu pacjenta
   ============================================================================ */

/**
 * Zwraca nazwę folderu wg konwencji {KOD}_{Nazwisko}_{Imię}.
 * Sanityzuje znaki niedozwolone w nazwach plików (Windows + POSIX).
 *
 * @example
 *   patientFolderName({ id: 'P001', imie: 'Michał', nazwisko: 'Bogusz' })
 *   → 'P001_Bogusz_Michal'
 */
export function patientFolderName(patient) {
    if (!patient) return 'patient_unknown';
    const kod = patient.id || patient.kodPacjenta || 'P000';
    const naz = _sanitize(patient.nazwisko || 'bez_nazwiska');
    const imi = _sanitize(patient.imie || 'bez_imienia');
    return `${kod}_${naz}_${imi}`;
}

function _sanitize(s) {
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // znaki diakrytyczne
        .replace(/[^A-Za-z0-9_-]/g, '_')   // tylko ASCII alfanum + _ -
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}


/* ============================================================================
   HELPER: format etykiety pola pacjenta z dowolnego klucza.
   Reuse semantyczny z _xlsx-codec — zwraca etykietę po polsku dla danego
   klucza pola pacjenta. Używany przy wypisywaniu dynamic fields wizyty.
   ============================================================================ */

const _allPatientLabels = {};
for (const section of PATIENT_SECTIONS) {
    if (section.fields) {
        for (const f of section.fields) {
            _allPatientLabels[f.key] = f.label;
        }
    }
}

export function patientFieldLabel(key) {
    return _allPatientLabels[key] || key;
}
