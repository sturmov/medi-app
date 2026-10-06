// ============================================================================
// view-med-form.js — formularz leku jako WIDOK INLINE.
//
// 2026-06-13 (klientka, refactor):
//   • Lek = część wizyty (inline-meds w sekcji Farmakoterapia). Ten widok
//     to legacy fallback dla URL-i `#/meds/new` i `#/meds/edit/:id`. Nowa
//     edycja leku odbywa się INLINE w formularzu wizyty.
//   • Nazwa handlowa — BEZ NAWIASÓW w dropdownie (sama nazwa).
//   • Substancja czynna + grupa — READONLY (auto z bazy leków).
//   • Aktualna dawka — number + jednostka dziedziczona z max dawki.
//   • Max dawka — READONLY (auto z bazy).
//   • Sekcja „Ordynacja" (data + przepisał + notatki) — USUNIĘTA.
//
// Hash:
//   #/meds/new            – nowy lek, lazy create (legacy)
//   #/meds/edit/:id       – edycja (legacy)
//
// Cechy: brak „Zapisz" — autozapis 400 ms.
// ============================================================================

import { Store } from './_store.js';
import { FAKE_MED_DICT } from './_fake-data.js';
import { openConfirm } from './_modal.js';
import {
    el, field, section,
    todayISO
} from './_form-helpers.js';

const CUSTOM_VALUE = '__custom__';

/** Wyciąga jednostkę z max dawki (np. „200 mg/d" → „mg/d"). */
function _extractUnit(maxDose) {
    if (!maxDose) return '';
    const m = String(maxDose).match(/[\d,.\s]+([a-zA-Z\u00C0-\u017F\/]+)(?:\s*\*+|$)/);
    if (m && m[1]) return m[1].trim();
    return '';
}

/** Wyciąga liczbę z dose („100 mg/d" → „100"). */
function _extractDoseNumber(dose) {
    if (!dose) return '';
    const m = String(dose).match(/^[\d.,]+/);
    return m ? m[0] : '';
}

export function renderMedForm(opts = {}) {
    const patient = Store.state.currentPatient;

    if (!patient) {
        const r = el('div', { class: 'psy-new-view' });
        r.appendChild(el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, ['Lek'])])
        ]));
        r.appendChild(el('div', { class: 'psy-new-view__body' }, [
            el('div', { class: 'psy-new-hint' }, ['Wybierz pacjenta, aby pracować z lekami.'])
        ]));
        return r;
    }

    let _id    = opts.id || null;
    let med    = _id ? Store.getMedById(_id) : null;
    const isNew = !med;
    const initial = med || {};

    // Czy nazwa jest ze słownika?
    const initialDictHit  = FAKE_MED_DICT.find((m) => m.name === initial.name);
    const initialIsCustom = !!(initial.name && !initialDictHit);

    const root = el('div', {
        class: 'psy-new-view psy-form-view',
        dataset: { live: 'true' }
    });

    /* --------- Breadcrumb + nagłówek --------- */
    const breadcrumb = el('nav', { class: 'psy-new-breadcrumb' }, [
        el('a', {
            href: '#/meds',
            class: 'psy-new-breadcrumb__link',
            onclick: (e) => { e.preventDefault(); window.location.hash = '#/meds'; }
        }, ['💊 Leki']),
        el('span', { class: 'psy-new-breadcrumb__sep' }, ['›']),
        el('span', { class: 'psy-new-breadcrumb__current' }, [
            isNew ? '+ Nowy lek' : 'Edycja: ' + (initial.name || initial.id)
        ])
    ]);

    const backBtn = el('button', {
        class: 'btn btn--secondary',
        onclick: () => { window.location.hash = '#/meds'; }
    }, ['← Wróć do listy']);

    const deleteBtn = !isNew ? el('button', {
        class: 'btn btn--danger',
        onclick: async () => {
            const ok = await openConfirm({
                title: 'Usunąć lek?',
                message: `Czy na pewno usunąć „${initial.name || ''}" z listy leków pacjenta?`,
                confirmLabel: 'Usuń',
                variant: 'danger'
            });
            if (!ok) return;
            Store.removeMed(_id);
            window.location.hash = '#/meds';
        }
    }, ['🗑 Usuń']) : null;

    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            breadcrumb,
            el('h1', { class: 'psy-new-view__title' }, [
                isNew ? '+ Nowy lek' : 'Edycja leku'
            ]),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ',
                el('span', { class: 'psy-new-hint' }, ['💾 autozapis aktywny · widok legacy, leki edytuj w wizycie'])
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            backBtn, deleteBtn
        ].filter(Boolean))
    ]));

    /* --------- Form body --------- */
    const form = el('form', { class: 'psy-form psy-form--med' });
    form.addEventListener('submit', (e) => e.preventDefault());

    // 2026-06-13 (klientka) — dropdown BEZ NAWIASÓW (sama nazwa handlowa).
    const nameOptions = [
        { value: '', label: '— wybierz —' },
        ...FAKE_MED_DICT.map((m) => ({ value: m.name, label: m.name })),
        { value: CUSTOM_VALUE, label: '— inne (wpisz ręcznie) —' }
    ];

    const nameSelectField = field({
        name: 'nameSelect',
        label: 'Nazwa handlowa',
        type: 'select',
        value: initialIsCustom ? CUSTOM_VALUE : (initial.name || ''),
        required: true,
        cols: 6,
        options: nameOptions,
        onChange: () => onNameSelectChange()
    });

    const customNameField = field({
        name: 'name',
        label: 'Nazwa handlowa (wpisz)',
        value: initial.name || '',
        cols: 6,
        placeholder: 'Np. Sertranor, inny preparat...'
    });

    // 2026-06-13 (klientka) — substancja czynna READONLY (auto z bazy).
    const substanceField = field({
        name: 'substance',
        label: 'Substancja czynna',
        value: initial.substance || '',
        cols: 6,
        inputAttrs: { readonly: true },
        help: 'Auto-uzupełniana z bazy leków (read-only).'
    });

    // 2026-06-13 (klientka) — grupa READONLY (auto z bazy).
    const groupField = field({
        name: 'group',
        label: 'Grupa',
        value: initial.group || '',
        cols: 6,
        inputAttrs: { readonly: true },
        help: 'Auto-uzupełniana z bazy leków (read-only).'
    });

    // 2026-06-13 (klientka): aktualna dawka — NUMBER + jednostka z max dawki.
    const initialUnit = _extractUnit(initial.maxDose);
    const initialDoseNum = _extractDoseNumber(initial.dose);

    const doseNumberInput = el('input', {
        type: 'number',
        class: 'psy-field__input',
        id: 'psyf-doseNumber',
        name: 'doseNumber',
        value: initialDoseNum,
        step: '0.5',
        min: '0',
        placeholder: 'np. 100'
    });
    const doseUnitSpan = el('span', {
        class: 'psy-field__help',
        style: { fontWeight: '600', color: '#475569', marginLeft: '8px' }
    }, [initialUnit || '(jednostka z max dawki)']);

    const doseField = el('div', {
        class: 'psy-field psy-field--cols-6',
        dataset: { field: 'doseNumber' }
    }, [
        el('label', { class: 'psy-field__label', for: 'psyf-doseNumber' }, [
            'Aktualna dawka',
            el('span', { class: 'psy-field__required', 'aria-hidden': 'true' }, [' '])
        ]),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, [
            doseNumberInput,
            doseUnitSpan
        ]),
        el('div', { class: 'psy-field__help' }, ['Liczba w jednostce dziedziczonej z max dawki.']),
        el('div', { class: 'psy-field__error', hidden: true })
    ]);

    // 2026-06-13 (klientka) — max dawka READONLY (auto z bazy).
    const maxDoseField = field({
        name: 'maxDose',
        label: 'Max dawka',
        value: initial.maxDose || '',
        cols: 6,
        inputAttrs: { readonly: true },
        help: 'Auto-uzupełniana z bazy leków (read-only).'
    });

    form.appendChild(section('Lek', [
        nameSelectField, customNameField, substanceField, groupField,
        doseField, maxDoseField
    ]));

    // 2026-06-13 (klientka „ordynacji nie trzeba") — sekcja Ordynacja USUNIĘTA
    // (data rozpoczęcia + przepisał + notatki — wszystko out).

    root.appendChild(form);

    /* --------- Nazwa → autouzupełnienie --------- */
    function onNameSelectChange() {
        const sel = form.querySelector('[name="nameSelect"]');
        const v = sel.value;
        if (v === CUSTOM_VALUE) {
            setCustomMode(true);
        } else if (v === '') {
            setCustomMode(false);
            setFields({ name: '', substance: '', maxDose: '', group: '' });
            doseUnitSpan.textContent = '(jednostka z max dawki)';
        } else {
            setCustomMode(false);
            const hit = FAKE_MED_DICT.find((m) => m.name === v);
            if (hit) {
                setFields({
                    name: hit.name,
                    substance: hit.substance,
                    maxDose: hit.maxDose,
                    group: hit.group
                });
                const unit = _extractUnit(hit.maxDose);
                doseUnitSpan.textContent = unit || '(jednostka z max dawki)';
            }
        }
        scheduleAutosave();
    }

    function setCustomMode(on) {
        customNameField.style.display = on ? '' : 'none';
        if (on) {
            setFields({ name: '', substance: '', maxDose: '', group: '' });
            const input = form.querySelector('[name="name"]');
            if (input) input.focus();
        }
    }

    function setFields(patch) {
        for (const [k, v] of Object.entries(patch)) {
            const input = form.querySelector(`[name="${k}"]`);
            if (input) input.value = v == null ? '' : v;
        }
    }

    setCustomMode(initialIsCustom);

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
        if (_id) return Store.getMedById(_id);
        const created = Store.addMed({
            patientId: patient.id,
            name: '', substance: '', dose: '', maxDose: ''
        });
        _id = created.id;
        try { history.replaceState(null, '', '#/meds/edit/' + _id); } catch (_) {}
        return created;
    }

    function autosaveNow() {
        const data = readForm();

        // Wyznacz „efektywną" nazwę
        let effectiveName = '';
        if (data.nameSelect === CUSTOM_VALUE) {
            effectiveName = String(data.name || '').trim();
        } else if (data.nameSelect && data.nameSelect !== '') {
            effectiveName = data.nameSelect;
        }

        if (!_id) {
            const hasAnything = !!effectiveName ||
                                (data.doseNumber && data.doseNumber.trim());
            if (!hasAnything) return;
            ensureExists();
        }
        if (!_id) return;

        // Złóż dose: liczba + jednostka z max dawki
        const maxDose = (data.maxDose || '').trim();
        const unit = _extractUnit(maxDose);
        const doseNum = (data.doseNumber || '').trim();
        const dose = doseNum ? (doseNum + (unit ? ' ' + unit : '')) : '';

        Store.updateMed(_id, {
            name: effectiveName,
            substance: (data.substance || '').trim(),
            group: (data.group || '').trim(),
            dose: dose,
            maxDose: maxDose
            // 2026-06-13: BEZ prescribedAt, prescribedBy, notes — sekcja Ordynacja usunięta.
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
