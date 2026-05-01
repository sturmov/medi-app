// ============================================================================
// view-recommendation-form.js — formularz zalecenia jako WIDOK INLINE.
//
// Zastępuje `modal-recommendation.js`.
//
// Hash:
//   #/recommendations/new            – nowa, lazy
//   #/recommendations/edit/:id       – edycja
//
// Cechy: brak „Zapisz", autozapis 400 ms, lazy create, 🗑 z confirm,
//        ← Wróć, `data-live="true"`.
// ============================================================================

import { Store } from './_store.js';
import { openConfirm } from './_modal.js';
import { VISIT_DICT } from './_visit-dict.js';
import { visitTypeById } from './_fake-data.js';
import {
    el, field, section,
    todayISO
} from './_form-helpers.js';

/** Buduje listę opcji dla select „Powiązana wizyta": chronologicznie, format
 *  „YYYY-MM-DD · typ wizyty · krótki opis". */
function buildVisitOptions(patientId) {
    const visits = Store.getVisits(patientId) || [];
    const opts = [{ value: '', label: '— bez powiązania —' }];
    for (const v of visits) {
        const t = visitTypeById(v.type);
        const tlabel = t ? t.label : v.type;
        const summary = v.summary
            ? ' · ' + (v.summary.length > 40 ? v.summary.slice(0, 37) + '…' : v.summary)
            : '';
        opts.push({
            value: v.id,
            label: `${v.date}${v.time ? ' ' + v.time : ''} · ${tlabel}${summary}`
        });
    }
    return opts;
}

export function renderRecommendationForm(opts = {}) {
    const patient = Store.state.currentPatient;

    if (!patient) {
        const r = el('div', { class: 'psy-new-view' });
        r.appendChild(el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, ['Zalecenie'])])
        ]));
        r.appendChild(el('div', { class: 'psy-new-view__body' }, [
            el('div', { class: 'psy-new-hint' }, ['Wybierz pacjenta, aby pracować z zaleceniami.'])
        ]));
        return r;
    }

    let _id    = opts.id || null;
    let rec    = _id ? Store.getRecommendationById(_id) : null;
    const isNew = !rec;
    const initial = rec || {};

    const root = el('div', {
        class: 'psy-new-view psy-form-view',
        dataset: { live: 'true' }
    });

    /* --------- Breadcrumb + nagłówek --------- */
    const breadcrumb = el('nav', { class: 'psy-new-breadcrumb' }, [
        el('a', {
            href: '#/recommendations',
            class: 'psy-new-breadcrumb__link',
            onclick: (e) => { e.preventDefault(); window.location.hash = '#/recommendations'; }
        }, ['📋 Zalecenia']),
        el('span', { class: 'psy-new-breadcrumb__sep' }, ['›']),
        el('span', { class: 'psy-new-breadcrumb__current' }, [
            isNew ? '+ Nowe zalecenie' : 'Edycja: ' + (initial.title || initial.id)
        ])
    ]);

    const backBtn = el('button', {
        class: 'btn btn--secondary',
        onclick: () => { window.location.hash = '#/recommendations'; }
    }, ['← Wróć do listy']);

    const deleteBtn = !isNew ? el('button', {
        class: 'btn btn--danger',
        onclick: async () => {
            const ok = await openConfirm({
                title: 'Usunąć zalecenie?',
                message: `Czy na pewno usunąć zalecenie „${initial.title || ''}"?`,
                confirmLabel: 'Usuń',
                variant: 'danger'
            });
            if (!ok) return;
            Store.removeRecommendation(_id);
            window.location.hash = '#/recommendations';
        }
    }, ['🗑 Usuń']) : null;

    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            breadcrumb,
            el('h1', { class: 'psy-new-view__title' }, [
                isNew ? '+ Nowe zalecenie' : 'Edycja zalecenia'
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
    const form = el('form', { class: 'psy-form psy-form--recommendation' });
    form.addEventListener('submit', (e) => e.preventDefault());

    const titleField = field({
        name: 'title',
        label: 'Tytuł zalecenia',
        value: initial.title || '',
        required: true,
        cols: 8,
        placeholder: 'Np. Higiena snu, Plan terapii CBT, Aktywność fizyczna...'
    });

    const dateField = field({
        name: 'createdAt',
        label: 'Data',
        type: 'date',
        value: initial.createdAt || todayISO(),
        cols: 4
    });

    // Typ rekomendacji — multi-select REKOMENDACJE_TYP (z VISIT_FORM_SPEC §3).
    // W MVP jako single select; multi-tag w przyszłości jeśli będzie potrzeba.
    const typeField = field({
        name: 'type',
        label: 'Typ rekomendacji',
        type: 'select',
        value: initial.type || '',
        cols: 6,
        options: [{ value: '', label: '— wybierz —' }].concat(
            (VISIT_DICT.REKOMENDACJE_TYP || []).map((t) => ({ value: t, label: t }))
        ),
        help: 'Klasyfikacja rekomendacji (źródło: VISIT_FORM_SPEC §3 — REKOMENDACJE_TYP).'
    });

    // Termin realizacji / wizyty kontrolnej — KONTROLNA_TERMIN + opcjonalna data.
    const dueWhenField = field({
        name: 'dueWhen',
        label: 'Termin realizacji',
        type: 'select',
        value: initial.dueWhen || '',
        cols: 3,
        options: [{ value: '', label: '— bez terminu —' }].concat(
            (VISIT_DICT.KONTROLNA_TERMIN || []).map((t) => ({ value: t, label: t }))
        )
    });
    const dueDateField = field({
        name: 'dueDate',
        label: 'Data konkretna (opcjonalnie)',
        type: 'date',
        value: initial.dueDate || '',
        cols: 3
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
        help: 'Z którą wizytą pacjenta rekomendacja jest powiązana?'
    });

    const contentField = field({
        name: 'content',
        label: 'Treść zalecenia',
        type: 'textarea',
        value: initial.content || '',
        rows: 8,
        cols: 12,
        required: true,
        placeholder: 'Wpisz zalecenie (może zajmować kilka linii)...'
    });

    const doneField = !isNew ? field({
        name: 'done',
        label: 'Zrealizowane',
        type: 'checkbox',
        value: !!initial.done,
        cols: 12
    }) : null;

    form.appendChild(section('Zalecenie', [
        titleField, dateField,
        typeField, dueWhenField, dueDateField,
        linkedVisitField,
        contentField
    ]));

    if (doneField) {
        const adminSec = el('div', { class: 'psy-form-section' });
        adminSec.appendChild(el('h4', { class: 'psy-form-section__title' }, ['Status']));
        adminSec.appendChild(el('div', { class: 'psy-form-row' }, [doneField]));
        form.appendChild(adminSec);
    }

    root.appendChild(form);

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
        if (_id) return Store.getRecommendationById(_id);
        const created = Store.addRecommendation({
            patientId: patient.id,
            title: '', content: '',
            createdAt: todayISO(),
            done: false
        });
        _id = created.id;
        try { history.replaceState(null, '', '#/recommendations/edit/' + _id); } catch (_) {}
        return created;
    }

    function autosaveNow() {
        const data = readForm();
        if (!_id) {
            const hasAnything = (data.title && data.title.trim()) ||
                                (data.content && data.content.trim());
            if (!hasAnything) return;
            ensureExists();
        }
        if (!_id) return;
        Store.updateRecommendation(_id, {
            title: String(data.title || '').trim(),
            content: String(data.content || '').trim(),
            createdAt: data.createdAt || todayISO(),
            done: !!data.done,
            type: data.type || '',
            dueWhen: data.dueWhen || '',
            dueDate: data.dueDate || '',
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
