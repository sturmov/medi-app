// ============================================================================
// tools/test-patient-doc.mjs — test bezstratności zapisu (bez przeglądarki).
//
//   node tools/test-patient-doc.mjs
//
// Wypełnia KAŻDE pole schematu wizyty (oba tryby), po czym sprawdza, że:
//   1. czytelny opis wizyty zawiera każde pole i nic nie wpada do „Pozostałe",
//   2. dokument pacjenta wraca identyczny po zapisie do XLSX i odczycie,
//   3. cięcie dokumentu na komórki nie psuje emoji ani spacji,
//   4. osie czasu (leki, rozpoznania, parametry, plan) widzą dane z wizyt.
// ============================================================================

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.XLSX = require('../lib/xlsx-js-style.min.js');

const { schemaForMode } = await import('../js/views/_visit-form-schema.js');
const { VISIT_DICT } = await import('../js/views/_visit-dict.js');
const D = await import('../js/views/_visit-describe.js');
const { buildPatientDoc, parsePatientDoc, patientSummary, patientFolderName } = await import('../js/views/_patient-doc.js');
const { buildTabs, docToChunks, chunksToDoc, DATA_TAB } = await import('../js/views/_sheet-model.js');
const { writePatientWorkbook, readPatientWorkbook } = await import('../js/views/_xlsx-codec.js');

let passed = 0;
function check(name, fn) {
    try { fn(); passed++; console.log('  ✓ ' + name); }
    catch (e) { console.error('  ✗ ' + name + '\n    ' + (e && e.message || e)); process.exitCode = 1; }
}

/** Wypełnia wszystkie pola danego trybu wartościami pasującymi do typu. */
function fillVisit(mode, type, id) {
    const raw = {};
    const expectLabels = [];
    for (const section of schemaForMode(mode)) {
        if (section.sectionComment) raw[section.id + '.__comment'] = 'Komentarz: ' + section.title;
        for (const f of section.subfields) {
            const t = (f.input && f.input.type) || 'textarea';
            const key = section.id + '.' + f.id;
            const opts = (f.input && f.input.options) || [];
            if (t === 'header' || t === 'link-view' || t === 'inline-meds' || t === 'inline-diagnoses') continue;
            if (t === 'uzywki-special') {
                raw[section.id + '_u_2'] = true;
                raw[section.id + '_u_2_i'] = 'Regularnie';
                raw[section.id + '_u_2_n'] = 'weekendy';
                raw[section.id + '_u_5_n'] = 'tylko uwaga, bez zaznaczenia';
                continue;
            }
            if (t === 'multi-select' || t === 'checkbox-group') raw[key] = opts.slice(0, 2);
            else if (t === 'select' || t === 'radio') raw[key] = opts[0];
            else if (t === 'number') raw[key] = f.id === 'wzrost' ? '170' : f.id === 'masa' ? '65' : '22.5';
            else if (t === 'date') raw[key] = '2026-10-06';
            else if (t === 'tag-input-icd10') raw[key] = 'F32.1,F41.1';
            else raw[key] = 'Tekst pola „' + f.label + '" 🙂\ndruga linia';
            if (f.notes !== false && t !== 'textarea') raw[key + '.__notes'] = 'uwaga do: ' + f.id;
            expectLabels.push(f.label);
        }
    }
    return {
        visit: {
            id, patientId: 'P900', type, date: '2026-10-06', time: '10:30', paid: false, duration: 50, summary: '',
            data: {
                _raw: raw,
                meds: [{ name: 'Zoloft', substance: 'Sertralina', group: 'Leki przeciwdepresyjne', dose: '50', unit: 'mg/d', maxDose: '200 mg/d' }],
                diagnoses: [{ code: 'F32.1', description: 'Epizod depresyjny umiarkowany' }]
            }
        },
        expectLabels
    };
}

const first = fillVisit('first', 'first_meeting', 'V1');
const next = fillVisit('followup', 'next_meeting', 'V2');
next.visit.date = '2026-10-20';

const state = {
    patients: [{
        id: 'P900', kodPacjenta: 'P900', imie: 'Żaneta', nazwisko: 'Łęcka-Śliwa', pesel: '44051401359',
        ulica: 'Wiejska 4/2', kodPocztowy: '00-902', miasto: 'Warszawa', telefon: '+48 600 100 200',
        zgodaRodo: true, zgodaRodoData: '2026-01-15', innePole: 'notatka', minor: false,
        _ref: 'private-should-not-be-saved', _loaded: true
    }],
    visits: [first.visit, next.visit, { id: 'VX', patientId: 'P001', type: 'next_meeting', date: '2026-01-01', data: { _raw: {} } }],
    recommendations: [{ id: 'R1', patientId: 'P900', title: 'Higiena snu', content: 'stała pora', createdAt: '2026-10-06', done: false }],
    tests: [{ id: 'T1', patientId: 'P900', code: 'PHQ-9', name: 'PHQ-9', date: '2026-10-06', score: 14, interpretation: 'umiarkowana', answers: [1, 2, 3] }]
};

console.log('\nOpis wizyty');
check('tryb wynika z typu wizyty', () => {
    assert.equal(D.visitMode('first_meeting'), 'first');
    for (const t of ['next_meeting', 'supervision', 'admin_note', 'phone_contact', 'email_contact']) {
        assert.equal(D.visitMode(t), 'followup');
    }
});
for (const [label, sample] of [['pierwsza wizyta', first], ['kolejna wizyta', next]]) {
    check(label + ': każde wypełnione pole jest w opisie, nic w „Pozostałe"', () => {
        const d = D.describeVisit(sample.visit);
        const labels = new Set(d.sections.flatMap((s) => s.fields.map((f) => f.label)));
        const missing = sample.expectLabels.filter((l) => !labels.has(l));
        assert.deepEqual(missing, []);
        assert.deepEqual(d.other, []);
        assert.ok(d.sections.every((s) => !s.title || s.comment || s.fields.length));
    });
}
check('leki, rozpoznania i używki są częścią opisu wizyty', () => {
    const d = D.describeVisit(first.visit);
    const all = d.sections.flatMap((s) => s.fields);
    assert.ok(all.some((f) => /Zoloft \(Sertralina\) — 50 mg\/d, max 200 mg\/d/.test(f.value)));
    assert.ok(all.some((f) => /F32\.1 — Epizod depresyjny umiarkowany/.test(f.value)));
    const alkohol = all.find((f) => f.label === VISIT_DICT.UZYWKI_11[2]);
    assert.equal(alkohol.value, 'TAK · Regularnie');
    assert.equal(alkohol.notes, 'weekendy');
    assert.ok(all.some((f) => f.label === VISIT_DICT.UZYWKI_11[5] && f.notes));
});
check('pole z samą uwagą liczy się jako wypełnione', () => {
    const field = { id: 'sen', input: { type: 'radio' } };
    assert.equal(D.isFieldFilled('somatyczne', field, { 'somatyczne.sen.__notes': 'budzi się o 3' }, {}), true);
    assert.equal(D.isFieldFilled('somatyczne', field, { 'somatyczne.sen': '' }, {}), false);
});
check('klucz spoza schematu nie ginie — trafia do „Pozostałe"', () => {
    const d = D.describeVisit({ type: 'next_meeting', data: { _raw: { 'stare.poleUsuniete': 'treść' } } });
    assert.deepEqual(d.other, [{ label: 'Pole Usuniete', value: 'treść' }]);
});

console.log('\nOsie czasu');
check('leki / rozpoznania / parametry / plan — od najnowszej wizyty', () => {
    const visits = [first.visit, next.visit];
    assert.deepEqual(D.medsTimeline(visits).map((e) => e.visit.id), ['V2', 'V1']);
    assert.equal(D.diagnosesTimeline(visits).length, 2);
    assert.equal(D.parametersTimeline(visits)[0].bmi, '22.5');
    const plan = D.treatmentPlanTimeline(visits);
    assert.equal(plan.length, 2);
    assert.match(plan[0].ustalenia, /Ustalenia i plan leczenia/);
});

console.log('\nDokument pacjenta');
const doc = buildPatientDoc(state, 'P900');
check('dokument zawiera tylko dane tego pacjenta, bez pól roboczych', () => {
    assert.equal(doc.visits.length, 2);
    assert.equal(doc.patient._ref, undefined);
    assert.equal(doc.patient._loaded, undefined);
    assert.equal(patientSummary(doc).lastVisit, '2026-10-20');
    assert.equal(patientFolderName(doc.patient), 'P900_Lecka-Sliwa_Zaneta');
});
check('obcy plik jest odrzucany', () => {
    assert.throws(() => parsePatientDoc('{"foo":1}'));
    assert.throws(() => chunksToDoc(['', '']));
});

console.log('\nArkusz (XLSX = ten sam układ co Google Sheets)');
const tabs = buildTabs(doc);
check('zakładki czytelne + ukryta zakładka danych', () => {
    assert.deepEqual(tabs.map((t) => t.title),
        ['Pacjent', 'Wizyty', 'Leki', 'Diagnozy', 'Parametry', 'Plan leczenia', 'Zalecenia', 'Testy', DATA_TAB]);
    assert.equal(tabs.at(-1).hidden, true);
    for (const t of tabs) for (const r of t.rows) assert.equal(r.length, t.columns.length, t.title);
});
check('zakładka Pacjent ma adres w trzech polach', () => {
    const rows = tabs[0].rows.map((r) => r[1] + '=' + r[2]);
    assert.ok(rows.includes('Ulica=Wiejska 4/2') && rows.includes('Kod pocztowy=00-902') && rows.includes('Miasto=Warszawa'));
});
check('zakładka Wizyty zawiera komentarze sekcji i uwagi do pól', () => {
    const rows = tabs[1].rows;
    assert.ok(rows.some((r) => r[4] === 'Komentarz / opis' && /^Komentarz: /.test(r[5])));
    assert.ok(rows.some((r) => r[6] === 'uwaga do: sen'));
    assert.ok(rows.length >= first.expectLabels.length + next.expectLabels.length);
});
check('zapis do XLSX i odczyt zwracają identyczny dokument', () => {
    const back = readPatientWorkbook(writePatientWorkbook(doc));
    assert.deepEqual(back, parsePatientDoc(JSON.parse(JSON.stringify(doc))));
    assert.deepEqual(back.visits[0].data._raw, first.visit.data._raw);
    assert.deepEqual(back.visits[1].data.meds, next.visit.data.meds);
});
check('duży dokument: cięcie na komórki nie psuje emoji ani spacji', () => {
    const big = JSON.parse(JSON.stringify(doc));
    big.visits[0].data._raw['status.obserwacje'] = ('🙂 a  b ' + 'ź'.repeat(7)).repeat(9000);
    const chunks = docToChunks(big);
    assert.ok(chunks.length > 3);
    for (const c of chunks) {
        assert.ok(c.length <= 32767, 'kawałek mieści się w komórce XLSX');
        assert.ok(!/^[ \t]|[ \t]$/.test(c), 'kawałek nie zaczyna / nie kończy się spacją');
        const last = c.charCodeAt(c.length - 1);
        assert.ok(!(last >= 0xD800 && last <= 0xDBFF), 'kawałek nie przecina emoji');
    }
    assert.deepEqual(chunksToDoc(chunks), parsePatientDoc(big));
    assert.deepEqual(readPatientWorkbook(writePatientWorkbook(big)), parsePatientDoc(big));
});

console.log('\nŚwięta (dni wolne od pracy)');
const H = await import('../js/views/_holidays-pl.js');
check('Wielkanoc i święta ruchome wypadają we właściwe dni', () => {
    const day = (y) => H.easterSunday(y).toISOString().slice(0, 10);
    assert.deepEqual([day(2024), day(2025), day(2026), day(2027)], ['2024-03-31', '2025-04-20', '2026-04-05', '2027-03-28']);
    const y26 = Object.fromEntries(H.polishHolidays(2026).map((h) => [h.name, h.date]));
    assert.equal(y26['Poniedziałek Wielkanocny'], '2026-04-06');
    assert.equal(y26['Zielone Świątki'], '2026-05-24');
    assert.equal(y26['Boże Ciało'], '2026-06-04');
    assert.equal(y26['Święto Niepodległości'], '2026-11-11');
});
check('14 dni wolnych w roku (13 przed 2025 — bez Wigilii); wyszukiwanie w zakresie dat', () => {
    assert.equal(H.polishHolidays(2026).length, 14);
    assert.equal(H.polishHolidays(2024).length, 13);
    assert.deepEqual(H.holidaysBetween('2026-12-20', '2027-01-07').map((h) => h.date),
        ['2026-12-24', '2026-12-25', '2026-12-26', '2027-01-01', '2027-01-06']);
});

console.log('\n' + (process.exitCode ? '❌ Są błędy.' : '✅ Wszystkie testy przeszły (' + passed + ').'));
