// ============================================================================
// _form-toolbar.js — „pasek pól + dziennik akapitów" (formularz wizyty).
//
// LEWA kolumna: wszystkie pola pogrupowane w sekcje, z kropką wypełnienia
//   i podglądem wartości. Klik pola → akapit pojawia się po prawej w trybie
//   edycji (w kolejności schematu, nie na końcu). Sekcje są domyślnie
//   rozwinięte; nagłówek sekcji ma kropkę (zieloną, gdy którekolwiek jej pole
//   jest wypełnione) i licznik „wypełnione / wszystkie", a przełącznik u góry
//   zwija wszystko do samej listy sekcji (i z powrotem).
//
// PRAWA kolumna: dziennik — tylko pola, które mają treść (plus to, które
//   właśnie jest edytowane). Każdy akapit ma dwa stany:
//     • odczyt  — gotowa notatka (same wybrane wartości / tekst),
//     • edycja  — kontrolki; naraz edytowany jest JEDEN akapit.
//   Klik w akapit → edycja. Klik gdziekolwiek poza nim / Tab poza / Esc →
//   powrót do odczytu. Pusty akapit po wyjściu z edycji znika z dziennika.
//
// STAN: `values` to żywy obiekt należący do wywołującego. Komponent nigdy
//   nie trzyma własnej kopii wartości — każdy render czyta bieżący stan,
//   więc przełączanie pól nie może „zgubić" wpisu. Wywołujący aktualizuje
//   `values` synchronicznie w zdarzeniu `input`/`change` i woła `refresh()`.
//
// API:
//   const tb = createFormToolbar({
//       groups,            // [{ id, title, fields: [{ id, label, required?, input? }] }]
//       values,            // żywy obiekt wartości
//       renderEdit,        // (field, values) → Node
//       renderRead,        // (field, values) → Node
//       isFilled,          // (field, values) → boolean
//       preview,           // (field, values) → string   (podgląd na pasku)
//       groupPreview,      // (group, values) → string   (gdy sekcja zwinięta)
//       showNotes,         // (field) → boolean          (pole „Uwagi")
//       notesValue         // (field, values) → string
//   });
//   tb.refresh()           // odśwież kropki i podglądy na pasku
//   tb.redraw()            // jw. + dziennik (gdy dane zmieniły się poza kontrolkami)
//   tb.openField(uid)      // otwórz akapit w edycji
//   tb.scrollToField(uid)  // przewiń dziennik do akapitu (bez wchodzenia w edycję)
//   tb.closeEdit()         // zamknij edycję
//   tb.contentEl           // prawa kolumna (do odczytu kontrolek)
// ============================================================================

import { el } from './_dom.js';

function uidOf(groupId, fieldId) {
    return (groupId || '_') + '::' + fieldId;
}

function isLink(field) {
    return !!(field && field.input && field.input.type === 'link-view');
}

export function createFormToolbar(opts) {
    const {
        groups = [],
        values = {},
        renderEdit,
        renderRead,
        isFilled = () => false,
        preview = null,
        groupPreview = null,
        showNotes = (f) => f && f.notes !== false,
        notesValue = () => ''
    } = opts || {};

    // Płaska lista pól (nagłówki dekoracyjne schematu pomijamy).
    const flat = [];
    for (const g of groups) {
        for (const f of (g.fields || [])) {
            if (f.input && f.input.type === 'header') continue;
            flat.push({ ...f, _groupId: g.id, _groupTitle: g.title, _uid: uidOf(g.id, f.id) });
        }
    }
    const byUid = new Map(flat.map((f) => [f._uid, f]));

    const visibleSet = new Set();        // puste pola otwarte przez użytkownika
    const collapsedSections = new Set(); // zwinięte sekcje paska
    let editingUid = null;

    const root = el('div', { class: 'psy-form-toolbar psy-form-toolbar--journal' });
    const nav = el('div', { class: 'psy-form-toolbar__nav' });
    const content = el('div', { class: 'psy-form-toolbar__content' });
    root.appendChild(nav);
    root.appendChild(content);
    root.contentEl = content;

    /* ---------------------------------------------------------------------
       Lewa kolumna — pasek pól
       --------------------------------------------------------------------- */
    const itemEls = new Map();

    const countEls = new Map();     // sekcja → licznik „wypełnione / wszystkie" w jej nagłówku
    const navGroups = groups.filter((g) => flat.some((f) => f._groupId === g.id));

    function renderNav() {
        const scrollTop = nav.scrollTop;
        nav.innerHTML = '';
        itemEls.clear();
        countEls.clear();

        // Sekcje są domyślnie ROZWINIĘTE (wymaganie klientki). Ten przełącznik zwija je
        // na żądanie do samej listy sekcji — cały formularz mieści się wtedy na ekranie.
        const allCollapsed = navGroups.every((g) => collapsedSections.has(g.id));
        nav.classList.toggle('psy-form-toolbar__nav--sections-only', allCollapsed);
        nav.appendChild(el('div', { class: 'psy-form-toolbar__nav-tools' }, [
            el('button', {
                type: 'button',
                class: 'psy-form-toolbar__nav-toggle',
                dataset: { action: 'toggle-sections' },
                title: allCollapsed
                    ? 'Pokaż pola wszystkich sekcji'
                    : 'Pokaż same nazwy sekcji (z liczbą wypełnionych pól)',
                onclick: () => {
                    if (allCollapsed) collapsedSections.clear();
                    else for (const g of navGroups) collapsedSections.add(g.id);
                    renderNav();
                    nav.scrollTop = 0;
                }
            }, [allCollapsed ? '▾ Rozwiń wszystkie sekcje' : '▸ Zwiń do listy sekcji'])
        ]));

        for (const g of groups) {
            const fields = flat.filter((f) => f._groupId === g.id);
            if (!fields.length) continue;

            const collapsed = collapsedSections.has(g.id);
            const toggle = () => {
                if (collapsed) collapsedSections.delete(g.id);
                else collapsedSections.add(g.id);
                renderNav();
            };
            const title = el('div', {
                class: 'psy-form-toolbar__group-title'
                    + (collapsed ? ' psy-form-toolbar__group-title--collapsed' : ''),
                role: 'button',
                tabindex: '0',
                'aria-expanded': collapsed ? 'false' : 'true',
                onclick: toggle,
                onkeydown: (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
                }
            }, [
                el('span', { class: 'psy-form-toolbar__group-chevron', 'aria-hidden': 'true' },
                    [collapsed ? '▸' : '▾']),
                // ta sama kropka co przy polach: zielona, gdy w sekcji jest cokolwiek wpisane
                el('span', { class: 'psy-form-toolbar__group-dot', 'aria-hidden': 'true' }),
                el('span', { class: 'psy-form-toolbar__group-name' }, [g.title || ''])
            ]);
            const count = el('span', { class: 'psy-form-toolbar__group-count' });
            title.appendChild(count);
            countEls.set(g.id, count);
            if (collapsed && typeof groupPreview === 'function') {
                const txt = groupPreview(g, values) || '';
                if (txt) title.appendChild(el('div', { class: 'psy-form-toolbar__group-preview' }, [txt]));
            }
            nav.appendChild(title);
            if (collapsed) continue;

            const ul = el('ul', { class: 'psy-form-toolbar__group' });
            for (const f of fields) {
                const item = el('li', {
                    class: 'psy-form-toolbar__field',
                    role: 'button',
                    tabindex: '0',
                    dataset: { fieldUid: f._uid },
                    onclick: () => onNavClick(f._uid),
                    onkeydown: (ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onNavClick(f._uid); }
                    }
                }, [
                    el('div', { class: 'psy-form-toolbar__field-line1' }, [
                        el('span', { class: 'psy-form-toolbar__field-dot', 'aria-hidden': 'true' }),
                        el('span', { class: 'psy-form-toolbar__field-label' },
                            [f.label + (f.required ? ' *' : '')])
                    ]),
                    el('div', { class: 'psy-form-toolbar__field-preview' })
                ]);
                ul.appendChild(item);
                itemEls.set(f._uid, item);
            }
            nav.appendChild(ul);
        }
        paintNav();
        nav.scrollTop = scrollTop;
    }

    /** Kropki, podglądy, liczniki sekcji i podświetlenie edytowanego pola — bez przebudowy listy. */
    function paintNav() {
        for (const g of navGroups) {
            const count = countEls.get(g.id);
            if (!count) continue;
            const fields = flat.filter((f) => f._groupId === g.id);
            const filled = fields.filter((f) => isFilled(f, values)).length;
            count.textContent = filled + '/' + fields.length;
            count.title = 'Wypełnione pola: ' + filled + ' z ' + fields.length;
            count.parentElement.classList.toggle('psy-form-toolbar__group-title--filled', filled > 0);
            count.classList.toggle('psy-form-toolbar__group-count--some', filled > 0);
        }
        for (const f of flat) {
            const item = itemEls.get(f._uid);
            if (!item) continue;
            item.classList.toggle('psy-form-toolbar__field--filled', !!isFilled(f, values));
            item.classList.toggle('psy-form-toolbar__field--active', f._uid === editingUid);
            const prevEl = item.querySelector('.psy-form-toolbar__field-preview');
            if (prevEl) {
                const txt = preview ? (preview(f, values) || '') : '';
                prevEl.textContent = txt;
                prevEl.style.display = txt ? '' : 'none';
            }
        }
    }

    function onNavClick(uid) {
        const field = byUid.get(uid);
        if (!field) return;
        if (isLink(field)) {
            if (field.input.ref) window.location.hash = field.input.ref;
            return;
        }
        openEdit(uid, { scroll: true });
    }

    /* ---------------------------------------------------------------------
       Prawa kolumna — dziennik
       --------------------------------------------------------------------- */
    function isInJournal(field) {
        if (isLink(field)) return false;
        return field._uid === editingUid || visibleSet.has(field._uid) || !!isFilled(field, values);
    }

    function renderEntry(field) {
        const editing = field._uid === editingUid;
        const article = el('article', {
            class: 'psy-form-toolbar__entry psy-form-toolbar__entry--' + (editing ? 'edit' : 'read'),
            dataset: { fieldUid: field._uid },
            tabindex: editing ? null : '0',
            title: editing ? null : 'Kliknij, aby edytować'
        });

        article.appendChild(el('header', { class: 'psy-form-toolbar__entry-header' }, [
            el('span', { class: 'psy-form-toolbar__entry-chevron', 'aria-hidden': 'true' },
                [editing ? '▾' : '▸']),
            el('span', { class: 'psy-form-toolbar__entry-label' },
                [field.label + (field.required ? ' *' : '')])
        ]));

        const notes = showNotes(field) ? (notesValue(field, values) || '') : '';

        if (editing) {
            const body = el('div', {
                class: 'psy-form-toolbar__entry-body psy-form-toolbar__entry-body--edit'
            }, [renderEdit(field, values)]);
            if (showNotes(field)) {
                const ta = el('textarea', {
                    class: 'psy-form-toolbar__notes',
                    name: field._groupId + '.' + field.id + '.__notes',
                    rows: 2,
                    placeholder: 'uwagi…'
                });
                ta.value = notes;
                body.appendChild(el('div', { class: 'psy-form-toolbar__entry-notes' }, [
                    el('label', { class: 'psy-form-toolbar__notes-label' }, ['Uwagi:']),
                    ta
                ]));
            }
            article.appendChild(body);
        } else {
            const body = el('div', {
                class: 'psy-form-toolbar__entry-body psy-form-toolbar__entry-body--read'
            }, [renderRead(field, values)]);
            if (notes.trim()) {
                body.appendChild(el('div', { class: 'psy-form-toolbar__entry-notes-read' }, [
                    el('span', { class: 'psy-form-toolbar__notes-label' }, ['Uwagi:']), ' ', notes
                ]));
            }
            article.appendChild(body);
        }
        return article;
    }

    function renderJournal() {
        const scrollTop = content.scrollTop;
        content.innerHTML = '';
        const journal = el('div', { class: 'psy-form-toolbar__journal' });

        let any = false;
        for (const g of groups) {
            const fields = flat.filter((f) => f._groupId === g.id && isInJournal(f));
            if (!fields.length) continue;
            // Sekcja z jednym polem o tej samej nazwie (np. „Dane wizyty") nie potrzebuje
            // osobnego nagłówka — akapit sam się podpisuje.
            const all = flat.filter((f) => f._groupId === g.id);
            if (!(all.length === 1 && all[0].label === g.title)) {
                journal.appendChild(el('h3', { class: 'psy-form-toolbar__journal-section-title' }, [g.title || '']));
            }
            for (const f of fields) journal.appendChild(renderEntry(f));
            any = true;
        }
        if (!any) {
            journal.appendChild(el('div', { class: 'psy-form-toolbar__journal-empty' }, [
                el('div', { class: 'psy-form-toolbar__journal-empty-icon' }, ['📝']),
                el('div', { class: 'psy-form-toolbar__journal-empty-title' }, ['Notatka pusta']),
                el('div', { class: 'psy-form-toolbar__journal-empty-hint' },
                    ['Wybierz pole z paska po lewej, aby dodać pierwszy wpis.'])
            ]));
        }
        content.appendChild(journal);
        content.scrollTop = scrollTop;
    }

    function entryEl(uid) {
        return uid ? content.querySelector('article[data-field-uid="' + uid + '"]') : null;
    }

    function focusFirstControl(uid) {
        const article = entryEl(uid);
        if (!article) return;
        const target = article.querySelector(
            '.psy-form-toolbar__entry-body input:not([type="hidden"]):not([readonly]), '
            + '.psy-form-toolbar__entry-body textarea, .psy-form-toolbar__entry-body select');
        if (target) { try { target.focus({ preventScroll: true }); } catch (_) { /* */ } }
    }

    /* ---------------------------------------------------------------------
       Przejścia odczyt ↔ edycja
       --------------------------------------------------------------------- */

    /** Pole opuszczone bez treści nie zostaje w dzienniku. */
    function settle(uid) {
        const field = byUid.get(uid);
        if (field && !isFilled(field, values)) visibleSet.delete(uid);
    }

    function openEdit(uid, { scroll = false } = {}) {
        const field = byUid.get(uid);
        if (!field || isLink(field)) return;
        if (editingUid === uid) { focusFirstControl(uid); return; }

        const prev = editingUid;
        editingUid = uid;
        if (prev) settle(prev);
        if (!isFilled(field, values)) visibleSet.add(uid);

        renderJournal();
        paintNav();
        if (scroll) {
            const article = entryEl(uid);
            if (article) { try { article.scrollIntoView({ block: 'nearest' }); } catch (_) { /* */ } }
        }
        focusFirstControl(uid);
    }

    function closeEdit({ focusUid = null } = {}) {
        if (!editingUid) return;
        const prev = editingUid;
        editingUid = null;
        settle(prev);
        renderJournal();
        paintNav();
        const article = entryEl(focusUid);
        if (article) { try { article.focus({ preventScroll: true }); } catch (_) { /* */ } }
    }

    /* Klik: decyduje o trybie akapitów. Jeden listener na dokumencie w fazie
       capture — decyzja zapada, zanim cokolwiek zostanie przerysowane, a sam
       przerysunek dzieje się już W TRAKCIE zdarzenia click (żaden klik nie
       ginie przez podmianę elementu między mousedown a mouseup). */
    let pointerActive = false;

    function onDocPointerDown() {
        if (!root.isConnected) return detach();
        pointerActive = true;
    }
    function onDocPointerEnd() {
        // `click` przychodzi tuż po pointerup — flagę zdejmujemy dopiero po nim.
        setTimeout(() => { pointerActive = false; }, 0);
    }
    function onDocClick(ev) {
        if (!root.isConnected) return detach();
        pointerActive = false;
        const t = ev.target;
        if (!(t instanceof Element)) return;

        const article = t.closest('article[data-field-uid]');
        if (article && content.contains(article)) {
            const uid = article.dataset.fieldUid;
            if (uid !== editingUid) {
                if (t.closest('a[href]')) return;       // linki w treści działają normalnie
                openEdit(uid);
            } else if (t.closest('.psy-form-toolbar__entry-header')) {
                closeEdit({ focusUid: uid });           // klik w nagłówek = „gotowe"
            }
            return;
        }
        if (nav.contains(t)) return;                    // pasek ma własne handlery
        if (t.closest('.psy-modal-backdrop, psy-toast-container')) return;
        closeEdit();
    }
    function detach() {
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        document.removeEventListener('pointerup', onDocPointerEnd, true);
        document.removeEventListener('pointercancel', onDocPointerEnd, true);
        document.removeEventListener('click', onDocClick, true);
    }
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('pointerup', onDocPointerEnd, true);
    document.addEventListener('pointercancel', onDocPointerEnd, true);
    document.addEventListener('click', onDocClick, true);

    /* Klawiatura: Tab poza akapit zamyka edycję; Esc zamyka; Enter/Spacja na
       akapicie w trybie odczytu otwiera edycję. */
    content.addEventListener('focusout', (ev) => {
        if (!editingUid || pointerActive) return;       // myszą zajmuje się onDocClick
        const next = ev.relatedTarget;
        if (!(next instanceof Element)) return;
        const article = entryEl(editingUid);
        if (article && article.contains(next)) return;
        const nextArticle = next.closest('article[data-field-uid]');
        closeEdit({ focusUid: nextArticle ? nextArticle.dataset.fieldUid : null });
    });
    content.addEventListener('keydown', (ev) => {
        const article = ev.target instanceof Element ? ev.target.closest('article[data-field-uid]') : null;
        if (!article) return;
        const uid = article.dataset.fieldUid;
        if (ev.key === 'Escape' && uid === editingUid) {
            ev.preventDefault();
            closeEdit({ focusUid: uid });
        } else if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === article && uid !== editingUid) {
            ev.preventDefault();
            openEdit(uid);
        }
    });

    /* ---------------------------------------------------------------------
       API publiczne
       --------------------------------------------------------------------- */
    root.refresh = paintNav;
    root.openField = (uid) => openEdit(uid, { scroll: true });
    root.closeEdit = () => closeEdit();
    root.getEditingUid = () => editingUid;
    // Dane zmieniły się poza kontrolkami (np. skończyło się wgrywanie pliku). Dziennik
    // przerysowujemy tylko wtedy, gdy nic nie jest edytowane — przerysowanie w trakcie
    // pisania zabrałoby kursor; edytowany akapit i tak odświeża się sam.
    root.redraw = () => {
        if (!editingUid) renderJournal();
        paintNav();
    };
    root.scrollToField = (uid) => {
        const article = entryEl(uid);
        if (article) { try { article.scrollIntoView({ block: 'center' }); } catch (_) { /* */ } }
    };

    renderNav();
    renderJournal();
    return root;
}
