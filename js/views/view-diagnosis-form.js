// ============================================================================
// view-diagnosis-form.js — formularz diagnozy ICD-10 jako WIDOK INLINE.
//
// Zastępuje `modal-diagnosis.js` (zgodnie z ust. PO 2026-04-30).
//
// Hash:
//   #/diagnoses/new            – nowa, lazy (rekord powstaje przy 1. wpisie)
//   #/diagnoses/edit/:id       – edycja istniejącej
//
// Cechy:
//   • Brak przycisku „Zapisz" — autozapis (debounce 400 ms) na input/change.
//   • Lazy create dla nowych — `history.replaceState` na route edycji po 1. wpisie.
//   • Autocomplete kodów ICD-10 (popover, Arrow-keys, Enter, Esc).
//   • 🗑 Usuń (z confirm) + ← Wróć do listy.
//   • `data-live="true"` — pasywny re-render Store nie zabija formularza.
// ============================================================================

import { Store } from './_store.js';
import { searchIcd10, findIcd10ByCode } from './_icd10-dict.js';
import { openConfirm } from './_modal.js';
import { visitTypeById } from './_fake-data.js';
import {
    el, field, section,
    todayISO
} from './_form-helpers.js';

/** Lista opcji dla select „Powiązana wizyta". */
function buildVisitOptions(patientId) {
    const visits = Store.getVisits(patientId) || [];
    const opts = [{ value: '', label: '— bez powiązania —' }];
    for (const v of visits) {
        const t = visitTypeById(v.type);
        const tlabel = t ? t.label : v.type;
        opts.push({
            value: v.id,
            label: `${v.date}${v.time ? ' ' + v.time : ''} · ${tlabel}`
        });
    }
    return opts;
}

export function renderDiagnosisForm(opts = {}) {
    const patient = Store.state.currentPatient;

    // Bramka — bez pacjenta nie da się.
    if (!patient) {
        const r = el('div', { class: 'psy-new-view' });
        r.appendChild(el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, ['Diagnoza'])])
        ]));
        r.appendChild(el('div', { class: 'psy-new-view__body' }, [
            el('div', { class: 'psy-new-hint' }, ['Wybierz pacjenta, aby pracować z diagnozami.'])
        ]));
        return r;
    }

    let _id   = opts.id || null;
    let diag  = _id ? Store.getDiagnosisById(_id) : null;
    const isNew = !diag;
    const initial = diag || {};

    const root = el('div', {
        class: 'psy-new-view psy-form-view',
        dataset: { live: 'true' }
    });

    /* --------- Breadcrumb + nagłówek --------- */
    const breadcrumb = el('nav', { class: 'psy-new-breadcrumb' }, [
        el('a', {
            href: '#/diagnoses',
            class: 'psy-new-breadcrumb__link',
            onclick: (e) => { e.preventDefault(); window.location.hash = '#/diagnoses'; }
        }, ['🏥 Diagnozy']),
        el('span', { class: 'psy-new-breadcrumb__sep' }, ['›']),
        el('span', { class: 'psy-new-breadcrumb__current' }, [
            isNew ? '+ Nowa diagnoza' : 'Edycja: ' + (initial.code || initial.id)
        ])
    ]);

    const backBtn = el('button', {
        class: 'btn btn--secondary',
        onclick: () => { window.location.hash = '#/diagnoses'; }
    }, ['← Wróć do listy']);

    const deleteBtn = !isNew ? el('button', {
        class: 'btn btn--danger',
        onclick: async () => {
            const ok = await openConfirm({
                title: 'Usunąć diagnozę?',
                message: `Czy na pewno usunąć rozpoznanie „${initial.code || ''} — ${initial.description || ''}"?`,
                confirmLabel: 'Usuń',
                variant: 'danger'
            });
            if (!ok) return;
            Store.removeDiagnosis(_id);
            window.location.hash = '#/diagnoses';
        }
    }, ['🗑 Usuń']) : null;

    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            breadcrumb,
            el('h1', { class: 'psy-new-view__title' }, [
                isNew ? '+ Nowa diagnoza' : 'Edycja diagnozy'
            ]),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ',
                el('span', { class: 'psy-new-hint' }, ['💾 autozapis aktywny'])
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            backBtn, deleteBtn
        ].filter(Boolean))
    ]));

    /* --------- Form body --------- */
    const form = el('form', { class: 'psy-form psy-form--diagnosis' });
    form.addEventListener('submit', (e) => e.preventDefault());

    // ICD-10 input z popoverem (custom)
    const codeWrap = el('div', { class: 'psy-autocomplete' });
    const codeInput = el('input', {
        type: 'text',
        class: 'psy-field__input',
        id: 'psyf-code',
        name: 'code',
        value: initial.code || '',
        placeholder: 'Np. F32.1, F41.1...',
        autocomplete: 'off',
        oninput: () => onCodeInput(),
        onfocus: () => onCodeInput(),
        onblur: () => setTimeout(closePopover, 180),
        onkeydown: (ev) => onCodeKey(ev)
    });
    codeWrap.appendChild(codeInput);
    let popover = null;
    let activeIdx = -1;
    let currentMatches = [];

    const codeField = field({
        name: 'code',
        label: 'Kod ICD-10',
        required: true,
        cols: 4,
        type: 'custom',
        custom: codeWrap,
        help: 'Zacznij wpisywać kod lub fragment opisu — pojawią się podpowiedzi.'
    });

    const descField = field({
        name: 'description',
        label: 'Opis rozpoznania',
        value: initial.description || '',
        cols: 8,
        required: true,
        help: 'Auto-uzupełniany z ICD-10. Można edytować.'
    });

    const statusField = field({
        name: 'status',
        label: 'Status',
        type: 'select',
        value: initial.status || 'aktualne',
        cols: 4,
        options: [
            { value: 'aktualne',   label: 'Aktualne' },
            { value: 'w remisji', label: 'W remisji' },
            { value: 'zakończone', label: 'Zakończone' }
        ]
    });

    const dateField = field({
        name: 'assignedAt',
        label: 'Data nadania',
        type: 'date',
        value: initial.assignedAt || todayISO(),
        cols: 4
    });

    const authorField = field({
        name: 'author',
        label: 'Autor',
        value: initial.author || '',
        cols: 4,
        placeholder: 'Np. psycholog kliniczny, lek. med. J. Kowalski'
    });

    // Powiązanie z wizytą — z notatki PO „rozpoznania, leki itp są grupowane
    // per wizyta na podstawie wywiadu wizyty" (notatki.txt 2026-04-17).
    const linkedVisitField = field({
        name: 'linkedVisitId',
        label: 'Powiązana wizyta',
        type: 'select',
        value: initial.linkedVisitId || '',
        cols: 12,
        options: buildVisitOptions(patient.id),
        help: 'Z którą wizytą rozpoznanie zostało postawione / odnowione?'
    });

    const notesField = field({
        name: 'notes',
        label: 'Uwagi (opcjonalne)',
        type: 'textarea',
        value: initial.notes || '',
        rows: 3,
        cols: 12
    });

    form.appendChild(section('Rozpoznanie ICD-10', [
        codeField, descField, statusField, dateField, authorField,
        linkedVisitField
    ]));
    form.appendChild(section('Uwagi', [notesField]));

    root.appendChild(form);

    /* --------- ICD-10 autocomplete --------- */
    function onCodeInput() {
        const q = codeInput.value.trim();
        currentMatches = q ? searchIcd10(q, 8) : [];
        activeIdx = -1;
        renderPopover();
    }

    function renderPopover() {
        closePopover();
        if (!currentMatches.length) return;
        popover = el('div', { class: 'psy-autocomplete__popover' });
        currentMatches.forEach((m, i) => {
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
        codeWrap.appendChild(popover);
    }

    function closePopover() {
        if (popover && popover.parentNode) popover.remove();
        popover = null;
    }

    function pickMatch(m) {
        codeInput.value = m.code;
        const descInput = form.querySelector('[name="description"]');
        if (descInput) {
            descInput.value = m.description;
            descInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        closePopover();
        scheduleAutosave();
        codeInput.focus();
    }

    function onCodeKey(ev) {
        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            if (!currentMatches.length) onCodeInput();
            activeIdx = Math.min(activeIdx + 1, currentMatches.length - 1);
            renderPopover();
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            activeIdx = Math.max(activeIdx - 1, -1);
            renderPopover();
        } else if (ev.key === 'Enter' && activeIdx >= 0) {
            ev.preventDefault();
            pickMatch(currentMatches[activeIdx]);
        } else if (ev.key === 'Escape') {
            closePopover();
        }
    }

    /* --------- Autozapis + lazy create --------- */
    let _autosaveTimer = null;

    function readForm() {
        const out = {};
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach((node) => {
            if (!node.name) return;
            if (node.type === 'checkbox') out[node.name] = !!node.checked;
            else out[node.name] = node.value;
        });
        return out;
    }

    function ensureExists() {
        if (_id) return Store.getDiagnosisById(_id);
        const created = Store.addDiagnosis({
            patientId: patient.id,
            code: '', description: '',
            status: 'aktualne',
            assignedAt: todayISO()
        });
        _id = created.id;
        try { history.replaceState(null, '', '#/diagnoses/edit/' + _id); } catch (_) {}
        return created;
    }

    function autosaveNow() {
        const data = readForm();
        // Pomiń jeśli wszystko puste i jeszcze nie ma rekordu
        if (!_id) {
            const hasAnything = (data.code && data.code.trim()) ||
                                (data.description && data.description.trim()) ||
                                (data.author && data.author.trim()) ||
                                (data.notes && data.notes.trim());
            if (!hasAnything) return;
            ensureExists();
        }
        if (!_id) return;
        Store.updateDiagnosis(_id, {
            code: String(data.code || '').trim().toUpperCase(),
            description: String(data.description || '').trim(),
            status: data.status || 'aktualne',
            assignedAt: data.assignedAt || todayISO(),
            author: String(data.author || '').trim(),
            notes: String(data.notes || '').trim(),
            linkedVisitId: data.linkedVisitId || ''
        });
    }

    function scheduleAutosave() {
        if (_autosaveTimer) clearTimeout(_autosaveTimer);
        _autosaveTimer = setTimeout(autosaveNow, 400);
    }

    form.addEventListener('input', scheduleAutosave);
    form.addEventListener('change', scheduleAutosave);

    return root;
}
