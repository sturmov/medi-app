// ============================================================================
// _attachments.js — załączniki pacjenta: wgranie, lista, podgląd, pobranie,
// usunięcie. Wspólne dla pola „Dokumenty" w wizycie i wyciągu „Dokumenty".
//
// Pliki leżą w podfolderze `dokumenty/` folderu pacjenta — na Dysku Google albo
// w folderze lokalnym. Ten moduł rozmawia wyłącznie z `Store.getDocsApi()`,
// więc działa tak samo w obu trybach. To, DO KTÓREJ WIZYTY plik należy, pamięta
// wizyta (`visit.data.docs = [{ id, name, size }]`), nie magazyn.
// ============================================================================

import { Store } from './_store.js';
import { openConfirm } from './_modal.js';
import { el, toast } from './_dom.js';
import { iconForFile, isPreviewable, isImage, formatSize } from './_documents-store.js';

/** W trybie demo nie ma gdzie trzymać plików. */
export function attachmentsAvailable() {
    return !!Store.getDocsApi();
}

/** Wskaźnik folderu pacjenta w magazynie; nowy pacjent dostaje go po pierwszym zapisie. */
async function patientRef(patientId) {
    let ref = Store.getPatientRef(patientId);
    if (!ref) {
        await Store.flushNow();
        ref = Store.getPatientRef(patientId);
    }
    return ref;
}

/** Pliki w folderze `dokumenty/` pacjenta: [{ id, name, size, lastModified }]. */
export async function listAttachments(patientId) {
    const api = Store.getDocsApi();
    if (!api) return [];
    return api.list(Store.getPatientRef(patientId));
}

/**
 * Wgrywa pliki do folderu pacjenta.
 * @returns {Promise<{ added: Array<{id, name, size}>, failed: string[] }>}
 */
export async function uploadAttachments(patientId, files) {
    const api = Store.getDocsApi();
    const added = [];
    const failed = [];
    const ref = api ? await patientRef(patientId) : null;
    if (!ref) return { added, failed: Array.from(files).map((f) => f.name) };

    for (const file of files) {
        if (file.size > 50 * 1024 * 1024) {
            const proceed = await openConfirm({
                title: 'Duży plik',
                message: 'Plik „' + file.name + '" ma ' + formatSize(file.size) + '. Wgrywanie może potrwać. Kontynuować?',
                confirmLabel: 'Tak, wgraj',
                variant: 'primary'
            });
            if (!proceed) continue;
        }
        try {
            const saved = await api.upload(ref, file);
            added.push({ id: saved.id || saved.name, name: saved.name, size: saved.size || file.size || 0 });
        } catch (e) {
            console.error('[attachments] upload', file.name, e);
            failed.push(file.name);
        }
    }
    return { added, failed };
}

/** Usuwa plik z magazynu (na Dysku Google: do Kosza). Rzuca, gdy się nie udało. */
export async function removeAttachment(patientId, entry) {
    const api = Store.getDocsApi();
    if (!api) throw new Error('Brak podłączonego magazynu.');
    await api.remove(Store.getPatientRef(patientId), entry);
}

async function withBlobUrl(patientId, entry, use) {
    const api = Store.getDocsApi();
    let url = null;
    try {
        if (api) url = await api.blobUrl(Store.getPatientRef(patientId), entry);
    } catch (e) {
        console.error('[attachments] blob', e);
    }
    if (!url) {
        toast('error', 'Nie udało się odczytać pliku', entry.name);
        return;
    }
    use(url);
}

export function downloadAttachment(patientId, entry) {
    return withBlobUrl(patientId, entry, (url) => {
        const a = el('a', { href: url, download: entry.name });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
}

export function previewAttachment(patientId, entry) {
    return withBlobUrl(patientId, entry, (url) => {
        const backdrop = el('div', { class: 'psy-modal-backdrop psy-docs__preview-backdrop' });
        const close = () => {
            backdrop.remove();
            document.body.classList.remove('psy-modal-open');
            URL.revokeObjectURL(url);
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (ev) => { if (ev.key === 'Escape') close(); };
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
        backdrop.appendChild(el('div', { class: 'psy-modal psy-modal--xl psy-docs__preview-modal' }, [
            el('div', { class: 'psy-modal__header' }, [
                el('h3', { class: 'psy-modal__title' }, [iconForFile(entry.name) + ' ' + entry.name]),
                el('button', { type: 'button', class: 'psy-modal__close', title: 'Zamknij (Esc)', onclick: close }, ['×'])
            ]),
            el('div', { class: 'psy-modal__body psy-docs__preview-body' }, [
                isImage(entry.name)
                    ? el('img', { src: url, alt: entry.name, class: 'psy-docs__preview-image' })
                    : el('iframe', { src: url, class: 'psy-docs__preview-iframe', title: entry.name })
            ]),
            el('div', { class: 'psy-modal__footer' }, [
                el('button', { class: 'btn btn--secondary', onclick: () => downloadAttachment(patientId, entry) }, ['⬇ Pobierz']),
                el('button', { class: 'btn btn--primary', onclick: close }, ['Zamknij'])
            ])
        ]));
        document.body.appendChild(backdrop);
        document.body.classList.add('psy-modal-open');
        document.addEventListener('keydown', onKey);
    });
}

/** Podgląd, gdy przeglądarka umie pokazać plik (PDF, obraz); w przeciwnym razie pobranie. */
export function openAttachment(patientId, entry) {
    return isPreviewable(entry.name) ? previewAttachment(patientId, entry) : downloadAttachment(patientId, entry);
}
