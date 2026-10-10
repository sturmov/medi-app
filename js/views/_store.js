// ============================================================================
// _store.js — stan aplikacji + zapis.
//
// STAN (publikowany subskrybentom):
//   patients, visits, recommendations, tests, currentPatient, route, saveStatus,
//   storageKind ('gdrive' | 'local' | null), storageConnected, storageLabel,
//   storageStatus ('init' | 'connected' | 'needs-auth' | 'unsupported'),
//   devMode (tryb demo — dane przykładowe, tylko w tej przeglądarce)
//
// WIZYTA = JEDYNE ŹRÓDŁO PRAWDY. Leki, rozpoznania, parametry i plan leczenia
// są częścią wizyty; boczne widoki to projekcje (`get*Timeline`).
//
// ZAPIS
//   • Magazyn podłączony (Dysk Google / folder): każda zmiana oznacza pacjenta
//     jako „do zapisania"; po krótkiej pauzie cały dokument pacjenta trafia do
//     jego arkusza. Dane pacjentów NIE są wtedy kopiowane do przeglądarki.
//   • Tryb demo: dane przykładowe w localStorage.
//
// LENIWE WCZYTYWANIE: lista pacjentów to „skróty" (kod, nazwisko, PESEL…);
// pełny dokument pacjenta wczytuje się przy pierwszym otwarciu
// (`ensurePatientLoaded`). Niewczytany pacjent nigdy nie jest zapisywany.
//
// Dostępne w konsoli jako `window.PsyStore`.
// ============================================================================

import { FAKE_PATIENTS, FAKE_VISITS, FAKE_RECOMMENDATIONS, FAKE_TESTS } from './_fake-data.js';
import { isFileSystemAccessSupported, saveHandle, loadHandle, clearHandle, verifyPermission } from './_folder-handle.js';
import { createLocalBackend } from './_storage-local.js';
import { createGDriveBackend } from './_storage-gdrive.js';
import { storageErrorCode } from './_storage-errors.js';
import { buildPatientDoc } from './_patient-doc.js';
import {
    sortVisitsDesc, medsTimeline, diagnosesTimeline, parametersTimeline, treatmentPlanTimeline
} from './_visit-describe.js';

const LS_DATA     = 'psy-new:data';              // dane trybu demo
const LS_CURRENT  = 'psy-new:currentPatientId';
const LS_DEV_MODE = 'psy-new:devMode';
const LS_STORAGE  = 'psy-new:storageKind';       // ostatnio używany magazyn
const LS_ACCOUNT  = 'psy-new:gdriveAccount';     // podpowiedź konta przy logowaniu

const ls = {
    get(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { window.localStorage.setItem(key, value); } catch (_) { /* */ } },
    del(key) { try { window.localStorage.removeItem(key); } catch (_) { /* */ } }
};

// --- stan -------------------------------------------------------------------

const state = {
    patients: [],
    visits: [],
    recommendations: [],
    tests: [],
    currentPatient: null,
    route: '',
    saveStatus: 'idle',          // 'idle' | 'saving' | 'saved' | 'error'

    storageKind: null,
    storageConnected: false,
    storageLabel: '',
    storageStatus: 'init',
    devMode: false
};

const listeners = new Set();

let _backend = null;
let _pendingLocalHandle = null;          // folder zapamiętany, ale wymaga ponownej zgody

const _refs = new Map();                 // id pacjenta → wskaźnik w magazynie
const _loaded = new Set();               // id pacjentów z wczytanym pełnym dokumentem
const _loading = new Map();              // id → Promise trwającego wczytywania
const _loadErrors = new Map();           // id → komunikat błędu wczytania

const _dirty = new Set();                // id pacjentów czekających na zapis
let _syncTimer = null;
let _syncing = false;
let _retryDelay = 0;
let _problemToast = null;
let _saveStatusTimer = null;

// --- pomocnicze -------------------------------------------------------------

function emit() {
    for (const cb of listeners) {
        try { cb(state); } catch (e) { console.error('[store listener]', e); }
    }
}

function nextPatientCode(patients) {
    let max = 0;
    for (const p of patients) {
        const m = /^P(\d+)$/i.exec(p.id || '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
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
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function currentId() {
    return state.currentPatient && state.currentPatient.id;
}

function setSaveStatus(status) {
    state.saveStatus = status;
    if (_saveStatusTimer) { clearTimeout(_saveStatusTimer); _saveStatusTimer = null; }
    if (status === 'saved') {
        _saveStatusTimer = setTimeout(() => { state.saveStatus = 'idle'; emit(); }, 2000);
    }
    emit();
}

// --- tryb demo (localStorage) ------------------------------------------------

function demoSerialize() {
    return JSON.stringify({
        patients: state.patients, visits: state.visits,
        recommendations: state.recommendations, tests: state.tests
    });
}

function demoLoad() {
    let data = null;
    try { data = JSON.parse(ls.get(LS_DATA) || 'null'); } catch (_) { data = null; }
    const arr = (v) => (Array.isArray(v) ? v : null);
    if (data && arr(data.patients)) {
        state.patients = data.patients;
        state.visits = arr(data.visits) || [];
        state.recommendations = arr(data.recommendations) || [];
        state.tests = arr(data.tests) || [];
    } else {
        demoSeed();
    }
}

function demoSeed() {
    const copy = (list) => JSON.parse(JSON.stringify(list));
    state.patients = copy(FAKE_PATIENTS);
    state.visits = copy(FAKE_VISITS);
    state.recommendations = copy(FAKE_RECOMMENDATIONS);
    state.tests = copy(FAKE_TESTS);
    ls.set(LS_DATA, demoSerialize());
}

// --- zapis ------------------------------------------------------------------

/** Wołane po każdej zmianie danych. `patientId` = kogo dotyczy zmiana. */
function persist(patientId) {
    if (_backend) {
        if (patientId) _dirty.add(patientId);
        setSaveStatus('saving');
        scheduleSync(_backend.saveDebounceMs);
        return;
    }
    if (state.devMode) {
        try {
            ls.set(LS_DATA, demoSerialize());
            setSaveStatus('saved');
        } catch (e) {
            console.error('[store] zapis trybu demo', e);
            setSaveStatus('error');
        }
    }
}

function scheduleSync(delay) {
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => { _syncTimer = null; sync(); }, delay);
}

/**
 * Wysyła do magazynu wszystkich pacjentów oznaczonych do zapisu — po kolei,
 * nigdy równolegle. Pacjent, którego zapis się nie udał, zostaje w kolejce.
 */
async function sync() {
    if (!_backend || _syncing) return;
    if (state.storageStatus === 'needs-auth') return;       // czekamy na kliknięcie użytkownika
    if (!_dirty.size) return;

    _syncing = true;
    const backend = _backend;
    try {
        while (_dirty.size && _backend === backend) {
            const id = _dirty.values().next().value;
            _dirty.delete(id);
            if (!_loaded.has(id)) continue;                 // skrót bez dokumentu — nie nadpisujemy arkusza
            const doc = buildPatientDoc(state, id);
            if (!doc) continue;

            let res;
            try {
                res = await backend.savePatient(doc, _refs.get(id) || null);
            } catch (e) {
                _dirty.add(id);
                throw e;
            }
            _refs.set(id, res.ref);
            if (res.conflict && window.Toast) {
                window.Toast.warning('Folder o docelowej nazwie już istnieje — pacjent zapisany w dotychczasowym folderze.',
                    '⚠ Konflikt nazwy folderu');
            }
            // Zmiany wpisane w trakcie wysyłki: odczekaj, zanim ruszy kolejny zapis.
            if (_dirty.size) await sleep(backend.saveDebounceMs);
        }
        _retryDelay = 0;
        dismissProblemToast();
        setSaveStatus('saved');
    } catch (e) {
        onSyncError(e);
    } finally {
        _syncing = false;
    }
}

function dismissProblemToast() {
    if (_problemToast && window.Toast) window.Toast.dismiss(_problemToast);
    _problemToast = null;
}

function showProblemToast(title, message, action) {
    dismissProblemToast();
    if (!window.Toast) return;
    _problemToast = window.Toast.sticky({
        variant: 'warning', title, message,
        actions: action ? [{ label: action.label, variant: 'primary', onClick: action.onClick }] : []
    });
}

/** Folder lokalny potrafi wrócić sam (np. ponownie wpięty dysk) — sprawdzamy po cichu co 30 s. */
let _folderWatch = null;
function watchLocalFolder() {
    if (_folderWatch) return;
    _folderWatch = setInterval(async () => {
        if (state.storageStatus !== 'needs-auth' || !_pendingLocalHandle || state.storageKind !== 'local') {
            clearInterval(_folderWatch);
            _folderWatch = null;
            return;
        }
        let ok = false;
        try { ok = await verifyPermission(_pendingLocalHandle, 'readwrite', false); } catch (_) { /* */ }
        if (ok) {
            state.storageStatus = 'connected';
            dismissProblemToast();
            emit();
            scheduleSync(0);
        }
    }, 30000);
}

function onSyncError(e) {
    const code = storageErrorCode(e);
    console.warn('[store] zapis nieudany:', code, e && e.message);
    setSaveStatus('error');

    if (code === 'auth') {
        state.storageStatus = 'needs-auth';
        emit();
        showProblemToast('⚠ Wymagane ponowne połączenie',
            (e && e.message ? e.message + ' ' : '')
            + 'Zmiany są bezpieczne w otwartej karcie i zapiszą się po połączeniu — nie zamykaj jej.',
            { label: 'Połącz ponownie', onClick: () => { Store.reconnectStorage(); } });
        if (state.storageKind === 'local') watchLocalFolder();
        return;
    }

    // Brak sieci / chwilowy błąd — ponawiamy sami, coraz rzadziej (do 1 min).
    _retryDelay = Math.min(_retryDelay ? _retryDelay * 2 : 5000, 60000);
    showProblemToast(code === 'offline' ? '⚠ Brak połączenia' : '⚠ Zapis nie powiódł się',
        (e && e.message ? e.message + ' ' : '')
        + 'Ponowię próbę za ' + Math.round(_retryDelay / 1000) + ' s. Nie zamykaj karty — zmiany są w pamięci.',
        { label: 'Spróbuj teraz', onClick: () => { scheduleSync(0); } });
    scheduleSync(_retryDelay);
}

// --- magazyn: podłączanie ---------------------------------------------------

function clearData() {
    state.patients = [];
    state.visits = [];
    state.recommendations = [];
    state.tests = [];
    state.currentPatient = null;
    _refs.clear(); _loaded.clear(); _loading.clear(); _loadErrors.clear(); _dirty.clear();
}

/** Wstawia pełny dokument pacjenta do stanu (zastępując skrót / starą wersję). */
function ingestDoc(doc) {
    const id = doc.patient.id;
    const notOwn = (x) => x.patientId !== id;
    state.visits = state.visits.filter(notOwn).concat(doc.visits);
    state.recommendations = state.recommendations.filter(notOwn).concat(doc.recommendations);
    state.tests = state.tests.filter(notOwn).concat(doc.tests);

    const patient = Object.assign({}, doc.patient);
    const i = state.patients.findIndex((p) => p.id === id);
    if (i >= 0) state.patients[i] = patient; else state.patients.push(patient);
    if (currentId() === id) state.currentPatient = patient;

    _loaded.add(id);
    _loadErrors.delete(id);
}

function restoreCurrentPatient() {
    const id = ls.get(LS_CURRENT);
    state.currentPatient = (id && state.patients.find((p) => p.id === id)) || null;
}

/** Podłącza magazyn: jego zawartość ZASTĘPUJE to, co było w pamięci (np. dane demo). */
async function attachBackend(backend) {
    const listed = await backend.listPatients();

    clearData();
    _backend = backend;
    for (const item of listed) {
        const id = item.summary && item.summary.id;
        if (!id) continue;
        if (_refs.has(id)) {
            console.warn('[store] dwa pliki z tym samym kodem pacjenta — pomijam drugi:', id, item.ref);
            continue;
        }
        _refs.set(id, item.ref);
        if (item.doc) {
            ingestDoc(item.doc);
        } else {
            state.patients.push(Object.assign({}, item.summary, {
                _lastVisit: item.summary.lastVisit || '',
                _visitCount: item.summary.visitCount || 0
            }));
            if (item.error) _loadErrors.set(id, item.error);
        }
    }
    state.patients.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    state.storageKind = backend.kind;
    state.storageConnected = true;
    state.storageLabel = backend.label;
    state.storageStatus = 'connected';
    state.devMode = false;
    ls.set(LS_STORAGE, backend.kind);
    ls.del(LS_DEV_MODE);
    restoreCurrentPatient();
    setSaveStatus('idle');
}

// --- API --------------------------------------------------------------------

export const Store = {
    get state() { return state; },

    subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
    },

    // ---- Pacjenci -----------------------------------------------------------

    addPatient(data) {
        const id = data.id || data.kodPacjenta || nextPatientCode(state.patients);
        const patient = Object.assign({ archived: false }, data, { id, kodPacjenta: id });
        state.patients.push(patient);
        _loaded.add(id);                     // nowy pacjent = dokument kompletny od początku
        persist(id);
        emit();
        return patient;
    },

    updatePatient(id, patch) {
        const i = state.patients.findIndex((p) => p.id === id);
        if (i < 0) return null;
        state.patients[i] = Object.assign({}, state.patients[i], patch, { id, kodPacjenta: id });
        if (currentId() === id) state.currentPatient = state.patients[i];
        persist(id);
        emit();
        return state.patients[i];
    },

    archivePatient(id, archived = true) {
        return this.updatePatient(id, { archived: !!archived });
    },

    selectPatient(idOrObj) {
        const id = idOrObj && typeof idOrObj === 'object' ? idOrObj.id : idOrObj;
        const patient = (id && state.patients.find((p) => p.id === id)) || null;
        state.currentPatient = patient;
        if (patient) ls.set(LS_CURRENT, patient.id); else ls.del(LS_CURRENT);
        emit();
        return patient;
    },

    clearPatient() {
        state.currentPatient = null;
        ls.del(LS_CURRENT);
        emit();
    },

    setRoute(route) {
        state.route = route || '';
        emit();
    },

    /** Czy pełny dokument pacjenta jest w pamięci? (w trybie demo — zawsze) */
    isPatientLoaded(id) {
        return !_backend || _loaded.has(id);
    },

    getPatientLoadError(id) {
        return _loadErrors.get(id) || '';
    },

    /** Wczytuje pełny dokument pacjenta z magazynu (jeśli jeszcze nie wczytany). */
    ensurePatientLoaded(id, { retry = false } = {}) {
        if (!id || !_backend || _loaded.has(id)) return Promise.resolve(true);
        if (_loading.has(id)) return _loading.get(id);
        if (retry) _loadErrors.delete(id);
        const backend = _backend;
        const p = (async () => {
            try {
                const doc = await backend.loadPatient(_refs.get(id));
                if (_backend !== backend) return false;
                if (doc.patient.id !== id) {
                    throw new Error('Arkusz zawiera dane innego pacjenta (' + doc.patient.id + ').');
                }
                ingestDoc(doc);
                return true;
            } catch (e) {
                console.error('[store] wczytanie pacjenta', id, e);
                _loadErrors.set(id, (e && e.message) || String(e));
                if (storageErrorCode(e) === 'auth') onSyncError(e);
                return false;
            } finally {
                _loading.delete(id);
                emit();
            }
        })();
        _loading.set(id, p);
        return p;
    },

    /** Data ostatniej wizyty — także dla pacjenta, którego dokument nie jest wczytany. */
    getLastVisitDate(id) {
        if (this.isPatientLoaded(id)) {
            const v = this.getVisits(id)[0];
            return v ? v.date : '';
        }
        const p = state.patients.find((x) => x.id === id);
        return (p && p._lastVisit) || '';
    },

    // ---- Wizyty -------------------------------------------------------------

    getVisits(patientId) {
        const pid = patientId || currentId();
        if (!pid) return [];
        return sortVisitsDesc(state.visits.filter((v) => v.patientId === pid));
    },

    getVisitById(id) {
        return state.visits.find((v) => v.id === id) || null;
    },

    addVisit(data) {
        const visit = Object.assign({
            id: genId('V'),
            patientId: currentId(),
            date: todayISO(),
            time: '',
            type: 'next_meeting',
            paid: false,
            summary: '',
            duration: 50
        }, data);
        visit.data = Object.assign({ _raw: {}, meds: [], diagnoses: [] }, data.data || {});
        state.visits.push(visit);
        persist(visit.patientId);
        emit();
        return visit;
    },

    updateVisit(id, patch) {
        const i = state.visits.findIndex((v) => v.id === id);
        if (i < 0) return null;
        state.visits[i] = Object.assign({}, state.visits[i], patch, { id });
        persist(state.visits[i].patientId);
        emit();
        return state.visits[i];
    },

    togglePaid(id) {
        const v = this.getVisitById(id);
        return v ? this.updateVisit(id, { paid: !v.paid }) : null;
    },

    /** Usuwa wizytę razem z jej lekami i rozpoznaniami (są częścią wizyty). */
    removeVisit(id) {
        const i = state.visits.findIndex((v) => v.id === id);
        if (i < 0) return false;
        const [removed] = state.visits.splice(i, 1);
        persist(removed.patientId);
        emit();
        return true;
    },

    // ---- Osie czasu (projekcje z wizyt, od najnowszej) -----------------------

    getMedsTimeline(patientId)          { return medsTimeline(this.getVisits(patientId)); },
    getDiagnosesTimeline(patientId)     { return diagnosesTimeline(this.getVisits(patientId)); },
    getParametersTimeline(patientId)    { return parametersTimeline(this.getVisits(patientId)); },
    getTreatmentPlanTimeline(patientId) { return treatmentPlanTimeline(this.getVisits(patientId)); },

    // ---- Zalecenia ----------------------------------------------------------

    getRecommendations(patientId) {
        const pid = patientId || currentId();
        return pid ? state.recommendations.filter((r) => r.patientId === pid) : [];
    },

    getRecommendationById(id) {
        return state.recommendations.find((r) => r.id === id) || null;
    },

    addRecommendation(data) {
        const rec = Object.assign({
            id: genId('R'), patientId: currentId(),
            title: '', content: '', createdAt: todayISO(), done: false
        }, data);
        state.recommendations.push(rec);
        persist(rec.patientId);
        emit();
        return rec;
    },

    updateRecommendation(id, patch) {
        const i = state.recommendations.findIndex((r) => r.id === id);
        if (i < 0) return null;
        state.recommendations[i] = Object.assign({}, state.recommendations[i], patch, { id });
        persist(state.recommendations[i].patientId);
        emit();
        return state.recommendations[i];
    },

    removeRecommendation(id) {
        const i = state.recommendations.findIndex((r) => r.id === id);
        if (i < 0) return false;
        const [removed] = state.recommendations.splice(i, 1);
        persist(removed.patientId);
        emit();
        return true;
    },

    toggleRecommendationDone(id) {
        const r = this.getRecommendationById(id);
        return r ? this.updateRecommendation(id, { done: !r.done }) : null;
    },

    getRecommendationsTimeline(patientId) {
        const pid = patientId || currentId();
        if (!pid) return [];
        const visits = state.visits.filter((v) => v.patientId === pid);
        return this.getRecommendations(pid)
            .map((r) => {
                const visit = (r.linkedVisitId && visits.find((v) => v.id === r.linkedVisitId)) || null;
                return { recommendation: r, visit, sortKey: (visit && visit.date) || r.createdAt || '' };
            })
            .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    },

    // ---- Testy --------------------------------------------------------------

    getTests(patientId) {
        const pid = patientId || currentId();
        if (!pid) return [];
        return state.tests
            .filter((t) => t.patientId === pid)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    },

    addTest(data) {
        const test = Object.assign({
            id: genId('T'), patientId: currentId(),
            code: '', name: '', date: todayISO(), score: 0, interpretation: ''
        }, data);
        state.tests.push(test);
        persist(test.patientId);
        emit();
        return test;
    },

    removeTest(id) {
        const i = state.tests.findIndex((t) => t.id === id);
        if (i < 0) return false;
        const [removed] = state.tests.splice(i, 1);
        persist(removed.patientId);
        emit();
        return true;
    },

    // ---- Magazyn danych -----------------------------------------------------

    isStorageConnected() { return state.storageConnected === true; },
    isLocalFolderSupported() { return isFileSystemAccessSupported(); },
    hasUnsavedChanges() { return !!_backend && (_dirty.size > 0 || _syncing); },

    /**
     * Start aplikacji: przywraca ostatnio używany magazyn, jeśli da się to
     * zrobić bez klikania. W przeciwnym razie ustawia `needs-auth` (ekran
     * startowy pokaże jeden przycisk „Połącz").
     */
    async restoreStorage() {
        const kind = ls.get(LS_STORAGE);

        if (kind === 'local' && isFileSystemAccessSupported()) {
            let handle = null;
            try { handle = await loadHandle(); } catch (_) { /* */ }
            if (handle) {
                let granted = false;
                try { granted = await verifyPermission(handle, 'readwrite', false); } catch (_) { /* */ }
                if (granted) {
                    try {
                        _pendingLocalHandle = handle;
                        await attachBackend(createLocalBackend(handle));
                        emit();
                        return true;
                    } catch (e) { console.warn('[store] przywracanie folderu', e); }
                }
                _pendingLocalHandle = handle;
                state.storageKind = 'local';
                state.storageLabel = handle.name || '';
                state.storageStatus = 'needs-auth';
                emit();
                return false;
            }
        }

        if (kind === 'gdrive') {
            // Okienko logowania Google wolno otworzyć tylko po kliknięciu użytkownika.
            state.storageKind = 'gdrive';
            state.storageLabel = ls.get(LS_ACCOUNT) || '';
            state.storageStatus = 'needs-auth';
            emit();
            return false;
        }

        if (ls.get(LS_DEV_MODE) === '1') this.enableDevMode();
        else emit();
        return false;
    },

    /** Połączenie z Dyskiem Google (musi być wywołane z kliknięcia). */
    async connectGDrive() {
        const backend = createGDriveBackend();
        try {
            await backend.connect({ loginHint: ls.get(LS_ACCOUNT) || '' });
            await attachBackend(backend);
            if (backend.account) ls.set(LS_ACCOUNT, backend.account);
            emit();
            return { ok: true };
        } catch (e) {
            console.error('[store] connectGDrive', e);
            return { ok: false, error: (e && e.message) || String(e) };
        }
    },

    /** Połączenie z folderem lokalnym. `reuse` = użyj zapamiętanego folderu. */
    async connectLocalFolder({ reuse = false } = {}) {
        if (!isFileSystemAccessSupported()) {
            state.storageStatus = 'unsupported';
            emit();
            return { ok: false, error: 'Ta przeglądarka nie obsługuje folderów lokalnych (użyj Chrome lub Edge na komputerze).' };
        }
        try {
            let handle = reuse ? _pendingLocalHandle : null;
            if (!handle) {
                handle = await window.showDirectoryPicker({ id: 'psy-app-patients', mode: 'readwrite', startIn: 'documents' });
            }
            const granted = await verifyPermission(handle, 'readwrite', true);
            if (!granted) return { ok: false, error: 'Nie udzielono dostępu do folderu.' };
            await saveHandle(handle);
            _pendingLocalHandle = handle;
            await attachBackend(createLocalBackend(handle));
            emit();
            return { ok: true };
        } catch (e) {
            if (e && e.name === 'AbortError') return { ok: false, error: '' };       // anulowano wybór
            console.error('[store] connectLocalFolder', e);
            return { ok: false, error: (e && e.message) || String(e) };
        }
    },

    /** Po komunikacie „wymagane ponowne połączenie" — wznawia zapis w tej samej sesji. */
    async reconnectStorage() {
        if (!_backend) return { ok: false };
        try {
            if (_backend.kind === 'gdrive') {
                await _backend.reauthorize();
            } else if (_pendingLocalHandle) {
                const granted = await verifyPermission(_pendingLocalHandle, 'readwrite', true);
                if (!granted) return { ok: false };
            }
            state.storageStatus = 'connected';
            dismissProblemToast();
            emit();
            scheduleSync(0);
            return { ok: true };
        } catch (e) {
            console.warn('[store] reconnectStorage', e);
            if (window.Toast) window.Toast.warning((e && e.message) || 'Nie udało się połączyć.', 'Połączenie nieudane');
            return { ok: false, error: (e && e.message) || String(e) };
        }
    },

    /** Wysyła oczekujące zmiany natychmiast (np. przed dodaniem załącznika). */
    async flushNow() {
        if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
        await sync();
        while (_syncing) await sleep(100);
        return !_dirty.size;
    },

    /** Odłącza magazyn i wraca do ekranu startowego. Dane zostają w magazynie. */
    async disconnectStorage({ forget = true } = {}) {
        if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
        dismissProblemToast();
        if (_backend && _backend.kind === 'gdrive' && forget) _backend.signOut();
        if (forget) {
            try { await clearHandle(); } catch (_) { /* */ }
            _pendingLocalHandle = null;
            ls.del(LS_STORAGE);
        }
        _backend = null;
        clearData();
        ls.del(LS_CURRENT);
        state.storageKind = null;
        state.storageConnected = false;
        state.storageLabel = '';
        state.storageStatus = 'init';
        state.devMode = false;
        ls.del(LS_DEV_MODE);
        setSaveStatus('idle');
    },

    /** Załączniki bieżącego magazynu (`null`, gdy brak magazynu — np. tryb demo). */
    getDocsApi() {
        return _backend ? _backend.docs : null;
    },

    getPatientRef(id) {
        return _refs.get(id) || null;
    },

    /** Drobne ustawienia aplikacji. Na Dysku Google są wspólne dla urządzeń; w pozostałych
     *  trybach żyją w tej przeglądarce. */
    async getSetting(key) {
        if (_backend && _backend.getSetting) return _backend.getSetting(key);
        return ls.get('psy-new:setting:' + key) || '';
    },
    async setSetting(key, value) {
        if (_backend && _backend.setSetting) return _backend.setSetting(key, value);
        ls.set('psy-new:setting:' + key, value);
    },

    // ---- Tryb demo ----------------------------------------------------------

    /** Dane przykładowe trzymane wyłącznie w tej przeglądarce. */
    enableDevMode() {
        _backend = null;
        clearData();
        demoLoad();
        state.devMode = true;
        state.storageKind = null;
        state.storageConnected = false;
        state.storageStatus = 'init';
        ls.set(LS_DEV_MODE, '1');
        restoreCurrentPatient();
        emit();
    },

    /** Tryb demo: przywróć dane przykładowe. */
    resetAll() {
        if (!state.devMode) return;
        clearData();
        ls.del(LS_CURRENT);
        demoSeed();
        emit();
    },

    /** Tryb demo: pusta baza (jak przy pierwszym uruchomieniu). */
    wipeAll() {
        if (!state.devMode) return;
        clearData();
        ls.del(LS_CURRENT);
        ls.set(LS_DATA, demoSerialize());
        emit();
    },

    getSaveStatus() { return state.saveStatus; }
};

// Zamknięcie karty z niewysłanymi zmianami: przeglądarka zapyta o potwierdzenie,
// a my w tym czasie próbujemy dokończyć zapis.
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', (ev) => {
        if (!Store.hasUnsavedChanges()) return;
        scheduleSync(0);
        ev.preventDefault();
        ev.returnValue = '';
    });
    window.PsyStore = Store;
}
