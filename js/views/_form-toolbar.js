// ============================================================================
// _form-toolbar.js — generyczny widget "pasek narzędzi + treść".
//
// Tryby:
//
//   • mode: 'tab' (default, back-compat z PR-J14):
//     Prawa kolumna = JEDNO aktywne pole na raz (tab-content style).
//
//   • mode: 'journal' (PR-J16, klientka 15/05/2026):
//     Prawa kolumna = AKUMULUJĄCY DZIENNIK akapitów jak notatka medyczna.
//     Klik pola w pasku → akapit „wsuwa się" w odpowiednim miejscu.
//     Klik X → ukrywa akapit (wartość zostaje). Klik header akapitu → toggle
//     edit/read tego konkretnego akapitu (każdy niezależnie).
//
// PR-J16a (2026-05-16) — poprawki klientki po pierwszym teście na prod:
//   1. Fix scroll: container ma stałą wysokość, kolumny scrollują niezależnie
//      (`max-height: 100%` zamiast `calc(100vh - 220px)`).
//   2. Sekcje w pasku po lewej są COLLAPSIBLE (chevron + klik nagłówka =
//      toggle). Domyślnie wszystkie otwarte. Stan in-memory (nie persistowane).
//   3. Opcjonalny callback `groupPreview(group, values) → string` — small text
//      pod nagłówkiem sekcji (gdy zwinięta). Klientka: tylko `visitData` na
//      razie pokazuje początek pola „Powód zgłoszenia".
//   4. Edit/Read toggle PER AKAPIT (zamiast „tylko 1 edit-mode na raz"):
//      `editingSet = Set<uid>` — wiele akapitów może być rozwiniętych. Klik
//      całego nagłówka akapitu (label + miejsce, poza X) → toggle.
//
// Stan widoczności pola w mode='journal' (3 niezależne wymiary):
//   • `hiddenSet` (persisted) — user kliknął X (override dla wypełnionych)
//   • `visibleSet` (in-memory) — user kliknął puste pole z paska
//   • wartość w `_raw` — wypełnione = visible default, puste = hidden default
//   Logika: `!hidden && (visible || !empty)`.
//
// API:
//   createFormToolbar({
//     groups, values,
//     fieldRenderer, fieldNotesValue, fieldIsFilled, showFieldNotes,
//     fieldPreview, onSelect, activeFieldUid,
//     mode, hiddenFields, onHiddenFieldsChange, readRenderer,
//     groupPreview   // PR-J16a: (group, values) → string | null
//   }) → HTMLElement
//
// Public API:
//   root.refreshDots(newValues?, newHiddenFields?)
//   root.setActive(uid)
//   root.getHiddenFields()
// ============================================================================

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'style' && typeof v === 'object') {
            for (const [sk, sv] of Object.entries(v)) node.style[sk] = sv;
        }
        else if (k === 'dataset' && typeof v === 'object') {
            for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
        } else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
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
        } else node.appendChild(c);
    }
    return node;
}

function isFilledDefault(field, values) {
    if (!values) return false;
    const key = (field._groupId ? field._groupId + '.' : '') + field.id;
    const v = values[key];
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return !!v;
}

function uidOf(groupId, fieldId) {
    return (groupId || '_') + '::' + fieldId;
}

function isJournalSkippable(field) {
    if (!field || !field.input) return false;
    return field.input.type === 'link-view';
}

export function createFormToolbar(opts) {
    const {
        groups = [],
        values: initialValues = {},
        fieldRenderer,
        fieldNotesValue = () => '',
        fieldIsFilled = isFilledDefault,
        showFieldNotes = (f) => f && f.notes !== false,
        fieldPreview = null,
        onSelect = null,
        renderEmpty = null,
        mode = 'tab',
        hiddenFields = [],
        onHiddenFieldsChange = null,
        readRenderer = null,
        // PR-J16a — preview tekstu pod nagłówkiem sekcji w pasku (gdy zwinięta)
        groupPreview = null
    } = opts || {};

    let values = initialValues;

    // PR-J16 stan widoczności (mode='journal')
    const hiddenSet = new Set(hiddenFields || []);
    const visibleSet = new Set();
    // PR-J16a: zamiast `activeEditUid` (max 1) — Set per akapit (wiele edit naraz)
    const editingSet = new Set();
    // PR-J16a: sekcje zwinięte (in-memory only, nie persistowane)
    const collapsedSections = new Set();

    // Płaska lista pól (pomija header'y schematu — czysto wizualne).
    const flat = [];
    for (const g of groups) {
        for (const f of (g.fields || [])) {
            if (f.input && f.input.type === 'header') continue;
            flat.push({
                ...f,
                _groupId: g.id,
                _groupTitle: g.title,
                _uid: uidOf(g.id, f.id)
            });
        }
    }

    const root = el('div', {
        class: 'psy-form-toolbar' + (mode === 'journal' ? ' psy-form-toolbar--journal' : ''),
        dataset: { live: 'true' }
    });

    if (!flat.length) {
        root.appendChild(el('div', { class: 'psy-new-hint' }, ['Brak pól do wyświetlenia.']));
        root.refreshDots = () => {};
        root.setActive = () => {};
        root.getHiddenFields = () => [];
        return root;
    }

    // ----------------------------------------------------------------------
    // Tab-mode state (legacy)
    // ----------------------------------------------------------------------
    let activeUid = opts.activeFieldUid || flat[0]._uid;

    // Mapa _uid → element pozycji w pasku (do refresh-dot/active)
    const itemEls = new Map();

    // ----------------------------------------------------------------------
    // Lewa kolumna — pasek narzędzi (PR-J16a: collapsible sekcje)
    // ----------------------------------------------------------------------
    const nav = el('div', { class: 'psy-form-toolbar__nav', role: 'tablist' });

    function _renderNav() {
        nav.innerHTML = '';
        itemEls.clear();

        for (const g of groups) {
            const visibleFieldsInGroup = (g.fields || []).filter(
                (f) => !(f.input && f.input.type === 'header')
            );
            if (!visibleFieldsInGroup.length) continue;

            const isCollapsed = collapsedSections.has(g.id);
            const previewText = (typeof groupPreview === 'function' && isCollapsed)
                ? (groupPreview(g, values) || '')
                : '';

            // Nagłówek sekcji — klikalny (toggle collapse)
            const title = el('div', {
                class: 'psy-form-toolbar__group-title'
                    + (isCollapsed ? ' psy-form-toolbar__group-title--collapsed' : ''),
                role: 'button',
                tabindex: '0',
                'aria-expanded': isCollapsed ? 'false' : 'true',
                onclick: () => _toggleSection(g.id),
                onkeydown: (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        _toggleSection(g.id);
                    }
                }
            }, [
                el('span', {
                    class: 'psy-form-toolbar__group-chevron',
                    'aria-hidden': 'true'
                }, [isCollapsed ? '▸' : '▾']),
                el('span', { class: 'psy-form-toolbar__group-name' }, [g.title || ''])
            ]);

            // Preview pod nagłówkiem (tylko gdy zwinięta i jest callback)
            if (previewText) {
                title.appendChild(el('div', {
                    class: 'psy-form-toolbar__group-preview'
                }, [previewText]));
            }
            nav.appendChild(title);

            if (isCollapsed) continue;   // nie renderujemy listy pól

            const ul = el('ul', { class: 'psy-form-toolbar__group' });
            for (const f of visibleFieldsInGroup) {
                const uid = uidOf(g.id, f.id);
                const fieldWithGroup = { ...f, _groupId: g.id, _groupTitle: g.title };
                const filled = !!fieldIsFilled(fieldWithGroup, values);
                const isActive = (mode === 'tab') && (uid === activeUid);
                const previewText2 = fieldPreview
                    ? (fieldPreview(fieldWithGroup, values) || '')
                    : '';

                const labelLine = el('div', { class: 'psy-form-toolbar__field-line1' }, [
                    el('span', { class: 'psy-form-toolbar__field-dot', 'aria-hidden': 'true' }),
                    el('span', { class: 'psy-form-toolbar__field-label' }, [
                        f.label + (f.required ? ' *' : '')
                    ])
                ]);
                const previewEl = el('div', {
                    class: 'psy-form-toolbar__field-preview',
                    style: { display: previewText2 ? '' : 'none' }
                }, [previewText2]);

                const item = el('li', {
                    class: 'psy-form-toolbar__field'
                        + (isActive ? ' psy-form-toolbar__field--active' : '')
                        + (filled ? ' psy-form-toolbar__field--filled' : ''),
                    role: 'tab',
                    tabindex: '0',
                    'aria-selected': isActive ? 'true' : 'false',
                    dataset: { fieldUid: uid },
                    onclick: () => _onNavClick(uid),
                    onkeydown: (ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            _onNavClick(uid);
                        }
                    }
                }, [labelLine, previewEl]);
                ul.appendChild(item);
                itemEls.set(uid, item);
            }
            nav.appendChild(ul);
        }
    }

    function _toggleSection(groupId) {
        if (collapsedSections.has(groupId)) collapsedSections.delete(groupId);
        else collapsedSections.add(groupId);
        _renderNav();
    }

    // Initial nav render
    _renderNav();

    // ----------------------------------------------------------------------
    // Prawa kolumna
    // ----------------------------------------------------------------------
    const content = el('div', { class: 'psy-form-toolbar__content' });

    /* =====================================================================
       TAB-MODE (legacy)
       ===================================================================== */
    function _renderContentTab(uid) {
        content.innerHTML = '';
        const field = flat.find((f) => f._uid === uid);
        if (!field) {
            content.appendChild(el('div', { class: 'psy-new-hint' }, [
                'Wybierz pole z paska po lewej.'
            ]));
            return;
        }

        const panel = el('div', {
            class: 'psy-form-toolbar__panel',
            dataset: { fieldUid: field._uid }
        });

        panel.appendChild(el('div', { class: 'psy-form-toolbar__panel-breadcrumb' }, [
            field._groupTitle
                ? el('span', { class: 'psy-form-toolbar__panel-group' }, [field._groupTitle])
                : null,
            field._groupTitle
                ? el('span', { class: 'psy-form-toolbar__panel-sep' }, [' › '])
                : null,
            el('span', { class: 'psy-form-toolbar__panel-title' }, [
                field.label + (field.required ? ' *' : '')
            ])
        ]));

        const inputNode = fieldRenderer ? fieldRenderer(field, values) : null;
        if (inputNode) {
            panel.appendChild(el('div', { class: 'psy-form-toolbar__panel-input' }, [inputNode]));
        } else if (renderEmpty) {
            const empty = renderEmpty(field);
            if (empty) panel.appendChild(empty);
        }

        if (showFieldNotes(field)) {
            const noteName = (field._groupId ? field._groupId + '.' : '') + field.id + '.__notes';
            const noteVal = fieldNotesValue(field, values) || '';
            const ta = el('textarea', {
                class: 'psy-form-toolbar__notes',
                name: noteName,
                rows: 2,
                placeholder: 'uwagi do tego pola…'
            });
            ta.value = noteVal;
            panel.appendChild(el('div', { class: 'psy-form-toolbar__panel-notes' }, [
                el('label', { class: 'psy-form-toolbar__notes-label' }, ['Uwagi:']),
                ta
            ]));
        }

        content.appendChild(panel);
    }

    function _setActiveTab(uid) {
        if (uid === activeUid) return;
        const prev = itemEls.get(activeUid);
        if (prev) {
            prev.classList.remove('psy-form-toolbar__field--active');
            prev.setAttribute('aria-selected', 'false');
        }
        const next = itemEls.get(uid);
        if (next) {
            next.classList.add('psy-form-toolbar__field--active');
            next.setAttribute('aria-selected', 'true');
            try { next.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
            catch (_) {}
        }
        activeUid = uid;
        _renderContentTab(uid);
        if (typeof onSelect === 'function') onSelect(uid);
    }

    /* =====================================================================
       JOURNAL-MODE (PR-J16 + PR-J16a)
       ===================================================================== */

    function _isVisibleInJournal(field) {
        if (isJournalSkippable(field)) return false;
        const uid = field._uid;
        if (hiddenSet.has(uid)) return false;
        if (visibleSet.has(uid)) return true;
        return !!fieldIsFilled(field, values);
    }

    function _renderEntry(field) {
        const uid = field._uid;
        // PR-J16a: każdy akapit ma własny stan edit, niezależny
        const entryMode = editingSet.has(uid) ? 'edit' : 'read';
        const article = el('article', {
            class: 'psy-form-toolbar__entry'
                + (entryMode === 'edit'
                    ? ' psy-form-toolbar__entry--edit'
                    : ' psy-form-toolbar__entry--read'),
            dataset: { fieldUid: uid }
        });

        // Header: cały pasek klikalny (PR-J16a) — toggle edit/read. X osobno.
        const header = el('header', {
            class: 'psy-form-toolbar__entry-header',
            role: 'button',
            tabindex: '0',
            title: entryMode === 'edit' ? 'Kliknij, aby schować' : 'Kliknij, aby edytować',
            dataset: { action: 'toggle' }
        }, [
            el('span', {
                class: 'psy-form-toolbar__entry-chevron',
                'aria-hidden': 'true'
            }, [entryMode === 'edit' ? '▾' : '▸']),
            el('span', { class: 'psy-form-toolbar__entry-label' }, [
                field.label + (field.required ? ' *' : '')
            ]),
            el('button', {
                type: 'button',
                class: 'psy-form-toolbar__entry-close',
                title: 'Ukryj to pole (wartość zostaje w danych)',
                'aria-label': 'Ukryj pole',
                dataset: { action: 'close' }
            }, ['✕'])
        ]);
        article.appendChild(header);

        let body;
        if (entryMode === 'edit') {
            const inputNode = fieldRenderer ? fieldRenderer(field, values) : null;
            body = el('div', {
                class: 'psy-form-toolbar__entry-body psy-form-toolbar__entry-body--edit'
            }, [inputNode || el('div', { class: 'psy-new-hint' }, ['(brak renderera)'])]);

            // Auto-focus + auto-grow textarea
            setTimeout(() => {
                const focusable = body.querySelector('input:not([type="hidden"]), textarea, select');
                if (focusable) {
                    try { focusable.focus(); } catch (_) {}
                    if (focusable.classList && focusable.classList.contains('psy-vf__textarea--autogrow')) {
                        focusable.style.height = 'auto';
                        focusable.style.height = (focusable.scrollHeight + 2) + 'px';
                    }
                }
            }, 0);

            if (showFieldNotes(field)) {
                const noteName = (field._groupId ? field._groupId + '.' : '') + field.id + '.__notes';
                const noteVal = fieldNotesValue(field, values) || '';
                const ta = el('textarea', {
                    class: 'psy-form-toolbar__notes',
                    name: noteName,
                    rows: 2,
                    placeholder: 'uwagi…'
                });
                ta.value = noteVal;
                body.appendChild(el('div', { class: 'psy-form-toolbar__entry-notes' }, [
                    el('label', { class: 'psy-form-toolbar__notes-label' }, ['Uwagi:']),
                    ta
                ]));
            }
        } else {
            // Read-mode
            let readNode = null;
            if (typeof readRenderer === 'function') {
                readNode = readRenderer(field, values);
            }
            if (!readNode) {
                const key = field._groupId + '.' + field.id;
                const v = values[key];
                let txt = '';
                if (v == null) txt = '';
                else if (Array.isArray(v)) txt = v.join(', ');
                else if (typeof v === 'boolean') txt = v ? 'tak' : 'nie';
                else txt = String(v);
                readNode = el('div', { class: 'psy-form-toolbar__entry-text' }, [
                    txt || el('span', { class: 'psy-form-toolbar__entry-empty' }, ['(puste)'])
                ]);
            }
            body = el('div', {
                class: 'psy-form-toolbar__entry-body psy-form-toolbar__entry-body--read'
            }, [readNode]);

            if (showFieldNotes(field)) {
                const noteVal = fieldNotesValue(field, values) || '';
                if (noteVal.trim()) {
                    body.appendChild(el('div', { class: 'psy-form-toolbar__entry-notes-read' }, [
                        el('span', { class: 'psy-form-toolbar__notes-label' }, ['Uwagi:']),
                        ' ',
                        noteVal
                    ]));
                }
            }
        }
        article.appendChild(body);

        return article;
    }

    function _renderJournal() {
        content.innerHTML = '';
        const journal = el('div', { class: 'psy-form-toolbar__journal' });

        let anyVisible = false;
        for (const g of groups) {
            const visibleFieldsInGroup = (g.fields || [])
                .filter((f) => !(f.input && f.input.type === 'header'))
                .map((f) => ({ ...f, _groupId: g.id, _groupTitle: g.title, _uid: uidOf(g.id, f.id) }))
                .filter((f) => _isVisibleInJournal(f));
            if (!visibleFieldsInGroup.length) continue;

            journal.appendChild(el('h3', {
                class: 'psy-form-toolbar__journal-section-title'
            }, [g.title || '']));

            for (const f of visibleFieldsInGroup) {
                journal.appendChild(_renderEntry(f));
                anyVisible = true;
            }
        }

        if (!anyVisible) {
            journal.appendChild(el('div', { class: 'psy-form-toolbar__journal-empty' }, [
                el('div', { class: 'psy-form-toolbar__journal-empty-icon' }, ['📝']),
                el('div', { class: 'psy-form-toolbar__journal-empty-title' }, [
                    'Notatka pusta'
                ]),
                el('div', { class: 'psy-form-toolbar__journal-empty-hint' }, [
                    'Wybierz pole z paska po lewej, aby dodać pierwszą sekcję.'
                ])
            ]));
        }

        content.appendChild(journal);
    }

    /** PR-J16a: toggle pojedynczego akapitu — bez ruszania innych. */
    function _toggleEntry(uid) {
        if (editingSet.has(uid)) editingSet.delete(uid);
        else editingSet.add(uid);

        const article = content.querySelector(`article[data-field-uid="${uid}"]`);
        if (!article || !article.parentNode) {
            _renderJournal();
            return;
        }
        const field = flat.find((f) => f._uid === uid);
        if (!field) return;
        const newArticle = _renderEntry(field);
        article.parentNode.replaceChild(newArticle, article);
    }

    function _hideEntry(uid) {
        hiddenSet.add(uid);
        visibleSet.delete(uid);
        editingSet.delete(uid);
        if (typeof onHiddenFieldsChange === 'function') {
            onHiddenFieldsChange(Array.from(hiddenSet));
        }
        _renderJournal();
    }

    /** Klik pola w pasku w trybie journal — dodaje akapit + otwiera edit. */
    function _onNavClickJournal(uid) {
        const field = flat.find((f) => f._uid === uid);
        if (!field) return;

        if (isJournalSkippable(field)) {
            if (field.input && field.input.ref) {
                window.location.hash = field.input.ref;
            }
            return;
        }

        let needsRender = false;
        if (hiddenSet.has(uid)) {
            hiddenSet.delete(uid);
            if (typeof onHiddenFieldsChange === 'function') {
                onHiddenFieldsChange(Array.from(hiddenSet));
            }
            needsRender = true;
        }
        if (!fieldIsFilled(field, values) && !visibleSet.has(uid)) {
            visibleSet.add(uid);
            needsRender = true;
        }

        // Otwórz akapit w edit-mode (PR-J16a — każdy niezależnie)
        editingSet.add(uid);

        if (needsRender) {
            _renderJournal();
        } else {
            // Akapit już widoczny — tylko toggle ten konkretny do edit
            _toggleEntryToEdit(uid);
        }

        setTimeout(() => {
            const article = content.querySelector(`article[data-field-uid="${uid}"]`);
            if (article) {
                try { article.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
                catch (_) {}
            }
        }, 0);

        if (typeof onSelect === 'function') onSelect(uid);
    }

    /** Wymuszone przejście do edit (nie toggle) — używane przy kliku z paska. */
    function _toggleEntryToEdit(uid) {
        if (editingSet.has(uid)) {
            // już w edit — tylko re-render żeby focus zapełnił
            const article = content.querySelector(`article[data-field-uid="${uid}"]`);
            if (article && article.parentNode) {
                const field = flat.find((f) => f._uid === uid);
                if (field) {
                    article.parentNode.replaceChild(_renderEntry(field), article);
                }
            }
            return;
        }
        editingSet.add(uid);
        const article = content.querySelector(`article[data-field-uid="${uid}"]`);
        if (!article || !article.parentNode) {
            _renderJournal();
            return;
        }
        const field = flat.find((f) => f._uid === uid);
        if (!field) return;
        article.parentNode.replaceChild(_renderEntry(field), article);
    }

    // Event delegation w prawej kolumnie (klik X, klik header akapitu)
    if (mode === 'journal') {
        content.addEventListener('click', (ev) => {
            const target = ev.target;
            if (!target) return;
            // Klik X — ukryj akapit
            const closeBtn = target.closest('[data-action="close"]');
            if (closeBtn) {
                ev.stopPropagation();
                const article = closeBtn.closest('article[data-field-uid]');
                if (article) _hideEntry(article.dataset.fieldUid);
                return;
            }
            // Klik header akapitu (poza X) — toggle edit/read
            const header = target.closest('.psy-form-toolbar__entry-header');
            if (header) {
                const article = header.closest('article[data-field-uid]');
                if (article) _toggleEntry(article.dataset.fieldUid);
            }
        });
        // Klawiatura: Enter/Space na headerze
        content.addEventListener('keydown', (ev) => {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            const header = ev.target.closest('.psy-form-toolbar__entry-header');
            if (header && !ev.target.closest('[data-action="close"]')) {
                ev.preventDefault();
                const article = header.closest('article[data-field-uid]');
                if (article) _toggleEntry(article.dataset.fieldUid);
            }
        });
    }

    function _onNavClick(uid) {
        if (mode === 'journal') _onNavClickJournal(uid);
        else _setActiveTab(uid);
    }

    /* =====================================================================
       Public API
       ===================================================================== */
    root.refreshDots = function (newValues, newHiddenFields) {
        if (newValues) values = newValues;
        if (newHiddenFields) {
            hiddenSet.clear();
            for (const uid of newHiddenFields) hiddenSet.add(uid);
        }

        // Refresh kropki + preview + group-preview (gdy sekcja zwinięta)
        const vals = values;
        for (const f of flat) {
            const item = itemEls.get(f._uid);
            if (!item) continue;
            const filled = !!fieldIsFilled(f, vals);
            item.classList.toggle('psy-form-toolbar__field--filled', filled);
            if (fieldPreview) {
                const prevEl = item.querySelector('.psy-form-toolbar__field-preview');
                if (prevEl) {
                    const txt = fieldPreview(f, vals) || '';
                    prevEl.textContent = txt;
                    prevEl.style.display = txt ? '' : 'none';
                }
            }
        }
        // PR-J16a: refresh group-preview tekst w zwiniętych sekcjach
        if (typeof groupPreview === 'function') {
            for (const g of groups) {
                if (!collapsedSections.has(g.id)) continue;
                const titleEl = nav.querySelector(
                    `.psy-form-toolbar__group-title[role="button"]`
                );
                // Niestety brak data-section-id na nagłówku — re-renderuję nav.
                // (Mała operacja, nie wpływa na focus bo nav nie ma focus.)
                _renderNav();
                break;
            }
        }
    };

    root.setActive = (uid) => _onNavClick(uid);
    root.getHiddenFields = () => Array.from(hiddenSet);

    root.appendChild(nav);
    root.appendChild(content);

    if (mode === 'journal') {
        _renderJournal();
    } else {
        _renderContentTab(activeUid);
    }

    return root;
}
