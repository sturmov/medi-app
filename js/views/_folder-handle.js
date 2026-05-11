// ============================================================================
// _folder-handle.js — IndexedDB helper do persist'owania
// `FileSystemDirectoryHandle` (File System Access API).
//
// `directoryHandle` to obiekt natywny przeglądarki, który NIE serializuje
// się do JSON — nie da się go zapisać w `localStorage`. IndexedDB pozwala
// trzymać natywne obiekty (structured clone) między sesjami.
//
// Użycie:
//   import { saveHandle, loadHandle, clearHandle,
//            verifyPermission, isFileSystemAccessSupported } from './_folder-handle.js';
//
//   if (!isFileSystemAccessSupported()) { /* show warning */ }
//   const handle = await window.showDirectoryPicker();
//   await saveHandle(handle);
//
//   // Przy następnym uruchomieniu:
//   const restored = await loadHandle();
//   if (restored && await verifyPermission(restored, 'readwrite')) {
//       /* gotowe */
//   }
// ============================================================================

const DB_NAME = 'psy-app';
const DB_VERSION = 1;
const STORE_NAME = 'folder-handles';
const HANDLE_KEY = 'patients-folder';

/** Czy przeglądarka wspiera File System Access API? (Chrome/Edge desktop ✓, Firefox/Safari ✗) */
export function isFileSystemAccessSupported() {
    return typeof window !== 'undefined'
        && typeof window.showDirectoryPicker === 'function';
}

/** Otwiera (lub tworzy) bazę IndexedDB. */
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/** Zapisuje handle pod stałym kluczem. */
export async function saveHandle(handle) {
    if (!handle) return false;
    try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(handle, HANDLE_KEY);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('[folder-handle.saveHandle]', e);
        return false;
    }
}

/** Wczytuje zapisany handle (lub null). */
export async function loadHandle() {
    try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(HANDLE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.warn('[folder-handle.loadHandle]', e);
        return null;
    }
}

/** Usuwa zapisany handle (przy „Odepnij folder"). */
export async function clearHandle() {
    try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(HANDLE_KEY);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.warn('[folder-handle.clearHandle]', e);
        return false;
    }
}

/**
 * Weryfikuje (i — jeśli potrzeba — żąda) uprawnienie do handle'a.
 * Po reload Chrome może wymagać ponownego klika user'a.
 *
 * @param {FileSystemDirectoryHandle} handle
 * @param {'read'|'readwrite'} mode
 * @param {boolean} promptIfNeeded — czy pokazać prompt gdy permission='prompt'
 * @returns {Promise<boolean>} true = mamy granted permission
 */
export async function verifyPermission(handle, mode = 'readwrite', promptIfNeeded = true) {
    if (!handle) return false;
    const opts = { mode };
    try {
        let perm = await handle.queryPermission(opts);
        if (perm === 'granted') return true;
        if (perm === 'prompt' && promptIfNeeded) {
            perm = await handle.requestPermission(opts);
            return perm === 'granted';
        }
        return false;
    } catch (e) {
        console.warn('[folder-handle.verifyPermission]', e);
        return false;
    }
}

/**
 * Czyta plik z folderu (jako tekst).
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} fileName
 * @returns {Promise<string|null>} treść pliku lub null gdy nie istnieje
 */
export async function readTextFile(dirHandle, fileName) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
        const file = await fileHandle.getFile();
        return await file.text();
    } catch (e) {
        // NotFoundError = plik nie istnieje (OK przy pierwszym uruchomieniu)
        if (e && e.name === 'NotFoundError') return null;
        console.warn('[folder-handle.readTextFile]', fileName, e);
        return null;
    }
}

/**
 * Zapisuje tekst do pliku w folderze (tworzy plik gdy nie istnieje).
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} fileName
 * @param {string} content
 * @returns {Promise<boolean>}
 */
export async function writeTextFile(dirHandle, fileName, content) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return true;
    } catch (e) {
        console.error('[folder-handle.writeTextFile]', fileName, e);
        return false;
    }
}


// ============================================================================
// PR-K2 (2026-05-11) — Binary I/O + subfoldery
// Wymagane dla pliku `pacjent.xlsx` (binary XLSX) + struktury folderów
// `pacjenci/{KOD}_{Naz}_{Imię}/pacjent.xlsx` + `dokumenty/` per pacjent.
// ============================================================================

/**
 * Czyta plik binarny z folderu.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} fileName
 * @returns {Promise<ArrayBuffer|null>}  null gdy plik nie istnieje
 */
export async function readBinaryFile(dirHandle, fileName) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
        const file = await fileHandle.getFile();
        return await file.arrayBuffer();
    } catch (e) {
        if (e && e.name === 'NotFoundError') return null;
        console.warn('[folder-handle.readBinaryFile]', fileName, e);
        return null;
    }
}

/**
 * Zapisuje bajty do pliku binarnego (tworzy gdy nie istnieje, nadpisuje gdy istnieje).
 * Atomic write w File System Access API nie jest natywnie wspierany w przeglądarce
 * (brak rename), więc używamy direct overwrite z `keepExistingData: false`.
 * Dla jednoosobowej apki bez współbieżności to wystarcza — ryzyko utraty danych
 * przy crashu w trakcie zapisu jest minimalne.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} fileName
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Promise<boolean>}
 */
export async function writeBinaryFile(dirHandle, fileName, bytes) {
    try {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable({ keepExistingData: false });
        // `bytes` może być ArrayBuffer lub Uint8Array — WritableStream akceptuje oba
        await writable.write(bytes);
        await writable.close();
        return true;
    } catch (e) {
        console.error('[folder-handle.writeBinaryFile]', fileName, e);
        return false;
    }
}

/**
 * Usuwa plik (lub podfolder) z folderu.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} name
 * @param {object} [opts]
 * @param {boolean} [opts.recursive=false] — dla podfolderów
 * @returns {Promise<boolean>}
 */
export async function deleteEntry(dirHandle, name, opts = {}) {
    try {
        await dirHandle.removeEntry(name, { recursive: !!opts.recursive });
        return true;
    } catch (e) {
        if (e && e.name === 'NotFoundError') return true; // już nie ma
        console.warn('[folder-handle.deleteEntry]', name, e);
        return false;
    }
}

/**
 * Sprawdza czy plik istnieje w folderze.
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} fileName
 * @returns {Promise<boolean>}
 */
export async function existsFile(dirHandle, fileName) {
    try {
        await dirHandle.getFileHandle(fileName, { create: false });
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Listuje WSZYSTKIE podfoldery (1 poziom w głąb).
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<Array<{name: string, handle: FileSystemDirectoryHandle}>>}
 */
export async function listSubfolders(dirHandle) {
    const out = [];
    try {
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'directory') {
                out.push({ name, handle });
            }
        }
    } catch (e) {
        console.warn('[folder-handle.listSubfolders]', e);
    }
    return out;
}

/**
 * Listuje WSZYSTKIE pliki w folderze (1 poziom w głąb).
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @returns {Promise<Array<{name: string, handle: FileSystemFileHandle, size: number, lastModified: number}>>}
 */
export async function listFiles(dirHandle) {
    const out = [];
    try {
        for await (const [name, handle] of dirHandle.entries()) {
            if (handle.kind === 'file') {
                try {
                    const file = await handle.getFile();
                    out.push({
                        name,
                        handle,
                        size: file.size,
                        lastModified: file.lastModified,
                        type: file.type || ''
                    });
                } catch (_) {
                    out.push({ name, handle, size: 0, lastModified: 0, type: '' });
                }
            }
        }
    } catch (e) {
        console.warn('[folder-handle.listFiles]', e);
    }
    return out;
}

/**
 * Zwraca handle podfolderu (tworzy gdy nie istnieje).
 *
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} name
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function ensureSubfolder(dirHandle, name) {
    try {
        return await dirHandle.getDirectoryHandle(name, { create: true });
    } catch (e) {
        console.error('[folder-handle.ensureSubfolder]', name, e);
        return null;
    }
}

/**
 * Otwiera handle podfolderu (BEZ tworzenia jeśli nie istnieje).
 * Zwraca null gdy podfolder nie istnieje.
 */
export async function openSubfolder(dirHandle, name) {
    try {
        return await dirHandle.getDirectoryHandle(name, { create: false });
    } catch (e) {
        if (e && e.name === 'NotFoundError') return null;
        console.warn('[folder-handle.openSubfolder]', name, e);
        return null;
    }
}


