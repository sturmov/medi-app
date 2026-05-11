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

import {
    isFileSystemAccessSupported,
    saveHandle, loadHandle, clearHandle,
    verifyPermission, readTextFile, writeTextFile
} from './_folder-handle.js';

// PR-K3 (2026-05-11): zapis per pacjent do pliku XLSX zamiast wspólnego
// `data.json`. Format zdefiniowany w `_storage-format.js` (sekcja 20 .clinerules).
// F5.3 (2026-05-11): używamy `renamePatientFolderIfNeeded` w `_doFolderSync`,
// żeby zmiana nazwiska automatycznie przemianowała folder na dysku.
import {
    scanPatientFolders,
    loadPatient as loadPatientFromFolder,
    savePatient as savePatientToFolder,
    renamePatientFolderIfNeeded
} from './_local-folder-store.js';

// F5.3 — helper do wyliczenia oczekiwanej nazwy folderu pacjenta.
import { patientFolderName } from './_storage-format.js';

// --- storage keys -----------------------------------------------------------

const LS_KEY_DATA         = 'psy-new:data';
const LS_KEY_CURRENT      = 'psy-new:currentPatientId';
const LS_KEY_SCHEMA_VER   = 'psy-new:schema';
const LS_KEY_DEV_MODE     = 'psy-new:devMode';   // gdy true → user wybrał „🧪 Tryb dev"
const SCHEMA_VERSION      = 1;
const DATA_FILE_NAME      = 'data.json';

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
    saveStatus: 'idle', // 'idle' | 'saving' | 'saved' | 'error'

    // Folder lokalny (PR-I, 2026-05-01 cd. 3)
    folderConnected: false,           // true = handle aktywny + permission granted
    folderName: '',                    // czytelna nazwa wybranego folderu
    folderStatus: 'init',             // 'init' | 'unsupported' | 'denied' | 'connected' | 'devmode'
    devMode: false                     // true = user wybrał „🧪 Tryb dev (localStorage)"
};

const listeners = new Set();
let _saveStatusTimer = null;

// Trzymamy handle TYLKO w pamięci (nie w stanie publikowanym subscriberom).
// Persist do IndexedDB realizuje `_folder-handle.js`.
let _dirHandle = null;
let _folderSyncTimer = null;

// PR-K3 (2026-05-11): śledzimy które pacjentów wymagają zapisu do folderu.
// Każda mutacja oznacza patientId, `_doFolderSync` zapisuje per pacjent
// (XLSX), nie wspólnego `data.json`. Set, by uniknąć duplikatów przy
// wielokrotnych edycjach jednego pacjenta przed debouncem.
const _dirtyPatientIds = new Set();

// F5.2 (2026-05-11): error recovery dla File System Access.
// Sticky toast referencja (żeby nie spamować duplikatami przy każdej próbie),
// watcher (interval) który cicho sprawdza permission gdy folder w stanie 'denied'.
let _unavailableToast = null;
let _healthCheckTimer = null;
const FOLDER_HEALTH_CHECK_MS = 60000;   // 1 min

/**
 * Helper PR-K3: oznacza patientId jako wymagający zapisu do folderu.
 */
function _markDirty(patientId) {
    if (!patientId) return;
    _dirtyPatientIds.add(patientId);
}

/**
 * Helper PR-K3: składa `FullPatient` (pacjent + wszystkie powiązane dane)
 * dla pojedynczego pacjenta z bieżącego state. Format zgodny z
 * `writePatientWorkbook` w `_xlsx-codec.js`.
 */
function _buildFullPatient(patient) {
    return {
        patient,
        visits:          state.visits.filter((v) => v.patientId === patient.id),
        meds:            state.meds.filter((m) => m.patientId === patient.id),
        diagnoses:       state.diagnoses.filter((d) => d.patientId === patient.id),
        recommendations: state.recommendations.filter((r) => r.patientId === patient.id),
        tests:           state.tests.filter((t) => t.patientId === patient.id),
        treatmentPlan:   patient.treatmentPlan || null,
        parameters:      Array.isArray(patient.parameters) ? patient.parameters
                            : (patient.parameters ? [patient.parameters] : [])
    };
}

/**
 * Helper PR-K3: konwertuje metadane z `scanPatientFolders` na obiekt pacjenta
 * w shape spójnym z `state.patients[]`.
 */
function _metaToPatient(meta) {
    return {
        id: meta.kod,
        kodPacjenta: meta.kod,
        imie: meta.imie || '',
        nazwisko: meta.nazwisko || '',
        pesel: meta.pesel || '',
        telefon: meta.telefon || '',
        email: meta.email || '',
        dataUrodzenia: meta.dataUrodzenia || '',
        archived: meta.archived === true,
        _folderName: meta.folderName
    };
}

/**
 * Helper PR-K3: ładuje pełną zawartość folderu pacjentów do state.
 * Wywoływane z `connectLocalFolder`/`restoreLocalFolder`/`reauthorizeLocalFolder`.
 *
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<{loaded: number, total: number, errors: number}>}
 */
async function _loadAllFromFolder(handle) {
    const scanned = await scanPatientFolders(handle);
    const result = { loaded: 0, total: scanned.length, errors: 0 };

    if (scanned.length === 0) {
        return result;
    }

    const patients = [];
    const visits = [];
    const meds = [];
    const diagnoses = [];
    const recommendations = [];
    const tests = [];

    for (const meta of scanned) {
        try {
            const full = await loadPatientFromFolder(handle, meta.folderName);
            if (!full || !full.patient) {
                result.errors++;
                // dorzuć szkielet, żeby pacjent nie zniknął z listy
                patients.push(_metaToPatient(meta));
                continue;
            }
            // Zapamiętaj nazwę folderu na obiekcie (do rename'a przy zmianie nazwiska)
            full.patient._folderName = meta.folderName;
            patients.push(full.patient);
            visits.push(...(full.visits || []));
            meds.push(...(full.meds || []));
            diagnoses.push(...(full.diagnoses || []));
            recommendations.push(...(full.recommendations || []));
            tests.push(...(full.tests || []));
            result.loaded++;
        } catch (e) {
            console.error('[loadAllFromFolder] błąd ładowania', meta.folderName, e);
            result.errors++;
            patients.push(_metaToPatient(meta));
        }
    }

    state.patients = patients;
    state.visits = visits;
    state.meds = meds;
    state.diagnoses = diagnoses;
    state.recommendations = recommendations;
    state.tests = tests;

    return result;
}

/**
 * Helper PR-K3: migracja bieżącego state do XLSX-ów przy pierwszym podpięciu
 * pustego folderu. Zaznacza WSZYSTKICH pacjentów jako dirty i wymusza
 * natychmiastowy zapis (bez debounce'a).
 */
async function _migrateLocalStateToFolder(handle) {
    if (!handle || state.patients.length === 0) return { migrated: 0 };
    let migrated = 0;
    let errors = 0;
    for (const patient of state.patients) {
        const full = _buildFullPatient(patient);
        try {
            const ok = await savePatientToFolder(handle, full);
            if (ok) migrated++;
            else errors++;
        } catch (e) {
            console.error('[migrate] fail for', patient.id, e);
            errors++;
        }
    }
    return { migrated, errors };
}

/**
 * Helper PR-K3: inicjalizuje state po podpięciu folderu.
 * Priorytet źródeł danych:
 *   1. pliki XLSX w subfolderach `pacjenci/{KOD}_{Naz}_{Imię}/pacjent.xlsx` → load
 *   2. legacy `data.json` (z PR-I) → load + migracja do XLSX
 *   3. folder pusty + state nie-pusty (np. fake-data po seed) → migracja state → XLSX
 *   4. folder pusty + state pusty → no-op (apka startuje od pustej bazy)
 *
 * @returns {Promise<{source: string, loaded: number, total: number}>}
 */
async function _initStateFromFolder(handle) {
    // 1. Scan plików XLSX (nowy format K1+)
    const scanResult = await _loadAllFromFolder(handle);
    if (scanResult.total > 0) {
        return { source: 'xlsx', loaded: scanResult.loaded, total: scanResult.total };
    }

    // 2. Legacy data.json (z PR-I) → załaduj + migruj do XLSX
    const legacyJson = await readTextFile(handle, DATA_FILE_NAME);
    if (legacyJson) {
        try {
            const data = JSON.parse(legacyJson);
            if (data && typeof data === 'object') {
                state.patients        = Array.isArray(data.patients)        ? data.patients        : [];
                state.visits          = Array.isArray(data.visits)          ? data.visits          : [];
                state.meds            = Array.isArray(data.meds)            ? data.meds            : [];
                state.diagnoses       = Array.isArray(data.diagnoses)       ? data.diagnoses       : [];
                state.recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
                state.tests           = Array.isArray(data.tests)           ? data.tests           : [];
                console.log('[Store] Migracja legacy data.json → XLSX', state.patients.length, 'pacjentów');
                const mig = await _migrateLocalStateToFolder(handle);
                return { source: 'legacy-json', loaded: mig.migrated, total: state.patients.length };
            }
        } catch (e) {
            console.warn('[Store] data.json malformed', e);
        }
    }

    // 3. Folder pusty + state nie-pusty → migracja bieżącego state (fake-data lub localStorage)
    if (state.patients.length > 0) {
        console.log('[Store] Migracja state → XLSX', state.patients.length, 'pacjentów');
        const mig = await _migrateLocalStateToFolder(handle);
        return { source: 'state', loaded: mig.migrated, total: state.patients.length };
    }

    // 4. Folder pusty + state pusty (np. po wipeAll + connect)
    return { source: 'empty', loaded: 0, total: 0 };
}

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
        // 1) localStorage = zawsze cache (szybki, działa offline, fallback)
        window.localStorage.setItem(LS_KEY_DATA, _serialize());
        window.localStorage.setItem(LS_KEY_SCHEMA_VER, String(SCHEMA_VERSION));

        // 2) folder lokalny = source-of-truth (gdy podpięty).
        //    PR-K3 (2026-05-11): zapis per pacjent do `pacjent.xlsx` zamiast
        //    wspólnego data.json. Zaznaczamy currentPatient jako dirty —
        //    typowo wszystkie mutations dotyczą obecnie wybranego pacjenta.
        //    Edge case (addPatient, archivePatient innego niż current) jest
        //    obsłużony explicit `_markDirty(...)` w tych metodach.
        if (state.folderConnected && _dirHandle) {
            if (state.currentPatient && state.currentPatient.id) {
                _markDirty(state.currentPatient.id);
            }
            _scheduleFolderSync();
        }

        // krótkie „saving" → „saved" — miga by user widział feedback
        window.setTimeout(() => _setSaveStatus('saved'), 120);
    } catch (e) {
        console.error('[store persist]', e);
        _setSaveStatus('error');
    }
}

/** Zaplanuj zapis pacjentów do podpiętego folderu (debounce 800ms). */
function _scheduleFolderSync() {
    if (_folderSyncTimer) clearTimeout(_folderSyncTimer);
    _folderSyncTimer = setTimeout(_doFolderSync, 800);
}

/**
 * F5.2 (2026-05-11): wykrywa typowe błędy „folder niedostępny" (User wyłączył
 * dysk, przeniósł folder, cofnął permission). Inne błędy (np. uszkodzony
 * plik XLSX) zostają zaraportowane przez `_setSaveStatus('error')`.
 */
function _isFolderUnavailableError(err) {
    if (!err) return false;
    const name = err.name || '';
    return name === 'NotFoundError'      // folder/plik nie istnieje
        || name === 'NotAllowedError'    // permission revoked
        || name === 'SecurityError'      // ogólne permission denied
        || name === 'InvalidStateError'  // handle stale
        || name === 'AbortError';        // anulowane (rzadkie poza picker'em)
}

/**
 * F5.2 (2026-05-11): reakcja na utratę folderu w trakcie pracy.
 * Pokazuje sticky warning toast z akcją „Przywróć dostęp", uruchamia
 * watcher który co minutę sprawdza czy permission wrócił.
 */
function _onFolderUnavailable() {
    state.folderConnected = false;
    state.folderStatus = 'denied';
    emit();
    if (_unavailableToast) return; // już pokazany — nie duplikuj
    if (typeof window !== 'undefined' && window.Toast) {
        _unavailableToast = window.Toast.sticky({
            variant: 'warning',
            title: '⚠ Folder niedostępny',
            message: 'Aplikacja straciła dostęp do folderu „'
                + (state.folderName || '?')
                + '". Zmiany są zachowane w pamięci — kliknij „Przywróć dostęp" '
                + 'lub poczekaj na auto-detekcję (do 1 min).',
            actions: [{
                label: 'Przywróć dostęp',
                variant: 'primary',
                onClick: async (_ev, toast) => {
                    const result = await Store.reauthorizeLocalFolder();
                    if (result && result.ok) {
                        if (toast && toast.dismiss) toast.dismiss('api');
                        _unavailableToast = null;
                    }
                }
            }]
        });
    }
    _startFolderHealthCheck();
}

/**
 * F5.2: reakcja na powrót folderu — domykamy sticky toast i pushujemy
 * dirty pacjentów do zapisu.
 */
function _onFolderRecovered() {
    if (_unavailableToast && typeof window !== 'undefined' && window.Toast) {
        window.Toast.dismiss(_unavailableToast);
    }
    _unavailableToast = null;
    const dirtyCount = _dirtyPatientIds.size;
    if (typeof window !== 'undefined' && window.Toast) {
        window.Toast.success(
            dirtyCount > 0
                ? 'Synchronizuję ' + dirtyCount + ' pacjent(ów)…'
                : 'Folder dostępny',
            '✓ Folder znów dostępny'
        );
    }
    if (dirtyCount > 0) {
        _scheduleFolderSync();
    }
}

/**
 * F5.2: cichy watcher (interval 60 s) — gdy folder w stanie 'denied',
 * próbuje `verifyPermission` BEZ prompt'a. Sukces → push dirty + toast success.
 */
function _startFolderHealthCheck() {
    if (_healthCheckTimer) return;
    _healthCheckTimer = window.setInterval(async () => {
        // Watcher żyje tylko gdy w stanie 'denied' z zapamiętanym handle'm.
        if (!_dirHandle || state.folderStatus !== 'denied') {
            _stopFolderHealthCheck();
            return;
        }
        try {
            const ok = await verifyPermission(_dirHandle, 'readwrite', false);
            if (ok) {
                state.folderConnected = true;
                state.folderStatus = 'connected';
                emit();
                _stopFolderHealthCheck();
                _onFolderRecovered();
            }
        } catch (e) {
            // Tichaczem — błąd cichego pinga to OK (np. handle dalej stale).
            console.warn('[folder-health-check]', e && e.name ? e.name : e);
        }
    }, FOLDER_HEALTH_CHECK_MS);
}

function _stopFolderHealthCheck() {
    if (_healthCheckTimer) {
        window.clearInterval(_healthCheckTimer);
        _healthCheckTimer = null;
    }
}

/**
 * PR-K3 (2026-05-11): zapis zmienionych pacjentów do plików XLSX.
 * Iteruje po `_dirtyPatientIds` i wywołuje `savePatientToFolder` per pacjent.
 * Po sukcesie czyści Set; gdy są błędy, status zmienia się na 'error'.
 *
 * F5.2 (2026-05-11): wykrywa „folder niedostępny" — w tym przypadku przerywa
 * iterację, PRZYWRACA wszystkie nieprzetworzone ID do `_dirtyPatientIds`
 * (żeby się nie zgubiły) i odpala sticky toast + watcher.
 */
async function _doFolderSync() {
    if (!_dirHandle) return;
    if (_dirtyPatientIds.size === 0) return;

    const ids = Array.from(_dirtyPatientIds);
    _dirtyPatientIds.clear();

    let errors = 0;
    let folderUnavailable = false;
    let processedIdx = -1;

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const patient = state.patients.find((p) => p.id === id);
        if (!patient) { processedIdx = i; continue; }   // pacjent skasowany w międzyczasie

        const full = _buildFullPatient(patient);
        try {
            // F5.3 (2026-05-11): używamy `renamePatientFolderIfNeeded` zamiast
            // plain `savePatientToFolder`. Funkcja sama wykrywa czy nazwa
            // folderu jest aktualna i — jeśli nie — kopiuje plik + dokumenty,
            // a stary folder usuwa.
            const expectedName = patientFolderName(patient);
            const oldName = patient._folderName || expectedName;
            const result = await renamePatientFolderIfNeeded(_dirHandle, oldName, full);

            if (!result) {
                errors++;
            } else {
                // Zaktualizuj zapisaną nazwę folderu na obiekcie pacjenta.
                patient._folderName = result.folderName;
                if (result.renamed) {
                    console.log('[doFolderSync] rename:', oldName, '→', result.folderName);
                    if (typeof window !== 'undefined' && window.Toast) {
                        window.Toast.info(
                            'Folder pacjenta przemianowany: ' + result.folderName,
                            '📁 Aktualizacja struktury'
                        );
                    }
                } else if (result.conflict) {
                    console.warn('[doFolderSync] konflikt nazwy:', expectedName, 'już istnieje');
                    if (typeof window !== 'undefined' && window.Toast) {
                        window.Toast.warning(
                            'Folder docelowy „' + expectedName + '" już istnieje. '
                                + 'Pacjent zapisany w starym folderze („' + oldName + '"). '
                                + 'Zmień KOD pacjenta lub usuń konflikt.',
                            '⚠ Konflikt nazwy folderu'
                        );
                    }
                }
            }
            processedIdx = i;
        } catch (e) {
            if (_isFolderUnavailableError(e)) {
                console.warn('[doFolderSync] folder niedostępny:', e.name, '— przerywam i kolejkuję retry');
                folderUnavailable = true;
                // Przywróć ten i wszystkie następne ID do dirty
                for (let j = i; j < ids.length; j++) {
                    _markDirty(ids[j]);
                }
                break;
            }
            console.error('[doFolderSync] savePatient fail', id, e);
            errors++;
            processedIdx = i;
        }
    }

    if (folderUnavailable) {
        _onFolderUnavailable();
        _setSaveStatus('error');
    } else if (errors > 0) {
        _setSaveStatus('error');
    } else {
        _setSaveStatus('saved');
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

/**
 * Po wczytaniu danych (z folderu lub seed) ustaw `state.currentPatient`:
 *   1) próba z `LS_KEY_CURRENT` (ostatnio wybrany w tej przeglądarce),
 *   2) fallback — pierwszy nie-zarchiwizowany pacjent z listy,
 *   3) gdy lista pusta — `null` (sidebar zostanie greyed-out, OK).
 *
 * Naprawia regresję PR-I, gdzie po `connectLocalFolder` `currentPatient` był
 * twardo zerowany, przez co sidebar (Historia/Leki/itd.) zostawał greyed-out
 * mimo że w folderze byli pacjenci.
 */
function _restoreCurrentPatient() {
    if (!Array.isArray(state.patients) || state.patients.length === 0) {
        state.currentPatient = null;
        return;
    }
    let restored = null;
    try {
        const id = window.localStorage.getItem(LS_KEY_CURRENT);
        if (id) restored = state.patients.find((p) => p.id === id) || null;
    } catch (_) { /* ignore */ }
    if (!restored) {
        restored = state.patients.find((p) => !p.archived) || state.patients[0] || null;
    }
    state.currentPatient = restored;
    try {
        if (restored) window.localStorage.setItem(LS_KEY_CURRENT, restored.id);
    } catch (_) { /* ignore */ }
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
        // PR-K3: explicit mark — nowy pacjent może nie być jeszcze currentPatient
        _markDirty(code);
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

    // ---- Folder lokalny (PR-I, 2026-05-01 cd. 3) ---------------------------

    /** Czy aktywny jest podpięty folder lokalny? */
    isLocalConnected() {
        return state.folderConnected === true;
    },

    /**
     * Otwórz dialog `showDirectoryPicker`, zapisz handle, wczytaj `data.json`
     * (lub utwórz pusty), oznacz folder jako podpięty.
     *
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async connectLocalFolder() {
        if (!isFileSystemAccessSupported()) {
            state.folderStatus = 'unsupported';
            emit();
            return { ok: false, error: 'unsupported' };
        }
        try {
            const handle = await window.showDirectoryPicker({
                id: 'psy-app-patients',
                mode: 'readwrite',
                startIn: 'documents'
            });
            // Po pierwszym wyborze permission jest zwykle 'granted', ale upewnij się.
            const ok = await verifyPermission(handle, 'readwrite', true);
            if (!ok) {
                state.folderStatus = 'denied';
                emit();
                return { ok: false, error: 'denied' };
            }
            await saveHandle(handle);
            _dirHandle = handle;
            state.folderConnected = true;
            state.folderName = handle.name || '';
            state.folderStatus = 'connected';
            state.devMode = false;
            try { window.localStorage.removeItem(LS_KEY_DEV_MODE); } catch (_) { /* */ }

            // PR-K3: scan XLSX w folderze (lub migracja legacy data.json / fake-data)
            const initRes = await _initStateFromFolder(handle);
            console.log('[connectLocalFolder] źródło danych:', initRes.source,
                'załadowano:', initRes.loaded, '/', initRes.total);

            // Przywróć ostatnio wybranego pacjenta (lub pierwszego z listy)
            _restoreCurrentPatient();
            // Cache do localStorage (offline fallback)
            try {
                window.localStorage.setItem(LS_KEY_DATA, _serialize());
                window.localStorage.setItem(LS_KEY_SCHEMA_VER, String(SCHEMA_VERSION));
            } catch (_) { /* */ }
            emit();
            return { ok: true, source: initRes.source };

        } catch (e) {
            // User anulował picker → AbortError. Inne błędy logujemy.
            if (e && (e.name === 'AbortError' || e.message === 'The user aborted a request.')) {
                return { ok: false, error: 'aborted' };
            }
            console.error('[connectLocalFolder]', e);
            state.folderStatus = 'denied';
            emit();
            return { ok: false, error: 'denied' };
        }
    },

    /**
     * Spróbuj odzyskać podpięcie folderu z poprzedniej sesji (IndexedDB).
     * Wywoływane raz w `init()`. Zwraca true jeśli udało się.
     */
    async restoreLocalFolder() {
        if (!isFileSystemAccessSupported()) {
            state.folderStatus = 'unsupported';
            // Sprawdź czy user wcześniej wybrał tryb dev
            try {
                if (window.localStorage.getItem(LS_KEY_DEV_MODE) === '1') {
                    state.devMode = true;
                    state.folderStatus = 'devmode';
                }
            } catch (_) { /* */ }
            emit();
            return false;
        }
        try {
            const handle = await loadHandle();
            if (!handle) {
                // Brak zapisanego folderu — sprawdź dev mode
                try {
                    if (window.localStorage.getItem(LS_KEY_DEV_MODE) === '1') {
                        state.devMode = true;
                        state.folderStatus = 'devmode';
                    }
                } catch (_) { /* */ }
                emit();
                return false;
            }
            // Permission może być prompt'em po reload — verifyPermission z prompt:false
            // żeby NIE pokazywać popup'u przy starcie. User ma kliknąć „Połącz" w gate
            // żeby wyrazić user-gesture.
            const ok = await verifyPermission(handle, 'readwrite', false);
            if (!ok) {
                // Mamy handle, ale permission expired → trzeba ręcznie kliknąć
                _dirHandle = handle;   // zapamiętaj na potem
                state.folderStatus = 'denied';
                state.folderName = handle.name || '';
                emit();
                return false;
            }
            _dirHandle = handle;
            state.folderConnected = true;
            state.folderName = handle.name || '';
            state.folderStatus = 'connected';
            state.devMode = false;

            // PR-K3: scan XLSX w folderze (lub migracja legacy)
            const initRes = await _initStateFromFolder(handle);
            console.log('[restoreLocalFolder] źródło danych:', initRes.source,
                'załadowano:', initRes.loaded, '/', initRes.total);

            // Cache do localStorage (offline fallback)
            try {
                window.localStorage.setItem(LS_KEY_DATA, _serialize());
                window.localStorage.setItem(LS_KEY_SCHEMA_VER, String(SCHEMA_VERSION));
            } catch (_) { /* */ }
            _restoreCurrentPatient();
            emit();
            return true;

        } catch (e) {
            console.warn('[restoreLocalFolder]', e);
            return false;
        }
    },

    /**
     * Re-prompt permission dla zapamiętanego handle'a (gdy `folderStatus === 'denied'`
     * po reload). Wymaga user gesture (klik z gate'a / topbar'u).
     */
    async reauthorizeLocalFolder() {
        if (!_dirHandle) {
            // Nie ma handle'a w pamięci — spróbuj wczytać z IDB
            const handle = await loadHandle();
            if (!handle) return { ok: false, error: 'no-handle' };
            _dirHandle = handle;
        }
        const ok = await verifyPermission(_dirHandle, 'readwrite', true);
        if (!ok) {
            state.folderStatus = 'denied';
            emit();
            return { ok: false, error: 'denied' };
        }
        state.folderConnected = true;
        state.folderName = _dirHandle.name || '';
        state.folderStatus = 'connected';
        state.devMode = false;

        // F5.2: jeśli straciliśmy folder w trakcie pracy (sticky toast aktywny),
        // domknij toast + zatrzymaj watcher + pushuj dirty.
        _stopFolderHealthCheck();
        if (_unavailableToast) {
            if (typeof window !== 'undefined' && window.Toast) {
                window.Toast.dismiss(_unavailableToast);
            }
            _unavailableToast = null;
        }

        // PR-K3: scan XLSX w folderze (lub migracja legacy)
        const initRes = await _initStateFromFolder(_dirHandle);
        console.log('[reauthorizeLocalFolder] źródło danych:', initRes.source,
            'załadowano:', initRes.loaded, '/', initRes.total);

        _restoreCurrentPatient();
        _persist();
        emit();
        return { ok: true, source: initRes.source };
    },

    /**
     * Odepnij folder. Handle z IndexedDB usunięty. Cache w localStorage zostaje.

     * Po tej operacji aplikacja działa nadal, ale w trybie tylko-localStorage.
     */
    async disconnectLocalFolder() {
        try { await clearHandle(); } catch (_) { /* */ }
        if (_folderSyncTimer) { clearTimeout(_folderSyncTimer); _folderSyncTimer = null; }
        // F5.2: cleanup sticky toasta + watcher'a (gdyby były aktywne).
        _stopFolderHealthCheck();
        if (_unavailableToast) {
            if (typeof window !== 'undefined' && window.Toast) {
                window.Toast.dismiss(_unavailableToast);
            }
            _unavailableToast = null;
        }
        _dirHandle = null;
        state.folderConnected = false;
        state.folderName = '';
        state.folderStatus = 'init';
        state.devMode = false;
        try { window.localStorage.removeItem(LS_KEY_DEV_MODE); } catch (_) { /* */ }
        emit();
    },

    /**
     * Włącz „🧪 Tryb dev (localStorage)" — apka działa bez folderu, dane
     * tylko w przeglądarce. Persist'owany flag w localStorage żeby gate
     * nie wyskakiwał ponownie po reload.
     */
    enableDevMode() {
        state.devMode = true;
        state.folderStatus = 'devmode';
        try { window.localStorage.setItem(LS_KEY_DEV_MODE, '1'); } catch (_) { /* */ }
        emit();
    },

    /** Wyłącz tryb dev (np. gdy user chce wreszcie podpiąć folder). */
    disableDevMode() {
        state.devMode = false;
        state.folderStatus = 'init';
        try { window.localStorage.removeItem(LS_KEY_DEV_MODE); } catch (_) { /* */ }
        emit();
    },

    // ---- Save status helper (for UI) ---------------------------------------

    getSaveStatus() {
        return state.saveStatus;
    },

    // ---- Root folder accessor (PR-K4) --------------------------------------

    /**
     * Zwraca handle do root folderu pacjentów (do operacji w `_documents-store.js`,
     * `_local-folder-store.js`). `null` gdy folder nie jest podpięty.
     */
    getRootFolderHandle() {
        return _dirHandle;
    }
};

// --- bootstrap --------------------------------------------------------------

_init();

// dev-tools
if (typeof window !== 'undefined') {
    window.PsyStore = Store;
}
