// ============================================================================
// view-med-form.js — formularz leku jako WIDOK INLINE.
//
// Zastępuje `modal-med.js`.
//
// Hash:
//   #/meds/new            – nowy lek, lazy create
//   #/meds/edit/:id       – edycja
//
// Cechy:
//   • Brak „Zapisz" — autozapis 400 ms.
//   • Lazy create.
//   • Wybór nazwy z bazy `FAKE_MED_DICT` (auto-fill substancji + max dawki),
//     z opcją „inne (wpisz ręcznie)".
//   • 🗑 Usuń + ← Wróć.
// ============================================================================

import { Store } from './_store.js';
import { FAKE_MED_DICT } from './_fake-data.js';
import { openConfirm } from './_modal.js';
import {
    el, field, section,
    todayISO
} from './_form-helpers.js';

const CUSTOM_VALUE = '__custom__';

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
                el('span', { class: 'psy-new-hint' }, ['💾 autozapis aktywny'])
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            backBtn, deleteBtn
        ].filter(Boolean))
    ]));

    /* --------- Form body --------- */
    const form = el('form', { class: 'psy-form psy-form--med' });
    form.addEventListener('submit', (e) => e.preventDefault());

    const nameOptions = [
        { value: '', label: '— wybierz —' },
        ...FAKE_MED_DICT.map((m) => ({ value: m.name, label: `${m.name}  (${m.substance})` })),
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

    const substanceField = field({
        name: 'substance',
        label: 'Substancja czynna',
        value: initial.substance || '',
        cols: 6
    });

    const groupField = field({
        name: 'group',
        label: 'Grupa',
        value: initial.group || '',
        cols: 6,
        placeholder: 'Np. SSRI, SNRI, Benzodiazepiny...'
    });

    const doseField = field({
        name: 'dose',
        label: 'Aktualna dawka',
        value: initial.dose || '',
        cols: 6,
        placeholder: 'Np. 100 mg/d'
    });

    const maxDoseField = field({
        name: 'maxDose',
        label: 'Max dawka',
        value: initial.maxDose || '',
        cols: 6,
        help: 'Auto-uzupełniana z bazy. Można edytować.'
    });

    const dateField = field({
        name: 'prescribedAt',
        label: 'Data rozpoczęcia',
        type: 'date',
        value: initial.prescribedAt || todayISO(),
        cols: 6
    });

    const prescribedByField = field({
        name: 'prescribedBy',
        label: 'Przepisał(a)',
        value: initial.prescribedBy || '',
        cols: 6,
        placeholder: 'Np. psychiatra, lekarz rodzinny'
    });

    const notesField = field({
        name: 'notes',
        label: 'Notatki',
        type: 'textarea',
        value: initial.notes || '',
        rows: 3,
        cols: 12,
        placeholder: 'Np. schemat dawkowania, uwagi dot. reakcji, interakcji...'
    });

    form.appendChild(section('Lek', [
        nameSelectField, customNameField, substanceField, groupField,
        doseField, maxDoseField
    ]));

    form.appendChild(section('Ordynacja', [
        dateField, prescribedByField, notesField
    ]));

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
            name: '', substance: '', dose: '', maxDose: '',
            prescribedAt: todayISO(),
            prescribedBy: '',
            notes: ''
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
                                (data.notes && data.notes.trim()) ||
                                (data.substance && data.substance.trim());
            if (!hasAnything) return;
            ensureExists();
        }
        if (!_id) return;

        Store.updateMed(_id, {
            name: effectiveName,
            substance: (data.substance || '').trim(),
            group: (data.group || '').trim(),
            dose: (data.dose || '').trim(),
            maxDose: (data.maxDose || '').trim(),
            prescribedAt: data.prescribedAt || '',
            prescribedBy: (data.prescribedBy || '').trim(),
            notes: (data.notes || '').trim()
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
