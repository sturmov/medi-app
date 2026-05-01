// ============================================================================
// view-patient-form.js — formularz pacjenta jako WIDOK INLINE.
//
// Zastępuje `modal-patient.js`.
//
// Hash:
//   #/patients/new            – nowy pacjent, lazy create (ID auto)
//   #/patients/edit/:id       – edycja
//
// Cechy:
//   • Brak „Zapisz" — autozapis 400 ms.
//   • Lazy create: kod pacjenta nadawany przy 1. wpisie (np. P006).
//   • Wiek auto-obliczany z daty urodzenia.
//   • Sekcja „Opiekunowie" widoczna tylko dla pacjentów niepełnoletnich.
//   • Archiwizacja (toggle) + ← Wróć do listy. Brak 🗑 (PO 2026-04-18: bez
//     removePatient — kasacja w folderze pacjenta).
// ============================================================================

import { Store } from './_store.js';
import {
    el, field, section,
    ageFromDate
} from './_form-helpers.js';

export function renderPatientForm(opts = {}) {
    let _id   = opts.id || null;
    let patient = _id ? (Store.state.patients.find((p) => p.id === _id) || null) : null;
    const isNew = !patient;
    const initial = patient || {};

    const root = el('div', {
        class: 'psy-new-view psy-form-view',
        dataset: { live: 'true' }
    });

    /* --------- Breadcrumb + nagłówek --------- */
    const breadcrumb = el('nav', { class: 'psy-new-breadcrumb' }, [
        el('a', {
            href: '#/patients',
            class: 'psy-new-breadcrumb__link',
            onclick: (e) => { e.preventDefault(); window.location.hash = '#/patients'; }
        }, ['📋 Pacjenci']),
        el('span', { class: 'psy-new-breadcrumb__sep' }, ['›']),
        el('span', { class: 'psy-new-breadcrumb__current' }, [
            isNew ? '+ Nowy pacjent' : 'Edycja: ' +
                ((initial.imie || '') + ' ' + (initial.nazwisko || '')).trim()
        ])
    ]);

    const backBtn = el('button', {
        class: 'btn btn--secondary',
        onclick: () => { window.location.hash = '#/patients'; }
    }, ['← Wróć do listy']);

    const archiveBtn = !isNew ? el('button', {
        class: 'btn btn--' + (initial.archived ? 'primary' : 'secondary'),
        title: initial.archived ? 'Przywróć z archiwum' : 'Przenieś do archiwum',
        onclick: () => {
            Store.archivePatient(_id, !initial.archived);
            // Force-rerender żeby przycisk zmienił label
            if (window.AppController) window.AppController._renderView(true);
        }
    }, [initial.archived ? '↩ Przywróć z archiwum' : '📦 Archiwizuj']) : null;

    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            breadcrumb,
            el('h1', { class: 'psy-new-view__title' }, [
                isNew ? '+ Nowy pacjent' : 'Edycja pacjenta'
            ]),
            el('div', { class: 'psy-new-view__subtitle' }, [
                _id ? 'Kod: ' + _id : 'Kod nadany po pierwszej zmianie · ',
                el('span', { class: 'psy-new-hint' }, ['💾 autozapis aktywny'])
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            backBtn, archiveBtn
        ].filter(Boolean))
    ]));

    /* --------- Form body --------- */
    const form = el('form', { class: 'psy-form psy-form--patient' });
    form.addEventListener('submit', (e) => e.preventDefault());

    // === Identyfikacja ===
    const codeField = field({
        name: 'kodPacjenta',
        label: 'Kod pacjenta',
        value: _id || '(nadany po 1. zmianie)',
        cols: 3,
        inputAttrs: { readonly: '' }
    });

    const firstNameField = field({
        name: 'imie',
        label: 'Imię',
        value: initial.imie || '',
        required: true,
        cols: 5
    });

    const lastNameField = field({
        name: 'nazwisko',
        label: 'Nazwisko',
        value: initial.nazwisko || '',
        required: true,
        cols: 4
    });

    const birthDateField = field({
        name: 'dataUrodzenia',
        label: 'Data urodzenia',
        type: 'date',
        value: initial.dataUrodzenia || '',
        cols: 4,
        onInput: () => updateAge()
    });

    const ageField = field({
        name: 'wiek',
        label: 'Wiek',
        value: initial.wiek || ageFromDate(initial.dataUrodzenia) || '',
        cols: 2,
        inputAttrs: { readonly: '' }
    });

    const genderField = field({
        name: 'plec',
        label: 'Płeć',
        type: 'select',
        value: initial.plec || '',
        cols: 3,
        options: [
            { value: '', label: '— wybierz —' },
            { value: 'Kobieta', label: 'Kobieta' },
            { value: 'Mężczyzna', label: 'Mężczyzna' },
            { value: 'Inna / nie określono', label: 'Inna / nie określono' }
        ]
    });

    const minorField = field({
        name: 'minor',
        label: 'Niepełnoletni (< 18 lat)',
        type: 'checkbox',
        value: !!initial.minor,
        cols: 3,
        onChange: () => updateMinorBlock()
    });

    // === Kontakt ===
    const phoneField = field({
        name: 'telefon',
        label: 'Telefon',
        type: 'tel',
        value: initial.telefon || '',
        cols: 4,
        placeholder: '+48 ...'
    });

    const emailField = field({
        name: 'email',
        label: 'Email',
        type: 'email',
        value: initial.email || '',
        cols: 4
    });

    const peselField = field({
        name: 'pesel',
        label: 'PESEL',
        value: initial.pesel || '',
        cols: 4,
        help: '11 cyfr (opcjonalnie)',
        inputAttrs: { maxlength: '11', inputmode: 'numeric', pattern: '[0-9]{11}' }
    });

    const addressField = field({
        name: 'adres',
        label: 'Adres',
        value: initial.adres || '',
        cols: 12,
        placeholder: 'ul. ..., kod pocztowy, miasto'
    });

    // === Opiekunowie ===
    const guardianBlock = el('div', { class: 'psy-form-section', id: 'psy-guardians' });
    guardianBlock.appendChild(el('h4', { class: 'psy-form-section__title' }, ['Opiekunowie prawni']));
    const guardianRow = el('div', { class: 'psy-form-row' });
    guardianRow.appendChild(field({ name: 'matkaImie', label: 'Matka — imię i nazwisko', value: initial.matkaImie || '', cols: 6 }));
    guardianRow.appendChild(field({ name: 'matkaTelefon', label: 'Matka — telefon', value: initial.matkaTelefon || '', cols: 3 }));
    guardianRow.appendChild(field({ name: 'matkaEmail', label: 'Matka — email', value: initial.matkaEmail || '', cols: 3 }));
    guardianRow.appendChild(field({ name: 'ojciecImie', label: 'Ojciec — imię i nazwisko', value: initial.ojciecImie || '', cols: 6 }));
    guardianRow.appendChild(field({ name: 'ojciecTelefon', label: 'Ojciec — telefon', value: initial.ojciecTelefon || '', cols: 3 }));
    guardianRow.appendChild(field({ name: 'ojciecEmail', label: 'Ojciec — email', value: initial.ojciecEmail || '', cols: 3 }));
    guardianBlock.appendChild(guardianRow);

    // === Awaryjny ===
    const emergencyBlock = section('Kontakt w nagłych wypadkach', [
        field({ name: 'kontaktNaglyImie', label: 'Imię i nazwisko', value: initial.kontaktNaglyImie || '', cols: 6 }),
        field({ name: 'kontaktNaglyTelefon', label: 'Telefon', value: initial.kontaktNaglyTelefon || '', cols: 3 }),
        field({ name: 'kontaktNaglyRelacja', label: 'Relacja', value: initial.kontaktNaglyRelacja || '', cols: 3, placeholder: 'np. małżonek, rodzic' })
    ]);

    // Compose
    form.appendChild(section('Identyfikacja', [
        codeField, firstNameField, lastNameField,
        birthDateField, ageField, genderField, minorField
    ]));
    form.appendChild(section('Kontakt', [
        phoneField, emailField, peselField, addressField
    ]));
    form.appendChild(guardianBlock);
    form.appendChild(emergencyBlock);

    root.appendChild(form);

    function updateAge() {
        const dateInput = form.querySelector('[name="dataUrodzenia"]');
        const ageInput = form.querySelector('[name="wiek"]');
        if (dateInput && ageInput) {
            ageInput.value = ageFromDate(dateInput.value) || '';
        }
    }

    function updateMinorBlock() {
        const minorChecked = form.querySelector('[name="minor"]').checked;
        guardianBlock.style.display = minorChecked ? '' : 'none';
    }

    updateMinorBlock();

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

    function ensureExists(initData) {
        if (_id) return Store.state.patients.find((p) => p.id === _id);
        const created = Store.addPatient({
            imie: (initData.imie || '').trim(),
            nazwisko: (initData.nazwisko || '').trim(),
            archived: false
        });
        _id = created.id;
        // Update kod field display
        const codeInput = form.querySelector('[name="kodPacjenta"]');
        if (codeInput) codeInput.value = _id;
        try { history.replaceState(null, '', '#/patients/edit/' + _id); } catch (_) {}
        return created;
    }

    function autosaveNow() {
        const data = readForm();

        if (!_id) {
            const hasMinimum = (data.imie && data.imie.trim()) ||
                               (data.nazwisko && data.nazwisko.trim());
            if (!hasMinimum) return;
            ensureExists(data);
        }
        if (!_id) return;

        const payload = {
            imie: String(data.imie || '').trim(),
            nazwisko: String(data.nazwisko || '').trim(),
            dataUrodzenia: data.dataUrodzenia || '',
            wiek: ageFromDate(data.dataUrodzenia) || '',
            plec: data.plec || '',
            telefon: (data.telefon || '').trim(),
            email: (data.email || '').trim(),
            pesel: (data.pesel || '').trim(),
            adres: (data.adres || '').trim(),
            minor: !!data.minor,
            matkaImie: data.matkaImie || '',
            matkaTelefon: data.matkaTelefon || '',
            matkaEmail: data.matkaEmail || '',
            ojciecImie: data.ojciecImie || '',
            ojciecTelefon: data.ojciecTelefon || '',
            ojciecEmail: data.ojciecEmail || '',
            kontaktNaglyImie: data.kontaktNaglyImie || '',
            kontaktNaglyTelefon: data.kontaktNaglyTelefon || '',
            kontaktNaglyRelacja: data.kontaktNaglyRelacja || ''
        };

        Store.updatePatient(_id, payload);
    }

    function scheduleAutosave() {
        if (_autosaveTimer) clearTimeout(_autosaveTimer);
        _autosaveTimer = setTimeout(autosaveNow, 400);
    }

    form.addEventListener('input', scheduleAutosave);
    form.addEventListener('change', scheduleAutosave);

    return root;
}
