// ============================================================================
// test-history-extract.mjs — smoke test funkcji `_extractVisitGroupedContent`.
// Symulacja: kopia logiki ekstrakcji bezpośrednio z `js/app-new.js` (PR-J15).
// Test: 3 scenariusze — legacy fake-data, nowe wizyty schema-driven, edge cases.
// Uruchomienie: node tools/test-history-extract.mjs
// ============================================================================

import { schemaForMode } from '../js/views/_visit-form-schema.js';
import { VISIT_DICT } from '../js/views/_visit-dict.js';

// --- KOPIA LOGIKI z app-new.js (jeśli się rozjedzie — fix obu plików!) ---

function _prettyVisitFieldLabel(rawKey) {
    if (!rawKey) return '';
    let key = String(rawKey).replace(/^[a-zA-Z]+\./, '');
    if (key === '__comment' || key === '__notes' || key.endsWith('.__notes') || key.endsWith('.__comment')) {
        return '';
    }
    const map = {
        rodzajWizyty: 'Rodzaj wizyty',
        osobyObecne: 'Osoby obecne',
        powodKonsultacji: 'Powód konsultacji',
        objawyDepresyjne: 'Objawy depresyjne',
        objawyLekowe: 'Objawy lękowe',
        hipotezaDiagnostyczna: 'Hipoteza diagnostyczna',
        plan: 'Plan',
        planNaNastepne: 'Plan na następne spotkanie',
        cosWaznego: 'Co ważnego',
        historiaEdukacji: 'Historia edukacji',
        historiaRodzinna: 'Historia rodzinna',
        zasoby: 'Zasoby pacjenta'
    };
    if (map[key]) return map[key];
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
}

function _formatVisitFieldValue(field, primary, arrayAlt) {
    const type = field && field.input && field.input.type;
    if (type === 'tag-input-icd10') {
        let arr = [];
        if (Array.isArray(primary)) arr = primary;
        else if (typeof primary === 'string' && primary.trim()) {
            arr = primary.split(',').map((s) => s.trim()).filter(Boolean);
        }
        const parts = [];
        for (const item of arr) {
            if (typeof item === 'string') parts.push(item.toUpperCase());
            else if (item && typeof item === 'object' && item.code) {
                const code = String(item.code).toUpperCase();
                const desc = item.description ? ' · ' + item.description : '';
                parts.push(code + desc);
            }
        }
        return parts.join('; ');
    }
    if (type === 'multi-select' || type === 'checkbox-group') {
        let arr = [];
        if (Array.isArray(primary)) arr = primary;
        else if (Array.isArray(arrayAlt)) arr = arrayAlt;
        else if (typeof primary === 'string' && primary.trim()) {
            arr = primary.split(',').map((s) => s.trim()).filter(Boolean);
        }
        return arr.filter(Boolean).join(', ');
    }
    if (primary == null) return '';
    if (Array.isArray(primary)) return primary.length ? primary.join(', ') : '';
    if (typeof primary === 'boolean') return primary ? 'tak' : 'nie';
    return String(primary).trim();
}

function _extractUzywkiEntries(raw, sectionId, usedKeys) {
    const out = [];
    const LIST = (VISIT_DICT && VISIT_DICT.UZYWKI_11) || [];
    LIST.forEach((label, idx) => {
        const checkKey = sectionId + '_u_' + idx;
        const intKey = sectionId + '_u_' + idx + '_i';
        const noteKey = sectionId + '_u_' + idx + '_n';
        usedKeys.add(checkKey);
        usedKeys.add(intKey);
        usedKeys.add(noteKey);
        const checked = !!(raw[checkKey] === true || raw[checkKey] === '1' || raw[checkKey] === 1 || raw[checkKey] === 'true');
        const intVal = raw[intKey] && String(raw[intKey]).trim();
        const noteVal = raw[noteKey] && String(raw[noteKey]).trim();
        if (!checked && !intVal && !noteVal) return;
        const parts = [];
        if (checked) parts.push('✓ TAK');
        if (intVal) parts.push(intVal);
        const value = parts.join(' · ');
        out.push({
            label,
            value: value || (noteVal ? '(tylko notatka)' : ''),
            notes: noteVal || ''
        });
    });
    return out;
}

function _extractVisitGroupedContent(raw, mode) {
    if (!raw || typeof raw !== 'object') return { sections: [], otherFields: [] };
    const schema = schemaForMode(mode);
    const usedKeys = new Set();
    const sections = [];
    for (const section of schema) {
        const sectionId = section.id;
        const block = { sectionId, sectionTitle: section.title, comment: '', fields: [] };
        const commentKey = sectionId + '.__comment';
        const commentVal = raw[commentKey];
        if (commentVal != null && String(commentVal).trim()) {
            block.comment = String(commentVal).trim();
            usedKeys.add(commentKey);
        }
        for (const field of (section.subfields || [])) {
            const fieldId = field.id;
            const fieldType = field.input && field.input.type;
            if (fieldType === 'header' || fieldType === 'link-view') continue;
            if (fieldType === 'uzywki-special') {
                const uzywkiItems = _extractUzywkiEntries(raw, sectionId, usedKeys);
                for (const u of uzywkiItems) block.fields.push(u);
                continue;
            }
            const fullKey = sectionId + '.' + fieldId;
            const altKey = fullKey + '[]';
            const notesKey = fullKey + '.__notes';
            const rawValue = raw[fullKey];
            const rawArray = raw[altKey];
            const value = _formatVisitFieldValue(field, rawValue, rawArray);
            const notesVal = raw[notesKey] && String(raw[notesKey]).trim();
            if (value || notesVal) {
                block.fields.push({ label: field.label, value, notes: notesVal || '' });
                usedKeys.add(fullKey);
                if (rawArray !== undefined) usedKeys.add(altKey);
                if (notesVal) usedKeys.add(notesKey);
            }
        }
        if (block.comment || block.fields.length) sections.push(block);
    }
    const otherFields = [];
    for (const [k, v] of Object.entries(raw)) {
        if (usedKeys.has(k)) continue;
        if (k === '__comment' || k === '__notes') continue;
        if (k.endsWith('.__comment') || k.endsWith('.__notes')) continue;
        if (/_u_\d+(_[in])?$/.test(k)) continue;
        const label = _prettyVisitFieldLabel(k);
        if (!label) continue;
        let display = '';
        if (v == null) continue;
        if (Array.isArray(v)) {
            if (!v.length) continue;
            display = v.join(', ');
        } else if (typeof v === 'boolean') {
            display = v ? 'tak' : 'nie';
        } else {
            display = String(v).trim();
            if (!display) continue;
        }
        otherFields.push({ label, value: display });
    }
    return { sections, otherFields };
}

// --- TESTY ---

let pass = 0, fail = 0;
function test(name, cond, details) {
    if (cond) {
        console.log(`✓ ${name}`);
        pass++;
    } else {
        console.log(`✗ ${name}` + (details ? ` — ${details}` : ''));
        fail++;
    }
}

console.log('\n=== TEST 1: legacy fake-data (P001 V1001 — Kolejne spotkanie) ===');
const raw1 = {
    rodzajWizyty: 'Wizyta terapeutyczna',
    osobyObecne: 'Pacjent',
    cosWaznego: 'Pacjentka relacjonuje poprawę snu...',
    planNaNastepne: 'Praca nad asertywnością...'
};
const r1 = _extractVisitGroupedContent(raw1, 'followup');
console.log(`  - schema sections: ${r1.sections.length}, otherFields: ${r1.otherFields.length}`);
console.log(`  - otherFields keys:`, r1.otherFields.map(f => f.label));
test('Legacy data: 0 sekcji schema (flat keys nie pasują)', r1.sections.length === 0);
test('Legacy data: 4 pola w otherFields', r1.otherFields.length === 4);
test('Legacy data: zawiera "Rodzaj wizyty"', r1.otherFields.some(f => f.label === 'Rodzaj wizyty' && f.value === 'Wizyta terapeutyczna'));
test('Legacy data: zawiera "Co ważnego"', r1.otherFields.some(f => f.label === 'Co ważnego'));

console.log('\n=== TEST 2: nowe schema-driven dane (sekcje + komentarz + notatki) ===');
const raw2 = {
    'visitData.data': '2026-05-30',
    'visitData.rodzaj': 'Konsultacja',
    'visitData.osoby': ['Pacjent', 'Matka'],
    'visitData.powod': 'Pogorszenie nastroju',
    'wywiad.depresyjne': ['anhedonia', 'obniżony nastrój', 'bezsenność'],
    'wywiad.lekowe': ['GAD (uogólniony)', 'napady paniki'],
    'wywiad.depresyjne.__notes': 'Nasilenie wieczorne',
    'problemZdrowotny.__comment': 'Pacjent zgłasza pogłębienie objawów po stresie w pracy.',
    'ocenaKliniczna.hipoteza': [{ code: 'F32.1', description: 'Epizod depresyjny umiarkowany' }]
};
const r2 = _extractVisitGroupedContent(raw2, 'first');
console.log(`  - schema sections: ${r2.sections.length}, otherFields: ${r2.otherFields.length}`);
console.log(`  - sekcje:`, r2.sections.map(s => s.sectionTitle + ' (' + s.fields.length + ' pól)'));
test('Schema data: niepuste sekcje (visitData, wywiad, problemZdrowotny, ocenaKliniczna)', r2.sections.length === 4);
test('Schema data: brak otherFields', r2.otherFields.length === 0);
test('Schema data: sekcja "Dane wizyty" ma 4 wypełnione pola', r2.sections.find(s => s.sectionId === 'visitData')?.fields.length === 4);
test('Schema data: sekcja "Wywiad" ma 2 pola (depresyjne + lekowe)', r2.sections.find(s => s.sectionId === 'wywiad')?.fields.length === 2);
test('Schema data: pole "Depresyjne" ma notes "Nasilenie wieczorne"', r2.sections.find(s => s.sectionId === 'wywiad')?.fields.find(f => f.label === 'Depresyjne')?.notes === 'Nasilenie wieczorne');
test('Schema data: sekcja "Aktualny problem zdrowotny" ma komentarz', r2.sections.find(s => s.sectionId === 'problemZdrowotny')?.comment.includes('pogłębienie'));
test('Schema data: multi-select "Osoby" → "Pacjent, Matka"',
    r2.sections.find(s => s.sectionId === 'visitData')?.fields.find(f => f.label === 'Osoby obecne')?.value === 'Pacjent, Matka');
test('Schema data: ICD-10 → "F32.1 · Epizod depresyjny umiarkowany"',
    r2.sections.find(s => s.sectionId === 'ocenaKliniczna')?.fields.find(f => f.label === 'Hipoteza diagnostyczna')?.value === 'F32.1 · Epizod depresyjny umiarkowany');

console.log('\n=== TEST 3: edge cases (puste, mieszane) ===');
const r3a = _extractVisitGroupedContent(null, 'first');
test('Null raw: zwraca {sections:[], otherFields:[]}', r3a.sections.length === 0 && r3a.otherFields.length === 0);
const r3b = _extractVisitGroupedContent({}, 'first');
test('Pusty obiekt: zwraca {sections:[], otherFields:[]}', r3b.sections.length === 0 && r3b.otherFields.length === 0);
const r3c = _extractVisitGroupedContent({ 'visitData.rodzaj': '', 'wywiad.depresyjne': [] }, 'first');
test('Puste wartości: pomijane — brak sekcji', r3c.sections.length === 0);

console.log('\n=== TEST 4: używki (uzywki-special) ===');
const raw4 = {
    uzywki_u_0: true, uzywki_u_0_i: 'Okazjonalnie', uzywki_u_0_n: 'tylko w weekendy',
    uzywki_u_2: true, uzywki_u_2_i: 'Regularnie',
    uzywki_u_5: false  // nie pokazany
};
const r4 = _extractVisitGroupedContent(raw4, 'first');
console.log(`  - sekcje:`, r4.sections.map(s => s.sectionTitle + ' (' + s.fields.length + ' pól)'));
const uzywkiSection = r4.sections.find(s => s.sectionId === 'uzywki');
test('Używki: jest sekcja z 2 pozycjami', uzywkiSection && uzywkiSection.fields.length === 2);
if (uzywkiSection) {
    console.log(`  - pozycja 0:`, uzywkiSection.fields[0]);
    test('Używki: pozycja 0 ma value "✓ TAK · Okazjonalnie"', uzywkiSection.fields[0].value === '✓ TAK · Okazjonalnie');
    test('Używki: pozycja 0 ma notes "tylko w weekendy"', uzywkiSection.fields[0].notes === 'tylko w weekendy');
}

console.log('\n=== TEST 5: tryb followup vs first ===');
const raw5 = { 'wywiad.depresyjne': ['anhedonia'] };
const r5a = _extractVisitGroupedContent(raw5, 'first');
const r5b = _extractVisitGroupedContent(raw5, 'followup');
test('Tryb first: sekcja Wywiad pokazana', r5a.sections.some(s => s.sectionId === 'wywiad'));
test('Tryb followup: sekcja Wywiad NIE jest w schemie (onlyIn: first)',
    !r5b.sections.some(s => s.sectionId === 'wywiad'));
test('Tryb followup: dane wpadają do otherFields',
    r5b.otherFields.some(f => f.label === 'Depresyjne'));

console.log(`\n=== WYNIK: ${pass}/${pass + fail} testów przeszło ===`);
process.exit(fail > 0 ? 1 : 0);
