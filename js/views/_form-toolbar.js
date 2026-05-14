// ============================================================================
// _form-toolbar.js — generyczny widget "pasek narzędzi + pole treści".
//
// Wzorzec PR-J14 (klientka 2026-05-14): zamiast collapsible-tree, formularze
// (wizyta, pacjent, lek, diagnoza, zalecenie, …) mają 2 kolumny:
//
//   • LEWA  — lista WSZYSTKICH pól (grupowane wg sekcji), z dot-indicatorem
//             wypełnienia (🟢 wypełnione / ⚪ puste) i kliknięciem do aktywacji.
//             Domyślnie aktywne jest pierwsze pole pierwszej grupy.
//
//   • PRAWA — aktywne pole (input/textarea/select/...) z labelem i opcjonalnym
//             slotem na notes (uwagi). Tylko JEDNO pole widoczne na raz (zg.
//             z decyzją PO: wariant A — tab-content style).
//
// Komponent nie wie o konkretnych typach pól — wywołujący widok przekazuje
// callback `fieldRenderer(field, values) → DOMNode`, który zwraca input
// control. Dzięki temu ten sam komponent obsługuje wizyty (z uzywki-special,
// tag-input-icd10, link-view, …), pacjenta (tekstowe pola) i CRUD-y.
//
// API:
//   createFormToolbar({
//     groups: [{ id, title, fields: [field, …] }],
//     values: {},                                  // flat-map wartości
//     fieldRenderer:    (field, values) → DOMNode, // wymagane (renderuje input)
//     fieldNotesValue:  (field, values) → string,  // opcjonalne (notes pre-fill)
//     fieldIsFilled:    (field, values) → boolean, // opcjonalne (default heurystyka)
//     showFieldNotes:   (field) → boolean,         // opcjonalne (default field.notes !== false)
//     onSelect:         (fieldUid) → void,         // opcjonalne (po kliknięciu w pasku)
//     activeFieldUid:   string,                    // opcjonalne (default: pierwsze pole)
//   }) → HTMLElement
//
// Zwracany root ma metodę `.refreshDots(newValues?)` — wywoływaną przez
// wywołującego po autozapisie, żeby zaktualizować dot-indicators na pasku
// (bez re-renderu treści, focus zostaje zachowany).
// ============================================================================

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
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

export function createFormToolbar(opts) {
    const {
        groups = [],
        values: initialValues = {},
        fieldRenderer,
        fieldNotesValue = () => '',
        fieldIsFilled = isFilledDefault,
        showFieldNotes = (f) => f && f.notes !== false,
        // PR-J14b: opcjonalny callback zwracający string preview wartości pola
        // (wyświetlany na pasku po lewej obok labela, mniejszą czcionką).
        // Gdy zwraca '' lub gdy brak callback'u — druga linia jest ukryta.
        fieldPreview = null,
        onSelect = null,
        renderEmpty = null
    } = opts || {};

    // PR-J14d (2026-05-14, KRYTYCZNY): `values` musi być MUTOWALNĄ referencją
    // wewnętrzną, żeby `refreshDots(newValues)` mogło ją zaktualizować dla
    // przyszłych `_renderContent(uid)`. Bez tego — kropki+preview pokazują
    // świeże dane, ale gdy user klika nowe pole (lub wraca do starego),
    // `fieldRenderer(field, values)` widzi STARE wartości (initialValues),
    // więc input renderuje się pusty / sprzed edycji. Klientka raport:
    // „po zmianie pola to co zostało wpisane od razu znika - choć zielona
    // kropka zostaje".
    let values = initialValues;


    // Płaska lista pól (do wyszukiwania, do refresh-dot). Pomija pola typu
    // 'header' (to są tylko wizualne separatory w starym schemacie).
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

    const root = el('div', { class: 'psy-form-toolbar', dataset: { live: 'true' } });

    if (!flat.length) {
        root.appendChild(el('div', { class: 'psy-new-hint' }, ['Brak pól do wyświetlenia.']));
        root.refreshDots = () => {};
        return root;
    }

    // State
    let activeUid = opts.activeFieldUid || flat[0]._uid;

    // Mapa _uid → element pozycji w pasku (do refresh-dot/active)
    const itemEls = new Map();

    // Lewa kolumna — pasek narzędzi
    const nav = el('div', { class: 'psy-form-toolbar__nav', role: 'tablist' });
    for (const g of groups) {
        const visibleFields = (g.fields || []).filter(
            (f) => !(f.input && f.input.type === 'header')
        );
        if (!visibleFields.length) continue;

        nav.appendChild(el('div', { class: 'psy-form-toolbar__group-title' }, [g.title || '']));

        const ul = el('ul', { class: 'psy-form-toolbar__group' });
        for (const f of visibleFields) {
            const uid = uidOf(g.id, f.id);
            const fieldWithGroup = { ...f, _groupId: g.id, _groupTitle: g.title };
            const filled = !!fieldIsFilled(fieldWithGroup, values);
            const isActive = uid === activeUid;
            const previewText = fieldPreview ? (fieldPreview(fieldWithGroup, values) || '') : '';

            // PR-J14b: dwulinijkowy element paska — pierwsza linia: kropka + label,
            // druga linia (opcjonalna): preview wartości, mniejszą czcionką.
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
                onclick: () => _setActive(uid),
                onkeydown: (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        _setActive(uid);
                    }
                }
            }, [labelLine, previewEl]);
            ul.appendChild(item);
            itemEls.set(uid, item);
        }
        nav.appendChild(ul);
    }

    // Prawa kolumna — pole aktywne
    const content = el('div', { class: 'psy-form-toolbar__content' });

    function _renderContent(uid) {
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

        // Breadcrumb: grupa › pole
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

        // Pole główne (input)
        const inputNode = fieldRenderer ? fieldRenderer(field, values) : null;
        if (inputNode) {
            panel.appendChild(el('div', { class: 'psy-form-toolbar__panel-input' }, [inputNode]));
        } else if (renderEmpty) {
            const empty = renderEmpty(field);
            if (empty) panel.appendChild(empty);
        }

        // Notes (uwagi do pola) — slot dodatkowy, jeśli pole je wspiera
        if (showFieldNotes(field)) {
            const noteName = (field._groupId ? field._groupId + '.' : '')
                + field.id + '.__notes';
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

    function _setActive(uid) {
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
            // Scroll do widocznego elementu na pasku (na małych ekranach lista jest długa)
            try { next.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
            catch (_) { /* no-op */ }
        }
        activeUid = uid;
        _renderContent(uid);
        if (typeof onSelect === 'function') onSelect(uid);
    }

    // Public API: re-oblicza dot-indicators + preview po autozapisie (bez
    // re-renderu treści — focus i scroll w polu po prawej zostają nietknięte).
    //
    // PR-J14d (2026-05-14): KRYTYCZNE — gdy `newValues` jest podany, MUSIMY
    // zaktualizować wewnętrzną referencję `values` (closure). Inaczej kolejne
    // wywołania `_renderContent(uid)` (po kliknięciu w inne pole) będą używać
    // STAREGO obiektu `initialValues`, co spowoduje renderowanie pól pustych
    // / sprzed edycji — pomimo że Store i kropki na pasku mają świeże dane.
    root.refreshDots = function (newValues) {
        if (newValues) values = newValues;
        const vals = values;
        for (const f of flat) {

            const item = itemEls.get(f._uid);
            if (!item) continue;
            const filled = !!fieldIsFilled(f, vals);
            item.classList.toggle('psy-form-toolbar__field--filled', filled);
            // PR-J14b: refresh preview-text (druga linia) per pole
            if (fieldPreview) {
                const prevEl = item.querySelector('.psy-form-toolbar__field-preview');
                if (prevEl) {
                    const txt = fieldPreview(f, vals) || '';
                    prevEl.textContent = txt;
                    prevEl.style.display = txt ? '' : 'none';
                }
            }
        }
    };

    // Public API: zmiana aktywnego pola z zewnątrz (np. deep-link przyszłościowy)
    root.setActive = _setActive;

    root.appendChild(nav);
    root.appendChild(content);

    // Initial render
    _renderContent(activeUid);

    return root;
}
