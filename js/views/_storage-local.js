// ============================================================================
// _storage-local.js — magazyn „folder na komputerze" (tryb testowy / offline).
//
// Ten sam kontrakt co `_storage-gdrive.js`:
//   kind, label, saveDebounceMs
//   listPatients()            → [{ ref, summary, doc? , error? }]
//   loadPatient(ref)          → dokument pacjenta
//   savePatient(doc, ref)     → { ref, renamed?, conflict? }
//   docs.{list, upload, remove, rename, blobUrl}   — załączniki pacjenta
//
// `ref` = nazwa podfolderu pacjenta (`P001_Nazwisko_Imie`), w nim `pacjent.xlsx`
// i `dokumenty/`. Działa tylko w Chrome/Edge na komputerze (File System Access).
// ============================================================================

import { scanPatientFolders, loadPatient, renamePatientFolderIfNeeded } from './_local-folder-store.js';
import {
    listDocuments, uploadDocument, deleteDocument, renameDocument, getDocumentBlobURL
} from './_documents-store.js';
import { verifyPermission } from './_folder-handle.js';
import { patientFolderName, patientSummary } from './_patient-doc.js';
import { StorageError } from './_storage-errors.js';

export function createLocalBackend(dirHandle) {
    /** Rozróżnia „folder zniknął / cofnięto dostęp" od zwykłego błędu zapisu. */
    async function failure(message) {
        let granted = false;
        try { granted = await verifyPermission(dirHandle, 'readwrite', false); } catch (_) { /* */ }
        return new StorageError(granted ? 'io' : 'auth', message);
    }

    return {
        kind: 'local',
        label: dirHandle.name || 'folder',
        saveDebounceMs: 800,

        async listPatients() {
            const scanned = await scanPatientFolders(dirHandle);
            return scanned.map((s) => (s.doc
                ? { ref: s.folderName, summary: patientSummary(s.doc), doc: s.doc }
                : {
                    ref: s.folderName,
                    summary: { id: s.kod, kodPacjenta: s.kod, imie: '', nazwisko: s.folderName },
                    error: s.error
                }));
        },

        async loadPatient(ref) {
            const doc = await loadPatient(dirHandle, ref);
            if (!doc) throw await failure('Nie znaleziono pliku pacjent.xlsx w folderze „' + ref + '".');
            return doc;
        },

        async savePatient(doc, ref) {
            let res = null;
            try {
                res = await renamePatientFolderIfNeeded(dirHandle, ref || patientFolderName(doc.patient), doc);
            } catch (e) {
                throw await failure('Zapis pliku pacjenta nie powiódł się: ' + (e && e.message || e));
            }
            if (!res) throw await failure('Zapis pliku pacjenta nie powiódł się.');
            return { ref: res.folderName, renamed: !!res.renamed, conflict: !!res.conflict };
        },

        docs: {
            pathHint: (ref) => ref + '/dokumenty/',
            async list(ref) {
                const files = await listDocuments(dirHandle, ref);
                return files.map((f) => ({ id: f.name, name: f.name, size: f.size, lastModified: f.lastModified }));
            },
            // W folderze lokalnym identyfikatorem pliku jest jego (unikalna) nazwa.
            async upload(ref, file) {
                const saved = await uploadDocument(dirHandle, ref, file);
                return { id: saved.name, name: saved.name, size: saved.size };
            },
            remove: (ref, entry) => deleteDocument(dirHandle, ref, entry.name),
            rename: (ref, entry, newName) => renameDocument(dirHandle, ref, entry.name, newName),
            blobUrl: (ref, entry) => getDocumentBlobURL(dirHandle, ref, entry.name)
        }
    };
}
