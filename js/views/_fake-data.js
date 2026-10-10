// ============================================================================
// _fake-data.js — dane przykładowe trybu demo (bez podłączonego magazynu).
//
// Służą wyłącznie do obejrzenia aplikacji i testów. Po podłączeniu Dysku Google
// lub folderu aplikacja pokazuje tylko to, co jest w magazynie.
// ============================================================================

export const FAKE_PATIENTS = [
    {
        id: 'P001',
        kodPacjenta: 'P001',
        imie: 'Magdalena',
        nazwisko: 'Bogusz',
        dataUrodzenia: '1991-05-12',
        plec: 'Kobieta',
        telefon: '+48 500 100 200',
        email: 'magdalena.bogusz@example.com',
        pesel: '91051212345',
        ulica: 'ul. Długa 12',
        miasto: 'Warszawa',
        kontaktNaglyImie: 'Jan Bogusz',
        kontaktNaglyTelefon: '+48 500 999 000',
        kontaktNaglyRelacja: 'małżonek',
        zgodaRodo: true,
        zgodaRodoData: '2025-11-15'
    },
    {
        id: 'P002',
        kodPacjenta: 'P002',
        imie: 'Michał',
        nazwisko: 'Bogusz',
        dataUrodzenia: '2013-06-28',
        plec: 'Mężczyzna',
        telefon: '',
        email: '',
        pesel: '13062812345',
        ulica: 'ul. Długa 12',
        miasto: 'Warszawa',
        matkaTelefon: '+48 500 100 200',
        matkaEmail: 'magdalena.bogusz@example.com',
        ojciecTelefon: '+48 500 999 000',
        ojciecEmail: 'jan.bogusz@example.com',
        minor: true,
        zgodaRodo: true,
        zgodaRodoData: '2025-11-15'
    },
    {
        id: 'P003',
        kodPacjenta: 'P003',
        imie: 'Anna',
        nazwisko: 'Nowak',
        dataUrodzenia: '1995-03-17',
        plec: 'Kobieta',
        telefon: '+48 600 200 300',
        pesel: '95031712345'
    },
    {
        id: 'P004',
        kodPacjenta: 'P004',
        imie: 'Marek',
        nazwisko: 'Wiśniewski',
        dataUrodzenia: '1988-11-03',
        plec: 'Mężczyzna',
        telefon: '+48 700 300 400',
        pesel: '88110312345'
    },
    {
        id: 'P005',
        kodPacjenta: 'P005',
        imie: 'Ewa',
        nazwisko: 'Lewandowska',
        dataUrodzenia: '1972-07-22',
        plec: 'Kobieta',
        telefon: '+48 800 400 500',
        pesel: '72072212345'
    }
];

// Wizyty przykładowe — w tym samym kształcie, jaki zapisuje formularz wizyty:
// `data._raw` (klucze `sekcja.pole`) + `data.meds` / `data.diagnoses`.
export const FAKE_VISITS = [
    {
        id: 'V1001', patientId: 'P001', date: '2026-04-15', time: '14:30',
        type: 'next_meeting', paid: true, duration: 50,
        summary: 'Kontynuacja — poprawa snu, obniżona lękliwość',
        data: {
            _raw: {
                'visitData.data': '2026-04-15',
                'visitData.rodzaj': 'Wizyta terapeutyczna',
                'visitData.osoby': ['Pacjent'],
                'visitData.powod': 'Kontynuacja — poprawa snu, obniżona lękliwość.',
                'somatyczne.sen': 'prawidłowy',
                'somatyczne.sen.__notes': 'od ok. tygodnia zasypia w 15–20 minut bez leków nasennych',
                'status.obserwacje': 'Pacjentka relacjonuje znaczącą poprawę jakości snu. Lękliwość w sytuacjach społecznych obniżona o ok. 40% (ocena subiektywna). Kontynuujemy ekspozycję stopniową.',
                'oddzialywania.ustalenia': 'Praca nad asertywnością w kontekście zawodowym. Zadanie domowe: rozmowa z przełożonym o zmianie zakresu obowiązków.',
                'oddzialywania.kontrolna': 'za 2 tygodnie'
            },
            meds: [
                { name: 'Setaloft', substance: 'Sertralina', group: 'Leki przeciwdepresyjne', dose: '100', unit: 'mg/d', maxDose: '200 mg/d' }
            ],
            diagnoses: [],
            tests: [
                { id: 'T1', code: 'PHQ-9', name: 'Kwestionariusz depresji (PHQ-9)', score: 14, interpretation: 'Umiarkowana depresja (10–14). Wskazana konsultacja i plan leczenia.' },
                { id: 'T2', code: 'GAD-7', name: 'Kwestionariusz lęku uogólnionego (GAD-7)', score: 12, interpretation: 'Lęk umiarkowany' }
            ],
            docs: []
        }
    },
    {
        id: 'V1000', patientId: 'P001', date: '2026-04-01', time: '14:30',
        type: 'next_meeting', paid: true, duration: 50,
        summary: 'Wprowadzenie techniki uważności, praca nad automatycznymi myślami',
        data: {
            _raw: {
                'visitData.data': '2026-04-01',
                'visitData.rodzaj': 'Wizyta terapeutyczna',
                'visitData.osoby': ['Pacjent'],
                'status.obserwacje': 'Wprowadzona technika uważności (skanowanie ciała, 10 min dziennie). Praca nad identyfikacją automatycznych myśli negatywnych. Pacjentka zaczyna zauważać schemat „katastrofizacji".',
                'oddzialywania.ustalenia': 'Dziennik myśli automatycznych przez 7 dni. Kontynuacja medytacji.',
                'zalecenia.tresc': 'Higiena snu: stała pora kładzenia się spać (22:30), rezygnacja z ekranu godzinę przed snem, krótkie medytacje.',
                'parametry.wzrost': '168',
                'parametry.masa': '61',
                'parametry.bmi': '21.6'
            },
            meds: [
                { name: 'Setaloft', substance: 'Sertralina', group: 'Leki przeciwdepresyjne', dose: '50', unit: 'mg/d', maxDose: '200 mg/d' }
            ],
            diagnoses: []
        }
    },
    {
        id: 'V0999', patientId: 'P001', date: '2026-03-22', time: '15:00',
        type: 'first_meeting', paid: false, duration: 90,
        summary: 'Wywiad kliniczny — epizod depresyjny umiarkowany + lęk uogólniony',
        data: {
            _raw: {
                'visitData.data': '2026-03-22',
                'visitData.rodzaj': 'Konsultacja',
                'visitData.osoby': ['Pacjent'],
                'visitData.powod': 'Obniżony nastrój utrzymujący się od ok. 6 miesięcy, narastający lęk, problemy ze snem, spadek motywacji w pracy. Zgłosiła się sama po rekomendacji lekarza rodzinnego.',
                'wywiad.depresyjne': ['anhedonia', 'obniżony nastrój', 'poczucie winy', 'bezsenność', 'utrata energii'],
                'wywiad.lekowe': ['GAD (uogólniony)', 'zamartwianie', 'lęk antycypacyjny'],
                'przemoc.wynik': 'nie',
                'problemZdrowotny.__comment': 'Trudności z koncentracją w pracy, wycofanie z kontaktów towarzyskich, płaczliwość wieczorami.',
                'somatyczne.sen': 'problem z zasypianiem',
                'somatyczne.sen.__notes': '2–3 godziny, od około pół roku',
                'ocenaKliniczna.hipoteza': 'F32.1,F41.1',
                'ocenaKliniczna.motywacja': 'wysoka (z własnej inicjatywy)',
                'oddzialywania.rekomendacje': ['psychoterapia indywidualna', 'konsultacja psychiatryczna'],
                'oddzialywania.ustalenia': 'Psychoterapia CBT, 10 sesji co tydzień. Konsultacja psychiatryczna pod kątem farmakoterapii.',
                'oddzialywania.kontrolna': 'za tydzień',
                'zalecenia.tresc': 'Plan terapii CBT: 10 sesji, co tydzień. Zadanie domowe: dziennik myśli automatycznych.'
            },
            meds: [],
            diagnoses: [
                { code: 'F32.1', description: 'Epizod depresyjny umiarkowany' },
                { code: 'F41.1', description: 'Zaburzenia lękowe uogólnione' }
            ],
            tests: [
                { id: 'T3', code: 'PHQ-9', name: 'Kwestionariusz depresji (PHQ-9)', score: 18, interpretation: 'Umiarkowana / ciężka depresja (15–19). Rozważyć farmakoterapię + psychoterapię.' }
            ],
            docs: []
        }
    },
    {
        id: 'V1100', patientId: 'P002', date: '2026-04-04', time: '11:00',
        type: 'first_meeting', paid: true, duration: 60,
        summary: 'Pierwsza konsultacja z rodzicami, trudności adaptacyjne w szkole',
        data: {
            _raw: {
                'visitData.data': '2026-04-04',
                'visitData.rodzaj': 'Konsultacja rodziców',
                'visitData.osoby': ['Matka i ojciec'],
                'visitData.powod': 'Trudności adaptacyjne syna (12 l.) po zmianie szkoły — wycofanie, niechęć do wychodzenia z domu, spadek ocen.',
                'oddzialywania.ustalenia': 'Spotkanie indywidualne z dzieckiem za tydzień. Wywiad z wychowawcą klasy (za zgodą rodziców).'
            },
            meds: [],
            diagnoses: []
        }
    },
    {
        id: 'V1200', patientId: 'P003', date: '2026-04-10', time: '13:00',
        type: 'first_meeting', paid: true, duration: 60,
        summary: 'Konsultacja diagnostyczna',
        data: {
            _raw: {
                'visitData.data': '2026-04-10',
                'visitData.rodzaj': 'Konsultacja',
                'visitData.osoby': ['Pacjent'],
                'visitData.powod': 'Powracające ataki paniki w sytuacjach zawodowych (prezentacje publiczne). Pierwszy epizod ok. 3 miesiące temu.',
                'wywiad.lekowe': ['napady paniki', 'lęk antycypacyjny'],
                'oddzialywania.ustalenia': 'Wywiad pogłębiony na kolejnej wizycie. Wstępnie: techniki oddechowe + dziennik objawów.'
            },
            meds: [],
            diagnoses: []
        }
    }
];

// Zalecenia i wyniki testów są częścią wizyt powyżej (`zalecenia.tresc`, `tests`).

// Baza leków (słownik) — jedno źródło: `_meds-dict.js`.
export { FAKE_MED_DICT } from './_meds-dict.js';

// Typy wizyt — jedno źródło: `_visit-types.js`.
export { VISIT_TYPES, visitTypeById } from './_visit-types.js';
