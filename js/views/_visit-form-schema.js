// ============================================================================
// _visit-form-schema.js — schema (data) formularza wizyty.
//
// Zgodnie z docs/VISIT_FORM_SPEC.md §2. Każdy rozdział to obiekt z listą
// podpól (subfields). Widok `view-visit-form.js` iteruje i renderuje
// schemat w 5-slotowym wzorcu akordeonu (1: belka, 2: sub-label,
// 3: pole główne, 4: uwagi, 5: komentarz rozdziału).
//
// Właściwości rozdziału:
//   id             - stabilny klucz (używany w Store)
//   title          - etykieta belki
//   icon           - emoji
//   onlyIn         - 'first' | 'followup' | undefined (obydwa)
//   defaultOpen    - true/false — czy rozwinięty na start
//   sectionComment - czy slot (5) ma być widoczny
//   sticky         - true = nie-collapsible (2.1 Dane wizyty)
//   subfields      - lista podpól (puste → tylko slot 5)
//
// Właściwości subfieldu:
//   id         - stabilny klucz
//   label      - slot (2)
//   required   - true/false (gwiazdka)
//   onlyIn     - 'first' | 'followup' | undefined
//   fullWidth  - true = (4) zajmuje resztę (pole (3) = '—')
//   input      - { type, options?, unit?, ref? } (slot 3)
//       type: 'text' | 'textarea' | 'number' | 'date' |
//             'select' | 'multi-select' | 'radio' | 'checkbox-group' |
//             'tag-input-icd10' | 'uzywki-special' | 'link-view'
//   notes      - true/false — czy slot (4) widoczny (domyślnie true)
// ============================================================================

import { VISIT_DICT } from './_visit-dict.js';

export const VISIT_FORM_SCHEMA = [

    // ---------------------------------------------------------------------
    // 2.1 Dane wizyty (sticky, brak collapsible)
    // ---------------------------------------------------------------------
    {
        id: 'visitData',
        title: 'Dane wizyty',
        icon: '🗓',
        sticky: true,
        sectionComment: false,
        subfields: [
            { id: 'data',    label: 'Data wizyty',            required: true, input: { type: 'date' }, notes: false },
            { id: 'rodzaj',  label: 'Rodzaj wizyty',          required: true, input: { type: 'select', options: VISIT_DICT.RODZAJ_WIZYTY }, notes: false },
            { id: 'osoby',   label: 'Osoby obecne',                           input: { type: 'multi-select', options: VISIT_DICT.OSOBY_OBECNE } },
            { id: 'powod',   label: 'Powód zgłoszenia',                       input: { type: 'textarea' }, notes: false },
            { id: 'przemoc', label: 'Doświadczenie przemocy',                 input: { type: 'radio', options: VISIT_DICT.PRZEMOC } }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.2 Wywiad (⬆ first)
    // ---------------------------------------------------------------------
    {
        id: 'wywiad',
        title: 'Wywiad — aktualne objawy',
        icon: '📋',
        onlyIn: 'first',
        defaultOpen: true,
        sectionComment: true,
        subfields: [
            { id: 'depresyjne',   label: 'Depresyjne',                                            input: { type: 'multi-select', options: VISIT_DICT.OBJAWY_DEPRESYJNE } },
            { id: 'lekowe',       label: 'Lękowe',                                                input: { type: 'multi-select', options: VISIT_DICT.OBJAWY_LEKOWE } },
            { id: 'maniakalne',   label: 'Maniakalne / hipomaniakalne',                           input: { type: 'radio', options: VISIT_DICT.OBJAWY_MANIAKALNE } },
            { id: 'psychotyczne', label: 'Psychotyczne / zaburzenia spostrzegania i myślenia',    input: { type: 'multi-select', options: VISIT_DICT.OBJAWY_PSYCHOTYCZNE } },
            { id: 'oc',           label: 'Obsesyjno-kompulsyjne',                                 input: { type: 'multi-select', options: VISIT_DICT.OBJAWY_OC } },
            { id: 'regulacja',    label: 'Regulacja emocji i inne',                               input: { type: 'multi-select', options: VISIT_DICT.REGULACJA_EMOCJI } }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.3 Aktualny problem zdrowotny (tylko (5))
    // ---------------------------------------------------------------------
    {
        id: 'problemZdrowotny',
        title: 'Aktualny problem zdrowotny',
        icon: '🩺',
        defaultOpen: true,
        sectionComment: true,
        subfields: []
    },

    // ---------------------------------------------------------------------
    // 2.4 Tło / kontekst funkcjonowania
    // ---------------------------------------------------------------------
    {
        id: 'kontekst',
        title: 'Tło / kontekst funkcjonowania',
        icon: '🏠',
        sectionComment: true,
        subfields: [
            { id: 'rodzina',     label: 'Sytuacja rodzinna',      input: { type: 'multi-select', options: VISIT_DICT.SYTUACJA_RODZINNA } },
            { id: 'szkolaPraca', label: 'Szkoła / Praca',         input: { type: 'radio', options: VISIT_DICT.SZKOLA_PRACA } },
            { id: 'rowiesnicy',  label: 'Relacje rówieśnicze',    input: { type: 'radio', options: VISIT_DICT.RELACJE_ROWIESNICZE } },
            { id: 'stanCywilny', label: 'Stan cywilny',           input: { type: 'select', options: VISIT_DICT.STAN_CYWILNY } },
            { id: 'trauma',      label: 'Wydarzenia traumatyczne',input: { type: 'multi-select', options: VISIT_DICT.TRAUMY } },
            { id: 'czasWolny',   label: 'Czas wolny',             input: { type: 'multi-select', options: VISIT_DICT.CZAS_WOLNY } }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.5 Funkcjonowanie somatyczne
    // ---------------------------------------------------------------------
    {
        id: 'somatyczne',
        title: 'Funkcjonowanie somatyczne',
        icon: '❤',
        sectionComment: true,
        subfields: [
            { id: 'apetyt',    label: 'Apetyt / jedzenie',   input: { type: 'radio', options: VISIT_DICT.APETYT } },
            { id: 'sen',       label: 'Sen',                 input: { type: 'radio', options: VISIT_DICT.SEN } },
            { id: 'aktywnosc', label: 'Aktywność fizyczna',  input: { type: 'radio', options: VISIT_DICT.AKTYWNOSC_FIZ } },
            { id: 'alergie',   label: 'Alergie', onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.ALERGIE } }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.6 Aktualne problemy medyczne (⬆ first, tylko (5))
    // ---------------------------------------------------------------------
    {
        id: 'medyczne',
        title: 'Aktualne problemy medyczne',
        icon: '🏥',
        onlyIn: 'first',
        sectionComment: true,
        subfields: []
    },

    // ---------------------------------------------------------------------
    // 2.7 Historia leczenia
    // ---------------------------------------------------------------------
    {
        id: 'leczenie',
        title: 'Historia leczenia',
        icon: '💊',
        sectionComment: true,
        subfields: [
            { id: 'morfologia', label: 'Morfologia', onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.BADANIE_STATUS } },
            { id: 'ekg',        label: 'EKG',        onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.BADANIE_STATUS } }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.8 Ogólna farmakoterapia (i suplementy)
    // ---------------------------------------------------------------------
    {
        id: 'farmakoterapia',
        title: 'Ogólna farmakoterapia (i suplementy)',
        icon: '💉',
        sectionComment: true,
        subfields: [
            { id: 'leki', label: 'Leki psychotropowe', input: { type: 'link-view', ref: '#/meds' } }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.9 Używki (specjalna struktura — checkbox-group + per-item detail)
    // ---------------------------------------------------------------------
    {
        id: 'uzywki',
        title: 'Używki',
        icon: '🚬',
        sectionComment: true,
        subfields: [
            { id: 'substancje', label: 'Substancje', fullWidth: true, input: { type: 'uzywki-special' }, notes: false }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.10 Parametry somatyczne (siatka 2 kolumn, bez uwag poza min/max)
    // ---------------------------------------------------------------------
    {
        id: 'parametry',
        title: 'Parametry somatyczne',
        icon: '📏',
        sectionComment: false,
        subfields: [
            { id: 'wzrost',    label: 'Wzrost',             input: { type: 'number', unit: 'cm' }, notes: false },
            { id: 'masa',      label: 'Masa ciała',         input: { type: 'number', unit: 'kg' }, notes: false },
            { id: 'bmi',       label: 'BMI (auto)',         input: { type: 'number', readonly: true }, notes: false },
            { id: 'min',       label: 'Najniższa masa ciała', input: { type: 'number', unit: 'kg' } },
            { id: 'max',       label: 'Najwyższa masa ciała', input: { type: 'number', unit: 'kg' } }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.11 Status psychiczny (mały + duży tryb)
    // ---------------------------------------------------------------------
    {
        id: 'status',
        title: 'Status psychiczny',
        icon: '🧠',
        defaultOpen: true,
        sectionComment: true,
        subfields: [
            // Tryb mały (widoczny zawsze)
            { id: 'stanPsy',     label: 'Stan psychiczny',                      input: { type: 'multi-select', options: VISIT_DICT.STAN_PSYCHICZNY } },
            { id: 'wglad',       label: 'Stopień współpracy / wgląd',           input: { type: 'radio', options: VISIT_DICT.WGLAD } },
            { id: 'obserwacje',  label: 'Obserwacje podczas spotkania',         fullWidth: true },
            { id: 'suicydalnosc',label: 'Suicydalność / zachowania autoagresywne', input: { type: 'radio', options: VISIT_DICT.SUICYDALNOSC_SHORT } },
            { id: 'ryzykoS',     label: 'Ocena ryzyka S',                       input: { type: 'select', options: VISIT_DICT.RYZYKO_S } },

            // Tryb duży (tylko first)
            { id: 'wyglad',             label: 'Wygląd i prezentacja',                         onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.W_NORMIE } },
            { id: 'zachowanie',         label: 'Zachowanie i aktywność psychoruchowa',         onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.ZACHOWANIE_PSYCHORUCHOWE } },
            { id: 'styl',               label: 'Styl interakcyjny',                            onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.STYL_INTERAKCYJNY } },
            { id: 'mowa',               label: 'Mowa',                                         onlyIn: 'first', input: { type: 'multi-select', options: VISIT_DICT.MOWA } },
            { id: 'nastroj',            label: 'Nastrój',                                      onlyIn: 'first', input: { type: 'multi-select', options: VISIT_DICT.NASTROJ } },
            { id: 'afekt',              label: 'Afekt',                                        onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.AFEKT } },
            { id: 'procesMyslenia',     label: 'Proces myślenia',                              onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.PROCES_MYSLENIA } },
            { id: 'trescMyslenia',      label: 'Treść myślenia',                               onlyIn: 'first', input: { type: 'multi-select', options: VISIT_DICT.TRESC_MYSLENIA } },
            { id: 'percepcjaJa',        label: 'Percepcja i doświadczenia ja',                 onlyIn: 'first', input: { type: 'multi-select', options: VISIT_DICT.PERCEPCJA_JA } },
            { id: 'zaburzeniaPerc',     label: 'Zaburzenia percepcyjne',                       onlyIn: 'first', input: { type: 'multi-select', options: VISIT_DICT.ZABURZENIA_PERCEPCYJNE } },
            { id: 'koncentracja',       label: 'Koncentracja i uwaga',                         onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.KONCENTRACJA } },
            { id: 'orientacja',         label: 'Orientacja',                                   onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.ORIENTACJA } },
            { id: 'pamiec',             label: 'Pamięć',                                       onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.PAMIEC } },
            { id: 'funkcIntel',         label: 'Funkcjonowanie intelektualne / zasób wiedzy',  onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.FUNKCJONOWANIE_INTEL } },
            { id: 'osad',               label: 'Osąd',                                         onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.OSAD } },
            { id: 'wgladDuzy',          label: 'Wgląd',                                        onlyIn: 'first', input: { type: 'radio', options: VISIT_DICT.WGLAD } }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.12 Ocena ryzyka S (⬆ first — rozszerzona)
    // ---------------------------------------------------------------------
    {
        id: 'ryzykoS',
        title: 'Ocena ryzyka S (szczegółowa)',
        icon: '🚨',
        onlyIn: 'first',
        sectionComment: true,
        subfields: [
            { id: 'depresja',     label: 'Depresja / beznadzieja',      input: { type: 'select', options: VISIT_DICT.RYZYKO_DEPRESJA } },
            { id: 'mysliSmierc',  label: 'Myśli o śmierci',             input: { type: 'radio', options: VISIT_DICT.RYZYKO_MYSLI_SMIERC } },
            { id: 'mysliSam',     label: 'Myśli samobójcze',            input: { type: 'radio', options: VISIT_DICT.RYZYKO_MYSLI_SAM } },
            { id: 'zamiar',       label: 'Zamiar',                      input: { type: 'radio', options: VISIT_DICT.RYZYKO_ZAMIAR } },
            { id: 'plan',         label: 'Plan',                        input: { type: 'radio', options: VISIT_DICT.RYZYKO_PLAN } },
            { id: 'przygotowania',label: 'Przygotowania',               input: { type: 'radio', options: VISIT_DICT.RYZYKO_PRZYGOTOWANIA } },
            { id: 'proby',        label: 'Próby w przeszłości',         input: { type: 'radio', options: VISIT_DICT.RYZYKO_PROBY } },
            { id: 'slady',        label: 'Widoczne ślady samouszkodzeń',input: { type: 'radio', options: VISIT_DICT.RYZYKO_SLADY } },

            // Czynniki ochronne (oznaczone sub-headerem w labelu)
            { id: '__header_ochrona', label: '— Czynniki ochronne —', input: { type: 'header' }, notes: false },

            { id: 'powstrzymuje',  label: 'Co powstrzymuje przed działaniem',               fullWidth: true },
            { id: 'osoba',         label: 'Osoba dostępna do kontaktu dziś/w nocy',         input: { type: 'text' } },
            { id: 'zdolnoscBezp',  label: 'Zdolność do utrzymania bezpieczeństwa',          input: { type: 'radio', options: VISIT_DICT.ZDOLNOSC_BEZP } },
            { id: 'gotowosc',      label: 'Gotowość do skorzystania z pomocy',              input: { type: 'radio', options: VISIT_DICT.GOTOWOSC_POMOC } },

            { id: 'podsumowanie',  label: 'Podsumowanie ryzyka S',                          input: { type: 'select', options: VISIT_DICT.RYZYKO_S }, notes: false }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.13 Testy przesiewowe (⬆ first, prosty placeholder)
    // ---------------------------------------------------------------------
    {
        id: 'testy',
        title: 'Testy przesiewowe',
        icon: '🧪',
        onlyIn: 'first',
        sectionComment: true,
        subfields: [
            { id: 'testyLink', label: 'Wyniki testów', input: { type: 'link-view', ref: '#/tests' }, notes: false }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.14 Ocena kliniczna
    // ---------------------------------------------------------------------
    {
        id: 'ocenaKliniczna',
        title: 'Ocena kliniczna',
        icon: '🎯',
        defaultOpen: true,
        sectionComment: true,
        subfields: [
            { id: 'hipoteza',        label: 'Hipoteza diagnostyczna', input: { type: 'tag-input-icd10' } },
            { id: 'czynniki',        label: 'Czynniki podtrzymujące', input: { type: 'multi-select', options: VISIT_DICT.CZYNNIKI_PODTRZYMUJACE } },
            { id: 'motywacja',       label: 'Motywacja do leczenia',  input: { type: 'radio', options: VISIT_DICT.MOTYWACJA } },
            { id: 'postawaRodzicow', label: 'Postawa rodziców',       input: { type: 'radio', options: VISIT_DICT.POSTAWA_RODZICOW } }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.15 Rozpoznanie (ICD-10)
    // ---------------------------------------------------------------------
    {
        id: 'rozpoznanie',
        title: 'Rozpoznanie (ICD-10)',
        icon: '📖',
        sectionComment: true,
        subfields: [
            { id: 'diagnozy', label: 'Rozpoznania', input: { type: 'link-view', ref: '#/diagnoses' }, notes: false }
        ]
    },

    // ---------------------------------------------------------------------
    // 2.16 Podjęte oddziaływania
    // ---------------------------------------------------------------------
    {
        id: 'oddzialywania',
        title: 'Podjęte oddziaływania podczas wizyty',
        icon: '➡',
        defaultOpen: true,
        sectionComment: true,
        subfields: [
            { id: 'rekomendacje',     label: 'Rekomendacje', onlyIn: 'first', input: { type: 'multi-select', options: VISIT_DICT.REKOMENDACJE_TYP } },
            { id: 'ustalenia',        label: 'Ustalenia i plan leczenia',                 fullWidth: true },
            { id: 'pilnaKonsultacja', label: 'Pilna konsultacja z innym specjalistą?',    input: { type: 'radio', options: VISIT_DICT.PILNA_KONSULTACJA } },
            { id: 'kontrolna',        label: 'Wizyta kontrolna',                          input: { type: 'select', options: VISIT_DICT.KONTROLNA_TERMIN } },
            { id: 'ewaluacja',        label: 'Ewaluacja',                                 fullWidth: true },
            { id: 'dodatkowe',        label: 'Informacje dodatkowe i zabezpieczenia',     onlyIn: 'first', fullWidth: true }
        ]
    }
];

/** Filtruje schema wg trybu wizyty ('first' / 'followup'). */
export function schemaForMode(mode) {
    return VISIT_FORM_SCHEMA
        .filter((s) => !s.onlyIn || s.onlyIn === mode)
        .map((s) => ({
            ...s,
            subfields: (s.subfields || []).filter((f) => !f.onlyIn || f.onlyIn === mode)
        }));
}
