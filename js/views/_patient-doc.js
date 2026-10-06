// ============================================================================
// _patient-doc.js — „dokument pacjenta": kompletne, bezstratne dane jednego
// pacjenta. To jest to, co aplikacja zapisuje i wczytuje — niezależnie od
// miejsca przechowywania (Google Drive / folder lokalny).
//
//   {
//     format: 'psychoapp-patient', version: 2, savedAt: ISO,
//     patient:         { id, imie, nazwisko, … },
//     visits:          [{ id, date, time, type, paid, duration, summary,
//                         data: { _raw, meds, diagnoses } }],
//     recommendations: [...],
//     tests:           [...]
//   }
//
// W arkuszu pacjenta dokument leży w zakładce `_dane` (JSON), a pozostałe
// zakładki są czytelną kopią generowaną z niego — patrz `_sheet-model.js`.
// Czyste funkcje, działają też w Node.
// ============================================================================

export const DOC_FORMAT = 'psychoapp-patient';
export const DOC_VERSION = 2;

/** Pola robocze aplikacji (z podkreślnikiem, np. `_ref`, `_loaded`) nie są danymi. */
function withoutPrivate(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
        if (k.startsWith('_')) continue;
        out[k] = v;
    }
    return out;
}

/** Składa dokument pacjenta z bieżącego stanu aplikacji. */
export function buildPatientDoc(state, patientId) {
    const patient = (state.patients || []).find((p) => p.id === patientId);
    if (!patient) return null;
    const own = (list) => (list || []).filter((x) => x.patientId === patientId);
    return {
        format: DOC_FORMAT,
        version: DOC_VERSION,
        savedAt: new Date().toISOString(),
        patient: withoutPrivate(patient),
        visits: own(state.visits),
        recommendations: own(state.recommendations),
        tests: own(state.tests)
    };
}

/** Waliduje i normalizuje dokument wczytany z magazynu. Rzuca, gdy to nie nasz format. */
export function parsePatientDoc(input) {
    const doc = typeof input === 'string' ? JSON.parse(input) : input;
    if (!doc || typeof doc !== 'object' || doc.format !== DOC_FORMAT || !doc.patient || !doc.patient.id) {
        throw new Error('To nie jest dokument pacjenta PsychoApp.');
    }
    if (doc.version > DOC_VERSION) {
        throw new Error('Dane zapisała nowsza wersja aplikacji (format ' + doc.version + '). Odśwież aplikację.');
    }
    const pid = doc.patient.id;
    const arr = (v) => (Array.isArray(v) ? v : []);
    return {
        format: DOC_FORMAT,
        version: DOC_VERSION,
        savedAt: doc.savedAt || '',
        patient: Object.assign({}, doc.patient, { id: pid, kodPacjenta: pid }),
        visits: arr(doc.visits).map((v) => Object.assign({}, v, {
            patientId: pid,
            data: Object.assign({ _raw: {}, meds: [], diagnoses: [] }, v.data || {})
        })),
        recommendations: arr(doc.recommendations).map((r) => Object.assign({}, r, { patientId: pid })),
        tests: arr(doc.tests).map((t) => Object.assign({}, t, { patientId: pid }))
    };
}

/** Dane do listy pacjentów — bez otwierania całego dokumentu. */
export function patientSummary(doc) {
    const p = doc.patient || {};
    const dates = (doc.visits || []).map((v) => v.date || '').filter(Boolean).sort();
    return {
        id: p.id,
        kodPacjenta: p.id,
        imie: p.imie || '',
        nazwisko: p.nazwisko || '',
        pesel: p.pesel || '',
        telefon: p.telefon || '',
        email: p.email || '',
        dataUrodzenia: p.dataUrodzenia || '',
        plec: p.plec || '',
        minor: p.minor === true,
        archived: p.archived === true,
        lastVisit: dates.length ? dates[dates.length - 1] : '',
        visitCount: (doc.visits || []).length
    };
}

function sanitizeNamePart(s) {
    return String(s)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ł/g, 'l').replace(/Ł/g, 'L')
        .replace(/[^A-Za-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/** Nazwa folderu / arkusza pacjenta: `{KOD}_{Nazwisko}_{Imie}` (bez polskich znaków). */
export function patientFolderName(patient) {
    if (!patient) return 'pacjent';
    const kod = patient.id || patient.kodPacjenta || 'P000';
    const naz = sanitizeNamePart(patient.nazwisko || '') || 'bez_nazwiska';
    const imi = sanitizeNamePart(patient.imie || '') || 'bez_imienia';
    return kod + '_' + naz + '_' + imi;
}
