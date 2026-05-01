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
