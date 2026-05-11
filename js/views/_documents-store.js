// ============================================================================
// _documents-store.js — CRUD na plikach w folderze `dokumenty/` pacjenta.
//
// Paczka K4 (2026-05-11):
//   Cienka warstwa nad `_folder-handle.js` + `_local-folder-store.js`,
//   oferująca operacje na załącznikach pacjenta (PDF, JPG, DOCX, MP3, …)
//   w strukturze:
//
//     pacjenci/{KOD}_{Naz}_{Imię}/
//       ├── pacjent.xlsx
//       └── dokumenty/
//           ├── skierowanie.pdf
//           ├── wyniki_2026-05-08.pdf
//           └── ...
//
// API:
//   listDocuments(rootHandle, folderName)   → Array<{name, size, mime, lastModified, handle}>
//   uploadDocument(rootHandle, folderName, file)   → {name, size}
//   deleteDocument(rootHandle, folderName, fileName)   → boolean
//   renameDocument(rootHandle, folderName, oldName, newName)   → boolean
//   getDocumentBlobURL(rootHandle, folderName, fileName)   → string (blob URL)
//   downloadDocument(rootHandle, folderName, fileName)   → void (triggers download)
//
// Czyste funkcje — bez Store. Widok `view-documents.js` wywołuje je używając
// `Store.getRootFolderHandle()` + bieżącego `currentPatient._folderName`.
// ============================================================================

import {
    listFiles,
    writeBinaryFile,
    readBinaryFile,
    deleteEntry,
    existsFile
} from './_folder-handle.js';

import {
    ensureDocumentsFolder,
    openDocumentsFolder
} from './_local-folder-store.js';

/**
 * Listuje pliki w `{rootHandle}/{folderName}/dokumenty/`.
 * Zwraca tablicę metadanych BEZ czytania zawartości plików (szybkie).
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} folderName  — nazwa folderu pacjenta (np. „P001_Bogusz_Michal")
 * @returns {Promise<Array<{name, size, mime, lastModified, handle}>>}
 */
export async function listDocuments(rootHandle, folderName) {
    if (!rootHandle || !folderName) return [];
    const docsHandle = await openDocumentsFolder(rootHandle, folderName);
    if (!docsHandle) return [];   // folder dokumenty/ nie istnieje jeszcze

    const files = await listFiles(docsHandle);
    return files.map((f) => ({
        name: f.name,
        size: f.size,
        mime: f.type || _mimeFromName(f.name),
        lastModified: f.lastModified,
        handle: f.handle
    }));
}

/**
 * Wgrywa plik do folderu `dokumenty/` pacjenta.
 * Sanityzuje nazwę (usuwa niedozwolone znaki Windows). Gdy plik o tej samej
 * nazwie istnieje, dodaje sufiks `_1`, `_2`, …
 *
 * @param {FileSystemDirectoryHandle} rootHandle
 * @param {string} folderName
 * @param {File} file
 * @returns {Promise<{name: string, size: number}>}
 */
export async function uploadDocument(rootHandle, folderName, file) {
    if (!rootHandle || !folderName || !file) {
        throw new Error('uploadDocument: brakuje argumentów');
    }
    const docsHandle = await ensureDocumentsFolder(rootHandle, folderName);
    if (!docsHandle) {
        throw new Error('Nie udało się utworzyć folderu dokumenty/');
    }

    const sanitized = _sanitizeFileName(file.name);
    const uniqueName = await _uniqueName(docsHandle, sanitized);

    const buffer = await file.arrayBuffer();
    const ok = await writeBinaryFile(docsHandle, uniqueName, buffer);
    if (!ok) {
        throw new Error('Zapis pliku nie powiódł się: ' + uniqueName);
    }
    return { name: uniqueName, size: file.size };
}

/**
 * Usuwa plik z folderu `dokumenty/` pacjenta.
 */
export async function deleteDocument(rootHandle, folderName, fileName) {
    if (!rootHandle || !folderName || !fileName) return false;
    const docsHandle = await openDocumentsFolder(rootHandle, folderName);
    if (!docsHandle) return false;
    return await deleteEntry(docsHandle, fileName, { recursive: false });
}

/**
 * Zmiana nazwy pliku — File System Access nie ma natywnego rename,
 * więc copy + delete.
 */
export async function renameDocument(rootHandle, folderName, oldName, newName) {
    if (!rootHandle || !folderName || !oldName || !newName) return false;
    if (oldName === newName) return true;

    const docsHandle = await openDocumentsFolder(rootHandle, folderName);
    if (!docsHandle) return false;

    const sanitized = _sanitizeFileName(newName);
    if (sanitized === oldName) return true;

    // Czy nowa nazwa już istnieje? → unique
    const finalName = await _uniqueName(docsHandle, sanitized);

    try {
        const buf = await readBinaryFile(docsHandle, oldName);
        if (!buf) {
            console.warn('[renameDocument] źródłowy plik nie istnieje', oldName);
            return false;
        }
        const ok = await writeBinaryFile(docsHandle, finalName, buf);
        if (!ok) return false;
        await deleteEntry(docsHandle, oldName, { recursive: false });
        return true;
    } catch (e) {
        console.error('[renameDocument]', oldName, '→', newName, e);
        return false;
    }
}

/**
 * Zwraca blob URL pliku (do `<iframe>` / `<img>` w modalu podglądu).
 * Pamiętaj o `URL.revokeObjectURL(url)` po użyciu!
 */
export async function getDocumentBlobURL(rootHandle, folderName, fileName) {
    if (!rootHandle || !folderName || !fileName) return null;
    const docsHandle = await openDocumentsFolder(rootHandle, folderName);
    if (!docsHandle) return null;

    const buf = await readBinaryFile(docsHandle, fileName);
    if (!buf) return null;

    const mime = _mimeFromName(fileName);
    const blob = new Blob([buf], { type: mime });
    return URL.createObjectURL(blob);
}

/**
 * Wywołuje pobranie pliku w przeglądarce (`<a download>` trigger).
 */
export async function downloadDocument(rootHandle, folderName, fileName) {
    const url = await getDocumentBlobURL(rootHandle, folderName, fileName);
    if (!url) {
        console.warn('[downloadDocument] nie udało się odczytać', fileName);
        return false;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
}


// ============================================================================
// HELPERS
// ============================================================================

/**
 * Sanityzuje nazwę pliku — usuwa znaki niedozwolone w Windows i POSIX.
 * Zachowuje rozszerzenie. Pusta nazwa → 'plik'.
 */
function _sanitizeFileName(name) {
    if (!name) return 'plik';
    // Usuń ścieżkę (jeśli przyszło coś typu "C:\folder\plik.pdf")
    let s = String(name).split(/[\\/]/).pop().trim();
    // Usuń znaki niedozwolone Windows: < > : " / \ | ? *
    s = s.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    // Wielokrotne spacje/podkreślenia → jedno
    s = s.replace(/\s+/g, ' ').replace(/_+/g, '_');
    // Trim kropek z początku/końca
    s = s.replace(/^\.+|\.+$/g, '');
    return s || 'plik';
}

/**
 * Zwraca nazwę, która jeszcze nie istnieje w folderze. Gdy `name.pdf` istnieje,
 * próbuje `name_1.pdf`, `name_2.pdf`, …
 */
async function _uniqueName(docsHandle, name) {
    if (!(await existsFile(docsHandle, name))) return name;

    // Wyciągnij baseName + extension
    const lastDot = name.lastIndexOf('.');
    const base = lastDot > 0 ? name.slice(0, lastDot) : name;
    const ext  = lastDot > 0 ? name.slice(lastDot) : '';

    for (let i = 1; i < 1000; i++) {
        const candidate = `${base}_${i}${ext}`;
        if (!(await existsFile(docsHandle, candidate))) return candidate;
    }
    // Fallback (mało prawdopodobne)
    return `${base}_${Date.now()}${ext}`;
}

/**
 * Wykrywa MIME type na podstawie rozszerzenia pliku.
 * Używane gdy `File.type` jest pusty (po odczycie z dysku).
 */
function _mimeFromName(name) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    const map = {
        pdf:  'application/pdf',
        jpg:  'image/jpeg',
        jpeg: 'image/jpeg',
        png:  'image/png',
        gif:  'image/gif',
        webp: 'image/webp',
        svg:  'image/svg+xml',
        bmp:  'image/bmp',
        doc:  'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls:  'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ppt:  'application/vnd.ms-powerpoint',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        odt:  'application/vnd.oasis.opendocument.text',
        ods:  'application/vnd.oasis.opendocument.spreadsheet',
        txt:  'text/plain',
        csv:  'text/csv',
        rtf:  'application/rtf',
        mp3:  'audio/mpeg',
        wav:  'audio/wav',
        ogg:  'audio/ogg',
        m4a:  'audio/mp4',
        mp4:  'video/mp4',
        webm: 'video/webm',
        zip:  'application/zip',
        rar:  'application/vnd.rar',
        '7z': 'application/x-7z-compressed'
    };
    return map[ext] || 'application/octet-stream';
}

/**
 * Zwraca ikonę emoji odpowiednią dla pliku na podstawie nazwy/MIME.
 * Używane w `view-documents.js`.
 */
export function iconForFile(name) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    if (ext === 'pdf') return '📄';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return '🖼';
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return '📝';
    if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return '📊';
    if (['ppt', 'pptx', 'odp'].includes(ext)) return '📑';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return '🎵';
    if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return '🎬';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
    if (['txt', 'md'].includes(ext)) return '📃';
    return '📎';
}

/**
 * Czy plik nadaje się do podglądu inline (PDF / obraz)?
 */
export function isPreviewable(name) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    return ext === 'pdf' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
}

/**
 * Czy plik jest obrazem? (do wyboru tagu `<img>` vs `<iframe>` w podglądzie)
 */
export function isImage(name) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
}

/**
 * Format rozmiaru pliku (1234 → "1.2 KB", 1234567 → "1.2 MB").
 */
export function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

/**
 * Format daty (timestamp ms → "2026-05-11 14:32").
 */
export function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
