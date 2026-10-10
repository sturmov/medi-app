// ============================================================================
// view-visit-form.js — formularz wizyty (pasek pól + dziennik akapitów).
//
// STAN FORMULARZA (jedno źródło prawdy, w pamięci):
//   raw   — płaska mapa wartości pól (`sekcja.pole`), patrz `_visit-describe.js`
//   data  — { meds, diagnoses, tests, docs }: leki, rozpoznania, wyniki testów
//           i załączniki TEJ wizyty
//
//   Każde zdarzenie `input`/`change` NATYCHMIAST przenosi wartości z kontrolek
//   edytowanego akapitu do `raw`. Zapis do Store jest opóźniony (400 ms), ale
//   ekran zawsze rysuje się z `raw`, więc przełączenie pola / kliknięcie obok
//   nie może zgubić wpisu. Wyjście z widoku i zamknięcie karty wymuszają zapis.
//
// LAZY CREATE: `#/visit/form/new/:typeId` nie tworzy rekordu. Wizyta powstaje
//   przy pierwszej zmianie, a adres zmienia się na `#/visit/form/:visitId`.
//
// TRYB: „1sze spotkanie" = pełny wywiad, pozostałe typy = formularz skrócony
//   (wynika wyłącznie z typu wizyty).
// ============================================================================

import { Store } from './_store.js';
import { schemaForMode } from './_visit-form-schema.js';
import { visitTypeById } from './_fake-data.js';
import { VISIT_DICT } from './_visit-dict.js';
import { searchIcd10, findIcd10ByCode } from './_icd10-dict.js';
import { searchMeds } from './_meds-dict.js';
import { openConfirm } from './_modal.js';
import { createFormToolbar } from './_form-toolbar.js';
import { el, toast } from './_dom.js';
import { patchAppointment, unlinkVisitFromAppointment } from './_calendar-api.js';
import { listAvailableTests } from './_tests-catalog.js';
import { attachmentsAvailable, uploadAttachments, removeAttachment, openAttachment } from './_attachments.js';
import { iconForFile, formatSize } from './_documents-store.js';
import {
    visitMode, fieldKey, isBlank, listOf,
    isFieldFilled, fieldText, uzywkiEntries,
    medDoseText, diagnosisText, visitSummary
} from './_visit-describe.js';

const DEFAULT_VISIT_TYPE = 'next_meeting';

function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function clone(v) { return JSON.parse(JSON.stringify(v || [])); }

/* ==========================================================================
   Odczyt kontrolek → wartości (`name` kontrolki = klucz w `raw`)
   ========================================================================== */
function readControls(scope) {
    const out = {};
    scope.querySelectorAll('input[name], select[name], textarea[name]').forEach((node) => {
        const name = node.name;
        if (node.type === 'checkbox') {
            if (name.endsWith('[]')) {
                const k = name.slice(0, -2);
                if (!Array.isArray(out[k])) out[k] = [];
                if (node.checked) out[k].push(node.value);
            } else {
                out[name] = !!node.checked;
            }
        } else if (node.type === 'radio') {
            if (node.checked) out[name] = node.value;
            else if (!(name in out)) out[name] = '';
        } else {
            out[name] = node.value;
        }
    });
    return out;
}

/* ==========================================================================
   Kontrolki edycji — proste typy
   ========================================================================== */
function editInput(type, name, value, opts = {}) {
    return el('input', {
        type, name,
        class: 'psy-vf__input',
        value: value == null ? '' : String(value),
        readonly: !!opts.readonly,
        placeholder: opts.placeholder || null,
        step: type === 'number' ? 'any' : null
    });
}

function editTextarea(name, value, opts = {}) {
    const ta = el('textarea', {
        class: 'psy-vf__textarea psy-vf__textarea--autogrow' + (opts.compact ? ' psy-vf__textarea--compact' : ''),
        name,
        rows: opts.rows || 3,
        placeholder: opts.placeholder || null
    });
    ta.value = value == null ? '' : String(value);
    return ta;
}

function editSelect(name, options, value) {
    const nodes = [el('option', { value: '' }, ['— wybierz —'])];
    for (const o of options) nodes.push(el('option', { value: o, selected: o === value }, [o]));
    return el('select', { name, class: 'psy-vf__select' }, nodes);
}

/** Radio z możliwością odznaczenia (ponowny klik w zaznaczoną opcję czyści wybór). */
function editRadio(name, options, value) {
    const group = el('div', { class: 'psy-vf__radio-group' });
    options.forEach((o, i) => {
        const id = name.replace(/\W+/g, '_') + '_r' + i;
        const input = el('input', { type: 'radio', id, name, value: o, checked: o === value });
        input.dataset.was = o === value ? '1' : '0';
        input.addEventListener('click', () => {
            if (input.dataset.was === '1') {
                input.checked = false;
                input.dataset.was = '0';
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                group.querySelectorAll('input[type="radio"]').forEach((r) => {
                    r.dataset.was = r === input ? '1' : '0';
                });
            }
        });
        group.appendChild(el('label', { class: 'psy-vf__radio', for: id }, [input, el('span', {}, [o])]));
    });
    return group;
}

function editCheckboxes(name, options, value) {
    const selected = new Set(listOf(value));
    const group = el('div', { class: 'psy-vf__checkbox-group' });
    options.forEach((o, i) => {
        const id = name.replace(/\W+/g, '_') + '_c' + i;
        group.appendChild(el('label', { class: 'psy-vf__checkbox', for: id }, [
            el('input', { type: 'checkbox', id, name: name + '[]', value: o, checked: selected.has(o) }),
            el('span', {}, [o])
        ]));
    });
    return group;
}

/* ==========================================================================
   Autocomplete (wspólny dla ICD-10 i leków)
   - `transient`: kontrolka pomocnicza, jej wpisywanie nie jest zmianą notatki.
   ========================================================================== */
function attachAutocomplete(host, input, { search, itemParts, onPick, onFreeText }) {
    let matches = [];
    let activeIdx = -1;
    let popover = null;
    input.dataset.transient = '1';

    function close() {
        if (popover) popover.remove();
        popover = null;
        activeIdx = -1;
    }
    function render() {
        close();
        if (!matches.length) return;
        popover = el('div', { class: 'psy-autocomplete__popover' });
        matches.forEach((m, i) => {
            const [code, desc] = itemParts(m);
            popover.appendChild(el('div', {
                class: 'psy-autocomplete__item' + (i === activeIdx ? ' psy-autocomplete__item--active' : ''),
                // mousedown + preventDefault: wybór bez utraty fokusu pola
                onmousedown: (ev) => { ev.preventDefault(); pick(m); }
            }, [
                el('span', { class: 'psy-autocomplete__code' }, [code]),
                el('span', { class: 'psy-autocomplete__desc' }, [desc])
            ]));
        });
        host.appendChild(popover);
        // Lista podpowiedzi wystaje poza akapit — notatka przewija się tak, żeby było ją widać całą.
        try { popover.scrollIntoView({ block: 'nearest' }); } catch (_) { /* */ }
    }
    function pick(m) {
        input.value = '';
        matches = [];
        close();
        onPick(m);
    }
    function refresh() {
        const q = input.value.trim();
        matches = q ? search(q) : [];
        activeIdx = -1;
        render();
    }

    input.addEventListener('input', refresh);
    input.addEventListener('focus', () => { if (input.value.trim()) refresh(); });
    input.addEventListener('blur', () => setTimeout(close, 150));
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            if (!matches.length) matches = search(input.value.trim());
            activeIdx = Math.min(activeIdx + 1, matches.length - 1);
            render();
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            activeIdx = Math.max(activeIdx - 1, -1);
            render();
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            if (activeIdx >= 0 && matches[activeIdx]) pick(matches[activeIdx]);
            else if (matches.length === 1) pick(matches[0]);
            else if (input.value.trim() && onFreeText) {
                const text = input.value.trim();
                input.value = '';
                matches = [];
                close();
                onFreeText(text);
            }
        } else if (ev.key === 'Escape' && popover) {
            ev.stopPropagation();          // Esc zamyka listę, nie cały akapit
            close();
        }
    });
}

/* ==========================================================================
   Hipoteza diagnostyczna — tagi ICD-10 (wartość: kody rozdzielone przecinkiem)
   ========================================================================== */
function editIcd10Tags(name, value) {
    const codes = listOf(value).map((c) => String(c).toUpperCase());
    const wrap = el('div', { class: 'psy-vf__tag-icd10 psy-autocomplete' });
    const tagsBox = el('div', { class: 'psy-vf__tag-icd10__tags' });
    const hidden = el('input', { type: 'hidden', name, value: codes.join(',') });
    const input = el('input', {
        type: 'text',
        class: 'psy-vf__input psy-vf__tag-icd10__input',
        placeholder: 'wpisz kod lub fragment opisu (np. F32…)',
        autocomplete: 'off'
    });

    function commit() {
        hidden.value = codes.join(',');
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        renderTags();
    }
    function renderTags() {
        tagsBox.innerHTML = '';
        codes.forEach((code, i) => {
            const hit = findIcd10ByCode(code);
            tagsBox.appendChild(el('span', { class: 'psy-vf__tag-icd10__chip' }, [
                el('span', { class: 'psy-vf__tag-icd10__chip-code' }, [code]),
                hit ? el('span', { class: 'psy-vf__tag-icd10__chip-desc' }, [hit.description]) : null,
                el('button', {
                    type: 'button',
                    class: 'psy-vf__tag-icd10__chip-remove',
                    'aria-label': 'Usuń ' + code,
                    onclick: () => { codes.splice(i, 1); commit(); input.focus(); }
                }, ['✕'])
            ]));
        });
        tagsBox.style.display = codes.length ? '' : 'none';
    }
    function add(code) {
        const c = String(code || '').trim().toUpperCase();
        if (!c || codes.includes(c)) return;
        codes.push(c);
        commit();
    }

    attachAutocomplete(wrap, input, {
        search: (q) => searchIcd10(q, 8),
        itemParts: (m) => [m.code, m.description],
        onPick: (m) => { add(m.code); input.focus(); },
        onFreeText: (text) => add(text)
    });
    input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Backspace' && !input.value && codes.length) { codes.pop(); commit(); }
    });

    renderTags();
    wrap.appendChild(tagsBox);
    wrap.appendChild(input);
    wrap.appendChild(hidden);
    return wrap;
}

/* ==========================================================================
   Używki — 11 pozycji: zaznaczenie + intensywność + uwagi
   ========================================================================== */
function editUzywki(sectionId, raw) {
    const wrap = el('div', { class: 'psy-vf__uzywki' });
    (VISIT_DICT.UZYWKI_11 || []).forEach((label, idx) => {
        const base = sectionId + '_u_' + idx;
        const c = raw[base];
        const checked = c === true || c === '1' || c === 1 || c === 'true';
        const note = editTextarea(base + '_n', raw[base + '_n'] || '', { compact: true, rows: 1, placeholder: 'uwagi…' });
        wrap.appendChild(el('div', {
            class: 'psy-vf__uzywki-row' + (checked ? ' psy-vf__uzywki-row--checked' : '')
        }, [
            el('label', { class: 'psy-vf__checkbox' }, [
                el('input', { type: 'checkbox', name: base, value: '1', checked }),
                el('span', {}, [label])
            ]),
            el('div', { class: 'psy-vf__uzywki-detail' }, [
                editSelect(base + '_i', VISIT_DICT.INTENSYWNOSC_UZYWEK || [], raw[base + '_i'] || ''),
                note
            ])
        ]));
    });
    wrap.addEventListener('change', (ev) => {
        if (ev.target.type !== 'checkbox') return;
        const row = ev.target.closest('.psy-vf__uzywki-row');
        if (row) row.classList.toggle('psy-vf__uzywki-row--checked', ev.target.checked);
    });
    return wrap;
}

/* ==========================================================================
   Sekcja „w jednym oknie" (Dane wizyty, Parametry somatyczne)
   ========================================================================== */
function editGrid(section, raw) {
    const wrap = el('div', { class: 'psy-vf__compact-grid', dataset: { section: section.id } });
    for (const sf of (section.subfields || [])) {
        const control = editControl(section.id, sf, raw);
        const unit = sf.input && sf.input.unit;
        wrap.appendChild(el('div', {
            class: 'psy-vf__compact-grid-cell' + (sf.fullWidth ? ' psy-vf__compact-grid-cell--full' : '')
        }, [
            el('div', { class: 'psy-vf__compact-grid-label' }, [sf.label + (sf.required ? ' *' : '')]),
            unit
                ? el('div', { class: 'psy-vf__compact-grid-input-row' }, [
                    control, el('span', { class: 'psy-vf__compact-grid-unit' }, [unit])
                ])
                : el('div', { class: 'psy-vf__compact-grid-input' }, [control])
        ]));
    }

    if (section.id === 'parametry') {
        const q = (id) => wrap.querySelector('input[name="parametry.' + id + '"]');
        // Listener na `wrap` odpala się przed listenerem formularza (bąbelkowanie),
        // więc przeliczone BMI trafia do stanu razem ze wzrostem / wagą.
        wrap.addEventListener('input', (ev) => {
            const n = ev.target && ev.target.name;
            if (n !== 'parametry.wzrost' && n !== 'parametry.masa') return;
            const cm = parseFloat(String(q('wzrost').value).replace(',', '.'));
            const kg = parseFloat(String(q('masa').value).replace(',', '.'));
            q('bmi').value = (cm > 0 && kg > 0) ? (kg / Math.pow(cm / 100, 2)).toFixed(1) : '';
        });
    }
    return wrap;
}

/* ==========================================================================
   Rozpoznania tej wizyty (ICD-10: jedno pole „kod — opis")
   ========================================================================== */
function editDiagnoses(ctx) {
    const wrap = el('div', { class: 'psy-vf__inline-diagnoses' });
    const list = el('div', { class: 'psy-vf__inline-diagnoses__list' });
    const addBox = el('div', { class: 'psy-vf__inline-diagnoses__add psy-autocomplete' });
    const input = el('input', {
        type: 'text',
        class: 'psy-vf__input',
        placeholder: 'Dodaj rozpoznanie — kod ICD-10 lub fragment opisu…',
        autocomplete: 'off'
    });

    function renderList() {
        list.innerHTML = '';
        const items = ctx.data.diagnoses;
        if (!items.length) {
            list.appendChild(el('div', { class: 'psy-vf__inline-diagnoses__empty' },
                ['Brak rozpoznań w tej wizycie.']));
        }
        items.forEach((d, i) => {
            list.appendChild(el('div', { class: 'psy-vf__inline-diagnoses__chip' }, [
                el('span', { class: 'psy-vf__inline-diagnoses__chip-code' }, [d.code || '?']),
                el('span', { class: 'psy-vf__inline-diagnoses__chip-desc' }, [d.description || '(kod spoza słownika)']),
                el('button', {
                    type: 'button',
                    class: 'psy-vf__inline-diagnoses__chip-remove',
                    title: 'Usuń rozpoznanie',
                    onclick: () => { items.splice(i, 1); ctx.changed(); renderList(); }
                }, ['✕'])
            ]));
        });
    }
    function add(code, description) {
        const c = String(code || '').trim().toUpperCase();
        if (!c || ctx.data.diagnoses.some((d) => d.code === c)) return;
        ctx.data.diagnoses.push({ code: c, description: description || '' });
        ctx.changed();
        renderList();
    }

    attachAutocomplete(addBox, input, {
        search: (q) => searchIcd10(q, 8),
        itemParts: (m) => [m.code, m.description],
        onPick: (m) => { add(m.code, m.description); input.focus(); },
        onFreeText: (text) => {
            const hit = findIcd10ByCode(text.toUpperCase());
            add(text, hit ? hit.description : '');
        }
    });

    renderList();
    addBox.appendChild(input);
    wrap.appendChild(list);
    wrap.appendChild(addBox);
    return wrap;
}

/* ==========================================================================
   Leki tej wizyty
   - nazwa handlowa (sama, bez nawiasu), substancja i grupa ze słownika,
   - aktualna dawka = liczba, jednostka taka jak w dawce maksymalnej,
   - dawka maksymalna tylko do odczytu.
   ========================================================================== */

/** „200 mg/d" → „mg/d";  „wg litemii; zwykle 1200–1500 mg/d*" → „mg/d". */
export function unitFromMaxDose(maxDose) {
    const m = String(maxDose || '').match(/\d[\d.,–-]*\s*([a-zA-Zµ]+(?:\/[a-zA-Z]+)*)\*?\s*$/);
    return m ? m[1] : '';
}

function editMeds(ctx) {
    const wrap = el('div', { class: 'psy-vf__inline-meds' });
    const list = el('div', { class: 'psy-vf__inline-meds__list' });
    const addBox = el('div', { class: 'psy-vf__inline-meds__add psy-autocomplete' });
    const input = el('input', {
        type: 'text',
        class: 'psy-vf__input',
        placeholder: 'Dodaj lek — nazwa handlowa lub substancja…',
        autocomplete: 'off'
    });

    function renderList(focusIdx = -1) {
        list.innerHTML = '';
        const items = ctx.data.meds;
        if (!items.length) {
            list.appendChild(el('div', { class: 'psy-vf__inline-meds__empty' }, ['Brak leków w tej wizycie.']));
        }
        items.forEach((m, i) => {
            const dose = el('input', {
                type: 'number',
                class: 'psy-vf__input psy-vf__inline-meds__dose-input',
                value: isBlank(m.dose) ? '' : String(m.dose),
                step: 'any', min: '0',
                placeholder: 'dawka',
                'aria-label': 'Aktualna dawka — ' + (m.name || ''),
                dataset: { transient: '1' },
                oninput: (ev) => { m.dose = ev.target.value.trim(); ctx.changed(); }
            });
            // Lek spoza słownika nie ma dawki maksymalnej — jednostkę wpisuje się ręcznie.
            const unit = m.maxDose
                ? (m.unit ? el('span', { class: 'psy-vf__inline-meds__unit' }, [m.unit]) : null)
                : el('input', {
                    type: 'text',
                    class: 'psy-vf__input psy-vf__inline-meds__dose-input',
                    value: m.unit || '',
                    placeholder: 'jedn.',
                    'aria-label': 'Jednostka dawki',
                    dataset: { transient: '1' },
                    oninput: (ev) => { m.unit = ev.target.value.trim(); ctx.changed(); }
                });
            list.appendChild(el('div', { class: 'psy-vf__inline-meds__row' }, [
                el('div', { class: 'psy-vf__inline-meds__name', title: m.group || null }, [
                    el('strong', {}, [m.name || '(bez nazwy)']),
                    m.substance ? el('span', { class: 'psy-vf__inline-meds__substance' }, [' · ' + m.substance]) : null
                ]),
                el('div', { class: 'psy-vf__inline-meds__dose' }, [el('label', {}, ['Aktualna:']), dose, unit]),
                el('div', { class: 'psy-vf__inline-meds__maxdose', title: 'Dawka maksymalna (z bazy leków)' }, [
                    el('label', {}, ['Max:']),
                    el('span', { class: 'psy-vf__inline-meds__maxdose-value' }, [m.maxDose || '—'])
                ]),
                el('button', {
                    type: 'button',
                    class: 'psy-vf__inline-meds__remove',
                    title: 'Usuń lek',
                    onclick: () => { items.splice(i, 1); ctx.changed(); renderList(); }
                }, ['✕'])
            ]));
            if (i === focusIdx) setTimeout(() => { try { dose.focus(); } catch (_) { /* */ } }, 0);
        });
    }
    function add(med) {
        if (ctx.data.meds.some((x) => x.name === med.name)) return;
        ctx.data.meds.push(med);
        ctx.changed();
        renderList(ctx.data.meds.length - 1);   // kursor od razu w polu dawki
    }

    attachAutocomplete(addBox, input, {
        search: (q) => searchMeds(q, 8),
        itemParts: (m) => [m.name, m.substance + ' · max ' + m.maxDose],
        onPick: (m) => add({
            name: m.name,
            substance: m.substance || '',
            group: m.group || '',
            dose: '',
            unit: unitFromMaxDose(m.maxDose),
            maxDose: m.maxDose || ''
        }),
        onFreeText: (text) => add({ name: text, substance: '', group: '', dose: '', unit: 'mg/d', maxDose: '' })
    });

    renderList();
    addBox.appendChild(input);
    wrap.appendChild(list);
    wrap.appendChild(addBox);
    return wrap;
}

/* ==========================================================================
   Testy tej wizyty
   - wynik powstaje w osobnym widoku testu (pełny ekran, pacjent może wypełniać
     sam) i wraca tutaj jako część wizyty,
   - zakładka „Testy" w menu to wyciąg tych wyników ze wszystkich wizyt.
   ========================================================================== */
function editTests(ctx) {
    const wrap = el('div', { class: 'psy-vf__inline-tests' });
    const list = el('div', { class: 'psy-vf__inline-list' });

    function renderList() {
        list.innerHTML = '';
        const items = ctx.data.tests;
        if (!items.length) {
            list.appendChild(el('div', { class: 'psy-vf__inline-meds__empty' }, ['Brak testów w tej wizycie.']));
        }
        items.forEach((t) => {
            list.appendChild(el('div', { class: 'psy-vf__inline-list__row' }, [
                el('strong', { class: 'psy-vf__inline-list__main' }, [t.code || 'test']),
                el('span', { class: 'psy-vf__inline-list__value' }, ['wynik ' + (isBlank(t.score) ? '?' : t.score)]),
                el('span', { class: 'psy-vf__inline-list__rest' }, [(t.redFlag ? '🚨 ' : '') + (t.interpretation || '')]),
                el('button', {
                    type: 'button',
                    class: 'psy-vf__inline-meds__remove',
                    title: 'Usuń wynik',
                    onclick: async () => {
                        const ok = await openConfirm({
                            title: 'Usunąć wynik testu?',
                            message: 'Wynik testu „' + (t.code || '') + '" zostanie usunięty z tej wizyty.',
                            confirmLabel: 'Usuń',
                            variant: 'danger'
                        });
                        if (!ok) return;
                        const at = items.indexOf(t);
                        if (at >= 0) items.splice(at, 1);
                        ctx.changed();
                        renderList();
                    }
                }, ['✕'])
            ]));
        });
    }

    const run = el('div', { class: 'psy-vf__inline-run' }, [
        el('span', { class: 'psy-vf__inline-run__label' }, ['Uruchom test:'])
    ]);
    for (const t of listAvailableTests()) {
        run.appendChild(el('button', {
            type: 'button',
            class: 'btn btn--secondary btn--sm',
            dataset: { testCode: t.code },
            title: t.name + ' · ' + t.questions + ' pytań',
            onclick: () => {
                // Test otwiera się w osobnym widoku — wizyta musi już istnieć, żeby wynik miał dokąd wrócić.
                const visitId = ctx.ensureVisit();
                if (!visitId) return;
                window.location.hash = '#/tests/run/' + encodeURIComponent(t.code) + '?visit=' + encodeURIComponent(visitId);
            }
        }, [t.code]));
    }

    renderList();
    wrap.appendChild(list);
    wrap.appendChild(run);
    return wrap;
}

/* ==========================================================================
   Dokumenty tej wizyty (skierowania, wyniki badań, skany)
   - plik trafia do folderu `dokumenty/` pacjenta; wizyta pamięta, że jest jej,
   - usunięcie z wizyty usuwa plik z magazynu (na Dysku Google: do Kosza).
   ========================================================================== */
function editDocs(ctx) {
    const wrap = el('div', { class: 'psy-vf__inline-docs' });
    const list = el('div', { class: 'psy-vf__inline-list' });
    const status = el('div', { class: 'psy-new-hint psy-vf__inline-docs__status' });

    function renderList() {
        list.innerHTML = '';
        const items = ctx.data.docs;
        if (!items.length) {
            list.appendChild(el('div', { class: 'psy-vf__inline-meds__empty' }, ['Brak dokumentów w tej wizycie.']));
        }
        items.forEach((d) => {
            list.appendChild(el('div', { class: 'psy-vf__inline-list__row' }, [
                el('span', { 'aria-hidden': 'true' }, [iconForFile(d.name || '')]),
                el('a', {
                    href: '#',
                    class: 'psy-vf__inline-list__main psy-vf__inline-docs__link',
                    title: 'Otwórz plik',
                    onclick: (ev) => { ev.preventDefault(); openAttachment(ctx.patientId, d); }
                }, [d.name || '(plik bez nazwy)']),
                el('span', { class: 'psy-vf__inline-list__rest' }, [d.size ? formatSize(d.size) : '']),
                el('button', {
                    type: 'button',
                    class: 'psy-vf__inline-meds__remove',
                    title: 'Usuń plik',
                    onclick: async () => {
                        const ok = await openConfirm({
                            title: 'Usunąć plik?',
                            message: 'Plik „' + (d.name || '') + '" zostanie usunięty z tej wizyty i z folderu pacjenta.',
                            confirmLabel: 'Usuń',
                            variant: 'danger'
                        });
                        if (!ok) return;
                        try {
                            await removeAttachment(ctx.patientId, d);
                        } catch (e) {
                            // Plik zostaje w folderze — w „Dokumentach" będzie widoczny jako „bez wizyty".
                            toast('warning', 'Pliku nie udało się usunąć z magazynu', String(e && e.message || e));
                        }
                        const at = items.indexOf(d);
                        if (at >= 0) items.splice(at, 1);
                        ctx.changed();
                        ctx.ensureVisit();      // pliku już nie ma — wizyta od razu przestaje go wskazywać
                        renderList();
                        ctx.redraw();
                    }
                }, ['✕'])
            ]));
        });
    }

    async function add(files) {
        if (!files.length) return;
        status.textContent = '⏳ Wgrywanie' + (files.length === 1 ? ': ' + files[0].name : ' plików: ' + files.length) + '…';
        const { added, failed } = await uploadAttachments(ctx.patientId, files);
        status.textContent = failed.length ? '⚠ Nie udało się wgrać: ' + failed.join(', ') : '';
        if (added.length) {
            ctx.data.docs.push(...added);
            ctx.changed();
            ctx.ensureVisit();      // plik już leży w magazynie — wizyta od razu zapisuje, że jest jej
        }
        renderList();
        ctx.redraw();       // akapit mógł zostać zamknięty, zanim wgrywanie się skończyło
    }

    renderList();
    wrap.appendChild(list);

    if (!attachmentsAvailable()) {
        wrap.appendChild(el('div', { class: 'psy-new-hint' }, [
            'Załączniki wymagają podłączonego magazynu (Dysk Google albo folder na komputerze) — '
            + 'w trybie demo nie ma gdzie przechowywać plików.'
        ]));
        return wrap;
    }

    // `transient`: wybór pliku nie jest jeszcze zmianą notatki (staje się nią po wgraniu).
    const fileInput = el('input', {
        type: 'file', multiple: true, style: { display: 'none' }, dataset: { transient: '1' },
        onchange: (ev) => {
            const files = Array.from(ev.target.files || []);
            ev.target.value = '';
            add(files);
        }
    });
    wrap.appendChild(el('div', { class: 'psy-vf__inline-run' }, [
        el('button', {
            type: 'button', class: 'btn btn--secondary btn--sm', dataset: { action: 'attach' },
            onclick: () => fileInput.click()
        }, ['📎 Dodaj plik']),
        el('span', { class: 'psy-new-hint' }, ['albo przeciągnij plik tutaj · PDF, zdjęcia, DOCX…']),
        fileInput
    ]));
    wrap.appendChild(status);

    wrap.addEventListener('dragover', (ev) => { ev.preventDefault(); wrap.classList.add('psy-vf__inline-docs--dragover'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('psy-vf__inline-docs--dragover'));
    wrap.addEventListener('drop', (ev) => {
        ev.preventDefault();
        wrap.classList.remove('psy-vf__inline-docs--dragover');
        add(Array.from((ev.dataTransfer && ev.dataTransfer.files) || []));
    });
    return wrap;
}

/* ==========================================================================
   Kontrolka wg typu pola
   ========================================================================== */
function editControl(sectionId, field, raw, ctx) {
    const name = fieldKey(sectionId, field.id);
    const input = field.input || { type: 'textarea' };
    const value = raw[name];
    switch (input.type) {
        case 'text':            return editInput('text', name, value);
        case 'number':          return editInput('number', name, value, { readonly: input.readonly });
        case 'date':            return editInput('date', name, value);
        case 'textarea':        return editTextarea(name, value);
        case 'select':          return editSelect(name, input.options || [], value || '');
        case 'radio':           return editRadio(name, input.options || [], value || '');
        case 'checkbox-group':
        case 'multi-select':    return editCheckboxes(name, input.options || [], value);
        case 'tag-input-icd10': return editIcd10Tags(name, value);
        case 'uzywki-special':  return editUzywki(sectionId, raw);
        case 'inline-diagnoses': return editDiagnoses(ctx);
        case 'inline-meds':     return editMeds(ctx);
        case 'inline-tests':    return editTests(ctx);
        case 'inline-docs':     return editDocs(ctx);
        default:
            return el('div', { class: 'psy-new-hint' }, ['(nieobsługiwany typ pola: ' + input.type + ')']);
    }
}

/* ==========================================================================
   Tryb odczytu — „gotowa notatka" (same wybrane wartości / tekst)
   ========================================================================== */
function readText(text) {
    const div = el('div', { class: 'psy-form-toolbar__entry-text' }, [text]);
    div.style.whiteSpace = 'pre-wrap';
    return div;
}

function readEmpty() {
    return el('div', { class: 'psy-form-toolbar__entry-empty' }, ['(puste — kliknij, aby uzupełnić)']);
}

function readLines(lines) {
    return el('div', { class: 'psy-form-toolbar__entry-text' },
        lines.map((parts) => el('div', {}, parts)));
}

function readField(sectionId, field, raw, data, ctx) {
    const type = (field.input && field.input.type) || 'textarea';

    if (type === 'inline-tests') {
        if (!data.tests.length) return readEmpty();
        return readLines(data.tests.map((t) => [
            el('strong', {}, [t.code || 'test']),
            ' — wynik ' + (isBlank(t.score) ? '?' : t.score),
            t.interpretation ? el('span', { class: 'psy-new-hint' }, [' · ' + (t.redFlag ? '🚨 ' : '') + t.interpretation]) : null
        ]));
    }
    if (type === 'inline-docs') {
        if (!data.docs.length) return readEmpty();
        // Link w treści działa normalnie (nie przełącza akapitu w edycję) — otwiera plik.
        return readLines(data.docs.map((d) => [
            iconForFile(d.name || '') + ' ',
            el('a', {
                href: '#',
                class: 'psy-vf__inline-docs__link',
                title: 'Otwórz plik',
                onclick: (ev) => { ev.preventDefault(); openAttachment(ctx.patientId, d); }
            }, [d.name || '(plik bez nazwy)']),
            d.size ? el('span', { class: 'psy-new-hint' }, [' · ' + formatSize(d.size)]) : null
        ]));
    }

    if (type === 'inline-diagnoses') {
        if (!data.diagnoses.length) return readEmpty();
        return readLines(data.diagnoses.map((d) => [
            el('strong', { style: { fontFamily: 'monospace' } }, [d.code || '?']),
            d.description ? ' — ' + d.description : ''
        ]));
    }
    if (type === 'inline-meds') {
        if (!data.meds.length) return readEmpty();
        return readLines(data.meds.map((m) => {
            const dose = medDoseText(m);
            return [
                el('strong', {}, [m.name || '(bez nazwy)']),
                m.substance ? ' (' + m.substance + ')' : '',
                dose ? ' — ' + dose : '',
                m.maxDose ? el('span', { class: 'psy-new-hint' }, [' · max ' + m.maxDose]) : null
            ];
        }));
    }
    if (type === 'uzywki-special') {
        const entries = uzywkiEntries(sectionId, raw);
        if (!entries.length) return readEmpty();
        return readLines(entries.map((u) => [
            el('strong', {}, [u.label.split(':')[0]]),
            u.intensity ? ' — ' + u.intensity : '',
            u.notes ? el('span', { class: 'psy-new-hint' }, [' · ' + u.notes]) : null
        ]));
    }
    if (type === 'multi-select' || type === 'checkbox-group') {
        const items = listOf(raw[fieldKey(sectionId, field.id)]);
        if (!items.length) return readEmpty();
        return el('div', { class: 'psy-form-toolbar__entry-tags' },
            items.map((item) => el('span', { class: 'psy-form-toolbar__entry-tag' }, [item])));
    }
    if (type === 'tag-input-icd10') {
        const codes = listOf(raw[fieldKey(sectionId, field.id)]);
        if (!codes.length) return readEmpty();
        return readLines(codes.map((code) => {
            const hit = findIcd10ByCode(String(code).toUpperCase());
            return [diagnosisText({ code: String(code).toUpperCase(), description: hit ? hit.description : '' })];
        }));
    }
    const text = fieldText(sectionId, field, raw, data);
    return text ? readText(text) : readEmpty();
}

/** Sekcja „w jednym oknie" w odczycie: pary „etykieta: wartość" jedna za drugą, w linii. */
function readGrid(section, raw, data) {
    const pairs = [];
    for (const sf of (section.subfields || [])) {
        const text = fieldText(section.id, sf, raw, data);
        if (!text) continue;
        pairs.push(el('span', { class: 'psy-vf__read-pair' }, [
            el('span', { class: 'psy-vf__read-pair-label' }, [sf.label.replace(/\s*\(auto\)$/, '') + ': ']),
            el('span', { class: 'psy-vf__read-pair-value' }, [text])
        ]));
    }
    return pairs.length ? el('div', { class: 'psy-vf__read-pairs' }, pairs) : readEmpty();
}

/* ==========================================================================
   Widoki pomocnicze
   ========================================================================== */
function messageView(title, children) {
    return el('div', { class: 'psy-new-view' }, [
        el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, [title])])
        ]),
        el('div', { class: 'psy-new-view__body' }, [el('div', { class: 'psy-new-hint' }, children)])
    ]);
}

/* ==========================================================================
   GŁÓWNY EXPORT
   @param {object} opts — { isNew?, typeId?, visitId?,
                            date?, time?, eventId?, paid?,   ← gdy notatka powstaje z terminu w kalendarzu
                            focus? }                         ← akapit do pokazania (`sekcja::pole`)
   ========================================================================== */
export function renderVisitForm(opts = {}) {
    const patient = Store.state.currentPatient;
    if (!patient) return messageView('Formularz wizyty', ['Wybierz pacjenta, aby rozpocząć wizytę.']);

    let visitId = opts.visitId || null;
    const visit = visitId ? Store.getVisitById(visitId) : null;
    if (visitId && (!visit || visit.patientId !== patient.id)) {
        return messageView('Wizyta — nie znaleziono', [
            'Ta wizyta nie istnieje u wybranego pacjenta. ',
            el('a', { href: '#/history' }, ['Wróć do historii wizyt'])
        ]);
    }

    const typeId = visit ? visit.type : (visitTypeById(opts.typeId) ? opts.typeId : DEFAULT_VISIT_TYPE);
    const typeObj = visitTypeById(typeId);
    const mode = visitMode(typeId);
    const schema = schemaForMode(mode);

    /* ---------------- stan formularza (jedno źródło prawdy) ---------------- */
    const raw = Object.assign({}, (visit && visit.data && visit.data._raw) || {});
    const data = {
        meds: clone(visit && visit.data && visit.data.meds),
        diagnoses: clone(visit && visit.data && visit.data.diagnoses),
        tests: clone(visit && visit.data && visit.data.tests),
        docs: clone(visit && visit.data && visit.data.docs)
    };
    // Nowa wizyta: data domyślnie dzisiejsza (zapisze się przy pierwszej zmianie).
    if (!visit && isBlank(raw['visitData.data'])) raw['visitData.data'] = opts.date || todayISO();

    let dirty = false;
    let deleted = false;
    let saveTimer = null;

    /* ---------------- pola paska ---------------- */
    // Słowa, po których „Szukaj tematu…" znajduje pole, choć nie ma ich w jego nazwie
    // ani na liście opcji (tę listę wyszukiwarka czyta sama z `input.options`).
    const keywordsFor = (field) => {
        const type = field.input && field.input.type;
        if (type === 'uzywki-special') return VISIT_DICT.UZYWKI_11 || [];
        if (type === 'inline-tests') return listAvailableTests().flatMap((t) => [t.code, t.name]);
        return null;
    };

    const groups = schema.map((section) => {
        if (section.compactGrid) {
            return {
                id: section.id, title: section.title,
                fields: [{
                    id: '__grid', label: section.title, input: { type: 'compact-grid' }, section, notes: false,
                    // jedno okno = kilka pól: szukamy po nazwach i opcjach każdego z nich
                    keywords: (section.subfields || []).flatMap((sf) => [sf.label, ...((sf.input && sf.input.options) || [])])
                }]
            };
        }
        const fields = (section.subfields || []).filter((f) => !(f.input && f.input.type === 'header'));
        const out = fields.map((f) => {
            const keywords = keywordsFor(f);
            return keywords ? { ...f, keywords } : f;
        });
        if (section.sectionComment) {
            out.push({
                id: '__comment',
                // Sekcja bez własnych pól = jeden opis pod nazwą sekcji.
                label: fields.length ? 'Komentarz sekcji' : section.title,
                input: { type: 'textarea' },
                notes: false
            });
        }
        return { id: section.id, title: section.title, fields: out };
    });

    const ctx = {
        data,
        patientId: patient.id,
        changed: () => markDirty(),
        redraw: () => toolbar.redraw(),
        /** Zapisuje wizytę od razu, bez czekania 400 ms (także jeszcze pustą) i zwraca jej identyfikator. */
        ensureVisit: () => { dirty = true; persist(); return visitId; }
    };

    function gridFilled(section) {
        return (section.subfields || []).some((sf) => isFieldFilled(section.id, sf, raw, data));
    }

    function isFilled(field) {
        if (field.id === '__grid') return gridFilled(field.section);
        return isFieldFilled(field._groupId, field, raw, data);
    }

    function preview(field) {
        const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
        const type = field.input && field.input.type;
        if (field.id === '__grid') {
            const parts = [];
            for (const sf of (field.section.subfields || [])) {
                const t = fieldText(field.section.id, sf, raw, data);
                if (t) parts.push(cut(t.replace(/\s+/g, ' '), 28));
                if (parts.length >= 2) break;
            }
            return parts.join(' · ');
        }
        if (type === 'inline-meds') return cut(data.meds.map((m) => m.name).join(', '), 80);
        if (type === 'inline-diagnoses') return cut(data.diagnoses.map((d) => d.code).join(', '), 80);
        if (type === 'inline-tests') return cut(data.tests.map((t) => (t.code || 'test') + ': ' + t.score).join(', '), 80);
        if (type === 'inline-docs') return cut(data.docs.map((d) => d.name).join(', '), 80);
        if (type === 'uzywki-special') {
            const n = uzywkiEntries(field._groupId, raw).length;
            return n ? n + ' ' + (n === 1 ? 'pozycja' : (n < 5 ? 'pozycje' : 'pozycji')) : '';
        }
        if (type === 'tag-input-icd10') return cut(listOf(raw[fieldKey(field._groupId, field.id)]).join(', '), 80);
        return cut(fieldText(field._groupId, field, raw, data).replace(/\s+/g, ' '), 80);
    }

    const toolbar = createFormToolbar({
        groups,
        values: raw,
        isFilled,
        preview,
        renderEdit: (field) => (field.id === '__grid'
            ? editGrid(field.section, raw)
            : editControl(field._groupId, field, raw, ctx)),
        renderRead: (field) => (field.id === '__grid'
            ? readGrid(field.section, raw, data)
            : readField(field._groupId, field, raw, data, ctx)),
        groupPreview: (group) => {
            if (group.id !== 'visitData') return '';
            const s = String(raw['visitData.powod'] || '').trim();
            return s.length > 60 ? s.slice(0, 57) + '…' : s;
        },
        // Uwagi mają sens przy polach wyboru; pole tekstowe samo jest opisem.
        showNotes: (field) => {
            if (field.notes === false) return false;
            const t = field.input && field.input.type;
            return !['textarea', 'compact-grid', 'uzywki-special', 'inline-meds', 'inline-diagnoses',
                'inline-tests', 'inline-docs', 'link-view'].includes(t);
        },
        notesValue: (field) => raw[fieldKey(field._groupId, field.id) + '.__notes'] || ''
    });

    /* ---------------- zapis ---------------- */
    function persist() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        if (!dirty || deleted) return;
        dirty = false;

        const date = isBlank(raw['visitData.data']) ? ((visit && visit.date) || todayISO()) : raw['visitData.data'];
        const payload = {
            _raw: Object.assign({}, raw),
            meds: clone(data.meds), diagnoses: clone(data.diagnoses),
            tests: clone(data.tests), docs: clone(data.docs)
        };
        const summary = visitSummary({ data: payload });

        if (!visitId) {
            const fromEvent = opts.eventId
                ? { time: opts.time || '', paid: opts.paid === true, calendarEventId: opts.eventId }
                : {};
            const created = Store.addVisit(Object.assign(
                { patientId: patient.id, type: typeId, date, summary, data: payload }, fromEvent));
            visitId = created.id;
            // Termin w kalendarzu dostaje znaczek „jest notatka" (błąd kalendarza nie blokuje pisania).
            if (opts.eventId) {
                patchAppointment(opts.eventId, { visitId })
                    .catch((e) => console.warn('[calendar] powiązanie notatki z terminem:', e && e.message));
            }
            // Stabilny adres bez przeładowania widoku — ale tylko gdy nadal jesteśmy
            // na „nowej wizycie". Jeśli użytkownik właśnie przechodzi gdzie indziej,
            // podmiana adresu cofnęłaby jego nawigację.
            if (window.location.hash.startsWith('#/visit/form/new')) {
                try { history.replaceState(null, '', '#/visit/form/' + visitId); } catch (_) { /* */ }
            }
            deleteBtn.style.display = '';
        } else {
            const current = Store.getVisitById(visitId);
            if (!current) return;                       // usunięta w międzyczasie
            Store.updateVisit(visitId, { date, summary, data: Object.assign({}, current.data, payload) });
        }
    }

    function markDirty() {
        dirty = true;
        toolbar.refresh();
        // Zapis najpóźniej 400 ms po pierwszej zmianie (nie przesuwamy terminu przy
        // kolejnych — przy ciągłym pisaniu Store i tak dostaje dane na bieżąco).
        if (!saveTimer) saveTimer = setTimeout(persist, 400);
    }

    function onControlEvent(ev) {
        const t = ev.target;
        if (t && t.dataset && t.dataset.transient === '1') return;   // pola pomocnicze
        Object.assign(raw, readControls(toolbar.contentEl));
        markDirty();
    }
    toolbar.addEventListener('input', onControlEvent);
    toolbar.addEventListener('change', onControlEvent);

    const onPageHide = () => persist();
    window.addEventListener('pagehide', onPageHide);

    /* ---------------- nagłówek ---------------- */
    const title = visit
        ? 'Wizyta · ' + visit.date + (visit.time ? ' ' + visit.time : '') + (typeObj ? ' · ' + typeObj.label : '')
        : '+ Nowa wizyta' + (typeObj ? ' · ' + typeObj.label : '');

    const deleteBtn = el('button', {
        class: 'btn btn--danger',
        title: 'Usuń tę wizytę',
        style: { display: visit ? '' : 'none' },
        onclick: async () => {
            const ok = await openConfirm({
                title: 'Usunąć wizytę?',
                message: 'Wizyta zostanie trwale usunięta razem z tym, co w niej wpisano: lekami, rozpoznaniami, '
                    + 'zaleceniami i wynikami testów. Operacji nie da się cofnąć.'
                    + (data.docs.length
                        ? ' Dołączone pliki (' + data.docs.length + ') zostają w folderze pacjenta — '
                            + 'w „Dokumentach" będą oznaczone „bez wizyty".'
                        : ''),
                confirmLabel: 'Usuń',
                variant: 'danger'
            });
            if (!ok) return;
            deleted = true;
            if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
            if (visitId) {
                unlinkVisitFromAppointment(Store.getVisitById(visitId));
                Store.removeVisit(visitId);
            }
            window.location.hash = '#/history';
        }
    }, ['🗑 Usuń']);

    const root = el('div', {
        class: 'psy-new-view psy-visit-form-view',
        dataset: { live: 'true' }       // kontroler nie przerysowuje tego widoku przy zmianach Store
    }, [
        // Jedna linia: każdy piksel wysokości idzie na listę pól i notatkę. Pacjent
        // i stan zapisu są już na górnym pasku, więc nie powtarzamy ich tutaj.
        el('div', { class: 'psy-new-view__header psy-visit-form-view__header' }, [
            el('h1', { class: 'psy-new-view__title' }, [title]),
            el('div', { class: 'psy-new-view__actions' }, [
                el('button', {
                    class: 'btn btn--secondary',
                    onclick: () => { window.location.hash = '#/history'; }
                }, ['← Wróć do listy']),
                deleteBtn
            ])
        ]),
        toolbar
    ]);

    // Powrót np. z testu: pokaż akapit, którego dotyczył (widok jest już wtedy na ekranie).
    if (opts.focus) setTimeout(() => toolbar.scrollToField(opts.focus), 0);

    // Kontroler woła to przed zdjęciem widoku z ekranu (zmiana trasy).
    root.psyTeardown = () => {
        persist();
        window.removeEventListener('pagehide', onPageHide);
    };

    return root;
}
