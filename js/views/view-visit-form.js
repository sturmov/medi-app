// ============================================================================
// view-visit-form.js — widok-strona formularza wizyty.
//
// CECHY (Faza 4 + ustalenia PO 2026-05-01):
//
//  • Renderuje schemat z `_visit-form-schema.js` w 5-slotowym wzorcu akordeonu
//    (VISIT_FORM_SPEC.md §2.0). Slot 1: belka, 2: sub-label, 3: pole główne,
//    4: uwagi, 5: komentarz rozdziału.
//
//  • AUTOZAPIS: każda zmiana (input/change) z debouncem ~400 ms zapisuje
//    flat-mapę wartości do `visit.data._raw`. Brak przycisku „Zapisz".
//
//  • LAZY CREATE: wejście w `#/visit/form/new[/:typeId]` NIE tworzy rekordu.
//    Pierwsza zmiana w którymkolwiek polu woła `Store.addVisit({...})`
//    i bez nawigacji aktualizuje hash na `#/visit/form/:visitId` przez
//    `history.replaceState`. Dzięki temu lista nie jest zaśmiecana pustymi
//    szkicami.
//
//  • STATUS WIZYTY (PO 2026-05-01): `Robocza`/`Zamknięta` zostały usunięte
//    z UI. Pole `closed` w danych zostaje (legacy). Formularz nigdy nie jest
//    read-only. Każdą wizytę można skasować przyciskiem 🗑 w nagłówku.
//
//  • SEKCJE COLLAPSIBLE (PO 2026-05-01): wszystkie sekcje, włącznie z
//    pierwszą („Dane wizyty"), są collapsible default-closed. Sekcja
//    „Dane wizyty" gdy collapsed pokazuje preview-line w summary
//    (data · godzina · typ · czas · osoby) zamiast samej etykiety.
//
//  • LIVE-VIEW: root ma `data-live="true"` — `AppController._renderView()`
//    pomija ten widok przy pasywnych re-renderach Store (autozapis nie
//    przerenderuje formularza i nie zabija focusu/scroll).
//
// HASH:
//   #/visit/form/new            – nowa, lazy
//   #/visit/form/new/:typeId    – nowa, lazy + ustawiony typ
//   #/visit/form/:visitId       – edycja istniejącej
// ============================================================================

import { Store } from './_store.js';
import { schemaForMode } from './_visit-form-schema.js';
import { visitTypeById } from './_fake-data.js';
import { searchIcd10, findIcd10ByCode } from './_icd10-dict.js';
import { openConfirm } from './_modal.js';
import { createFormToolbar } from './_form-toolbar.js';

/* --------------------------------------------------------------------------
   Mini-helper `el()` — vanilla DOM (ten sam styl co app-new.js).
   -------------------------------------------------------------------------- */
function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'dataset' && typeof v === 'object') {
            for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
        } else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'style' && typeof v === 'object') {
            for (const [sk, sv] of Object.entries(v)) node.style[sk] = sv;
        } else if (k === 'checked') {
            node.checked = !!v;
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

/* --------------------------------------------------------------------------
   Renderery dla pola głównego (slot 3) — każdy zwraca DOMNode.
   Każdy honoruje `initialValue` jeśli jest dostępne w `raw`.
   -------------------------------------------------------------------------- */

/* Auto-grow helper — dopasowuje wysokość textarea-y do zawartości.
   Wywołać po wstrzyknięciu w DOM oraz po każdym `input`. */
function _autoGrowTextarea(ta) {
    if (!ta || !ta.classList || !ta.classList.contains('psy-vf__textarea--autogrow')) return;
    // Reset, żeby `scrollHeight` odzwierciedlał aktualną zawartość, nie poprzednią wysokość.
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight + 2) + 'px';   // +2 px na border
}

function renderTextarea(name, initial = '', opts = {}) {
    // Domyślnie WSZYSTKIE textarea w formularzu wizyty rosną z zawartością
    // (PR-J: notatki/opisy „muszą być widoczne w całości"). Wyjątek: gdy
    // wywołujący jawnie poda `autoGrow: false` (np. 1-linijkowy komentarz
    // sekcji w summary collapsible — narzędzie dev).
    const autoGrow = (opts.autoGrow !== false);
    const klass = ['psy-vf__textarea'];
    if (opts.compact) klass.push('psy-vf__textarea--compact');
    if (autoGrow)     klass.push('psy-vf__textarea--autogrow');
    const ta = el('textarea', {
        class: klass.join(' '),
        name,
        rows: opts.rows || 2,
        placeholder: opts.placeholder || '',
        readonly: opts.readonly || false
    });
    ta.value = initial == null ? '' : initial;
    return ta;
}


function renderInput(type, name, initial = '', opts = {}) {
    const attrs = { type, name, class: 'psy-vf__input', value: initial == null ? '' : initial };
    if (opts.readonly) attrs.readonly = true;
    if (opts.placeholder) attrs.placeholder = opts.placeholder;
    if (opts.unit) attrs.dataset = { unit: opts.unit };
    return el('input', attrs);
}

function renderSelect(name, options, initial = '') {
    const opts = [el('option', { value: '' }, ['— wybierz —'])];
    for (const o of options) {
        opts.push(el('option', { value: o, selected: o === initial }, [o]));
    }
    return el('select', { name, class: 'psy-vf__select' }, opts);
}

function renderRadio(name, options, initial = '') {
    const group = el('div', { class: 'psy-vf__radio-group' });
    for (const o of options) {
        const id = name + '_r_' + o.replace(/\W+/g, '_');
        group.appendChild(el('label', { class: 'psy-vf__radio', for: id }, [
            el('input', {
                type: 'radio', id, name,
                value: o,
                checked: o === initial
            }),
            el('span', {}, [o])
        ]));
    }
    return group;
}

function renderCheckboxGroup(name, options, initial = []) {
    const group = el('div', { class: 'psy-vf__checkbox-group' });
    const set = new Set(Array.isArray(initial) ? initial : []);
    for (const o of options) {
        const id = name + '_c_' + o.replace(/\W+/g, '_');
        group.appendChild(el('label', { class: 'psy-vf__checkbox', for: id }, [
            el('input', {
                type: 'checkbox',
                id,
                name: name + '[]',
                value: o,
                checked: set.has(o)
            }),
            el('span', {}, [o])
        ]));
    }
    return group;
}

/** Multi-select → renderujemy jako checkbox-group (prostsze niż <select multiple>) */
function renderMultiSelect(name, options, initial = []) {
    return renderCheckboxGroup(name, options, initial);
}

/* --------------------------------------------------------------------------
   Multi-tag ICD-10 autocomplete (slot 3 dla `tag-input-icd10`).
   `initial` może być:
     - tablicą stringów (kodów),  np. ['F32.1','F41.1']
     - tablicą obiektów {code, description},
     - stringiem CSV (z `_raw[name]`), np. 'F32.1,F41.1'
   -------------------------------------------------------------------------- */
function normalizeIcd10Initial(initial) {
    if (initial == null) return [];
    let arr;
    if (typeof initial === 'string') {
        arr = initial.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(initial)) {
        arr = initial;
    } else {
        return [];
    }
    const out = [];
    for (const item of arr) {
        if (typeof item === 'string' && item.trim()) {
            const code = item.trim().toUpperCase();
            const hit = findIcd10ByCode(code);
            out.push({ code, description: hit ? hit.description : '' });
        } else if (item && typeof item === 'object' && item.code) {
            out.push({
                code: String(item.code).toUpperCase(),
                description: item.description || ''
            });
        }
    }
    return out;
}

function renderTagIcd10(name, initial = []) {
    const selected = normalizeIcd10Initial(initial);
    let matches = [];
    let activeIdx = -1;
    let popover = null;

    const wrap = el('div', { class: 'psy-vf__tag-icd10 psy-autocomplete' });
    const tagsBox = el('div', { class: 'psy-vf__tag-icd10__tags' });
    const input = el('input', {
        type: 'text',
        class: 'psy-vf__input psy-vf__tag-icd10__input',
        placeholder: 'wpisz kod lub fragment opisu (np. F32…)',
        autocomplete: 'off'
    });
    const hidden = el('input', { type: 'hidden', name });

    function syncHidden() {
        hidden.value = selected.map((s) => s.code).join(',');
        // Trigger autozapisu
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function renderTags() {
        tagsBox.innerHTML = '';
        selected.forEach((s, i) => {
            const chip = el('span', {
                class: 'psy-vf__tag-icd10__chip',
                title: s.description || s.code
            }, [
                el('span', { class: 'psy-vf__tag-icd10__chip-code' }, [s.code]),
                s.description
                    ? el('span', { class: 'psy-vf__tag-icd10__chip-desc' }, [s.description])
                    : null,
                el('button', {
                    type: 'button',
                    class: 'psy-vf__tag-icd10__chip-remove',
                    'aria-label': 'Usuń ' + s.code,
                    onclick: (ev) => {
                        ev.preventDefault();
                        selected.splice(i, 1);
                        syncHidden();
                        renderTags();
                        input.focus();
                    }
                }, ['✕'])
            ]);
            tagsBox.appendChild(chip);
        });
        tagsBox.style.display = selected.length ? '' : 'none';
    }

    function addEntry(code, description) {
        const c = String(code || '').trim().toUpperCase();
        if (!c) return false;
        if (selected.some((s) => s.code === c)) return false;
        selected.push({ code: c, description: description || '' });
        syncHidden();
        renderTags();
        return true;
    }

    function closePopover() {
        if (popover && popover.parentNode) popover.remove();
        popover = null;
        activeIdx = -1;
    }

    function renderPopover() {
        closePopover();
        if (!matches.length) return;
        popover = el('div', { class: 'psy-autocomplete__popover' });
        matches.forEach((m, i) => {
            const item = el('div', {
                class: 'psy-autocomplete__item' +
                    (i === activeIdx ? ' psy-autocomplete__item--active' : ''),
                onmousedown: (ev) => {
                    ev.preventDefault();
                    pickMatch(m);
                }
            }, [
                el('span', { class: 'psy-autocomplete__code' }, [m.code]),
                el('span', { class: 'psy-autocomplete__desc' }, [m.description])
            ]);
            popover.appendChild(item);
        });
        wrap.appendChild(popover);
    }

    function pickMatch(m) {
        addEntry(m.code, m.description);
        input.value = '';
        matches = [];
        closePopover();
        input.focus();
    }

    function refreshSuggestions() {
        const q = input.value.trim();
        matches = q ? searchIcd10(q, 8) : [];
        activeIdx = -1;
        renderPopover();
    }

    input.addEventListener('input', refreshSuggestions);
    input.addEventListener('focus', () => { if (input.value.trim()) refreshSuggestions(); });
    input.addEventListener('blur', () => setTimeout(closePopover, 180));
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            if (!matches.length) { refreshSuggestions(); return; }
            activeIdx = Math.min(activeIdx + 1, matches.length - 1);
            renderPopover();
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            activeIdx = Math.max(activeIdx - 1, -1);
            renderPopover();
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            if (activeIdx >= 0 && matches[activeIdx]) {
                pickMatch(matches[activeIdx]);
            } else if (input.value.trim()) {
                const c = input.value.trim().toUpperCase();
                const hit = findIcd10ByCode(c);
                addEntry(c, hit ? hit.description : '');
                input.value = '';
                matches = [];
                closePopover();
            }
        } else if (ev.key === 'Escape') {
            closePopover();
        } else if (ev.key === 'Backspace' && !input.value && selected.length > 0) {
            selected.pop();
            syncHidden();
            renderTags();
        } else if (ev.key === ',' || ev.key === ';') {
            ev.preventDefault();
            const c = input.value.trim().toUpperCase();
            if (c) {
                const hit = findIcd10ByCode(c);
                addEntry(c, hit ? hit.description : '');
                input.value = '';
                matches = [];
                closePopover();
            }
        }
    });

    syncHidden();
    renderTags();

    wrap.appendChild(tagsBox);
    wrap.appendChild(input);
    wrap.appendChild(hidden);
    return wrap;
}

/** Specjalny renderer sekcji Używki (2.9). */
function renderUzywkiSpecial(sectionId, raw) {
    const { VISIT_DICT } = window.__psyVisitDict || {};
    const list = (VISIT_DICT && VISIT_DICT.UZYWKI_11) || [];
    const wrap = el('div', { class: 'psy-vf__uzywki' });

    list.forEach((label, idx) => {
        const checkName = sectionId + '_u_' + idx;
        const intName   = sectionId + '_u_' + idx + '_i';
        const noteName  = sectionId + '_u_' + idx + '_n';
        const isChecked = raw && raw[checkName] != null
            ? !!raw[checkName]
            : false;
        const intVal  = (raw && raw[intName]) || '';
        const noteVal = (raw && raw[noteName]) || '';

        const row = el('div', { class: 'psy-vf__uzywki-row' + (isChecked ? ' psy-vf__uzywki-row--checked' : '') }, [
            el('label', { class: 'psy-vf__checkbox' }, [
                el('input', { type: 'checkbox', name: checkName, value: '1', checked: isChecked }),
                el('span', {}, [label])
            ]),
            el('div', { class: 'psy-vf__uzywki-detail', 'data-idx': idx }, [
                renderSelect(intName,
                    ['Nigdy', 'Okazjonalnie', 'Regularnie', 'Uzależnienie (podejrzenie / diagnoza)'],
                    intVal
                ),
                el('textarea', {
                    class: 'psy-vf__textarea psy-vf__textarea--compact psy-vf__textarea--autogrow',
                    name: noteName,
                    rows: 1,
                    placeholder: 'uwagi…'
                }, [noteVal])

            ])
        ]);
        wrap.appendChild(row);
    });

    // Pokaż detail tylko gdy checkbox zaznaczony (delegacja)
    wrap.addEventListener('change', (ev) => {
        if (ev.target.type !== 'checkbox') return;
        const row = ev.target.closest('.psy-vf__uzywki-row');
        if (!row) return;
        row.classList.toggle('psy-vf__uzywki-row--checked', ev.target.checked);
    });

    return wrap;
}

function renderLinkView(label, href) {
    return el('div', { class: 'psy-vf__link-view' }, [
        el('button', {
            class: 'btn btn--secondary btn--sm',
            onclick: (e) => { e.preventDefault(); window.location.hash = href; }
        }, [label || '🔗 Przejdź']),
        el('span', { class: 'psy-new-hint' }, [' (edytuje się w dedykowanym widoku)'])
    ]);
}

/** Ruter typu pola (slot 3) → właściwy renderer. */
function renderInputForField(sectionId, field, raw) {
    const name = sectionId + '.' + field.id;
    const type = (field.input && field.input.type) || null;

    // Wartości — szukamy w raw po name
    const flatVal  = raw && raw[name] != null ? raw[name] : null;
    const arrayVal = (raw && Array.isArray(raw[name])) ? raw[name] :
                     (raw && Array.isArray(raw[name + '[]']) ? raw[name + '[]'] : []);

    if (field.fullWidth || type == null) {
        return null; // slot 3 pusty, uwagi (4) zajmą pełną szerokość
    }

    if (type === 'header') {
        return el('div', { class: 'psy-vf__sub-header' }, [field.label]);
    }

    if (type === 'text')     return renderInput('text', name, flatVal || '');
    if (type === 'number')   return renderInput('number', name, flatVal || '', { unit: field.input.unit, readonly: field.input.readonly });
    if (type === 'date')     return renderInput('date', name, flatVal || '');
    if (type === 'textarea') return renderTextarea(name, flatVal || '', { rows: 3 });
    if (type === 'select')   return renderSelect(name, field.input.options || [], flatVal || '');
    if (type === 'radio')    return renderRadio(name, field.input.options || [], flatVal || '');
    if (type === 'checkbox-group') return renderCheckboxGroup(name, field.input.options || [], arrayVal);
    if (type === 'multi-select')   return renderMultiSelect(name, field.input.options || [], arrayVal);
    if (type === 'tag-input-icd10') return renderTagIcd10(name, flatVal || []);
    if (type === 'link-view')      return renderLinkView(field.label, field.input.ref || '#');
    if (type === 'uzywki-special') return renderUzywkiSpecial(sectionId, raw);

    return el('div', { class: 'psy-new-hint' }, ['(nieznany typ: ' + type + ')']);
}

/* --------------------------------------------------------------------------
   Render wiersza podpola (slots 2-3-4).
   -------------------------------------------------------------------------- */
function renderSubfieldRow(sectionId, field, raw) {
    const inputNode = renderInputForField(sectionId, field, raw);

    // Specjalny case: header
    if (field.input && field.input.type === 'header') {
        return el('div', { class: 'psy-vf__row psy-vf__row--header' }, [inputNode]);
    }

    const fullWidth = field.fullWidth || inputNode == null;
    const showNotes = field.notes !== false;
    const notesName = sectionId + '.' + field.id + '.__notes';
    const notesVal  = (raw && raw[notesName]) || '';

    const parts = [
        el('div', { class: 'psy-vf__row-label' }, [
            field.label + (field.required ? ' *' : '')
        ])
    ];

    if (!fullWidth) {
        parts.push(el('div', { class: 'psy-vf__row-input' }, [inputNode]));
    }

    if (showNotes) {
        parts.push(el('div', {
            class: 'psy-vf__row-notes' + (fullWidth ? ' psy-vf__row-notes--wide' : '')
        }, [
            renderTextarea(notesName, notesVal, {
                compact: true,
                rows: 1,
                placeholder: fullWidth ? '' : 'uwagi…'
            })
        ]));
    }

    return el('div', {
        class: 'psy-vf__row' +
            (fullWidth ? ' psy-vf__row--fullwidth' : '') +
            (!showNotes ? ' psy-vf__row--no-notes' : '')
    }, parts);
}

/* --------------------------------------------------------------------------
   Build preview-line dla sekcji „Dane wizyty" (sticky w schemie, ale po
   ust. PO 2026-05-01 renderowane jako collapsible details). Pokazuje:
   data · godzina · typ wizyty · czas trwania · osoby obecne.
   -------------------------------------------------------------------------- */
function buildVisitDataPreview(raw, typeObj) {
    if (!raw) raw = {};
    const parts = [];
    const date = raw['visitData.data'] || '';
    const time = raw['visitData.czasOd'] || raw['visitData.czas'] || raw['visitData.time'] || '';
    if (date) parts.push(date + (time ? ' ' + time : ''));
    if (typeObj && typeObj.label) parts.push(typeObj.label);
    const dur = raw['visitData.czasTrwania'] || raw['visitData.duration'] || '';
    if (dur) parts.push(String(dur).match(/^\d+$/) ? dur + ' min' : dur);
    // Osoby obecne (multi-select array)
    const persons = raw['visitData.osoby'] || raw['visitData.osobyObecne'] || raw['visitData.uczestnicy'] || [];
    if (Array.isArray(persons) && persons.length) {
        parts.push(persons.slice(0, 3).join(', ') + (persons.length > 3 ? '…' : ''));
    }
    return parts.length ? parts.join(' · ') : '(uzupełnij dane wizyty)';
}

/** Zaktualizuj preview-line w summary sekcji visitData (po zmianie pól). */
function updateVisitDataPreview(rootEl, typeObj) {
    if (!rootEl) return;
    const sec = rootEl.querySelector('details[data-section="visitData"]');
    if (!sec) return;
    const previewSpan = sec.querySelector('.psy-vf__summary-preview');
    if (!previewSpan) return;
    const raw = readRawFormData(rootEl);
    previewSpan.textContent = buildVisitDataPreview(raw, typeObj);
}

/* --------------------------------------------------------------------------
   Render sekcji (rozdziału) — <details>/<summary>.
   PO 2026-05-01: wszystkie sekcje są collapsible (default closed),
   włącznie z `sticky: true` (Dane wizyty), która zyskuje preview-line
   w summary zamiast samej etykiety.
   -------------------------------------------------------------------------- */
function renderSection(section, raw, ctx = {}) {
    const commentName = section.id + '.__comment';
    const comment     = (raw && raw[commentName]) || '';

    const headerLeft = el('div', { class: 'psy-vf__summary-left' }, [
        el('span', { class: 'psy-vf__summary-icon' }, [section.icon || '📄']),
        el('span', { class: 'psy-vf__summary-title' }, [section.title])
    ]);

    // === Sekcja sticky (visitData) — collapsible z preview-line ===
    if (section.sticky) {
        const previewText = buildVisitDataPreview(raw, ctx.typeObj);
        headerLeft.appendChild(el('span', {
            class: 'psy-vf__summary-preview',
            'aria-hidden': 'true'
        }, [previewText]));

        const details = el('details', {
            class: 'psy-vf__section psy-vf__section--datadown',
            'data-section': section.id,
            open: false
        });
        const summary = el('summary', { class: 'psy-vf__summary' }, [headerLeft]);
        details.appendChild(summary);

        const body = el('div', { class: 'psy-vf__body' });
        for (const f of section.subfields || []) {
            body.appendChild(renderSubfieldRow(section.id, f, raw));
        }
        details.appendChild(body);
        return details;
    }

    const headerRight = section.sectionComment
        ? el('div', {
            class: 'psy-vf__summary-right',
            onclick: (e) => e.stopPropagation()
        }, [
            el('label', { class: 'psy-vf__summary-comment-label' }, ['Komentarz:']),
            // narzędzie dev — 1-linijkowy szybki komentarz w summary; bez auto-grow,
            // żeby nie rozjechało układu summary collapsible.
            renderTextarea(commentName, comment, {
                compact: true,
                rows: 1,
                autoGrow: false,
                placeholder: 'krótki komentarz do rozdziału…'
            })

        ])
        : null;

    if ((section.subfields || []).length === 0) {
        return el('section', { class: 'psy-vf__section psy-vf__section--simple' }, [
            el('div', { class: 'psy-vf__summary psy-vf__summary--simple' }, [
                headerLeft,
                el('div', { class: 'psy-vf__simple-field' }, [
                    renderTextarea(commentName, comment, {
                        rows: 3,
                        placeholder: 'opis / notatka dla tego rozdziału…'
                    })
                ])
            ])
        ]);
    }

    // PO 2026-05-01: wszystkie sekcje DEFAULT CLOSED (ignoruj `defaultOpen`
    // ze schematu, żeby strona nie była zalana).
    const details = el('details', {
        class: 'psy-vf__section',
        'data-section': section.id,
        open: false
    });

    const summaryChildren = [headerLeft];
    if (headerRight) summaryChildren.push(headerRight);
    const summary = el('summary', { class: 'psy-vf__summary' }, summaryChildren);
    details.appendChild(summary);

    const body = el('div', { class: 'psy-vf__body' });
    for (const f of section.subfields || []) {
        body.appendChild(renderSubfieldRow(section.id, f, raw));
    }
    details.appendChild(body);
    return details;
}

/* --------------------------------------------------------------------------
   readRawFormData — flat-mapa stanu formularza.
   -------------------------------------------------------------------------- */
function readRawFormData(root) {
    const out = {};
    root.querySelectorAll('input[name], select[name], textarea[name]').forEach((node) => {
        const name = node.name;
        if (!name) return;

        if (node.type === 'checkbox') {
            if (name.endsWith('[]')) {
                const k = name.slice(0, -2); // strip '[]' for storage key
                if (!Array.isArray(out[k])) out[k] = [];
                if (node.checked) out[k].push(node.value);
            } else {
                out[name] = !!node.checked;
            }
        } else if (node.type === 'radio') {
            if (node.checked) out[name] = node.value;
            else if (!(name in out)) out[name] = '';
        } else if (node.type === 'hidden') {
            // np. CSV z renderTagIcd10
            out[name] = node.value;
        } else {
            out[name] = node.value;
        }
    });
    return out;
}

/* --------------------------------------------------------------------------
   buildSummary — krótki opis wizyty na listę historii.
   Bierze pierwszy nie-pusty komentarz lub wartość z najwyższych sekcji.
   -------------------------------------------------------------------------- */
function buildSummary(raw) {
    if (!raw) return '';
    const candidates = [
        raw['visitData.powod'],
        raw['problemZdrowotny.__comment'],
        raw['wywiad.__comment'],
        raw['rozpoznanie.__comment'],
        raw['oddzialywania.__comment']
    ];
    for (const c of candidates) {
        if (c && typeof c === 'string' && c.trim()) {
            const s = c.trim();
            return s.length > 120 ? s.slice(0, 117) + '…' : s;
        }
    }
    return '';
}

/* --------------------------------------------------------------------------
   GŁÓWNY EXPORT — renderer widoku.
   -------------------------------------------------------------------------- */

/**
 * Renderuje widok formularza wizyty.
 * @param {object} opts — { isNew?: bool, typeId?: string, visitId?: string }
 */
export function renderVisitForm(opts = {}) {
    // Wymuś load słownika do window cache (renderUzywki nie ma importa).
    if (!window.__psyVisitDict) {
        import('./_visit-dict.js').then((m) => { window.__psyVisitDict = m; });
    }

    const patient = Store.state.currentPatient;
    if (!patient) {
        const r = el('div', { class: 'psy-new-view' });
        r.appendChild(el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, ['Formularz wizyty'])])
        ]));
        r.appendChild(el('div', { class: 'psy-new-view__body' }, [
            el('div', { class: 'psy-new-hint' }, ['Wybierz pacjenta, aby rozpocząć wizytę.'])
        ]));
        return r;
    }

    // Resolve visit / mode
    let visit    = null;
    let mode     = 'followup';
    let title    = 'Nowa wizyta';
    let _typeId  = opts.typeId || null;
    let _visitId = opts.visitId || null;

    // Typy wizyt, które wymagają pełnego wywiadu (`first` mode).
    // PR-J4 (2026-05-11): tylko `first_meeting` wymaga pełnego wywiadu.
    // Legacy `interview`/`diagnosis` zachowane dla wstecznej kompatybilności
    // (stare zapisy w localStorage).
    const FIRST_MODE_TYPES = new Set([
        'first_meeting',
        'interview', 'diagnosis',
        'first', 'first-visit'
    ]);

    function resolveMode(visitType) {
        const t = String(visitType || '').toLowerCase();
        if (FIRST_MODE_TYPES.has(t)) return 'first';
        if (/wywiad|first/.test(t)) return 'first';
        return 'followup';
    }

    if (_visitId) {
        visit = Store.getVisitById(_visitId);
        if (!visit) {
            const r = el('div', { class: 'psy-new-view' });
            r.appendChild(el('div', { class: 'psy-new-view__header' }, [
                el('div', {}, [el('h1', { class: 'psy-new-view__title' }, ['Wizyta — nie znaleziono'])])
            ]));
            r.appendChild(el('div', { class: 'psy-new-view__body' }, [
                el('div', { class: 'psy-new-hint' }, [
                    'Wizyta o ID „' + _visitId + '" nie istnieje. ',
                    el('a', { href: '#/history', onclick: (e) => { e.preventDefault(); window.location.hash = '#/history'; } }, ['Wróć do historii'])
                ])
            ]));
            return r;
        }
        mode = resolveMode(visit.type);
        _typeId = visit.type;
    } else if (opts.isNew) {
        const t = _typeId ? visitTypeById(_typeId) : null;
        mode = resolveMode(t && t.id);
    }

    // Dev override (radio switcher na modebar)
    if (window.__psyVisitFormModeOverride === 'first' ||
        window.__psyVisitFormModeOverride === 'followup') {
        mode = window.__psyVisitFormModeOverride;
    }

    const schema = schemaForMode(mode);
    const initialRaw = Object.assign({}, (visit && visit.data && visit.data._raw) || {});

    // Tytuł / podtytuł
    const typeObj = visitTypeById(_typeId);
    const isNew   = !visit;

    // PR-J14b (2026-05-14, klientka): nowa wizyta = data domyślnie dzisiejsza.
    // User może zmienić ręcznie w polu — to tylko pre-fill. Wstawiamy do
    // initialRaw, żeby renderer pola pokazał dzisiejszą datę od razu i żeby
    // autozapis przy pierwszej innej zmianie zachował tę datę w Store.
    if (isNew && !initialRaw['visitData.data']) {
        const _today = new Date();
        const _y = _today.getFullYear();
        const _m = String(_today.getMonth() + 1).padStart(2, '0');
        const _d = String(_today.getDate()).padStart(2, '0');
        initialRaw['visitData.data'] = `${_y}-${_m}-${_d}`;
    }
    if (isNew) {
        title = '+ Nowa wizyta' + (typeObj ? ' · ' + typeObj.label : '');
    } else {
        title = 'Wizyta · ' + visit.date + (visit.time ? ' ' + visit.time : '') +
                (typeObj ? ' · ' + typeObj.label : '');
    }

    /* ------------------ ROOT (LIVE) ----------------- */
    const root = el('div', {
        class: 'psy-new-view psy-visit-form-view',
        dataset: { live: 'true' }   // app-new pomija pasywny re-render
    });

    /* ------------------ Breadcrumb ------------------ */
    const breadcrumb = el('nav', { class: 'psy-new-breadcrumb' }, [
        el('a', {
            href: '#/history',
            class: 'psy-new-breadcrumb__link',
            onclick: (e) => { e.preventDefault(); window.location.hash = '#/history'; }
        }, ['🗓️ Historia wizyt']),
        el('span', { class: 'psy-new-breadcrumb__sep' }, ['›']),
        el('span', { class: 'psy-new-breadcrumb__current' }, [title])
    ]);

    /* ------------------ Akcje nagłówka --------------
     * PO 2026-05-01: usunięto badge „Robocza"/„Zamknięta" i przyciski
     * zamknij/otwórz. Zostaje: ← Wróć + 🗑 Usuń (zawsze, gdy nie isNew). */
    const backBtn = el('button', {
        class: 'btn btn--secondary',
        onclick: () => { window.location.hash = '#/history'; }
    }, ['← Wróć do listy']);

    const deleteBtn = !isNew ? el('button', {
        class: 'btn btn--danger',
        title: 'Usuń tę wizytę',
        onclick: async () => {
            const ok = await openConfirm({
                title: 'Usunąć wizytę?',
                message: 'Wizyta zostanie trwale usunięta. Operacji nie da się cofnąć.',
                confirmLabel: 'Usuń',
                variant: 'danger'
            });
            if (!ok) return;
            const removed = Store.removeVisit(_visitId);
            if (removed) {
                window.location.hash = '#/history';
            }
        }
    }, ['🗑 Usuń']) : null;

    /* ------------------ Header ---------------------- */
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            breadcrumb,
            el('h1', { class: 'psy-new-view__title' }, [title]),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko +
                ' · tryb: ' + (mode === 'first' ? 'pierwsza wizyta (pełny wywiad)' : 'kolejna wizyta')
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            backBtn,
            deleteBtn
        ].filter(Boolean))
    ]));

    /* ------------------ Mode bar (dev) -------------- */
    const modeBar = el('div', { class: 'psy-vf__modebar' }, [
        el('span', { class: 'psy-new-hint' }, ['Tryb: ']),
        el('label', { class: 'psy-vf__radio psy-vf__radio--inline' }, [
            el('input', {
                type: 'radio', name: '__mode', value: 'first',
                checked: mode === 'first',
                onchange: () => {
                    window.__psyVisitFormModeOverride = 'first';
                    if (window.AppController) window.AppController._renderView(true);
                }
            }),
            el('span', {}, ['Pierwsza wizyta (pełny wywiad)'])
        ]),
        el('label', { class: 'psy-vf__radio psy-vf__radio--inline' }, [
            el('input', {
                type: 'radio', name: '__mode', value: 'followup',
                checked: mode === 'followup',
                onchange: () => {
                    window.__psyVisitFormModeOverride = 'followup';
                    if (window.AppController) window.AppController._renderView(true);
                }
            }),
            el('span', {}, ['Kolejna wizyta'])
        ]),
        el('span', { class: 'psy-new-hint psy-vf__autosave-info' }, [
            schema.length + ' sekcji · 💾 autozapis aktywny'
        ])
    ]);

    /* ------------------ Form body (toolbar) ----------
     * PR-J14 (2026-05-14): zamiast collapsible sections — pasek wszystkich
     * pól po lewej + aktywne pole po prawej. Dot indicator 🟢/⚪ wskazuje
     * wypełnienie. Wszystkie pola spłaszczone do jednej listy z grupowaniem
     * po sekcjach (etap przejściowy — klientka dostarczy hierarchię 1/2).
     */
    const groups = schema.map((section) => {
        const fields = (section.subfields || [])
            .filter((f) => !(f.input && f.input.type === 'header'))
            .map((f) => ({ ...f }));
        // Komentarz sekcji jako wirtualne pole (dawny slot 5 — textarea).
        if (section.sectionComment) {
            fields.push({
                id: '__comment',
                label: 'Komentarz sekcji',
                input: { type: 'textarea' },
                notes: false
            });
        }
        return { id: section.id, title: section.title, fields };
    });

    function _fieldRenderer(field, raw) {
        return renderInputForField(field._groupId, field, raw);
    }

    function _fieldIsFilled(field, raw) {
        const key = field._groupId + '.' + field.id;
        if (!raw) return false;
        const v = raw[key];
        if (v == null) return false;
        if (typeof v === 'string') return v.trim() !== '';
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        return !!v;
    }

    function _fieldNotesValue(field, raw) {
        const key = field._groupId + '.' + field.id + '.__notes';
        return (raw && raw[key]) || '';
    }

    function _showFieldNotes(field) {
        if (!field) return false;
        if (field.notes === false) return false;
        const t = field.input && field.input.type;
        // Pomijamy notes dla typów, które mają własne UI lub są syntetycznymi
        // polami komentarzy (slot 4 byłby duplikatem).
        if (t === 'textarea' || t === 'header' ||
            t === 'link-view' || t === 'uzywki-special') return false;
        if (field.id === '__comment') return false;
        return true;
    }

    // PR-J14b (2026-05-14, klientka): preview wartości pola obok labela
    // na pasku po lewej, mniejszą czcionką. Sprawia że bez klika widać
    // co już jest wpisane (np. „Data wizyty / 2026-05-14").
    function _fieldPreview(field, raw) {
        if (!raw || !field) return '';
        const t = field.input && field.input.type;
        // Pola bez sensownego preview (special-UI, headery, link-out).
        if (t === 'header' || t === 'link-view' || t === 'uzywki-special') {
            return '';
        }
        const key = field._groupId + '.' + field.id;
        const v = raw[key];
        if (v == null) return '';
        if (Array.isArray(v)) {
            if (!v.length) return '';
            if (v.length <= 3) return v.join(', ');
            return v.slice(0, 3).join(', ') + ` … (+${v.length - 3})`;
        }
        if (typeof v === 'boolean') return v ? 'tak' : 'nie';
        const s = String(v).trim();
        if (!s) return '';
        // Skróć długie textarea — pasek ma ograniczoną szerokość, ellipsis
        // doda się w CSS, ale dodatkowo hard-cap żeby DOM nie wybuchł.
        if (s.length > 80) return s.slice(0, 77) + '…';
        return s;
    }

    const toolbar = createFormToolbar({
        groups,
        values: initialRaw,
        fieldRenderer: _fieldRenderer,
        fieldNotesValue: _fieldNotesValue,
        fieldIsFilled: _fieldIsFilled,
        showFieldNotes: _showFieldNotes,
        fieldPreview: _fieldPreview
    });

    root.appendChild(modeBar);
    root.appendChild(toolbar);

    /* ------------------ Autozapis -------------------- */
    let _autosaveTimer = null;

    function ensureVisitExists() {
        if (_visitId) return Store.getVisitById(_visitId);
        // Lazy create — pierwsza zmiana w polu (closed=false legacy)
        const created = Store.addVisit({
            patientId: patient.id,
            type: _typeId || 'followup',
            closed: false,
            data: { _raw: {} }
        });
        _visitId = created.id;
        // Zmień hash bez triggerowania hashchange (re-renderu)
        try {
            history.replaceState(null, '', '#/visit/form/' + _visitId);
        } catch (_) { /* SecurityError fallback */ }
        return created;
    }

    function autosaveNow() {
        const id = _visitId || (ensureVisitExists() && _visitId);
        if (!id) return;
        // KRYTYCZNE (PR-J14b 2026-05-14): toolbar renderuje TYLKO aktywne pole,
        // więc `readRawFormData(toolbar)` daje tylko świeże wartości WIDOCZNYCH
        // pól. Bez merge'a z istniejącym stanem Store, wartości pól nieobecnych
        // w bieżącym DOM zostałyby SKASOWANE (Store.updateVisit nadpisuje
        // `data._raw` w całości). Klientka raport: „jak wypełniam następne to
        // zaznacza się zielona kropka w nowym, a w poprzednim robi się biała".
        //
        // PR-J14c (2026-05-14, klientka 2): pre-fille (np. domyślna data
        // dzisiejsza) muszą być w merge na PIERWSZYM miejscu — inaczej `||`
        // w starym kodzie wracał do `{}` (bo `{}` jest truthy w JS) i pre-fill
        // ginął przy pierwszej zmianie GDZIEKOLWIEK. Łańcuch:
        //   initialRaw (pre-fille) → existing (Store) → fresh (DOM)
        // gwarantuje że nic nie zniknie.
        const fresh = readRawFormData(toolbar);
        const cur = Store.getVisitById(id);
        const existing = (cur && cur.data && cur.data._raw) || {};
        const raw = { ...initialRaw, ...existing, ...fresh };

        const summary = buildSummary(raw);
        const date = raw['visitData.data'] || (visit && visit.date) || undefined;
        const patch = { data: { _raw: raw } };
        if (summary) patch.summary = summary;
        if (date) patch.date = date;
        Store.updateVisit(id, patch);
        // Re-paint kropek + preview na pasku (bez re-renderu treści, focus OK).
        if (typeof toolbar.refreshDots === 'function') toolbar.refreshDots(raw);
    }

    function scheduleAutosave() {
        if (_autosaveTimer) clearTimeout(_autosaveTimer);
        _autosaveTimer = setTimeout(autosaveNow, 400);
    }

    toolbar.addEventListener('input', scheduleAutosave);
    toolbar.addEventListener('change', scheduleAutosave);

    /* ------------------ Auto-grow textarea (PR-J) -----
     * W nowym modelu treść po prawej re-renderuje się przy zmianie aktywnego
     * pola, więc grow-ujemy po initial mount + po każdej zmianie focusu. */
    function _growAllAutoTextareas(scope) {
        (scope || toolbar).querySelectorAll('.psy-vf__textarea--autogrow')
            .forEach(_autoGrowTextarea);
    }
    requestAnimationFrame(() => _growAllAutoTextareas());

    toolbar.addEventListener('input', (ev) => {
        const t = ev.target;
        if (t && t.tagName === 'TEXTAREA' &&
            t.classList && t.classList.contains('psy-vf__textarea--autogrow')) {
            _autoGrowTextarea(t);
        }
    });

    // Re-grow po przełączeniu aktywnego pola (klik w pasku po lewej) —
    // nowe textarea zostają zmountowane, scrollHeight przed layoutem = 0.
    toolbar.addEventListener('click', (ev) => {
        if (!ev.target.closest('.psy-form-toolbar__field')) return;
        requestAnimationFrame(() => _growAllAutoTextareas());
    });

    return root;
}


