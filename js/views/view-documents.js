// ============================================================================
// view-documents.js — „Dokumenty": załączniki pacjenta (PDF, skany, wyniki).
//
// Pliki leżą w podfolderze `dokumenty/` folderu pacjenta — na Dysku Google
// albo w folderze lokalnym (zależnie od podłączonego magazynu). Widok rozmawia
// wyłącznie z `Store.getDocsApi()`, więc działa tak samo w obu trybach:
//   list / upload (klik + przeciągnij) / podgląd PDF i obrazów / pobranie /
//   zmiana nazwy / usunięcie (z potwierdzeniem).
// ============================================================================

import { Store } from './_store.js';
import { openConfirm } from './_modal.js';
import { el, toast } from './_dom.js';
import { iconForFile, isPreviewable, isImage, formatSize, formatDate } from './_documents-store.js';

function emptyState(icon, title, description, actions = []) {
    const wrap = el('div', { class: 'psy-new-empty' }, [
        el('div', { class: 'psy-new-empty__icon' }, [icon]),
        el('div', { class: 'psy-new-empty__title' }, [title]),
        el('div', { class: 'psy-new-empty__description' }, [description])
    ]);
    if (actions.length) {
        wrap.appendChild(el('div', { class: 'psy-new-empty__actions' }, actions.map((a) =>
            el('button', { class: 'btn btn--' + (a.variant || 'secondary'), onclick: a.onClick }, [a.label]))));
    }
    return wrap;
}

export function renderDocuments() {
    const patient = Store.state.currentPatient;
    const api = Store.getDocsApi();
    const root = el('div', { class: 'psy-new-view psy-docs-view', dataset: { live: 'true' } });

    /** Wskaźnik folderu pacjenta w magazynie; nowy pacjent dostaje go po pierwszym zapisie. */
    async function patientRef() {
        let ref = Store.getPatientRef(patient.id);
        if (!ref) {
            await Store.flushNow();
            ref = Store.getPatientRef(patient.id);
        }
        return ref;
    }

    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Dokumenty']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient
                    ? (patient.imie || '') + ' ' + (patient.nazwisko || '')
                        + (api ? ' · ' + api.pathHint(Store.getPatientRef(patient.id)) : '')
                    : 'Wybierz pacjenta'
            ])
        ])
    ]));

    const body = el('div', { class: 'psy-new-view__body psy-docs' });
    root.appendChild(body);

    if (!patient) {
        body.appendChild(emptyState('🗂', 'Wybierz pacjenta', 'Aby zobaczyć dokumenty, najpierw wybierz pacjenta.', [
            { label: 'Lista pacjentów', variant: 'primary', onClick: () => { window.location.hash = '#/patients'; } }
        ]));
        return root;
    }
    if (!api) {
        body.appendChild(emptyState('☁️', 'Załączniki wymagają podłączonego magazynu',
            'W trybie demo nie ma gdzie przechowywać plików. Połącz aplikację z Dyskiem Google '
            + '(lub folderem na komputerze), aby dodawać skierowania, wyniki badań i skany.', [
            { label: 'Ustawienia magazynu', variant: 'primary', onClick: () => { window.location.hash = '#/settings'; } }
        ]));
        return root;
    }

    const listContainer = el('div', { class: 'psy-docs__list-container' });

    /* ---------------- lista ---------------- */
    async function refreshList() {
        listContainer.innerHTML = '';
        listContainer.appendChild(el('div', { class: 'psy-docs__list-loading' }, ['⏳ Ładowanie listy…']));
        let files;
        try {
            files = await api.list(Store.getPatientRef(patient.id));
        } catch (e) {
            console.error('[documents] list', e);
            listContainer.innerHTML = '';
            listContainer.appendChild(emptyState('⚠', 'Nie udało się odczytać listy plików', String(e && e.message || e), [
                { label: 'Spróbuj ponownie', variant: 'primary', onClick: refreshList }
            ]));
            return;
        }

        listContainer.innerHTML = '';
        listContainer.appendChild(el('h2', { class: 'psy-docs__list-title' },
            ['Załączniki' + (files.length ? ' (' + files.length + ')' : '')]));
        if (!files.length) {
            listContainer.appendChild(emptyState('📂', 'Brak załączników',
                'Przeciągnij pliki na obszar powyżej lub kliknij „Wybierz plik".'));
            return;
        }

        const tbody = el('tbody', {});
        files.slice().sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0))
            .forEach((f) => tbody.appendChild(fileRow(f)));
        listContainer.appendChild(el('table', { class: 'psy-new-table psy-docs__table' }, [
            el('thead', {}, [el('tr', {}, [
                el('th', { style: { width: '40px' } }, ['']),
                el('th', {}, ['Nazwa']),
                el('th', { style: { width: '100px' } }, ['Rozmiar']),
                el('th', { style: { width: '140px' } }, ['Modyfikacja']),
                el('th', { style: { width: '180px', textAlign: 'right' } }, ['Akcje'])
            ])]),
            tbody
        ]));
    }

    async function withBlobUrl(entry, use) {
        let url = null;
        try {
            url = await api.blobUrl(Store.getPatientRef(patient.id), entry);
        } catch (e) {
            console.error('[documents] blob', e);
        }
        if (!url) {
            toast('error', 'Nie udało się odczytać pliku', entry.name);
            return;
        }
        use(url);
    }

    function download(entry) {
        return withBlobUrl(entry, (url) => {
            const a = el('a', { href: url, download: entry.name });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }

    function preview(entry) {
        return withBlobUrl(entry, (url) => {
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
                    el('button', { class: 'btn btn--secondary', onclick: () => download(entry) }, ['⬇ Pobierz']),
                    el('button', { class: 'btn btn--primary', onclick: close }, ['Zamknij'])
                ])
            ]));
            document.body.appendChild(backdrop);
            document.body.classList.add('psy-modal-open');
            document.addEventListener('keydown', onKey);
        });
    }

    function fileRow(entry) {
        const canPreview = isPreviewable(entry.name);
        const iconBtn = (label, title, onClick, danger) => el('button', {
            class: 'btn btn--' + (danger ? 'danger' : 'secondary') + ' btn--sm btn--icon', title, onclick: onClick
        }, [label]);

        return el('tr', { class: 'psy-docs__row' }, [
            el('td', { class: 'psy-docs__row-icon' }, [iconForFile(entry.name)]),
            el('td', { class: 'psy-docs__row-name' }, [
                canPreview
                    ? el('a', {
                        href: '#', class: 'psy-docs__row-name-link', title: 'Otwórz podgląd',
                        onclick: (e) => { e.preventDefault(); preview(entry); }
                    }, [entry.name])
                    : el('span', { title: 'Brak podglądu — pobierz plik, aby go otworzyć' }, [entry.name])
            ]),
            el('td', { class: 'psy-docs__row-size' }, [formatSize(entry.size || 0)]),
            el('td', { class: 'psy-docs__row-date' }, [formatDate(entry.lastModified)]),
            el('td', { class: 'psy-docs__row-actions' }, [
                canPreview ? iconBtn('🔍', 'Podgląd', () => preview(entry)) : null,
                iconBtn('⬇', 'Pobierz', () => download(entry)),
                iconBtn('✏', 'Zmień nazwę', async () => {
                    const newName = window.prompt('Nowa nazwa pliku:', entry.name);
                    if (!newName || !newName.trim() || newName.trim() === entry.name) return;
                    try {
                        await api.rename(Store.getPatientRef(patient.id), entry, newName.trim());
                        toast('success', 'Zmieniono nazwę', entry.name + ' → ' + newName.trim());
                    } catch (e) {
                        toast('error', 'Nie udało się zmienić nazwy', String(e && e.message || e));
                    }
                    refreshList();
                }),
                iconBtn('🗑', 'Usuń', async () => {
                    const ok = await openConfirm({
                        title: 'Usunąć plik?',
                        message: 'Czy na pewno usunąć plik „' + entry.name + '"?',
                        confirmLabel: 'Usuń',
                        variant: 'danger'
                    });
                    if (!ok) return;
                    try {
                        await api.remove(Store.getPatientRef(patient.id), entry);
                        toast('info', 'Usunięto plik', entry.name);
                    } catch (e) {
                        toast('error', 'Nie udało się usunąć pliku', String(e && e.message || e));
                    }
                    refreshList();
                }, true)
            ])
        ]);
    }

    /* ---------------- wgrywanie ---------------- */
    async function upload(files) {
        const ref = await patientRef();
        if (!ref) {
            toast('error', 'Pacjent nie jest jeszcze zapisany', 'Spróbuj ponownie za chwilę.');
            return;
        }
        let done = 0;
        let failed = 0;
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
                await api.upload(ref, file);
                done++;
            } catch (e) {
                console.error('[documents] upload', file.name, e);
                failed++;
            }
        }
        if (done) toast('success', done === 1 ? 'Wgrano plik' : 'Wgrano plików: ' + done, failed ? '(nieudanych: ' + failed + ')' : '');
        else if (failed) toast('error', 'Nie udało się wgrać plików', 'Nieudanych: ' + failed);
        refreshList();
    }

    let dragDepth = 0;
    body.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    body.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; body.classList.add('psy-docs--dragover'); });
    body.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) body.classList.remove('psy-docs--dragover');
    });
    body.addEventListener('drop', (e) => {
        e.preventDefault();
        dragDepth = 0;
        body.classList.remove('psy-docs--dragover');
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) upload(files);
    });

    const fileInput = el('input', {
        type: 'file', multiple: true, style: { display: 'none' },
        onchange: (e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            if (files.length) upload(files);
        }
    });
    body.appendChild(el('div', { class: 'psy-docs__uploader' }, [
        el('div', { class: 'psy-docs__uploader-icon' }, ['📤']),
        el('div', { class: 'psy-docs__uploader-title' }, ['Przeciągnij pliki tutaj lub kliknij, aby wybrać']),
        el('div', { class: 'psy-docs__uploader-hint' }, ['PDF · JPG/PNG · DOCX · XLSX · MP3 · ZIP']),
        el('button', { class: 'btn btn--secondary btn--sm', onclick: () => fileInput.click() }, ['📂 Wybierz plik']),
        fileInput
    ]));
    body.appendChild(listContainer);

    refreshList();
    return root;
}
