// ============================================================================
// view-patient-detail.js — karta pacjenta (edit = view, jedno miejsce).
//
// Po PR-H (2026-05-01 cd. 2): zakładka „Pacjent" jest **edytowalna inline**
// z autozapisem 400 ms — bez przycisku „✎ Edytuj" i bez osobnego
// `view-patient-form.js`. Analogicznie do wizyty: edit = view.
//
// Hash:
//   #/patients/new                   – nowy pacjent, lazy create przy 1. wpisie
//   #/patients/detail/:id            – edycja istniejącego, zakładka „Pacjent"
//   #/patients/detail/:id/documents  – zakładka „Dokumenty" (stub, Faza 3)
//   #/patients/edit/:id              – alias do `/detail/:id` (legacy)
//
// Layout ATOL: lewa kolumna (avatar + pionowe zakładki + skróty), prawa
// kolumna — karty „Pacjent" + „Dane kontaktowe + adres + adres koresp." +
// „Powiązania z innymi kontami" (gdy minor lub są opiekunowie).
//
// Akcje w nagłówku:
//   • ← Wróć do listy
//   • 📦 Archiwizuj pacjenta / ↩ Przywróć z archiwum  (z `openConfirm`)
// ============================================================================

import { Store } from './_store.js';
import { openConfirm } from './_modal.js';

// ---- helpers (lokalne) -----------------------------------------------------

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

function ageOf(patient) {
    if (!patient) return '';
    if (patient.wiek) return String(patient.wiek);
    if (patient.dataUrodzenia) {
        const d = new Date(patient.dataUrodzenia);
        if (!isNaN(d.getTime())) {
            const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
            return String(age);
        }
    }
    return '';
}

function ageFromDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return String(Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000)));
}

function toast(variant, title, message) {
    if (window.PsyToast) {
        window.PsyToast.notify({ variant, title, message }, 'psy-app-toasts');
    }
}

/**
 * Wiersz formularza w karcie detali pacjenta — etykieta po lewej, kontrolka
 * po prawej (analogicznie do read-only field-row, ale z `<input>`).
 *
 * @param {object} opts
 *   - label: widoczna etykieta (z dwukropkiem na końcu doklei się sam)
 *   - name : atrybut `name` na inpucie (= klucz pola pacjenta)
 *   - value: wartość początkowa
 *   - type : 'text' (default) | 'date' | 'tel' | 'email' | 'select' | 'textarea' | 'checkbox'
 *   - options: tablica { value, label } dla `type='select'`
 *   - readonly: true → input read-only (tło szare)
 *   - placeholder
 *   - mono: monospace (np. PESEL/telefon)
 *   - rows: liczba wierszy textarea
 *   - inputAttrs: dodatkowe atrybuty (np. maxlength)
 */
function editableRow(opts = {}) {
    const {
        label, name, value = '',
        type = 'text', options = [], readonly = false,
        placeholder = '', mono = false, rows = 2, inputAttrs = {}
    } = opts;

    let control;
    if (type === 'select') {
        control = el('select', { name, class: 'psy-pdf__input' });
        for (const o of options) {
            control.appendChild(el('option', {
                value: o.value,
                selected: o.value === value
            }, [o.label || o.value || '']));
        }
    } else if (type === 'textarea') {
        control = el('textarea', {
            name, rows,
            class: 'psy-pdf__input psy-pdf__input--textarea',
            placeholder,
            readonly: readonly || false
        });
        control.value = value || '';
    } else if (type === 'checkbox') {
        control = el('input', {
            type: 'checkbox',
            name,
            class: 'psy-pdf__input--checkbox',
            checked: !!value,
            ...inputAttrs
        });
    } else {
        const attrs = {
            type, name,
            class: 'psy-pdf__input' + (mono ? ' psy-pdf__input--mono' : ''),
            value: value || '',
            placeholder,
            ...inputAttrs
        };
        if (readonly) attrs.readonly = true;
        control = el('input', attrs);
    }

    return el('div', { class: 'psy-patient-detail__field-row psy-patient-detail__field-row--editable' }, [
        el('label', {
            class: 'psy-patient-detail__field-label',
            for: name ? ('psy-pf-' + name) : undefined
        }, [label + ':']),
        el('div', { class: 'psy-patient-detail__field-value psy-patient-detail__field-value--editable' }, [control])
    ]);
}

// ---- TABS ------------------------------------------------------------------

const REAL_TABS = [
    { id: 'patient',   label: 'Pacjent',   icon: '📇' },
    { id: 'documents', label: 'Dokumenty', icon: '📁' }
];

const SHORTCUT_TABS = [
    { id: 'history',         label: 'Historia wizyt', icon: '🗓️',  route: '#/history',         counter: (pid) => Store.getVisits(pid).length },
    { id: 'meds',            label: 'Leki',           icon: '💊', route: '#/meds',            counter: (pid) => Store.getMeds(pid).length },
    { id: 'diagnoses',       label: 'Diagnozy',       icon: '🏥', route: '#/diagnoses',       counter: (pid) => Store.getDiagnoses(pid).length },
    { id: 'recommendations', label: 'Zalecenia',      icon: '📋', route: '#/recommendations', counter: (pid) => Store.getRecommendations(pid).length },
    { id: 'tests',           label: 'Testy',          icon: '📊', route: '#/tests',           counter: (pid) => Store.getTests(pid).length }
];

// ---- ENTRYPOINT ------------------------------------------------------------

/**
 * @param {object} opts
 *   - id: string|null  — `null` = nowy pacjent (lazy create)
 *   - tab: 'patient' | 'documents'
 */
export function renderPatientDetail(opts = {}) {
    const { id = null, tab = 'patient' } = opts;
    let _id = id;
    let patient = _id ? (Store.state.patients.find((p) => p.id === _id) || null) : null;
    const isNew = !patient;
    const initial = patient || {};

    const root = el('div', {
        class: 'psy-new-view psy-patient-detail-view',
        dataset: { live: 'true' }   // app-new pomija pasywny re-render (autozapis)
    });

    // === Breadcrumb + nagłówek ===
    const breadcrumb = el('nav', { class: 'psy-new-breadcrumb' }, [
        el('a', {
            href: '#/patients',
            class: 'psy-new-breadcrumb__link',
            onclick: (e) => { e.preventDefault(); window.location.hash = '#/patients'; }
        }, ['📋 Pacjenci']),
        el('span', { class: 'psy-new-breadcrumb__sep' }, ['›']),
        el('span', { class: 'psy-new-breadcrumb__current' }, [
            isNew
                ? '+ Nowy pacjent'
                : (initial.imie || '') + ' ' + (initial.nazwisko || '')
        ])
    ]);

    const titleParts = [
        isNew
            ? '+ Nowy pacjent'
            : (initial.imie || '') + ' ' + (initial.nazwisko || ''),
        !isNew && initial.archived
            ? el('span', { class: 'psy-new-badge psy-new-badge--neutral', style: { marginLeft: '10px', fontSize: '12px' } }, ['archiwum'])
            : null
    ].filter(Boolean);

    // === Akcje nagłówka ===
    const backBtn = el('button', {
        class: 'btn btn--secondary',
        onclick: () => { window.location.hash = '#/patients'; }
    }, ['← Wróć do listy']);

    const archiveBtn = !isNew ? el('button', {
        class: 'btn btn--' + (initial.archived ? 'success' : 'secondary'),
        title: initial.archived ? 'Przywróć z archiwum' : 'Przenieś pacjenta do archiwum',
        onclick: async () => {
            const ok = await openConfirm({
                title: initial.archived ? 'Przywrócić z archiwum?' : 'Archiwizować pacjenta?',
                message: initial.archived
                    ? `Pacjent „${initial.imie || ''} ${initial.nazwisko || ''}" zostanie przywrócony na listę aktywnych.`
                    : `Pacjent „${initial.imie || ''} ${initial.nazwisko || ''}" zostanie przeniesiony do archiwum. Operację można cofnąć.`,
                confirmLabel: initial.archived ? 'Przywróć' : 'Archiwizuj',
                variant: initial.archived ? 'primary' : 'secondary'
            });
            if (ok) {
                Store.archivePatient(_id, !initial.archived);
                toast('info',
                    initial.archived ? 'Przywrócono z archiwum' : 'Zarchiwizowano pacjenta',
                    (initial.imie || '') + ' ' + (initial.nazwisko || ''));
                if (window.AppController) window.AppController._renderView(true);
            }
        }
    }, [initial.archived ? '↩ Przywróć z archiwum' : '📦 Archiwizuj pacjenta']) : null;

    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            breadcrumb,
            el('h1', { class: 'psy-new-view__title psy-patient-detail__title' }, titleParts),
            el('div', { class: 'psy-new-view__subtitle' }, [
                isNew
                    ? 'Kod nadany po pierwszej zmianie · '
                    : ('Kod: ' + initial.id +
                        (initial.pesel ? ' · PESEL ' + initial.pesel : '') +
                        (ageOf(initial) ? ' · ' + ageOf(initial) + ' lat' : '') + ' · '),
                el('span', { class: 'psy-new-hint' }, ['💾 autozapis aktywny'])
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            backBtn, archiveBtn
        ].filter(Boolean))
    ]));

    /* === Body: 2-column layout === */
    const layout = el('div', { class: 'psy-patient-detail__layout' });

    // === LEFT COL: avatar + tabs ===
    const sidebar = el('aside', { class: 'psy-patient-detail__sidebar' });
    sidebar.appendChild(renderAvatar(initial, isNew));
    sidebar.appendChild(renderSidebarNav(initial, tab, isNew));
    layout.appendChild(sidebar);

    // === RIGHT COL: tab content ===
    const main = el('section', { class: 'psy-patient-detail__main' });
    if (tab === 'documents') {
        main.appendChild(renderDocumentsTab(initial, isNew));
    } else {
        main.appendChild(renderPatientTab(initial));
    }
    layout.appendChild(main);

    root.appendChild(layout);

    /* === Autozapis + lazy create === */
    let _autosaveTimer = null;

    function readForm() {
        const out = {};
        root.querySelectorAll('input[name], select[name], textarea[name]').forEach((node) => {
            if (!node.name) return;
            if (node.type === 'checkbox') out[node.name] = !!node.checked;
            else out[node.name] = node.value;
        });
        return out;
    }

    function ensureExists(data) {
        if (_id) return Store.state.patients.find((p) => p.id === _id) || null;
        const created = Store.addPatient({
            imie: (data.imie || '').trim(),
            nazwisko: (data.nazwisko || '').trim(),
            archived: false
        });
        _id = created.id;
        try { history.replaceState(null, '', '#/patients/detail/' + _id); } catch (_) {}
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

        // Przelicz wiek jeśli zmieniła się data urodzenia
        const updatedAge = data.dataUrodzenia ? ageFromDate(data.dataUrodzenia) : '';
        const ageInput = root.querySelector('input[name="wiek"]');
        if (ageInput && data.dataUrodzenia) {
            ageInput.value = updatedAge;
        }

        // Toggle widoczności karty „Powiązania" przy zmianie minor
        const minorOn = !!data.minor;
        const relationsCard = root.querySelector('.psy-patient-detail__card--relations');
        if (relationsCard) {
            relationsCard.style.display = minorOn ? '' : 'none';
        }

        const payload = {
            tytul: data.tytul || '',
            imie: String(data.imie || '').trim(),
            nazwisko: String(data.nazwisko || '').trim(),
            pesel: (data.pesel || '').trim(),
            plec: data.plec || '',
            dataUrodzenia: data.dataUrodzenia || '',
            wiek: updatedAge || '',
            obywatelstwo: (data.obywatelstwo || '').trim(),
            lekarz: (data.lekarz || '').trim(),
            placowka: (data.placowka || '').trim(),
            grupa: (data.grupa || '').trim(),
            uwagi: (data.uwagi || '').trim(),
            minor: minorOn,
            telefon: (data.telefon || '').trim(),
            email: (data.email || '').trim(),
            adres: (data.adres || '').trim(),
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

    root.addEventListener('input', scheduleAutosave);
    root.addEventListener('change', scheduleAutosave);

    return root;
}

// ---- AVATAR ---------------------------------------------------------------

function renderAvatar(patient, isNew) {
    const initials = isNew
        ? '?'
        : [(patient.imie || '?').charAt(0), (patient.nazwisko || '?').charAt(0)]
            .join('').toUpperCase();
    return el('div', { class: 'psy-patient-detail__avatar' }, [
        el('div', { class: 'psy-patient-detail__avatar-img' }, [
            el('span', { class: 'psy-patient-detail__avatar-initials' }, [initials])
        ]),
        el('div', { class: 'psy-patient-detail__avatar-caption' }, [
            isNew ? '(nowy)' : (patient.id || '')
        ])
    ]);
}

// ---- SIDEBAR NAV ----------------------------------------------------------

function renderSidebarNav(patient, activeTab, isNew) {
    const wrap = el('nav', { class: 'psy-patient-detail__tabs' });

    // Realne zakładki
    for (const t of REAL_TABS) {
        const active = activeTab === t.id;
        wrap.appendChild(el('button', {
            type: 'button',
            class: 'psy-patient-detail__tab' + (active ? ' is-active' : ''),
            onclick: () => {
                if (isNew) return; // dla nowego pacjenta jeszcze nie ma route
                window.location.hash = '#/patients/detail/' + patient.id +
                    (t.id === 'patient' ? '' : '/' + t.id);
            }
        }, [
            el('span', { class: 'psy-patient-detail__tab-icon' }, [t.icon]),
            el('span', { class: 'psy-patient-detail__tab-label' }, [t.label])
        ]));
    }

    // Skróty (tylko gdy pacjent istnieje)
    if (!isNew) {
        wrap.appendChild(el('div', { class: 'psy-patient-detail__tabs-sep' }, ['Sekcje pacjenta']));
        for (const s of SHORTCUT_TABS) {
            const count = (typeof s.counter === 'function') ? s.counter(patient.id) : 0;
            wrap.appendChild(el('button', {
                type: 'button',
                class: 'psy-patient-detail__tab psy-patient-detail__tab--shortcut',
                onclick: (e) => {
                    e.stopPropagation();
                    Store.selectPatient(patient);
                    window.location.hash = s.route;
                },
                title: 'Otwórz w głównym menu'
            }, [
                el('span', { class: 'psy-patient-detail__tab-icon' }, [s.icon]),
                el('span', { class: 'psy-patient-detail__tab-label' }, [s.label]),
                el('span', { class: 'psy-patient-detail__tab-count' }, [String(count)])
            ]));
        }
    }

    return wrap;
}

// ---- ZAKŁADKA „Pacjent" — edytowalny formularz ----------------------------

function renderPatientTab(patient) {
    const wrap = el('div', { class: 'psy-patient-detail__tab-content' });

    const cards = el('div', { class: 'psy-patient-detail__cards' });
    cards.appendChild(renderPatientCard(patient));
    cards.appendChild(renderContactCard(patient));
    wrap.appendChild(cards);

    // Karta „Powiązania" — domyślnie ukryta gdy nie minor (toggle w autosave)
    const relationsCard = renderRelationsCard(patient);
    if (!patient.minor && !patient.matkaImie && !patient.ojciecImie && !patient.kontaktNaglyImie) {
        relationsCard.style.display = 'none';
    }
    wrap.appendChild(relationsCard);

    return wrap;
}

function renderPatientCard(patient) {
    const card = el('div', { class: 'psy-patient-detail__card' });
    card.appendChild(el('h2', { class: 'psy-patient-detail__card-title' }, ['Pacjent']));

    const tbl = el('div', { class: 'psy-patient-detail__field-table' });

    tbl.appendChild(editableRow({
        label: 'Tytuł', name: 'tytul', value: patient.tytul || '',
        placeholder: 'np. dr, mgr…'
    }));
    tbl.appendChild(editableRow({
        label: 'Imię', name: 'imie', value: patient.imie || ''
    }));
    tbl.appendChild(editableRow({
        label: 'Nazwisko', name: 'nazwisko', value: patient.nazwisko || ''
    }));
    tbl.appendChild(editableRow({
        label: 'PESEL', name: 'pesel', value: patient.pesel || '',
        mono: true,
        inputAttrs: { maxlength: '11', inputmode: 'numeric', pattern: '[0-9]{11}' }
    }));
    tbl.appendChild(editableRow({
        label: 'Płeć', name: 'plec', value: patient.plec || '',
        type: 'select',
        options: [
            { value: '', label: '— wybierz —' },
            { value: 'Kobieta', label: 'Kobieta' },
            { value: 'Mężczyzna', label: 'Mężczyzna' },
            { value: 'Inna / nie określono', label: 'Inna / nie określono' }
        ]
    }));
    tbl.appendChild(editableRow({
        label: 'Data urodzenia', name: 'dataUrodzenia',
        value: patient.dataUrodzenia || '',
        type: 'date'
    }));
    tbl.appendChild(editableRow({
        label: 'Wiek', name: 'wiek',
        value: ageOf(patient),
        readonly: true
    }));
    tbl.appendChild(editableRow({
        label: 'Niepełnoletni', name: 'minor',
        value: !!patient.minor, type: 'checkbox'
    }));
    tbl.appendChild(editableRow({
        label: 'Obywatelstwo', name: 'obywatelstwo', value: patient.obywatelstwo || '',
        placeholder: 'np. polskie'
    }));
    tbl.appendChild(editableRow({
        label: 'Lekarz prowadzący', name: 'lekarz', value: patient.lekarz || ''
    }));
    tbl.appendChild(editableRow({
        label: 'Placówka', name: 'placowka', value: patient.placowka || ''
    }));
    tbl.appendChild(editableRow({
        label: 'Grupa', name: 'grupa', value: patient.grupa || ''
    }));
    tbl.appendChild(editableRow({
        label: 'Karta pacjenta', name: 'kodPacjenta',
        value: patient.id || '(nadany po 1. zmianie)',
        readonly: true, mono: true
    }));
    tbl.appendChild(editableRow({
        label: 'Uwagi', name: 'uwagi', value: patient.uwagi || '',
        type: 'textarea', rows: 3
    }));

    card.appendChild(tbl);
    return card;
}

function renderContactCard(patient) {
    const card = el('div', { class: 'psy-patient-detail__card' });

    // Dane kontaktowe
    card.appendChild(el('h2', { class: 'psy-patient-detail__card-title' }, ['Dane kontaktowe']));
    const kontakt = el('div', { class: 'psy-patient-detail__field-table' });
    kontakt.appendChild(editableRow({
        label: 'Telefon', name: 'telefon', value: patient.telefon || '',
        type: 'tel', mono: true, placeholder: '+48 ...'
    }));
    kontakt.appendChild(editableRow({
        label: 'E-mail', name: 'email', value: patient.email || '',
        type: 'email'
    }));
    card.appendChild(kontakt);

    // Adres zamieszkania
    card.appendChild(el('h3', { class: 'psy-patient-detail__card-subtitle' }, ['Adres zamieszkania']));
    const adres = el('div', { class: 'psy-patient-detail__field-table' });
    adres.appendChild(editableRow({
        label: 'Adres', name: 'adres', value: patient.adres || '',
        type: 'textarea', rows: 2,
        placeholder: 'ul. ..., kod pocztowy, miasto'
    }));
    card.appendChild(adres);

    // Adres korespondencyjny
    card.appendChild(el('h3', { class: 'psy-patient-detail__card-subtitle' }, ['Adres korespondencyjny']));
    const koresp = el('div', { class: 'psy-patient-detail__field-table' });
    koresp.appendChild(el('div', { class: 'psy-patient-detail__hint' }, [
        'inny niż adres zamieszkania ☐ (TODO: pole opcjonalne — Faza 5)'
    ]));
    card.appendChild(koresp);

    return card;
}

function renderRelationsCard(patient) {
    const card = el('div', {
        class: 'psy-patient-detail__card psy-patient-detail__card--full psy-patient-detail__card--relations'
    });
    card.appendChild(el('h2', { class: 'psy-patient-detail__card-title' }, ['Powiązania z innymi kontami']));

    const tbl = el('div', { class: 'psy-patient-detail__field-table psy-patient-detail__field-table--two-col' });

    // Matka
    tbl.appendChild(editableRow({ label: 'Matka — imię i nazwisko', name: 'matkaImie', value: patient.matkaImie || '' }));
    tbl.appendChild(editableRow({ label: 'Telefon (matka)', name: 'matkaTelefon', value: patient.matkaTelefon || '', type: 'tel', mono: true }));
    tbl.appendChild(editableRow({ label: 'E-mail (matka)', name: 'matkaEmail', value: patient.matkaEmail || '', type: 'email' }));

    // Ojciec
    tbl.appendChild(editableRow({ label: 'Ojciec — imię i nazwisko', name: 'ojciecImie', value: patient.ojciecImie || '' }));
    tbl.appendChild(editableRow({ label: 'Telefon (ojciec)', name: 'ojciecTelefon', value: patient.ojciecTelefon || '', type: 'tel', mono: true }));
    tbl.appendChild(editableRow({ label: 'E-mail (ojciec)', name: 'ojciecEmail', value: patient.ojciecEmail || '', type: 'email' }));

    // Kontakt awaryjny
    tbl.appendChild(editableRow({ label: 'Kontakt awaryjny — imię', name: 'kontaktNaglyImie', value: patient.kontaktNaglyImie || '' }));
    tbl.appendChild(editableRow({ label: 'Telefon awaryjny', name: 'kontaktNaglyTelefon', value: patient.kontaktNaglyTelefon || '', type: 'tel', mono: true }));
    tbl.appendChild(editableRow({ label: 'Relacja', name: 'kontaktNaglyRelacja', value: patient.kontaktNaglyRelacja || '', placeholder: 'np. małżonek, rodzic' }));

    card.appendChild(tbl);
    return card;
}

// ---- ZAKŁADKA „Dokumenty" — STUB do Fazy 3 --------------------------------

function renderDocumentsTab(patient, isNew) {
    const wrap = el('div', { class: 'psy-patient-detail__tab-content' });

    const card = el('div', { class: 'psy-patient-detail__card psy-patient-detail__card--full' });
    card.appendChild(el('div', { class: 'psy-patient-detail__docs-header' }, [
        el('h2', { class: 'psy-patient-detail__card-title', style: { margin: '0' } }, ['Dokumenty pacjenta']),
        el('button', {
            class: 'btn btn--primary',
            onclick: () => {
                toast('warning', 'Wymaga podpięcia folderu',
                    'Upload plików zostanie aktywowany po podpięciu folderu lokalnego lub Google Drive (Faza 3 — model folder per pacjent).');
            }
        }, ['⬆ Wgraj plik'])
    ]));

    if (!isNew) {
        card.appendChild(el('div', { class: 'psy-patient-detail__hint', style: { marginBottom: '12px' } }, [
            '💡 Dokumenty będą przechowywane w folderze pacjenta: ',
            el('code', {}, ['pacjenci/' + (patient.id || '?') + '_' +
                (patient.imie || '') + '_' + (patient.nazwisko || '') + '/']),
            ' (lokalnie lub na Google Drive).'
        ]));
    }

    card.appendChild(el('div', { class: 'psy-new-empty', style: { padding: '40px 20px', background: '#F9FAFB', borderRadius: '8px' } }, [
        el('div', { class: 'psy-new-empty__icon' }, ['📁']),
        el('div', { class: 'psy-new-empty__title' }, ['Brak dokumentów']),
        el('div', { class: 'psy-new-empty__description' }, [
            'Wgraj pierwszy plik, aby utworzyć folder pacjenta. ' +
            'Obsługiwane: PDF, DOCX, XLSX, JPG, PNG.'
        ]),
        el('div', { class: 'psy-new-hint', style: { marginTop: '14px', fontSize: '12px' } }, [
            '⚠ Funkcja zostanie aktywowana w Fazie 3 (PR-10/PR-11). ' +
            'W obecnej fazie dane pacjenta są w localStorage — bez plików.'
        ])
    ]));

    wrap.appendChild(card);
    return wrap;
}
