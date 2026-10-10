// ============================================================================
// _visit-describe.js — JEDNO miejsce, które wie, jak czytać dane wizyty.
//
// Czyste funkcje (bez DOM, bez Store) — używane przez:
//   • formularz wizyty (kropki wypełnienia, podgląd, tryb „tylko do odczytu"),
//   • Historię wizyt (pełna treść notatki),
//   • wyciągi z wizyt w menu bocznym (Leki / Testy / Zalecenia / Plan leczenia /
//     Diagnozy / Parametry / Dokumenty),
//   • eksport do arkusza (Google Sheets / XLSX),
//   • testy w Node.
//
// MODEL DANYCH WIZYTY
//   visit.data._raw       — płaska mapa wartości pól: klucz `sekcja.pole`
//       'visitData.rodzaj'            → 'Konsultacja'            (tekst / wybór)
//       'wywiad.depresyjne'           → ['anhedonia', 'apatia']  (wielokrotny wybór)
//       'wywiad.depresyjne.__notes'   → 'od 3 tygodni'           (uwagi do pola)
//       'wywiad.__comment'            → '…'                      (komentarz sekcji)
//       'ocenaKliniczna.hipoteza'     → 'F32.1,F41.1'            (kody ICD-10, CSV)
//       'uzywki_u_2' / '_i' / '_n'    → true / 'Regularnie' / '…' (używki, wg indeksu)
//   visit.data.meds       — [{ name, substance, group, dose, unit, maxDose }]
//   visit.data.diagnoses  — [{ code, description }]
//   visit.data.tests      — [{ id, code, name, score, interpretation, answers, redFlag }]
//   visit.data.docs       — [{ id, name, size }]   pliki w folderze `dokumenty/` pacjenta
//
// Leki, rozpoznania, wyniki testów i załączniki żyją W WIZYCIE (wizyta = jedyne
// źródło prawdy), więc usunięcie wizyty usuwa je razem z nią, a zakładki menu
// bocznego są zwykłą projekcją. Wyjątek: sam plik załącznika zostaje w folderze
// pacjenta — usunięcie wizyty tylko go od niej odpina.
// ============================================================================

import { schemaForMode } from './_visit-form-schema.js';
import { VISIT_DICT } from './_visit-dict.js';
import { findIcd10ByCode } from './_icd10-dict.js';

/** Tylko „1sze spotkanie" ma pełny wywiad; pozostałe typy — formularz skrócony. */
export function visitMode(visitType) {
    return visitType === 'first_meeting' ? 'first' : 'followup';
}

export function fieldKey(sectionId, fieldId) { return sectionId + '.' + fieldId; }
export function notesKey(sectionId, fieldId) { return sectionId + '.' + fieldId + '.__notes'; }
export function commentKey(sectionId) { return sectionId + '.__comment'; }

/** Wartość „pusta" z punktu widzenia notatki. */
export function isBlank(v) {
    if (v == null || v === false) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
}

/** Tablica z wartości, która może być tablicą albo napisem CSV. */
export function listOf(v) {
    if (Array.isArray(v)) return v.filter((x) => !isBlank(x));
    if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
    return [];
}

function fieldType(field) {
    return (field && field.input && field.input.type) || 'textarea';
}

// ---------------------------------------------------------------------------
// Leki / rozpoznania / używki — tekst czytelny dla człowieka
// ---------------------------------------------------------------------------

export function medDoseText(med) {
    if (!med || isBlank(med.dose)) return '';
    return String(med.dose).trim() + (med.unit ? ' ' + med.unit : '');
}

export function medText(med) {
    if (!med) return '';
    let s = med.name || '(bez nazwy)';
    if (med.substance) s += ' (' + med.substance + ')';
    const dose = medDoseText(med);
    if (dose) s += ' — ' + dose;
    if (med.maxDose) s += (dose ? ', ' : ' — ') + 'max ' + med.maxDose;
    return s;
}

export function diagnosisText(d) {
    if (!d) return '';
    return (d.code || '?') + (d.description ? ' — ' + d.description : '');
}

export function testText(t) {
    if (!t) return '';
    let s = (t.code || t.name || 'test') + ' — wynik ' + (isBlank(t.score) ? '?' : t.score);
    if (t.interpretation) s += ' · ' + t.interpretation;
    if (t.redFlag) s += ' · czerwona flaga';
    return s;
}

export function docText(d) {
    return d ? (d.name || '(plik bez nazwy)') : '';
}

export function icd10TagsText(value) {
    return listOf(value).map((item) => {
        if (item && typeof item === 'object') return diagnosisText(item);
        const code = String(item).toUpperCase();
        const hit = findIcd10ByCode(code);
        return code + (hit && hit.description ? ' — ' + hit.description : '');
    }).join('; ');
}

/** Pozycje sekcji „Używki", które mają jakąkolwiek treść. */
export function uzywkiEntries(sectionId, raw) {
    const out = [];
    if (!raw) return out;
    (VISIT_DICT.UZYWKI_11 || []).forEach((label, idx) => {
        const base = sectionId + '_u_' + idx;
        const c = raw[base];
        const checked = c === true || c === '1' || c === 1 || c === 'true';
        const intensity = isBlank(raw[base + '_i']) ? '' : String(raw[base + '_i']).trim();
        const notes = isBlank(raw[base + '_n']) ? '' : String(raw[base + '_n']).trim();
        if (!checked && !intensity && !notes) return;
        out.push({ idx, label, checked, intensity, notes });
    });
    return out;
}

function uzywkiKeys(sectionId) {
    const keys = [];
    (VISIT_DICT.UZYWKI_11 || []).forEach((_, idx) => {
        const base = sectionId + '_u_' + idx;
        keys.push(base, base + '_i', base + '_n');
    });
    return keys;
}

// ---------------------------------------------------------------------------
// Pojedyncze pole
// ---------------------------------------------------------------------------

/** Czy pole ma treść? `data` = visit.data (dla leków / rozpoznań). */
export function isFieldFilled(sectionId, field, raw, data) {
    const t = fieldType(field);
    if (t === 'header' || t === 'link-view') return false;
    if (t === 'inline-meds') return !!(data && Array.isArray(data.meds) && data.meds.length);
    if (t === 'inline-diagnoses') return !!(data && Array.isArray(data.diagnoses) && data.diagnoses.length);
    if (t === 'inline-tests') return !!(data && Array.isArray(data.tests) && data.tests.length);
    if (t === 'inline-docs') return !!(data && Array.isArray(data.docs) && data.docs.length);
    if (t === 'uzywki-special') return uzywkiEntries(sectionId, raw).length > 0;
    if (!raw) return false;
    return !isBlank(raw[fieldKey(sectionId, field.id)]) || !isBlank(raw[notesKey(sectionId, field.id)]);
}

/** Czytelna wartość pola (bez uwag). Pusty napis = brak treści. */
export function fieldText(sectionId, field, raw, data) {
    const t = fieldType(field);
    if (t === 'header' || t === 'link-view') return '';
    if (t === 'inline-meds') return ((data && data.meds) || []).map(medText).join('\n');
    if (t === 'inline-diagnoses') return ((data && data.diagnoses) || []).map(diagnosisText).join('\n');
    if (t === 'inline-tests') return ((data && data.tests) || []).map(testText).join('\n');
    if (t === 'inline-docs') return ((data && data.docs) || []).map(docText).join('\n');
    if (t === 'uzywki-special') {
        return uzywkiEntries(sectionId, raw).map((u) =>
            u.label + (u.intensity ? ' — ' + u.intensity : '') + (u.notes ? ' (' + u.notes + ')' : '')
        ).join('\n');
    }
    const v = raw ? raw[fieldKey(sectionId, field.id)] : null;
    if (isBlank(v)) return '';
    if (t === 'tag-input-icd10') return icd10TagsText(v);
    if (t === 'multi-select' || t === 'checkbox-group') return listOf(v).join(', ');
    if (Array.isArray(v)) return v.join(', ');
    if (v === true) return 'tak';
    const s = String(v).trim();
    const unit = field.input && field.input.unit;
    return unit && t === 'number' ? s + ' ' + unit : s;
}

export function fieldNotes(sectionId, field, raw) {
    const v = raw ? raw[notesKey(sectionId, field.id)] : null;
    return isBlank(v) ? '' : String(v).trim();
}

// ---------------------------------------------------------------------------
// Cała wizyta → struktura czytelna (Historia, tryb „do odczytu", eksport)
// ---------------------------------------------------------------------------

const TECHNICAL_KEY = /(^|\.)__(comment|notes)$|_u_\d+(_[in])?$/;

function prettifyKey(rawKey) {
    return String(rawKey)
        .replace(/^[a-zA-Z]+\./, '')
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * @returns {{
 *   sections: Array<{id, title, comment, fields: Array<{id, label, value, notes}>}>,
 *   other: Array<{label, value}>     // klucze spoza schematu — nic nie ginie po cichu
 * }}
 */
export function describeVisit(visit) {
    const data = (visit && visit.data) || {};
    const raw = data._raw || {};
    const used = new Set();
    const sections = [];

    for (const section of schemaForMode(visitMode(visit && visit.type))) {
        const block = { id: section.id, title: section.title, comment: '', fields: [] };

        const cKey = commentKey(section.id);
        used.add(cKey);
        if (!isBlank(raw[cKey])) block.comment = String(raw[cKey]).trim();

        for (const field of (section.subfields || [])) {
            const t = fieldType(field);
            if (t === 'header' || t === 'link-view') continue;

            if (t === 'uzywki-special') {
                for (const k of uzywkiKeys(section.id)) used.add(k);
                for (const u of uzywkiEntries(section.id, raw)) {
                    block.fields.push({
                        id: field.id + ':' + u.idx,
                        label: u.label,
                        value: [u.checked ? 'TAK' : '', u.intensity].filter(Boolean).join(' · '),
                        notes: u.notes
                    });
                }
                continue;
            }

            used.add(fieldKey(section.id, field.id));
            used.add(notesKey(section.id, field.id));
            const value = fieldText(section.id, field, raw, data);
            const notes = fieldNotes(section.id, field, raw);
            if (value || notes) {
                block.fields.push({ id: field.id, label: field.label, value, notes });
            }
        }

        if (block.comment || block.fields.length) sections.push(block);
    }

    const other = [];
    for (const [k, v] of Object.entries(raw)) {
        if (used.has(k) || TECHNICAL_KEY.test(k) || isBlank(v)) continue;
        other.push({
            label: prettifyKey(k),
            value: Array.isArray(v) ? v.join(', ') : (v === true ? 'tak' : String(v).trim())
        });
    }

    return { sections, other };
}

/** Krótki opis wizyty (pierwsza sensowna treść), maks. 120 znaków. */
export function visitSummary(visit) {
    const raw = (visit && visit.data && visit.data._raw) || {};
    const candidates = [
        raw['visitData.powod'],
        raw['problemZdrowotny.__comment'],
        raw['oddzialywania.ustalenia'],
        raw['status.obserwacje']
    ];
    for (const c of candidates) {
        if (!isBlank(c)) {
            const s = String(c).trim();
            return s.length > 120 ? s.slice(0, 117) + '…' : s;
        }
    }
    return '';
}

// ---------------------------------------------------------------------------
// Wyciągi z wizyt (boczne menu), od najnowszej wizyty. Każdy rekord niesie
// wizytę, z której pochodzi.
// ---------------------------------------------------------------------------

export function sortVisitsDesc(visits) {
    return (visits || []).slice().sort((a, b) =>
        ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));
}

export function medsTimeline(visits) {
    const out = [];
    for (const visit of sortVisitsDesc(visits)) {
        for (const med of ((visit.data && visit.data.meds) || [])) out.push({ visit, med });
    }
    return out;
}

export function diagnosesTimeline(visits) {
    const out = [];
    for (const visit of sortVisitsDesc(visits)) {
        for (const diagnosis of ((visit.data && visit.data.diagnoses) || [])) out.push({ visit, diagnosis });
    }
    return out;
}

function rawText(raw, key) {
    return isBlank(raw[key]) ? '' : String(raw[key]).trim();
}

export function parametersTimeline(visits) {
    const out = [];
    for (const visit of sortVisitsDesc(visits)) {
        const raw = (visit.data && visit.data._raw) || {};
        const entry = {
            visit,
            wzrost: rawText(raw, 'parametry.wzrost'),
            masa: rawText(raw, 'parametry.masa'),
            bmi: rawText(raw, 'parametry.bmi'),
            komentarz: rawText(raw, 'parametry.komentarz')
        };
        if (entry.wzrost || entry.masa || entry.bmi || entry.komentarz) out.push(entry);
    }
    return out;
}

export function treatmentPlanTimeline(visits) {
    const out = [];
    for (const visit of sortVisitsDesc(visits)) {
        const raw = (visit.data && visit.data._raw) || {};
        const entry = {
            visit,
            ustalenia: rawText(raw, 'oddzialywania.ustalenia'),
            ewaluacja: rawText(raw, 'oddzialywania.ewaluacja'),
            kontrolna: rawText(raw, 'oddzialywania.kontrolna'),
            notes: rawText(raw, 'oddzialywania.kontrolna.__notes')
        };
        if (entry.ustalenia || entry.ewaluacja || entry.kontrolna) out.push(entry);
    }
    return out;
}

export function testsTimeline(visits) {
    const out = [];
    for (const visit of sortVisitsDesc(visits)) {
        for (const test of ((visit.data && visit.data.tests) || [])) out.push({ visit, test });
    }
    return out;
}

/** Zalecenia: jedno pole tekstowe wizyty (`zalecenia.tresc`). */
export function recommendationsTimeline(visits) {
    const out = [];
    for (const visit of sortVisitsDesc(visits)) {
        const text = rawText((visit.data && visit.data._raw) || {}, 'zalecenia.tresc');
        if (text) out.push({ visit, text });
    }
    return out;
}

export function documentsTimeline(visits) {
    const out = [];
    for (const visit of sortVisitsDesc(visits)) {
        for (const doc of ((visit.data && visit.data.docs) || [])) out.push({ visit, doc });
    }
    return out;
}
