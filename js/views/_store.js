// ============================================================================
// _store.js — pub/sub store z persistencją do localStorage.
//
// Publikuje stan:
//   - patients        : Array
//   - visits          : Array
//   - meds            : Array
//   - diagnoses       : Array
//   - recommendations : Array
//   - tests           : Array
//   - currentPatient  : Object|null
//   - route           : string
//   - saveStatus      : 'idle' | 'saving' | 'saved' | 'error'
//
// Persistencja:
//   - Przy starcie: próbuje załadować z localStorage pod kluczem `psy-new:data`.
//     Jeśli brak / uszkodzony → seeduje z `_fake-data.js` i od razu zapisuje.
//   - Po każdej mutacji wywołuje `_persist()` (synchronicznie do localStorage),
//     emituje `saveStatus: saving → saved` (→ `idle` po 2s).
//
// CRUD:
//   Pacjent      : addPatient / updatePatient / archivePatient
//                  (BEZ removePatient — kasacja ręcznie w folderze pacjenta,
//                   zgodnie z ustaleniem PO z 2026-04-18)
//   Wizyta       : addVisit / updateVisit / togglePaid /
//                  closeVisit / reopenVisit (legacy, niewidoczne w UI po PO 2026-05-01)
//                  removeVisit (każda wizyta — bez guarda `closed`; PO 2026-05-01)
//   Lek          : addMed / updateMed / removeMed
//   Diagnoza     : addDiagnosis / updateDiagnosis / removeDiagnosis
//   Zalecenie    : addRecommendation / updateRecommendation / removeRecommendation
//                  / toggleRecommendationDone
//   Test         : addTest / removeTest

//
// DEV:
//   Store.resetAll()  — czyści localStorage i reseeduje z FAKE_*
//   Store.wipeAll()   — czyści localStorage do zera (bez seed-a; symulacja
//                       pierwszego uruchomienia aplikacji przed podpięciem
//                       folderu / Google Drive)
//
// Dostępne w dev-tools jako `window.PsyStore`.
// ============================================================================

import {
    FAKE_PATIENTS,
    FAKE_VISITS,
    FAKE_MEDS,
    FAKE_DIAGNOSES,
    FAKE_RECOMMENDATIONS,
    FAKE_TESTS
} from './_fake-data.js';

// --- storage keys -----------------------------------------------------------

const LS_KEY_DATA         = 'psy-new:data';
const LS_KEY_CURRENT      = 'psy-new:currentPatientId';
const LS_KEY_SCHEMA_VER   = 'psy-new:schema';
const SCHEMA_VERSION      = 1;

// --- state ------------------------------------------------------------------

const state = {
    patients: [],
    visits: [],
    meds: [],
    diagnoses: [],
    recommendations: [],
    tests: [],
    currentPatient: null,
    route: '',
    saveStatus: 'idle' // 'idle' | 'saving' | 'saved' | 'error'
};

const listeners = new Set();
let _saveStatusTimer = null;

// --- helpers: ID generation -------------------------------------------------

function nextPatientCode(patients) {
    let max = 0;
    for (const p of patients) {
        const m = /^P(\d+)$/i.exec(p.id || p.kodPacjenta || '');
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
    }
    return 'P' + String(max + 1).padStart(3, '0');
}

function genId(prefix) {
    const t = Date.now().toString(36).toUpperCase();
    const r = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
    return prefix + t + r;
}

function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// --- emit & subscribe -------------------------------------------------------

function emit() {
    for (const cb of listeners) {
        try { cb(state); } catch (e) { console.error('[store listener]', e); }
    }
}

// --- persistence ------------------------------------------------------------

function _serialize() {
    return JSON.stringify({
        schema: SCHEMA_VERSION,
        patients: state.patients,
        visits: state.visits,
        meds: state.meds,
        diagnoses: state.diagnoses,
        recommendations: state.recommendations,
        tests: state.tests
    });
}

function _persist() {
    _setSaveStatus('saving');
    try {
        window.localStorage.setItem(LS_KEY_DATA, _serialize());
        window.localStorage.setItem(LS_KEY_SCHEMA_VER, String(SCHEMA_VERSION));
        // krótkie „saving" → „saved" — miga by user widział feedback
        window.setTimeout(() => _setSaveStatus('saved'), 120);
    } catch (e) {
        console.error('[store persist]', e);
        _setSaveStatus('error');
    }
}

function _setSaveStatus(status) {
    state.saveStatus = status;
    if (_saveStatusTimer) {
        clearTimeout(_saveStatusTimer);
        _saveStatusTimer = null;
    }
    if (status === 'saved') {
        _saveStatusTimer = window.setTimeout(() => {
            state.saveStatus = 'idle';
            emit();
        }, 2000);
    }
    emit();
}

function _loadFromStorage() {
    try {
        const raw = window.localStorage.getItem(LS_KEY_DATA);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return false;
        state.patients        = Array.isArray(data.patients)        ? data.patients        : [];
        state.visits          = Array.isArray(data.visits)          ? data.visits          : [];
        state.meds            = Array.isArray(data.meds)            ? data.meds            : [];
        state.diagnoses       = Array.isArray(data.diagnoses)       ? data.diagnoses       : [];
        state.recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
        state.tests           = Array.isArray(data.tests)           ? data.tests           : [];
        return true;
    } catch (e) {
        console.warn('[store load]', e);
        return false;
    }
}

function _seedFromFake() {
    state.patients        = FAKE_PATIENTS.map((p) => ({ ...p, archived: p.archived === true }));
    state.visits          = FAKE_VISITS.map((v) => ({ ...v }));
    state.meds            = FAKE_MEDS.map((m) => ({ ...m }));
    state.diagnoses       = FAKE_DIAGNOSES.map((d) => ({ ...d }));
    state.recommendations = FAKE_RECOMMENDATIONS.map((r) => ({ ...r }));
    state.tests           = FAKE_TESTS.map((t) => ({ ...t }));
}

function _init() {
    const loaded = _loadFromStorage();
    if (!loaded) {
        _seedFromFake();
        _persist();   // od razu zapisujemy seed, żeby kolejne otwarcie go odczytało
    }
}

// --- API --------------------------------------------------------------------

export const Store = {
    get state() {
        return state;
    },

    subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    },

    // ---- Patients -----------------------------------------------------------

    setPatients(list) {
        state.patients = Array.isArray(list) ? list.slice() : [];
        if (state.currentPatient && !state.patients.find((p) => p.id === state.currentPatient.id)) {
            state.currentPatient = null;
            try { window.localStorage.removeItem(LS_KEY_CURRENT); } catch (_) { /* */ }
        }
        _persist();
        emit();
    },

    addPatient(data) {
        const code = data.id || data.kodPacjenta || nextPatientCode(state.patients);
        const patient = {
            id: code,
            kodPacjenta: code,
            archived: false,
            ...data,
            id: code,             // enforce
            kodPacjenta: code
        };
        state.patients.push(patient);
        _persist();
        emit();
        return patient;
    },

    updatePatient(id, patch) {
        const i = state.patients.findIndex((p) => p.id === id);
        if (i < 0) return null;
        state.patients[i] = { ...state.patients[i], ...patch, id, kodPacjenta: id };
        // sync currentPatient reference
        if (state.currentPatient && state.currentPatient.id === id) {
            state.currentPatient = state.patients[i];
        }
        _persist();
        emit();
        return state.patients[i];
    },

    archivePatient(id, archived = true) {
        return this.updatePatient(id, { archived: !!archived });
    },

    selectPatient(idOrObj) {
        let patient = null;
        if (idOrObj && typeof idOrObj === 'object') {
            // zachowaj referencję do rekordu w state.patients jeśli istnieje
            patient = state.patients.find((p) => p.id === idOrObj.id) || idOrObj;
        } else if (idOrObj) {
            patient = state.patients.find((p) => p.id === idOrObj) || null;
        }
        state.currentPatient = patient;
        try {
            if (patient) window.localStorage.setItem(LS_KEY_CURRENT, patient.id);
            else window.localStorage.removeItem(LS_KEY_CURRENT);
        } catch (_) { /* ignore */ }
        emit();
        return patient;
    },

    clearPatient() {
        state.currentPatient = null;
        try { window.localStorage.removeItem(LS_KEY_CURRENT); } catch (_) { /* */ }
        emit();
    },

    restoreLastPatient() {
        try {
            const id = window.localStorage.getItem(LS_KEY_CURRENT);
            if (id) {
                const found = state.patients.find((p) => p.id === id);
                if (found) {
                    state.currentPatient = found;
                    emit();
                    return found;
                }
            }
        } catch (_) { /* ignore */ }
        return null;
    },

    setRoute(route) {
        state.route = route || '';
        emit();
    },

    // ---- Visits -------------------------------------------------------------

    getVisits(patientId) {
        const pid = patientId || (state.currentPatient && state.currentPatient.id);
        if (!pid) return [];
        return state.visits
            .filter((v) => v.patientId === pid)
            .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    },

    getVisitById(id) {
        return state.visits.find((v) => v.id === id) || null;
    },

    addVisit(data) {
        const visit = {
            id: data.id || genId('V'),
            patientId: data.patientId || (state.currentPatient && state.currentPatient.id),
            date: data.date || todayISO(),
            time: data.time || '',
            type: data.type || 'followup',
            paid: data.paid === true,
            closed: data.closed === true,    // domyślnie roboczy/draft (false)
            summary: data.summary || '',
            note: data.note || '',
            duration: data.duration || 50,
            data: (data.data && typeof data.data === 'object') ? data.data : {},
            ...data
        };
        // dane sekcji formularza muszą być obiektem, nawet po splat-cie
        if (!visit.data || typeof visit.data !== 'object') visit.data = {};
        state.visits.push(visit);
        _persist();
        emit();
        return visit;
    },

    updateVisit(id, patch) {
        const i = state.visits.findIndex((v) => v.id === id);
        if (i < 0) return null;
        state.visits[i] = { ...state.visits[i], ...patch, id };
        _persist();
        emit();
        return state.visits[i];
    },

    togglePaid(id) {
        const v = state.visits.find((v) => v.id === id);
        if (!v) return null;
        return this.updateVisit(id, { paid: !v.paid });
    },

    /**
     * Oznacza wizytę jako zamkniętą (closed=true). Po zamknięciu nie da się
     * jej już skasować — staje się trwałym wpisem medycznym (zgodnie z
     * ustaleniem PO 2026-04-30).
     */
    closeVisit(id) {
        return this.updateVisit(id, { closed: true });
    },

    /**
     * Cofa zamknięcie wizyty (przywraca status „roboczy"). Pozwala edytować
     * i ewentualnie skasować (przyciskiem 🗑) niedokończony rekord.
     */
    reopenVisit(id) {
        return this.updateVisit(id, { closed: false });
    },

    /**
     * Kasuje wizytę. Po decyzji PO 2026-05-01 (wycofanie statusu „Robocza"/
     * „Zamknięta") guard `closed` został usunięty — każdą wizytę można
     * skasować z UI (z poziomu nagłówka formularza wizyty, po `openConfirm`).
     * Pole `closed` zostaje w danych jako legacy (kompatybilność z fake-data).
     */
    removeVisit(id) {
        const i = state.visits.findIndex((v) => v.id === id);
        if (i < 0) return false;
        state.visits.splice(i, 1);
        _persist();
        emit();
        return true;
    },


    // ---- Meds ---------------------------------------------------------------

    getMeds(patientId) {
        const pid = patientId || (state.currentPatient && state.currentPatient.id);
        if (!pid) return [];
        return state.meds.filter((m) => m.patientId === pid);
    },

    getMedById(id) {
        return state.meds.find((m) => m.id === id) || null;
    },

    addMed(data) {
        const med = {
            id: data.id || genId('M'),
            patientId: data.patientId || (state.currentPatient && state.currentPatient.id),
            name: '',
            substance: '',
            dose: '',
            maxDose: '',
            prescribedAt: '',
            prescribedBy: '',
            notes: '',
            ...data
        };
        state.meds.push(med);
        _persist();
        emit();
        return med;
    },

    updateMed(id, patch) {
        const i = state.meds.findIndex((m) => m.id === id);
        if (i < 0) return null;
        state.meds[i] = { ...state.meds[i], ...patch, id };
        _persist();
        emit();
        return state.meds[i];
    },

    removeMed(id) {
        const i = state.meds.findIndex((m) => m.id === id);
        if (i < 0) return false;
        state.meds.splice(i, 1);
        _persist();
        emit();
        return true;
    },

    // ---- Diagnoses ----------------------------------------------------------

    getDiagnoses(patientId) {
        const pid = patientId || (state.currentPatient && state.currentPatient.id);
        if (!pid) return [];
        return state.diagnoses.filter((d) => d.patientId === pid);
    },

    getDiagnosisById(id) {
        return state.diagnoses.find((d) => d.id === id) || null;
    },

    addDiagnosis(data) {
        const diag = {
            id: data.id || genId('D'),
            patientId: data.patientId || (state.currentPatient && state.currentPatient.id),
            code: '',
            description: '',
            assignedAt: todayISO(),
            author: '',
            status: 'aktualne',
            ...data
        };
        state.diagnoses.push(diag);
        _persist();
        emit();
        return diag;
    },

    updateDiagnosis(id, patch) {
        const i = state.diagnoses.findIndex((d) => d.id === id);
        if (i < 0) return null;
        state.diagnoses[i] = { ...state.diagnoses[i], ...patch, id };
        _persist();
        emit();
        return state.diagnoses[i];
    },

    removeDiagnosis(id) {
        const i = state.diagnoses.findIndex((d) => d.id === id);
        if (i < 0) return false;
        state.diagnoses.splice(i, 1);
        _persist();
        emit();
        return true;
    },

    // ---- Recommendations ----------------------------------------------------

    getRecommendations(patientId) {
        const pid = patientId || (state.currentPatient && state.currentPatient.id);
        if (!pid) return [];
        return state.recommendations.filter((r) => r.patientId === pid);
    },

    getRecommendationById(id) {
        return state.recommendations.find((r) => r.id === id) || null;
    },

    addRecommendation(data) {
        const rec = {
            id: data.id || genId('R'),
            patientId: data.patientId || (state.currentPatient && state.currentPatient.id),
            title: '',
            content: '',
            createdAt: todayISO(),
            done: false,
            ...data
        };
        state.recommendations.push(rec);
        _persist();
        emit();
        return rec;
    },

    updateRecommendation(id, patch) {
        const i = state.recommendations.findIndex((r) => r.id === id);
        if (i < 0) return null;
        state.recommendations[i] = { ...state.recommendations[i], ...patch, id };
        _persist();
        emit();
        return state.recommendations[i];
    },

    removeRecommendation(id) {
        const i = state.recommendations.findIndex((r) => r.id === id);
        if (i < 0) return false;
        state.recommendations.splice(i, 1);
        _persist();
        emit();
        return true;
    },

    toggleRecommendationDone(id) {
        const r = state.recommendations.find((r) => r.id === id);
        if (!r) return null;
        return this.updateRecommendation(id, { done: !r.done });
    },

    // ---- Tests --------------------------------------------------------------

    getTests(patientId) {
        const pid = patientId || (state.currentPatient && state.currentPatient.id);
        if (!pid) return [];
        return state.tests
            .filter((t) => t.patientId === pid)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    },

    addTest(data) {
        const test = {
            id: data.id || genId('T'),
            patientId: data.patientId || (state.currentPatient && state.currentPatient.id),
            code: '',
            name: '',
            date: todayISO(),
            score: 0,
            interpretation: '',
            ...data
        };
        state.tests.push(test);
        _persist();
        emit();
        return test;
    },

    /**
     * Kasuje pojedynczy wynik testu (dozwolone — to surowy wynik kwestionariusza,
     * nie wpis medyczny). Wymagane potwierdzenie przez `openConfirm` w UI.
     */
    removeTest(id) {
        const i = state.tests.findIndex((t) => t.id === id);
        if (i < 0) return false;
        state.tests.splice(i, 1);
        _persist();
        emit();
        return true;
    },

    // ---- DEV ---------------------------------------------------------------


    /**
     * Kasuje localStorage i reseeduje z FAKE_*. Używane z przycisku
     * „🔌 Odłącz folder & wczytaj demo" w Ustawieniach (wyłącznie faza dev).
     */
    resetAll() {
        try {
            window.localStorage.removeItem(LS_KEY_DATA);
            window.localStorage.removeItem(LS_KEY_CURRENT);
            window.localStorage.removeItem(LS_KEY_SCHEMA_VER);
        } catch (_) { /* ignore */ }
        state.currentPatient = null;
        _seedFromFake();
        _persist();
        emit();
    },

    /**
     * Czyści localStorage **do zera** (bez seed-a). Symuluje pierwsze
     * uruchomienie aplikacji — przed podpięciem folderu / Drive — gdy
     * baza pacjentów jest pusta. Po tej operacji aplikacja powinna
     * pokazać widok startowy „Dodaj pierwszego pacjenta".
     */
    wipeAll() {
        try {
            window.localStorage.removeItem(LS_KEY_DATA);
            window.localStorage.removeItem(LS_KEY_CURRENT);
            window.localStorage.removeItem(LS_KEY_SCHEMA_VER);
        } catch (_) { /* ignore */ }
        state.currentPatient = null;
        state.patients = [];
        state.visits = [];
        state.meds = [];
        state.diagnoses = [];
        state.recommendations = [];
        state.tests = [];
        // Persist pustego stanu — przy następnym uruchomieniu nie zostanie
        // zreseedowany z FAKE_* (bo `_loadFromStorage` zwróci `true`).
        _persist();
        emit();
    },

    // ---- Save status helper (for UI) ---------------------------------------

    getSaveStatus() {
        return state.saveStatus;
    }
};

// --- bootstrap --------------------------------------------------------------

_init();

// dev-tools
if (typeof window !== 'undefined') {
    window.PsyStore = Store;
}
