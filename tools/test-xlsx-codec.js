// ============================================================================
// tools/test-xlsx-codec.js — szybki test offline paczki K1.
//
// Uruchom:  node tools/test-xlsx-codec.js
//
// Wygeneruje plik `tools/test_output_pacjent.xlsx` z fake-pacjentem zawierającym
// wszystkie typy danych (wizyty, leki, diagnozy, zalecenia, testy, plan, parametry).
// Otwórz go ręcznie w Excelu/LibreOffice, żeby obejrzeć wszystkie 8 zakładek
// w nowym formacie PsychoApp v1.
//
// Symuluje przeglądarkę dla `_xlsx-codec.js`:
//   - ładuje xlsx-js-style do globalThis.XLSX
//   - mockuje Blob/URL.createObjectURL (nie używamy ich w writePatientWorkbook)
//   - dynamicznie importuje ESM `_xlsx-codec.js` przez `import()`
// ============================================================================

const fs = require('fs');
const path = require('path');

// 1. Załaduj xlsx-js-style → globalThis.XLSX (jak w przeglądarce)
//    W Node biblioteka eksportuje przez module.exports — przypisujemy do globalThis.
const XLSX = require('../lib/xlsx-js-style.min.js');
globalThis.XLSX = XLSX;

if (typeof globalThis.XLSX === 'undefined' || !globalThis.XLSX.utils) {
    console.error('[FAIL] xlsx-js-style nie wyeksportował obiektu XLSX');
    process.exit(1);
}
console.log('[OK] XLSX library loaded, version:', globalThis.XLSX.version || '(unknown)');

// 2. Mock fake-pacjenta + wizyt + meds + diagnoz + ...
const FAKE_PATIENT = {
    id: 'P001',
    kodPacjenta: 'P001',
    tytul: 'dr',
    imie: 'Michał',
    drugieImie: 'Adam',
    nazwisko: 'Bogusz',
    pesel: '85040156789',
    plec: 'Mężczyzna',
    dataUrodzenia: '1985-04-01',
    wiek: '40',
    minor: false,
    archived: false,
    obywatelstwo: 'polskie',
    lekarz: 'dr Anna Kowalska',
    placowka: 'Poradnia Zdrowia Psychicznego, Warszawa',
    grupa: 'pacjenci-prywatni',
    uwagi: 'Pacjent współpracujący, dobry kontakt. Preferuje terapię w godzinach popołudniowych.',
    telefon: '+48 600 123 456',
    email: 'michal.bogusz@example.com',
    adres: 'ul. Wiejska 4/2,\n00-902 Warszawa,\nPolska',
    matkaImie: 'Anna Bogusz',
    matkaTelefon: '+48 600 111 222',
    matkaEmail: 'anna.bogusz@example.com',
    ojciecImie: 'Jan Bogusz',
    ojciecTelefon: '+48 600 333 444',
    ojciecEmail: '',
    kontaktNaglyImie: 'Małgorzata Bogusz (żona)',
    kontaktNaglyTelefon: '+48 600 555 666',
    kontaktNaglyRelacja: 'małżonek',
    zgodaRodo: true,
    zgodaRodoData: '2026-01-15',
    zgodaRodoKomentarz: 'Zgoda na przesyłanie wyników mailem, zgoda na kontakt z opiekunem (matka).',
    innePole: 'Pacjent po stracie pracy w 03/2026. Konieczne wsparcie w procesie rekonwalescencji zawodowej. Ważne: alergia na sertralinę (wysypka).',
    opiekaMedycznaHistoria: '2024-2025 — dr Jan Kowalski (psychiatra, terapia farmakologiczna sertraliną, przerwana z powodu alergii).\n2023 — mgr Anna Nowak (psycholog, CBT, ukończona).\n2020-2022 — dr Marek Wiśniewski (lekarz POZ).'
};

const FAKE_VISITS = [
    {
        id: 'V001',
        patientId: 'P001',
        type: 'first_meeting',
        date: '2026-05-08',
        time: '14:00',
        duration: 60,
        paid: true,
        closed: false,
        summary: 'Pierwsze spotkanie, obniżony nastrój, bezsenność.',
        data: {
            _raw: {
                rodzajWizyty: 'pierwszorazowa',
                osobyObecne: ['pacjent', 'matka'],
                powodKonsultacji: 'obniżony nastrój, bezsenność, natrętne myśli, problemy w pracy',
                objawyDepresyjne: 'wyraźne obniżenie nastroju przez ostatnie 3 miesiące, anhedonia, bezsenność wczesnoporanna, utrata apetytu (-4 kg w 2 mies.)',
                hipotezaDiagnostyczna: 'F33.1 — epizod depresyjny umiarkowany, prawdopodobnie zaburzenie depresyjne nawracające (poprzedni epizod 2024)',
                historiaEdukacji: 'Wyższe (magister inżynier), 5 lat w branży IT.',
                historiaRodzinna: 'Ojciec — zaburzenia lękowe, leczony Estazolam. Matka — bez obciążeń. Brat starszy bez obciążeń.',
                zasoby: 'Dobra sieć wsparcia (rodzina, znajomi), wykształcenie wyższe, regularna aktywność fizyczna.',
                plan: 'Konsultacja psychiatryczna w celu rozważenia farmakoterapii. Psychoterapia CBT — 1x/tydzień.',
                planNaNastepne: 'Kontrolne spotkanie za 2 tygodnie, ocena efektów rozmowy z psychiatrą.'
            }
        }
    },
    {
        id: 'V002',
        patientId: 'P001',
        type: 'next_meeting',
        date: '2026-04-15',
        time: '16:00',
        duration: 45,
        paid: false,
        closed: false,
        summary: 'Sesja kontynuacyjna.',
        data: {
            _raw: {
                osobyObecne: 'pacjent',
                cosWaznego: 'Pacjent zgłosił poprawę nastroju po 2 tygodniach przyjmowania nowego leku (Escitalopram 10mg). Sen poprawił się — średnio 7h. Wraca do pracy w niepełnym wymiarze.',
                planNaNastepne: 'Kontynuacja terapii, monitoring efektów leku, ponowna ocena za miesiąc.'
            }
        }
    },
    {
        id: 'V003',
        patientId: 'P001',
        type: 'phone_contact',
        date: '2026-04-20',
        time: '11:30',
        duration: 15,
        paid: true,
        closed: false,
        summary: 'Pacjent dzwonił z pytaniem o nasilenie senności po lekach.',
        data: {
            _raw: {
                cosWaznego: 'Pacjent zgłasza zwiększoną senność dzienną. Zalecono przyjmowanie leku wieczorem zamiast rano. Pacjent zrozumiał, planuje wprowadzić zmianę od jutra.'
            }
        }
    }
];

const FAKE_MEDS = [
    {
        id: 'M001',
        patientId: 'P001',
        name: 'Escitalopram Bluefish',
        substance: 'escitalopram',
        dose: '10 mg/d (rano)',
        maxDose: '20 mg/d',
        prescribedAt: '2026-04-01',
        prescribedBy: 'dr Anna Kowalska',
        notes: 'Po nieskutecznej próbie sertraliny (alergia).',
        linkedVisitId: 'V001'
    }
];

const FAKE_DIAGNOSES = [
    {
        id: 'D001',
        patientId: 'P001',
        code: 'F33.1',
        description: 'Zaburzenie depresyjne nawracające, obecny epizod umiarkowany',
        status: 'aktualne',
        assignedAt: '2026-05-08',
        author: 'dr Anna Kowalska',
        notes: 'Poprzedni epizod 2024.',
        linkedVisitId: 'V001'
    }
];

const FAKE_RECOMMENDATIONS = [
    {
        id: 'R001',
        patientId: 'P001',
        title: 'Regularna aktywność fizyczna',
        content: '30 minut spaceru lub treningu aerobowego dziennie, minimum 5 razy w tygodniu.',
        type: 'styl-życia',
        dueWhen: 'codziennie',
        dueDate: '',
        done: false,
        createdAt: '2026-05-08',
        linkedVisitId: 'V001'
    },
    {
        id: 'R002',
        patientId: 'P001',
        title: 'Dziennik nastrojów',
        content: 'Zapisywanie codziennie wieczorem 3 pozytywne zdarzenia z dnia i ocenę nastroju w skali 1-10.',
        type: 'CBT',
        dueWhen: 'codziennie',
        done: true,
        createdAt: '2026-05-08',
        linkedVisitId: 'V001'
    }
];

const FAKE_TESTS = [
    {
        id: 'T001',
        patientId: 'P001',
        code: 'PHQ-9',
        name: 'Patient Health Questionnaire 9',
        date: '2026-05-08',
        score: 14,
        interpretation: 'Depresja umiarkowana (wynik 10-14: rekomendowane leczenie)',
        redFlag: false,
        raw: JSON.stringify([2, 1, 2, 2, 1, 2, 1, 2, 1])
    },
    {
        id: 'T002',
        patientId: 'P001',
        code: 'GAD-7',
        name: 'Generalized Anxiety Disorder 7',
        date: '2026-05-08',
        score: 8,
        interpretation: 'Łagodne objawy lęku (wynik 5-9)',
        redFlag: false
    }
];

const FAKE_TREATMENT_PLAN = {
    goals: [
        {
            id: 'G001',
            title: 'Redukcja objawów depresji',
            priority: 'wysoki',
            comment: 'Cel główny terapii.',
            tasks: [
                { id: 'T001', text: 'Codzienne ćwiczenia oddechowe (5 min rano)', done: true,  dueDate: '2026-05-15' },
                { id: 'T002', text: 'Spotkania z psychiatrą co 4 tygodnie',     done: false, dueDate: '2026-06-08' },
                { id: 'T003', text: 'CBT 1x/tydzień (12 sesji)',                done: false, dueDate: '2026-08-01' }
            ]
        },
        {
            id: 'G002',
            title: 'Powrót do pracy w pełnym wymiarze',
            priority: 'średni',
            comment: 'Stopniowo, w porozumieniu z pracodawcą.',
            tasks: [
                { id: 'T004', text: 'Rozmowa z przełożonym o powrocie', done: false, dueDate: '2026-05-30' },
                { id: 'T005', text: 'Plan stopniowego zwiększania godzin (3→4→5→6→8)', done: false }
            ]
        }
    ]
};

const FAKE_PARAMETERS = [
    {
        data: '2026-05-08',
        wzrost: 178,
        waga: 72,
        bmi: 22.7,
        cisnienieSkurcz: 128,
        cisnienieRozkurcz: 82,
        tetno: 72,
        komentarz: 'W normie. Pacjent po utracie 4kg w ostatnich 2 miesiącach.'
    }
];

const FULL_PATIENT = {
    patient: FAKE_PATIENT,
    visits: FAKE_VISITS,
    meds: FAKE_MEDS,
    diagnoses: FAKE_DIAGNOSES,
    recommendations: FAKE_RECOMMENDATIONS,
    tests: FAKE_TESTS,
    treatmentPlan: FAKE_TREATMENT_PLAN,
    parameters: FAKE_PARAMETERS
};

// 3. Dynamiczny import ESM + round-trip test
(async () => {
    try {
        const codecUrl = new URL('../js/views/_xlsx-codec.js', `file://${__filename}`).href;
        const codec = await import(codecUrl);
        console.log('[OK] _xlsx-codec.js loaded');

        // ====== WRITE ======
        const buf = codec.writePatientWorkbook(FULL_PATIENT);
        console.log('[OK] writePatientWorkbook() →', buf.byteLength || buf.length, 'bytes');

        const outPath = path.join(__dirname, 'test_output_pacjent.xlsx');
        try {
            fs.writeFileSync(outPath, Buffer.from(buf));
            console.log('[OK] Saved to:', outPath);
        } catch (e) {
            if (e.code === 'EBUSY') {
                console.warn('[SKIP] Plik otwarty w Excelu — pomijam zapis, round-trip leci na buforze.');
            } else {
                throw e;
            }
        }

        // ====== READ (round-trip — wprost z bufora) ======
        const re = codec.readPatientWorkbook(buf);
        console.log('[OK] readPatientWorkbook() — back to FullPatient');

        // Porównanie skrócone — kluczowe pola
        const checks = [
            ['patient.id',         FAKE_PATIENT.id,        re.patient.id],
            ['patient.imie',       FAKE_PATIENT.imie,      re.patient.imie],
            ['patient.nazwisko',   FAKE_PATIENT.nazwisko,  re.patient.nazwisko],
            ['patient.pesel',      FAKE_PATIENT.pesel,     re.patient.pesel],
            ['patient.zgodaRodo',  FAKE_PATIENT.zgodaRodo, re.patient.zgodaRodo],
            ['patient.matkaImie',  FAKE_PATIENT.matkaImie, re.patient.matkaImie],
            ['visits.length',      FAKE_VISITS.length,     re.visits.length],
            ['visits[0].id',       'V001',                 re.visits[0] && re.visits[0].id],
            ['visits[0].paid',     true,                   re.visits[0] && re.visits[0].paid],
            ['visits[0].duration', 60,                     re.visits[0] && re.visits[0].duration],
            ['meds.length',        FAKE_MEDS.length,       re.meds.length],
            ['meds[0].name',       FAKE_MEDS[0].name,      re.meds[0] && re.meds[0].name],
            ['diagnoses.length',   FAKE_DIAGNOSES.length,  re.diagnoses.length],
            ['diagnoses[0].code',  'F33.1',                re.diagnoses[0] && re.diagnoses[0].code],
            ['recommendations.length', FAKE_RECOMMENDATIONS.length, re.recommendations.length],
            ['recommendations[0].done', false,             re.recommendations[0] && re.recommendations[0].done],
            ['tests.length',       FAKE_TESTS.length,      re.tests.length],
            ['tests[0].score',     '14',                   re.tests[0] && re.tests[0].score],
            ['treatmentPlan.goals.length',         2,      re.treatmentPlan.goals.length],
            ['treatmentPlan.goals[0].tasks.length', 3,     re.treatmentPlan.goals[0] && re.treatmentPlan.goals[0].tasks.length],
            ['parameters.length',  FAKE_PARAMETERS.length, re.parameters.length]
        ];
        console.log('\nRound-trip checks:');
        let pass = 0, fail = 0;
        for (const [name, expected, actual] of checks) {
            const ok = JSON.stringify(actual) === JSON.stringify(expected);
            if (ok) {
                console.log('  ✓', name, '=', JSON.stringify(actual));
                pass++;
            } else {
                console.log('  ✗', name, ' expected:', JSON.stringify(expected), 'got:', JSON.stringify(actual));
                fail++;
            }
        }
        console.log('\n' + (fail === 0 ? '✅' : '⚠') + ' Wynik: ' + pass + '/' + checks.length + ' testów przeszło');
        console.log('');
        console.log('Otwórz plik w Excelu/LibreOffice:');
        console.log('  ' + outPath);
        process.exit(fail === 0 ? 0 : 1);
    } catch (e) {
        console.error('[FAIL]', e.stack || e.message || e);
        process.exit(1);
    }
})();
