// ============================================================================
// _fake-data.js — tymczasowe dane demo dla nowych widoków.
//
// Używane gdy StorageProvider nie zwraca jeszcze prawdziwych pacjentów (pierwsze
// uruchomienie, brak podpiętego folderu, itp.). W Fazie 5 (hardening) lub po
// podpięciu Drive / folderu lokalnego te dane zostają zastąpione realnymi.
//
// Struktura zgodna z polami ze starego `index.html` + rozszerzenia z arkuszy
// Magdy (Dokumentacja.xlsx / DIAGNOZA.xlsx).
// ============================================================================

export const FAKE_PATIENTS = [
    {
        id: 'P001',
        kodPacjenta: 'P001',
        imie: 'Magdalena',
        nazwisko: 'Bogusz',
        dataUrodzenia: '1991-05-12',
        wiek: '35 lat',
        plec: 'Kobieta',
        telefon: '+48 500 100 200',
        email: 'magdalena.bogusz@example.com',
        pesel: '91051212345',
        adres: 'ul. Długa 12, Warszawa',
        kontaktNaglyImie: 'Jan Bogusz',
        kontaktNaglyTelefon: '+48 500 999 000',
        kontaktNaglyRelacja: 'małżonek',
        zgodaRodo: true,
        zgodaRodoData: '2025-11-15',
        zgodaLeczenie: true,
        zgodaLeczenieData: '2025-11-15',
        zrodloSkierowania: 'lekarz rodzinny'
    },
    {
        id: 'P002',
        kodPacjenta: 'P002',
        imie: 'Michał',
        nazwisko: 'Bogusz',
        dataUrodzenia: '2013-06-28',
        wiek: '12 lat',
        plec: 'Mężczyzna',
        telefon: '',
        email: '',
        pesel: '13062812345',
        adres: 'ul. Długa 12, Warszawa',
        matkaTelefon: '+48 500 100 200',
        matkaEmail: 'magdalena.bogusz@example.com',
        ojciecTelefon: '+48 500 999 000',
        ojciecEmail: 'jan.bogusz@example.com',
        ograniczonePrawa: false,
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
        wiek: '31 lat',
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
        wiek: '38 lat',
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
        wiek: '53 lat',
        plec: 'Kobieta',
        telefon: '+48 800 400 500',
        pesel: '72072212345'
    }
];

// Wizyty — powiązane przez patientId. Status:
//   - paid        : ✓ Zapłacono
//   - unpaid      : ☐ Nie zapłacono
//   - draft       : szkic (niezapisany)
//   - completed   : zakończona (bez rozliczenia jeszcze)
// Typ wizyty:
//   - interview   : Wywiad kliniczny (1. wizyta)
//   - followup    : Kolejna wizyta (kontynuacja)
//   - diagnosis   : Diagnoza rozszerzona
//   - quick       : Nowa wizyta (skrót)
// Wszystkie historyczne wizyty są oznaczone jako `closed: true` (to wpisy
// medyczne). Robocze wizyty (closed=false) powstają w UI przez „+ Nowa wizyta".
export const FAKE_VISITS = [
    {
        id: 'V1001', patientId: 'P001', date: '2026-04-15', time: '14:30',
        type: 'followup', paid: true, closed: true,
        summary: 'Kontynuacja — poprawa snu, obniżona lękliwość',
        duration: 50
    },
    {
        id: 'V1000', patientId: 'P001', date: '2026-04-01', time: '14:30',
        type: 'followup', paid: true, closed: true,
        summary: 'Wprowadzenie techniki uważności, praca nad automatycznymi myślami',
        duration: 50
    },
    {
        id: 'V0999', patientId: 'P001', date: '2026-03-22', time: '15:00',
        type: 'interview', paid: true, closed: true,
        summary: 'Wywiad kliniczny — epizod depresyjny umiarkowany + lęk uogólniony',
        duration: 90
    },
    {
        id: 'V0998', patientId: 'P001', date: '2026-02-11', time: '10:00',
        type: 'diagnosis', paid: false, closed: true,
        summary: 'Diagnoza rozszerzona — historia edukacji, relacje rodzinne',
        duration: 90
    },
    {
        id: 'V1100', patientId: 'P002', date: '2026-04-04', time: '11:00',
        type: 'interview', paid: true, closed: true,
        summary: 'Pierwsza konsultacja z rodzicami, trudności adaptacyjne w szkole',
        duration: 60
    },
    {
        id: 'V1200', patientId: 'P003', date: '2026-04-10', time: '13:00',
        type: 'interview', paid: true, closed: true,
        summary: 'Konsultacja diagnostyczna',
        duration: 60
    }
];


// Leki pacjenta (nazwa handlowa, substancja, max dawka, notatki)
// Zgodne z wymaganiem z rysunku Magdy: LISTA — NAZWA — SUBSTANCJA → MAX DAWKA
export const FAKE_MEDS = [
    {
        id: 'M1', patientId: 'P001',
        name: 'Sertralina 50mg',
        substance: 'Sertralina',
        dose: '100 mg/d',
        maxDose: '200 mg/d',
        prescribedAt: '2026-03-22',
        prescribedBy: 'psychiatra',
        notes: 'Zwiększono z 50 do 100 mg od 15.04'
    },
    {
        id: 'M2', patientId: 'P001',
        name: 'Xanax 0.25mg',
        substance: 'Alprazolam',
        dose: '0.5 mg/d (w razie potrzeby)',
        maxDose: '3 mg/d',
        prescribedAt: '2026-03-22',
        prescribedBy: 'psychiatra',
        notes: 'Tylko w sytuacjach napadowych'
    }
];

// Baza leków psychotropowych (słownik) — re-eksport z `_meds-dict.js` jako
// single source of truth. ~120 preparatów handlowych w 5 grupach klinicznych
// (zgodnie z arkuszem „Leki psychotropowe" z Dokumentacja.xlsx).
//
// Konsumenci (`modal-med.js`, `view-settings.js`) używają tego samego API:
//   { name, substance, maxDose, group }
// — zmiana jest non-breaking, tylko rozszerzenie listy (z 11 do ~120 wpisów).
export { FAKE_MED_DICT } from './_meds-dict.js';

// Diagnozy pacjenta (ICD-10 / ICD-11)
export const FAKE_DIAGNOSES = [
    {
        id: 'D1', patientId: 'P001',
        code: 'F32.1',
        description: 'Epizod depresyjny umiarkowany',
        assignedAt: '2026-03-22',
        author: 'psycholog kliniczny',
        status: 'aktualne'
    },
    {
        id: 'D2', patientId: 'P001',
        code: 'F41.1',
        description: 'Zaburzenia lękowe uogólnione',
        assignedAt: '2026-03-22',
        author: 'psycholog kliniczny',
        status: 'aktualne'
    }
];

// Zalecenia (swobodny tekst / lista)
export const FAKE_RECOMMENDATIONS = [
    {
        id: 'R1', patientId: 'P001',
        title: 'Plan terapii CBT',
        createdAt: '2026-03-22',
        content: 'Psychoterapia CBT 10 sesji (cotygodniowo). Zadania domowe: dziennik myśli automatycznych.',
        done: false
    },
    {
        id: 'R2', patientId: 'P001',
        title: 'Higiena snu',
        createdAt: '2026-04-01',
        content: 'Stała pora kładzenia się spać (22:30), rezygnacja z ekranu 1h przed snem, krótkie medytacje.',
        done: false
    }
];

// Testy (PHQ-9, GAD-7, MoCA, ...)
export const FAKE_TESTS = [
    {
        id: 'T1', patientId: 'P001',
        code: 'PHQ-9',
        name: 'Kwestionariusz depresji (PHQ-9)',
        date: '2026-04-10',
        score: 14,
        interpretation: 'Depresja umiarkowana'
    },
    {
        id: 'T2', patientId: 'P001',
        code: 'GAD-7',
        name: 'Kwestionariusz lęku uogólnionego (GAD-7)',
        date: '2026-04-10',
        score: 12,
        interpretation: 'Lęk umiarkowany'
    },
    {
        id: 'T3', patientId: 'P001',
        code: 'PHQ-9',
        name: 'Kwestionariusz depresji (PHQ-9)',
        date: '2026-03-22',
        score: 18,
        interpretation: 'Depresja umiarkowana / ciężka'
    }
];

// Katalog dostępnych typów testów (dla szybkiego uruchamiania)
export const TEST_CATALOG = [
    { code: 'PHQ-9',  name: 'PHQ-9',   description: 'Depresja',         questions: 9 },
    { code: 'GAD-7',  name: 'GAD-7',   description: 'Lęk uogólniony',   questions: 7 },
    { code: 'MoCA',   name: 'MoCA',    description: 'Funkcje poznawcze', questions: 30 },
    { code: 'AUDIT',  name: 'AUDIT',   description: 'Alkohol',          questions: 10 },
    { code: 'DAST-10', name: 'DAST-10', description: 'Substancje',       questions: 10 },
    { code: 'SCOFF',  name: 'SCOFF',   description: 'Zaburzenia odżywiania', questions: 5 }
];

// Typy wizyt (wybór po kliknięciu „+ Nowa wizyta")
export const VISIT_TYPES = [
    {
        id: 'interview',
        label: 'Wywiad kliniczny (1. wizyta)',
        icon: '🆕',
        description: 'Pełny formularz wywiadu — historia, objawy, funkcjonowanie somatyczne, MSE, rozpoznanie, plan.',
        recommendedFor: 'pierwsza wizyta / konsultacja diagnostyczna'
    },
    {
        id: 'followup',
        label: 'Kolejna wizyta (kontynuacja)',
        icon: '➕',
        description: 'Skrócony formularz — notatka z bieżącej wizyty + zmiany od poprzedniej.',
        recommendedFor: 'sesja w toku terapii'
    },
    {
        id: 'diagnosis',
        label: 'Diagnoza rozszerzona',
        icon: '🔬',
        description: 'Pogłębiony wywiad wielodomenowy (ciąża, edukacja, historia rodzinna, warunki, zasoby).',
        recommendedFor: 'gdy potrzebne jest pełne rozeznanie'
    },
    {
        id: 'quick',
        label: 'Nowa wizyta (skrót)',
        icon: '⚡',
        description: 'Minimalna notatka — data, rodzaj, krótka uwaga. Można rozwinąć później.',
        recommendedFor: 'szybki zapis w trakcie dnia'
    }
];

// -- Helpers ----------------------------------------------------------------

export function patientsFindById(id) {
    return FAKE_PATIENTS.find((p) => p.id === id) || null;
}

export function visitsForPatient(patientId) {
    return FAKE_VISITS
        .filter((v) => v.patientId === patientId)
        .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
}

export function medsForPatient(patientId) {
    return FAKE_MEDS.filter((m) => m.patientId === patientId);
}

export function diagnosesForPatient(patientId) {
    return FAKE_DIAGNOSES.filter((d) => d.patientId === patientId);
}

export function recommendationsForPatient(patientId) {
    return FAKE_RECOMMENDATIONS.filter((r) => r.patientId === patientId);
}

export function testsForPatient(patientId) {
    return FAKE_TESTS
        .filter((t) => t.patientId === patientId)
        .sort((a, b) => b.date.localeCompare(a.date));
}

export function visitTypeById(id) {
    return VISIT_TYPES.find((t) => t.id === id) || null;
}
