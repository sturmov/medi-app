// ============================================================================
// _form-toolbar.js — generyczny widget "pasek narzędzi + treść".
//
// Tryby (PR-J16 2026-05-16):
//
//   • mode: 'tab' (default, back-compat z PR-J14):
//     Prawa kolumna = JEDNO aktywne pole na raz (tab-content style).
//     Klik pola w pasku → wymiana całej zawartości prawej kolumny.
//
//   • mode: 'journal' (nowy wzorzec — klientka 15/05/2026):
//     Prawa kolumna = AKUMULUJĄCY DZIENNIK akapitów wypełnionych pól, jak
//     notatka medyczna. Klik pola w pasku → akapit „wsuwa się" w odpowiednim
//     miejscu (kolejność = schemat). Klik X przy akapicie → ukrywa go
//     (wartość zostaje w Store, można przywrócić klikiem z paska).
//
//     Stan widoczności per pole (3 niezależne wymiary):
//       1. `hiddenSet` (persisted via `onHiddenFieldsChange`) — pola które user
//          jawnie ukrył klikając X. Override dla wypełnionych. Persistowane
//          jako `visit.data._hiddenFields` w Store.
//       2. `visibleSet` (in-memory only, nie persistowane) — pola które user
//          jawnie wybrał z paska (puste, ale chce je widzieć). Po reload
//          przeglądarki znikają (klientka 16/05: „na blur wszystko zostaje,
//          dopiero przy odświeżeniu strony puste sekcje znikają").
//       3. wartość w `_raw` — wypełnione domyślnie widoczne, puste domyślnie
//          ukryte. Logika: `!hidden && (visible || !empty)`.
//
//     Inline edit (klientka Q2: „od razu inline edit"):
//       - Akapit w read-mode → klik body → toggle do edit-mode + focus.
//       - W edit-mode: standardowy `fieldRenderer(field, values)` (input).
//       - Klik innego akapitu lub klik X → tamten do read, ten do edit.
//       - Tylko JEDEN akapit może być w edit-mode na raz.
//
// API:
//   createFormToolbar({
//     groups: [{ id, title, fields: [field, …] }],
//     values: {},                                       // flat-map wartości (`_raw`)
//     fieldRenderer:        (field, values) → DOMNode, // wymagane (edit-mode input)
//     fieldNotesValue:      (field, values) → string,  // opcjonalne (notes pre-fill)
//     fieldIsFilled:        (field, values) → boolean, // opcjonalne (heurystyka)
//     showFieldNotes:       (field) → boolean,         // opcjonalne
//     fieldPreview:         (field, values) → string,  // opcjonalne (preview pod labelem)
//     onSelect:             (fieldUid) → void,         // opcjonalne
//     activeFieldUid:       string,                    // opcjonalne (tab-mode init)
//
//     // PR-J16 dla mode='journal':
//     mode:                 'tab' | 'journal',         // default 'tab'
//     hiddenFields:         Array<string>,             // initial persisted hidden
//     onHiddenFieldsChange: (newArray) → void,         // save callback
//     readRenderer:         (field, values) → DOMNode, // opcjonalny — fallback do edit
//   }) → HTMLElement
//
// Public API:
//   root.refreshDots(newValues?, newHiddenFields?)  — refresh paska + dziennika
//   root.setActive(uid)                              — programowa aktywacja
//   root.getHiddenFields()                           — bieżący snapshot Array
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

/**
 * Domyślna heurystyka „pole jest wypełnione" — gdy wywołujący nie poda
 * własnej `fieldIsFilled`. Sprawdza wartość pod kluczem `groupId.fieldId`.
 */
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

/** Buduje unikalny identyfikator pola w obrębie całego paska (grupa + pole). */
function uidOf(groupId, fieldId) {
    return (groupId || '_') + '::' + fieldId;
}

/** Czy pole jest „pomijalne" w dzienniku (link-view = nawigacja, nie wartość). */
function isJournalSkippable(field) {
    if (!field || !field.input) return false;
    const t = field.input.type;
    return t === 'link-view';
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
        // PR-J16 — tryb journal
        mode = 'tab',
        hiddenFields = [],
        onHiddenFieldsChange = null,
        readRenderer = null
    } = opts || {};

    // PR-J14d: `values` MUTOWALNA referencja — `refreshDots(newValues)` ją aktualizuje
    let values = initialValues;

    // PR-J16 stan widoczności (mode='journal' only)
    const hiddenSet = new Set(hiddenFields || []);    // persisted (X-em)
    const visibleSet = new Set();                     // in-memory only (klik z paska)
    let activeEditUid = null;                         // uid akapitu w edit-mode (max 1)

    // Płaska lista pól (do wyszukiwania, do refresh-dot, do dziennika).
    // Pomija pola typu 'header' (czysto wizualne separatory w schemacie).
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
    // Tab-mode state (legacy, używane gdy mode='tab')
    // ----------------------------------------------------------------------
    let activeUid = opts.activeFieldUid || flat[0]._uid;

    // Mapa _uid → element pozycji w pasku (do refresh-dot/active)
    const itemEls = new Map();

    // ----------------------------------------------------------------------
    // Lewa kolumna — pasek narzędzi (BEZ ZMIAN po PR-J16, niezależnie od mode)
    // ----------------------------------------------------------------------
    const nav = el('div', { class: 'psy-form-toolbar__nav', role: 'tablist' });
    for (const g of groups) {
        const visibleFieldsInGroup = (g.fields || []).filter(
            (f) => !(f.input && f.input.type === 'header')
        );
        if (!visibleFieldsInGroup.length) continue;

        nav.appendChild(el('div', { class: 'psy-form-toolbar__group-title' }, [g.title || '']));

        const ul = el('ul', { class: 'psy-form-toolbar__group' });
        for (const f of visibleFieldsInGroup) {
            const uid = uidOf(g.id, f.id);
            const fieldWithGroup = { ...f, _groupId: g.id, _groupTitle: g.title };
            const filled = !!fieldIsFilled(fieldWithGroup, values);
            const isActive = (mode === 'tab') && (uid === activeUid);
            const previewText = fieldPreview ? (fieldPreview(fieldWithGroup, values) || '') : '';

            const labelLine = el('div', { class: 'psy-form-toolbar__field-line1' }, [
                el('span', { class: 'psy-form-toolbar__field-dot', 'aria-hidden': 'true' }),
                el('span', { class: 'psy-form-toolbar__field-label' }, [
                    f.label + (f.required ? ' *' : '')
                ])
            ]);
            const previewEl = el('div', {
                class: 'psy-form-toolbar__field-preview',
                style: { display: previewText ? '' : 'none' }
            }, [previewText]);

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

    // ----------------------------------------------------------------------
    // Prawa kolumna — zależna od trybu
    // ----------------------------------------------------------------------
    const content = el('div', { class: 'psy-form-toolbar__content' });

    /* =====================================================================
       TAB-MODE (legacy, back-compat)
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
       JOURNAL-MODE (PR-J16)
       ===================================================================== */

    /** Czy pole powinno być widoczne w dzienniku (uwzględnia 3 wymiary). */
    function _isVisibleInJournal(field) {
        if (isJournalSkippable(field)) return false;
        const uid = field._uid;
        if (hiddenSet.has(uid)) return false;
        if (visibleSet.has(uid)) return true;
        return !!fieldIsFilled(field, values);
    }

    /** Renderuje jeden akapit w danym trybie ('read' / 'edit'). */
    function _renderEntry(field, entryMode) {
        const uid = field._uid;
        const article = el('article', {
            class: 'psy-form-toolbar__entry'
                + (entryMode === 'edit' ? ' psy-form-toolbar__entry--edit' : ' psy-form-toolbar__entry--read'),
            dataset: { fieldUid: uid }
        });

        // Header: label + X (close)
        const header = el('header', { class: 'psy-form-toolbar__entry-header' }, [
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

        // Body — read lub edit
        let body;
        if (entryMode === 'edit') {
            const inputNode = fieldRenderer ? fieldRenderer(field, values) : null;
            body = el('div', {
                class: 'psy-form-toolbar__entry-body psy-form-toolbar__entry-body--edit'
            }, [inputNode || el('div', { class: 'psy-new-hint' }, ['(brak renderera)'])]);

            // Auto-focus pierwszego inputable w edit-mode po wstawieniu w DOM
            setTimeout(() => {
                const focusable = body.querySelector('input:not([type="hidden"]), textarea, select');
                if (focusable) {
                    try { focusable.focus(); } catch (_) {}
                    // Auto-grow textarea jeśli ma klasę
                    if (focusable.classList && focusable.classList.contains('psy-vf__textarea--autogrow')) {
                        focusable.style.height = 'auto';
                        focusable.style.height = (focusable.scrollHeight + 2) + 'px';
                    }
                }
            }, 0);

            // Notes (uwagi) — pod inputem
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
                // Fallback — pokaż wartość raw jako tekst
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
                class: 'psy-form-toolbar__entry-body psy-form-toolbar__entry-body--read',
                title: 'Kliknij, aby edytować',
                dataset: { action: 'edit' }
            }, [readNode]);

            // Notes — read-only paragraph (jeśli niepusty)
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

    /** Pełen re-render dziennika (prawa kolumna). */
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
                const entryMode = (f._uid === activeEditUid) ? 'edit' : 'read';
                journal.appendChild(_renderEntry(f, entryMode));
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

    /** Toggle pojedynczego akapitu między read / edit bez pełnego re-renderu. */
    function _toggleEntryEdit(uid) {
        // Jeśli inny akapit jest w edit-mode → przełącz tamten do read
        if (activeEditUid && activeEditUid !== uid) {
            const prevField = flat.find((f) => f._uid === activeEditUid);
            const prevArticle = content.querySelector(`article[data-field-uid="${activeEditUid}"]`);
            if (prevField && prevArticle && prevArticle.parentNode) {
                const newArticle = _renderEntry(prevField, 'read');
                prevArticle.parentNode.replaceChild(newArticle, prevArticle);
            }
        }
        // Przełącz aktualny akapit do edit
        const field = flat.find((f) => f._uid === uid);
        const article = content.querySelector(`article[data-field-uid="${uid}"]`);
        if (!field || !article || !article.parentNode) {
            // Akapit nie istnieje (np. po unhide trzeba pełny re-render)
            activeEditUid = uid;
            _renderJournal();
            return;
        }
        activeEditUid = uid;
        const newArticle = _renderEntry(field, 'edit');
        article.parentNode.replaceChild(newArticle, article);
    }

    /** Klik X przy akapicie — ukryj pole. */
    function _hideEntry(uid) {
        hiddenSet.add(uid);
        visibleSet.delete(uid);
        if (activeEditUid === uid) activeEditUid = null;
        if (typeof onHiddenFieldsChange === 'function') {
            onHiddenFieldsChange(Array.from(hiddenSet));
        }
        _renderJournal();
    }

    /** Klik pola w pasku (lewa kolumna) — dodaj/aktywuj akapit w dzienniku. */
    function _onNavClickJournal(uid) {
        const field = flat.find((f) => f._uid === uid);
        if (!field) return;

        // Jeśli to link-view — nawigacja od razu, nie dodajemy do dziennika
        if (isJournalSkippable(field)) {
            if (field.input && field.input.ref) {
                window.location.hash = field.input.ref;
            }
            return;
        }

        let changed = false;
        if (hiddenSet.has(uid)) {
            // Reset hidden flag → wartość niepusta wraca jako default visible
            hiddenSet.delete(uid);
            if (typeof onHiddenFieldsChange === 'function') {
                onHiddenFieldsChange(Array.from(hiddenSet));
            }
            changed = true;
        }
        if (!fieldIsFilled(field, values) && !visibleSet.has(uid)) {
            // Puste pole — wymuś widoczne (in-memory)
            visibleSet.add(uid);
            changed = true;
        }

        if (changed) {
            activeEditUid = uid;
            _renderJournal();
        } else {
            // Już widoczne — tylko toggle edit-mode + scroll
            _toggleEntryEdit(uid);
        }

        // Scroll do akapitu
        setTimeout(() => {
            const article = content.querySelector(`article[data-field-uid="${uid}"]`);
            if (article) {
                try { article.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
                catch (_) {}
            }
        }, 0);

        if (typeof onSelect === 'function') onSelect(uid);
    }

    // Event delegation w prawej kolumnie (klik X, klik body-read)
    if (mode === 'journal') {
        content.addEventListener('click', (ev) => {
            const target = ev.target;
            if (!target) return;
            const closeBtn = target.closest('[data-action="close"]');
            if (closeBtn) {
                const article = closeBtn.closest('article[data-field-uid]');
                if (article) {
                    ev.stopPropagation();
                    _hideEntry(article.dataset.fieldUid);
                }
                return;
            }
            // Klik na read-body → toggle do edit
            const readBody = target.closest('.psy-form-toolbar__entry-body--read');
            if (readBody) {
                const article = readBody.closest('article[data-field-uid]');
                if (article) {
                    _toggleEntryEdit(article.dataset.fieldUid);
                }
            }
        });
    }

    /** Wspólny dispatcher klika pola w pasku — różny w zależności od mode. */
    function _onNavClick(uid) {
        if (mode === 'journal') _onNavClickJournal(uid);
        else _setActiveTab(uid);
    }

    /* =====================================================================
       Public API
       ===================================================================== */

    // Refresh kropek na pasku + (w journal-mode) refresh dziennika.
    // PR-J14d: gdy `newValues` jest podany — aktualizuj wewnętrzną referencję.
    // PR-J16: w trybie 'journal' robimy też pełen re-render dziennika
    //         (bo nowo wypełnione pola mogą się pojawić jako visible-default).
    //         WYJĄTEK: jeśli `activeEditUid` istnieje, pomijamy re-render
    //         tego akapitu — żeby nie zabić focusu/kursora w aktywnym input.
    root.refreshDots = function (newValues, newHiddenFields) {
        if (newValues) values = newValues;
        if (newHiddenFields) {
            hiddenSet.clear();
            for (const uid of newHiddenFields) hiddenSet.add(uid);
        }

        // Refresh kropki + preview na pasku
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

        // W trybie journal NIE robimy pełnego re-renderu po autozapisie —
        // wartość już jest w input.value (user pisze). Re-render tylko gdy
        // explicit change (klik X / klik pola w pasku). Tylko refresh notes
        // i ewentualnie odświeżenie read-mode (gdy ktoś z zewnątrz zmienił).
    };

    root.setActive = (uid) => _onNavClick(uid);
    root.getHiddenFields = () => Array.from(hiddenSet);

    /* =====================================================================
       Initial assembly
       ===================================================================== */
    root.appendChild(nav);
    root.appendChild(content);

    if (mode === 'journal') {
        _renderJournal();
    } else {
        _renderContentTab(activeUid);
    }

    return root;
}
