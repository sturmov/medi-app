// ============================================================================
// view-documents.js — sekcja „Dokumenty" pacjenta (PR-K4).
//
// Realny widok plików w folderze `pacjenci/{KOD}_*/dokumenty/`.
// Obsługuje:
//   - listing plików (ikona / nazwa / rozmiar / data / akcje)
//   - upload przez `<input type="file" multiple>` + drag & drop
//   - podgląd inline (PDF w `<iframe>`, JPG/PNG w `<img>`)
//   - pobieranie pliku
//   - usuwanie (z `openConfirm`)
//   - zmiana nazwy (inline edit)
//
// PR-K4 (2026-05-11): zastępuje stub UI z PR-J9. Wymaga podpiętego folderu
// — gdy brak, pokazuje empty-state z przyciskiem „Podpiej folder".
// ============================================================================

import { Store } from './_store.js';
import { openConfirm } from './_modal.js';
import { patientFolderName } from './_storage-format.js';
import {
    listDocuments,
    uploadDocument,
    deleteDocument,
    renameDocument,
    getDocumentBlobURL,
    downloadDocument,
    iconForFile,
    isPreviewable,
    isImage,
    formatSize,
    formatDate
} from './_documents-store.js';

// ---- helpers ----------------------------------------------------------------

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'style' && typeof v === 'object') {
            for (const [sk, sv] of Object.entries(v)) node.style[sk] = sv;
        } else if (typeof v === 'boolean') {
            if (v) node.setAttribute(k, '');
        } else {
            node.setAttribute(k, v);
        }
    }
    if (!Array.isArray(children)) children = [children];
    for (const c of children) {
        if (c == null || c === false) continue;
        if (typeof c === 'string' || typeof c === 'number') {
            node.appendChild(document.createTextNode(String(c)));
        } else {
            node.appendChild(c);
        }
    }
    return node;
}

function toast(variant, title, message) {
    if (window.PsyToast) {
        window.PsyToast.notify({ variant, title, message }, 'psy-app-toasts');
    }
}

// ---- VIEW -------------------------------------------------------------------

export function renderDocuments() {
    const patient = Store.state.currentPatient;
    const root = el('div', {
        class: 'psy-new-view psy-docs-view',
        dataset: { live: 'true' }
    });

    // === HEADER ===
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Dokumenty']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient
                    ? (patient.imie + ' ' + patient.nazwisko + ' · ' + _folderPathHint(patient))
                    : 'Wybierz pacjenta'
            ])
        ])
    ]));

    // === BODY ===
    const body = el('div', { class: 'psy-new-view__body psy-docs' });

    if (!patient) {
        body.appendChild(_emptyState('🗂', 'Wybierz pacjenta',
            'Aby zobaczyć dokumenty, najpierw wybierz pacjenta z listy lub topbara.', [
            { label: 'Lista pacjentów', variant: 'primary',
              onClick: () => { window.location.hash = '#/patients'; } }
        ]));
        root.appendChild(body);
        return root;
    }

    if (!Store.isLocalConnected()) {
        body.appendChild(_emptyState('📁', 'Folder nie jest podpięty',
            'Aby przechowywać i wgrywać dokumenty pacjenta (PDF skierowań, wyniki badań, '
            + 'skany dokumentów), podepnij folder lokalny.', [
            { label: '📁 Podpiej folder', variant: 'primary',
              onClick: () => document.getElementById('btn-connect-folder')?.click() }
        ]));
        root.appendChild(body);
        return root;
    }

    const rootHandle = Store.getRootFolderHandle();
    const folderName = patient._folderName || patientFolderName(patient);

    // === Drag & drop overlay (na całe body) ===
    let dragCounter = 0;
    body.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });
    body.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        body.classList.add('psy-docs--dragover');
    });
    body.addEventListener('dragleave', () => {
        dragCounter = Math.max(0, dragCounter - 1);
        if (dragCounter === 0) body.classList.remove('psy-docs--dragover');
    });
    body.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragCounter = 0;
        body.classList.remove('psy-docs--dragover');
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length === 0) return;
        await _handleUpload(rootHandle, folderName, files, body);
    });

    // === Uploader card ===
    const fileInput = el('input', {
        type: 'file',
        multiple: true,
        style: { display: 'none' },
        onchange: async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;
            await _handleUpload(rootHandle, folderName, files, body);
            e.target.value = '';   // reset input
        }
    });
    const uploader = el('div', { class: 'psy-docs__uploader' }, [
        el('div', { class: 'psy-docs__uploader-icon' }, ['📤']),
        el('div', { class: 'psy-docs__uploader-title' }, ['Przeciągnij pliki tutaj lub kliknij, aby wybrać']),
        el('div', { class: 'psy-docs__uploader-hint' }, [
            'PDF · JPG/PNG · DOCX · XLSX · MP3 · ZIP — bez ograniczeń wielkości'
        ]),
        el('button', {
            class: 'btn btn--secondary btn--sm',
            onclick: () => fileInput.click()
        }, ['📂 Wybierz plik']),
        fileInput
    ]);
    body.appendChild(uploader);

    // === Lista plików ===
    const listContainer = el('div', { class: 'psy-docs__list-container' });
    body.appendChild(listContainer);

    // Render asynchroniczny (po fetch'u listy)
    _renderFileList(listContainer, rootHandle, folderName);

    root.appendChild(body);
    return root;
}

// ============================================================================
// UPLOAD handling
// ============================================================================

async function _handleUpload(rootHandle, folderName, files, body) {
    let success = 0;
    let errors = 0;
    for (const file of files) {
        // Ostrzeżenie przy dużych plikach
        if (file.size > 50 * 1024 * 1024) {
            const proceed = await openConfirm({
                title: 'Duży plik',
                message: `Plik „${file.name}" ma ${formatSize(file.size)}. Upload może potrwać. Kontynuować?`,
                confirmLabel: 'Tak, wgraj',
                variant: 'primary'
            });
            if (!proceed) continue;
        }

        try {
            const result = await uploadDocument(rootHandle, folderName, file);
            success++;
            console.log('[uploadDocument]', result.name, formatSize(result.size));
        } catch (e) {
            console.error('[uploadDocument] fail', file.name, e);
            errors++;
        }
    }

    if (success > 0) {
        toast('success', success === 1 ? 'Wgrano plik' : `Wgrano ${success} plików`,
            errors > 0 ? `(${errors} błędów)` : '');
    }
    if (errors > 0 && success === 0) {
        toast('error', 'Błąd uploadu', `Nie udało się wgrać ${errors} plików`);
    }

    // Re-render listy
    const listContainer = body.querySelector('.psy-docs__list-container');
    if (listContainer) {
        _renderFileList(listContainer, rootHandle, folderName);
    }
}

// ============================================================================
// LIST rendering
// ============================================================================

async function _renderFileList(container, rootHandle, folderName) {
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'psy-docs__list-loading' }, ['⏳ Ładowanie listy…']));

    let files;
    try {
        files = await listDocuments(rootHandle, folderName);
    } catch (e) {
        console.error('[listDocuments]', e);
        container.innerHTML = '';
        container.appendChild(_emptyState('⚠', 'Błąd odczytu',
            'Nie udało się odczytać folderu z dokumentami: ' + String(e && e.message || e)));
        return;
    }

    container.innerHTML = '';
    container.appendChild(el('h2', { class: 'psy-docs__list-title' }, [
        'Załączniki' + (files.length > 0 ? ` (${files.length})` : '')
    ]));

    if (files.length === 0) {
        container.appendChild(_emptyState('📂', 'Brak załączników',
            'Przeciągnij pliki na obszar powyżej lub kliknij „Wybierz plik".'));
        return;
    }

    // Tabela plików
    const table = el('table', { class: 'psy-new-table psy-docs__table' });
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', { style: { width: '40px' } }, ['']),
            el('th', {}, ['Nazwa']),
            el('th', { style: { width: '100px' } }, ['Rozmiar']),
            el('th', { style: { width: '140px' } }, ['Modyfikacja']),
            el('th', { style: { width: '180px', textAlign: 'right' } }, ['Akcje'])
        ])
    ]));

    const tbody = el('tbody', {});
    // Sortowanie po dacie modyfikacji DESC (najnowsze na górze)
    const sorted = [...files].sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

    for (const f of sorted) {
        tbody.appendChild(_renderFileRow(f, rootHandle, folderName, container));
    }
    table.appendChild(tbody);
    container.appendChild(table);
}

function _renderFileRow(file, rootHandle, folderName, listContainer) {
    const previewable = isPreviewable(file.name);
    const tr = el('tr', { class: 'psy-docs__row' });

    tr.appendChild(el('td', { class: 'psy-docs__row-icon' }, [iconForFile(file.name)]));

    // Nazwa (klikalna gdy previewable)
    const nameCell = el('td', { class: 'psy-docs__row-name' });
    if (previewable) {
        const link = el('a', {
            href: '#',
            class: 'psy-docs__row-name-link',
            title: 'Otwórz podgląd',
            onclick: async (e) => {
                e.preventDefault();
                await _openPreview(rootHandle, folderName, file.name);
            }
        }, [file.name]);
        nameCell.appendChild(link);
    } else {
        nameCell.appendChild(el('span', { title: 'Brak podglądu — pobierz plik aby otworzyć' }, [file.name]));
    }
    tr.appendChild(nameCell);

    tr.appendChild(el('td', { class: 'psy-docs__row-size' }, [formatSize(file.size)]));
    tr.appendChild(el('td', { class: 'psy-docs__row-date' }, [formatDate(file.lastModified)]));

    // Akcje
    const actions = el('td', { class: 'psy-docs__row-actions' });

    if (previewable) {
        actions.appendChild(el('button', {
            class: 'btn btn--secondary btn--sm btn--icon',
            title: 'Podgląd',
            onclick: () => _openPreview(rootHandle, folderName, file.name)
        }, ['🔍']));
    }

    actions.appendChild(el('button', {
        class: 'btn btn--secondary btn--sm btn--icon',
        title: 'Pobierz',
        onclick: async () => {
            await downloadDocument(rootHandle, folderName, file.name);
        }
    }, ['⬇']));

    actions.appendChild(el('button', {
        class: 'btn btn--secondary btn--sm btn--icon',
        title: 'Zmień nazwę',
        onclick: async () => {
            const newName = window.prompt('Nowa nazwa pliku:', file.name);
            if (!newName || newName.trim() === '' || newName === file.name) return;
            const ok = await renameDocument(rootHandle, folderName, file.name, newName.trim());
            if (ok) {
                toast('success', 'Zmieniono nazwę', file.name + ' → ' + newName);
                _renderFileList(listContainer, rootHandle, folderName);
            } else {
                toast('error', 'Błąd zmiany nazwy', 'Sprawdź czy plik istnieje');
            }
        }
    }, ['✏']));

    actions.appendChild(el('button', {
        class: 'btn btn--danger btn--sm btn--icon',
        title: 'Usuń',
        onclick: async () => {
            const ok = await openConfirm({
                title: 'Usunąć plik?',
                message: `Czy na pewno usunąć plik „${file.name}" (${formatSize(file.size)})? `
                    + 'Operacji nie da się cofnąć.',
                confirmLabel: 'Usuń',
                variant: 'danger'
            });
            if (!ok) return;
            const success = await deleteDocument(rootHandle, folderName, file.name);
            if (success) {
                toast('info', 'Usunięto plik', file.name);
                _renderFileList(listContainer, rootHandle, folderName);
            } else {
                toast('error', 'Błąd usuwania', 'Plik mógł zostać już usunięty.');
            }
        }
    }, ['🗑']));

    tr.appendChild(actions);
    return tr;
}

// ============================================================================
// PREVIEW MODAL — PDF w iframe / obraz w img
// ============================================================================

async function _openPreview(rootHandle, folderName, fileName) {
    let blobUrl;
    try {
        blobUrl = await getDocumentBlobURL(rootHandle, folderName, fileName);
    } catch (e) {
        console.error('[preview] błąd odczytu', e);
        toast('error', 'Błąd odczytu pliku', String(e && e.message || e));
        return;
    }
    if (!blobUrl) {
        toast('error', 'Brak pliku', 'Plik nie istnieje lub nie można go odczytać.');
        return;
    }

    // Modal — używamy istniejących klas `.psy-modal*` z `_modal.js` (light variant)
    const backdrop = el('div', { class: 'psy-modal-backdrop psy-docs__preview-backdrop' });
    const closeAndRevoke = () => {
        backdrop.remove();
        document.body.classList.remove('psy-modal-open');
        URL.revokeObjectURL(blobUrl);
        document.removeEventListener('keydown', onKeydown);
    };
    function onKeydown(ev) {
        if (ev.key === 'Escape') closeAndRevoke();
    }
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeAndRevoke();
    });

    const modal = el('div', { class: 'psy-modal psy-modal--xl psy-docs__preview-modal' }, [
        el('div', { class: 'psy-modal__header' }, [
            el('h3', { class: 'psy-modal__title' }, [iconForFile(fileName) + ' ' + fileName]),
            el('button', {
                type: 'button',
                class: 'psy-modal__close',
                title: 'Zamknij (Esc)',
                onclick: closeAndRevoke
            }, ['×'])
        ]),
        el('div', { class: 'psy-modal__body psy-docs__preview-body' }, [
            isImage(fileName)
                ? el('img', {
                    src: blobUrl,
                    alt: fileName,
                    class: 'psy-docs__preview-image'
                })
                : el('iframe', {
                    src: blobUrl,
                    class: 'psy-docs__preview-iframe',
                    title: fileName
                })
        ]),
        el('div', { class: 'psy-modal__footer' }, [
            el('button', {
                class: 'btn btn--secondary',
                onclick: async () => {
                    await downloadDocument(rootHandle, folderName, fileName);
                }
            }, ['⬇ Pobierz']),
            el('button', {
                class: 'btn btn--primary',
                onclick: closeAndRevoke
            }, ['Zamknij'])
        ])
    ]);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.classList.add('psy-modal-open');
    document.addEventListener('keydown', onKeydown);
}

// ============================================================================
// HELPERS
// ============================================================================

function _folderPathHint(patient) {
    const name = patient._folderName || patientFolderName(patient);
    return name + '/dokumenty/';
}

function _emptyState(icon, title, description, actions = []) {
    const wrap = el('div', { class: 'psy-new-empty' }, [
        el('div', { class: 'psy-new-empty__icon' }, [icon]),
        el('div', { class: 'psy-new-empty__title' }, [title]),
        el('div', { class: 'psy-new-empty__description' }, [description])
    ]);
    if (actions.length) {
        const actionsRow = el('div', { class: 'psy-new-empty__actions' });
        for (const a of actions) {
            actionsRow.appendChild(el('button', {
                class: 'btn btn--' + (a.variant || 'secondary'),
                onclick: a.onClick
            }, [a.label]));
        }
        wrap.appendChild(actionsRow);
    }
    return wrap;
}
