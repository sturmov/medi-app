// ============================================================================
// view-patient-detail.js — karta pacjenta (Dane identyfikacyjne).
//
// PR-J10 (2026-05-11): single-column layout.
//   • Klientka: „pacjent to właśnie ta główna strona; dokumenty są już w menu".
//   • Usunięta lewa kolumna z awatarem + pionowe zakładki + skróty.
//   • Usunięty przełącznik „📇 Pacjent / 📁 Dokumenty" — Dokumenty są pod
//     osobnym routem `#/documents` w głównym sidebarze (PR-J9).
//   • Główny przełącznik wewnątrz widoku to 5 podzakładek z PR-J6:
//     Ogólne / Osoby upoważnione / Zgoda RODO / Inne / Opieka medyczna.
//
// Hash:
//   #/patients/new                   — nowy pacjent (lazy create)
//   #/patients/detail/:id            — edycja istniejącego
//   #/patients/edit/:id              — alias legacy → /detail/:id
//
// Karta jest **edytowalna inline** z autozapisem 400 ms.
// ============================================================================

import { Store } from './_store.js';
import { openConfirm } from './_modal.js';
import { downloadPatientWorkbook, buildFullPatient } from './_xlsx-codec.js';
// F5.4 (2026-05-11): walidatory PESEL/tel/mail + autofill z PESEL
import {
    validatePesel, parsePesel, validatePhone, validateEmail
} from './_form-helpers.js';

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
 * po prawej.
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

// ---- ENTRYPOINT ------------------------------------------------------------

/**
 * @param {object} opts
 *   - id: string|null  — `null` = nowy pacjent (lazy create)
 *
 * UWAGA: parametr `tab` (Pacjent / Dokumenty) został wycofany w PR-J10.
 * Dokumenty są dostępne pod osobnym route'em `#/documents` z głównego sidebara.
 */
export function renderPatientDetail(opts = {}) {
    const { id = null } = opts;
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

    // PR-K3 (2026-05-11) — Ad-hoc eksport pełnej dokumentacji pacjenta do
    // pliku XLSX (kopia/backup). Po podpięciu folderu autozapis robi to
    // automatycznie do `pacjenci/{KOD}_*/pacjent.xlsx` — ten przycisk pozwala
    // pobrać kopię ręcznie (np. do wysłania mailem, backupu, archiwum).
    const downloadXlsxBtn = !isNew ? el('button', {
        class: 'btn btn--secondary',
        title: 'Pobierz pełną kartę pacjenta jako plik XLSX (kopia/backup)',
        onclick: () => {
            try {
                const fullPatient = buildFullPatient(Store, _id);
                if (!fullPatient) {
                    toast('error', 'Brak pacjenta', 'Nie udało się znaleźć danych pacjenta.');
                    return;
                }
                downloadPatientWorkbook(fullPatient);
                toast('success', 'Wygenerowano kopię XLSX',
                    'Plik pobierany do folderu Pobrane.');
            } catch (e) {
                console.error('[downloadPatientWorkbook]', e);
                toast('error', 'Błąd generowania XLSX', String(e && e.message || e));
            }
        }
    }, ['⬇ Pobierz kopię']) : null;

    // PR-J12 (2026-05-11): nagłówek karty pacjenta zmienia kolor wg wieku
    // (Wariant A wymagań klientki). Próg 18 lat: dorosły → jasny niebieski,
    // dziecko → jasny róż. Spójne z badge'm „Pełnoletni"/„Nieletni" w pasku
    // pacjenta (sekcja 17 `.clinerules`). Stan „brak daty urodzenia" =
    // neutralny (bez modyfikatora).
    const _ageStr = ageOf(initial);
    const _ageNum = _ageStr ? parseInt(_ageStr, 10) : NaN;
    const _hasAge = !isNew && !isNaN(_ageNum);
    const _ageClass = _hasAge
        ? (_ageNum >= 18
            ? ' psy-new-view__header--adult'
            : ' psy-new-view__header--minor')
        : '';

    // PR-J15 (2026-05-16): nagłówek karty pacjenta UPROSZCZONY.
    // Klientka raport: „tam na górze jest tytuł, USUŃ" — duże <h1> z imieniem
    // + subtitle z PESEL/wiekiem duplikowały dane ze sticky paska pacjenta
    // w topbarze (PR-J2). Zostaje tylko cienki breadcrumb (kontekst nawigacji)
    // + strip akcji (← Wróć | ⬇ Pobierz | 📦 Archiwizuj). Dla nowego pacjenta
    // (lazy create, brak imienia) dodajemy minimalny nagłówek „+ Nowy pacjent".
    const headerLeft = el('div', { style: { minWidth: '0' } }, [breadcrumb]);
    if (isNew) {
        headerLeft.appendChild(el('div', {
            class: 'psy-new-view__subtitle',
            style: { marginTop: '4px' }
        }, [
            '+ Nowy pacjent · ',
            el('span', { class: 'psy-new-hint' }, ['Kod nadany po pierwszej zmianie · 💾 autozapis aktywny'])
        ]));
    }
    if (!isNew && initial.archived) {
        headerLeft.appendChild(el('div', { style: { marginTop: '4px' } }, [
            el('span', { class: 'psy-new-badge psy-new-badge--neutral' }, ['archiwum'])
        ]));
    }

    root.appendChild(el('div', {
        class: 'psy-new-view__header psy-patient-detail__header' + _ageClass,
        title: _hasAge
            ? (_ageNum >= 18 ? 'Pacjent pełnoletni' : 'Pacjent nieletni')
            : undefined
    }, [
        headerLeft,
        el('div', { class: 'psy-new-view__actions' }, [
            backBtn, downloadXlsxBtn, archiveBtn
        ].filter(Boolean))
    ]));


    /* === Body: single column (PR-J10) === */
    const main = el('section', { class: 'psy-patient-detail__main psy-patient-detail__main--full' });
    main.appendChild(renderPatientTab(initial));
    root.appendChild(main);

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
            drugieImie: (data.drugieImie || '').trim(),
            pesel: (data.pesel || '').trim(),
            plec: data.plec || '',
            dataUrodzenia: data.dataUrodzenia || '',
            wiek: updatedAge || '',
            obywatelstwo: (data.obywatelstwo || '').trim(),
            lekarz: (data.lekarz || '').trim(),
            placowka: (data.placowka || '').trim(),
            // PR-J15 (2026-05-16): pole `grupa` USUNIĘTE z UI — klientka „?".
            // Zachowujemy w payload dla wstecznej kompatybilności (jeśli ktoś
            // ma w localStorage), ale nie czytamy z formularza (input nie
            // istnieje → data.grupa === undefined → fallback do '').
            grupa: (data.grupa || '').trim(),
            uwagi: (data.uwagi || '').trim(),
            minor: minorOn,
            telefon: (data.telefon || '').trim(),
            email: (data.email || '').trim(),
            // PR-J15 (2026-05-16): adres rozbity na 3 osobne pola.
            // Legacy `adres` (string) zostaje w payload jako fallback dla
            // starych eksportów/migracji, ale priorytet mają nowe pola.
            adres: (data.adres || '').trim(),
            ulica: (data.ulica || '').trim(),
            kodPocztowy: (data.kodPocztowy || '').trim(),
            miasto: (data.miasto || '').trim(),
            // Adres korespondencyjny (gdy `korespRozny=true`)
            korespRozny: !!data.korespRozny,
            korespUlica: (data.korespUlica || '').trim(),
            korespKodPocztowy: (data.korespKodPocztowy || '').trim(),
            korespMiasto: (data.korespMiasto || '').trim(),
            matkaImie: data.matkaImie || '',

            matkaTelefon: data.matkaTelefon || '',
            matkaEmail: data.matkaEmail || '',
            ojciecImie: data.ojciecImie || '',
            ojciecTelefon: data.ojciecTelefon || '',
            ojciecEmail: data.ojciecEmail || '',
            kontaktNaglyImie: data.kontaktNaglyImie || '',
            kontaktNaglyTelefon: data.kontaktNaglyTelefon || '',
            kontaktNaglyRelacja: data.kontaktNaglyRelacja || '',
            // PR-J6 (2026-05-11): pola z nowych podzakładek
            //   Zgoda RODO / Inne / Opieka medyczna
            zgodaRodo: !!data.zgodaRodo,
            zgodaRodoData: data.zgodaRodoData || '',
            zgodaRodoKomentarz: (data.zgodaRodoKomentarz || '').trim(),
            innePole: (data.innePole || '').trim(),
            opiekaMedycznaHistoria: (data.opiekaMedycznaHistoria || '').trim()
        };

        Store.updatePatient(_id, payload);
    }

    function scheduleAutosave() {
        // F5.4: walidatory synchroniczne (PESEL/tel/mail) + autofill z PESEL —
        // pokazujemy błąd OD RAZU, nie czekamy na debounce.
        _runPatientValidators(root);
        if (_autosaveTimer) clearTimeout(_autosaveTimer);
        _autosaveTimer = setTimeout(autosaveNow, 400);
    }

    root.addEventListener('input', scheduleAutosave);
    root.addEventListener('change', scheduleAutosave);

    // F5.4: pierwsze uruchomienie walidatorów po renderze — żeby istniejące
    // legacy dane z błędnym formatem od razu pokazały ostrzeżenie.
    setTimeout(() => _runPatientValidators(root), 0);

    return root;
}

// ============================================================================
// F5.4 (2026-05-11): walidatory pól PESEL/tel/mail + autofill z PESEL.
//
// Walidacja jest OSTRZEGAWCZA — autozapis zawsze działa, błędny format pokazuje
// tylko czerwony inline-tekst pod polem. Klientka może wpisywać krok po kroku
// (np. „123…" → „12345…" → pełen PESEL), w międzyczasie walidator skarży się
// ale nic nie blokuje.
//
// Po wprowadzeniu poprawnego (checksum OK) PESEL, jeśli pola `dataUrodzenia` /
// `plec` są PUSTE — autofill z parsowanego PESEL + toast info. Nie nadpisujemy
// ręcznie wpisanych wartości.
// ============================================================================

const _patientValidationFields = [
    { name: 'pesel',                fn: validatePesel, msg: 'Nieprawidłowy PESEL (sprawdź 11 cyfr i sumę kontrolną).' },
    { name: 'telefon',              fn: validatePhone, msg: 'Format: +48 XXX XXX XXX lub 9 cyfr.' },
    { name: 'email',                fn: validateEmail, msg: 'Nieprawidłowy format e-maila (np. jan@example.com).' },
    { name: 'matkaTelefon',         fn: validatePhone, msg: 'Format: +48 XXX XXX XXX lub 9 cyfr.' },
    { name: 'matkaEmail',           fn: validateEmail, msg: 'Nieprawidłowy format e-maila.' },
    { name: 'ojciecTelefon',        fn: validatePhone, msg: 'Format: +48 XXX XXX XXX lub 9 cyfr.' },
    { name: 'ojciecEmail',          fn: validateEmail, msg: 'Nieprawidłowy format e-maila.' },
    { name: 'kontaktNaglyTelefon',  fn: validatePhone, msg: 'Format: +48 XXX XXX XXX lub 9 cyfr.' }
];

// Stan modułowy — żeby autofill z PESEL odpalał się TYLKO po transition
// „niepoprawny → poprawny", nie przy każdym keystroke po wpisaniu valid PESEL.
let _lastPeselValid = false;

function _runPatientValidators(root) {
    if (!root) return;

    for (const v of _patientValidationFields) {
        const input = root.querySelector(`[name="${v.name}"]`);
        if (!input) continue;
        const ok = v.fn(input.value || '');
        const fieldValue = input.closest('.psy-patient-detail__field-value');
        if (!fieldValue) continue;
        let errEl = fieldValue.querySelector('.psy-pdf__error');
        if (!ok) {
            if (!errEl) {
                errEl = el('div', { class: 'psy-pdf__error' });
                fieldValue.appendChild(errEl);
            }
            errEl.textContent = v.msg;
            errEl.hidden = false;
            input.classList.add('psy-pdf__input--invalid');
            input.setAttribute('aria-invalid', 'true');
        } else {
            if (errEl) {
                errEl.hidden = true;
                errEl.textContent = '';
            }
            input.classList.remove('psy-pdf__input--invalid');
            input.removeAttribute('aria-invalid');
        }
    }

    // F5.4 autofill z PESEL — tylko po transition false → true
    const peselInput = root.querySelector('[name="pesel"]');
    if (peselInput) {
        const val = String(peselInput.value || '').trim();
        const digits = val.replace(/\D/g, '');
        const isCurrentValid = digits.length === 11 && validatePesel(digits);
        if (isCurrentValid && !_lastPeselValid) {
            const parsed = parsePesel(digits);
            if (parsed) {
                let filled = [];
                const dataInput = root.querySelector('[name="dataUrodzenia"]');
                if (dataInput && !String(dataInput.value || '').trim()) {
                    dataInput.value = parsed.dataUrodzenia;
                    filled.push('data urodzenia');
                }
                const plecInput = root.querySelector('[name="plec"]');
                if (plecInput && !String(plecInput.value || '').trim()) {
                    plecInput.value = parsed.plec === 'M' ? 'Mężczyzna' : 'Kobieta';
                    filled.push('płeć');
                }
                // Wiek — autofill jeśli puste (czytany potem przez autosaveNow)
                const wiekInput = root.querySelector('[name="wiek"]');
                if (wiekInput && dataInput) {
                    wiekInput.value = ageFromDate(parsed.dataUrodzenia);
                }
                if (filled.length > 0 && typeof window !== 'undefined' && window.Toast) {
                    window.Toast.info(
                        'Wypełniono z PESEL: ' + filled.join(', ') + '.',
                        '✓ Autofill'
                    );
                }
            }
        }
        _lastPeselValid = isCurrentValid;
    }
}

// ---- ZAKŁADKA „Pacjent" — 5 podzakładek (PR-J6) ---------------------------
//
// PR-J6 (2026-05-11): 5 podzakładek wewnątrz karty pacjenta (z6.jpg):
//   1) Ogólne                    — dotychczasowe dane (PESEL/imię/adres/tel/mail)
//   2) Osoby upoważnione         — komu przekazywać dane medyczne, opiekun
//   3) Zgoda RODO                — checkbox + data + komentarz
//   4) Inne                      — wolne pole tekstowe
//   5) Opieka medyczna           — historia poprzednich kontaktów medycznych
//
// Pole „Kraj" nigdy nie zostało dodane (klientka przekreśliła w z3.jpg).

const PATIENT_SUBTABS = [
    { id: 'general',       label: 'Ogólne',             icon: '🆔' },
    { id: 'guardians',     label: 'Osoby upoważnione',  icon: '👥' },
    { id: 'rodo',          label: 'Zgoda RODO',         icon: '📜' },
    { id: 'other',         label: 'Inne',               icon: '➕' },
    { id: 'medical-care',  label: 'Opieka medyczna',    icon: '🏥' }
];

// Stan podzakładki — pamiętamy między re-renderami widoku (UI-side state, nie URL).
let _patientDetailSubTab = 'general';

function renderPatientTab(patient) {
    const wrap = el('div', { class: 'psy-patient-detail__tab-content' });

    // Drugi rząd tabsów (klientka, z3.jpg + z6.jpg)
    const tabsRow = el('div', { class: 'psy-patient-detail__subtabs' });
    for (const t of PATIENT_SUBTABS) {
        const active = _patientDetailSubTab === t.id;
        tabsRow.appendChild(el('button', {
            type: 'button',
            class: 'psy-patient-detail__subtab' + (active ? ' is-active' : ''),
            onclick: () => {
                _patientDetailSubTab = t.id;
                if (window.AppController) window.AppController._renderView(true);
            }
        }, [
            el('span', { class: 'psy-patient-detail__subtab-icon' }, [t.icon]),
            el('span', { class: 'psy-patient-detail__subtab-label' }, [t.label])
        ]));
    }
    wrap.appendChild(tabsRow);

    // Body — zawartość wybranej podzakładki
    const body = el('div', { class: 'psy-patient-detail__subtab-body' });

    switch (_patientDetailSubTab) {
        case 'guardians':
            body.appendChild(renderSubtabGuardians(patient));
            break;
        case 'rodo':
            body.appendChild(renderSubtabRodo(patient));
            break;
        case 'other':
            body.appendChild(renderSubtabOther(patient));
            break;
        case 'medical-care':
            body.appendChild(renderSubtabMedicalCare(patient));
            break;
        case 'general':
        default:
            body.appendChild(renderSubtabGeneral(patient));
            break;
    }

    wrap.appendChild(body);
    return wrap;
}

/* --- Subtab #1: Ogólne -- karty Pacjent + Kontakt + Powiązania (gdy minor) */
function renderSubtabGeneral(patient) {
    const wrap = el('div', { class: 'psy-patient-detail__subtab-content' });

    const cards = el('div', { class: 'psy-patient-detail__cards' });
    cards.appendChild(renderPatientCard(patient));
    cards.appendChild(renderContactCard(patient));
    wrap.appendChild(cards);

    // Karta „Powiązania" — domyślnie ukryta gdy nie minor.
    const relationsCard = renderRelationsCard(patient);
    if (!patient.minor && !patient.matkaImie && !patient.ojciecImie && !patient.kontaktNaglyImie) {
        relationsCard.style.display = 'none';
    }
    wrap.appendChild(relationsCard);

    return wrap;
}

/* --- Subtab #2: Osoby upoważnione --- */
function renderSubtabGuardians(patient) {
    const wrap = el('div', { class: 'psy-patient-detail__subtab-content' });
    wrap.appendChild(el('div', { class: 'psy-new-hint', style: { marginBottom: '12px' } }, [
        'Lista osób, którym wolno przekazywać informacje o stanie zdrowia pacjenta '
        + '(opiekunowie prawni, rodzina, inni). Klientka, z6.jpg: „komu przekazywać dane med + opiekun".'
    ]));

    // Reuse karty „Powiązania" — w niej są pola Matka/Ojciec/Kontakt awaryjny.
    const card = renderRelationsCard(patient);
    card.style.display = '';   // zawsze widoczna w tej zakładce
    wrap.appendChild(card);

    // Lista dodatkowych osób upoważnionych — stub do Fazy 5.
    const stubCard = el('div', { class: 'psy-patient-detail__card psy-patient-detail__card--full' }, [
        el('h2', { class: 'psy-patient-detail__card-title' }, ['Dodatkowe osoby upoważnione']),
        el('div', { class: 'psy-new-empty', style: { padding: '24px 14px', background: '#F9FAFB', borderRadius: '8px' } }, [
            el('div', { class: 'psy-new-empty__icon' }, ['👥']),
            el('div', { class: 'psy-new-empty__title' }, ['Lista w przygotowaniu']),
            el('div', { class: 'psy-new-empty__description' }, [
                'W kolejnej iteracji dodamy pełną listę osób upoważnionych z polami: '
                + 'Imię, Nazwisko, Telefon, Komentarz. Obecnie używamy karty „Powiązania" powyżej.'
            ])
        ])
    ]);
    wrap.appendChild(stubCard);

    return wrap;
}

/* --- Subtab #3: Zgoda RODO --- */
function renderSubtabRodo(patient) {
    const wrap = el('div', { class: 'psy-patient-detail__subtab-content' });

    const card = el('div', { class: 'psy-patient-detail__card psy-patient-detail__card--full' });
    card.appendChild(el('h2', { class: 'psy-patient-detail__card-title' }, ['Zgoda na przetwarzanie danych']));
    card.appendChild(el('div', { class: 'psy-new-hint', style: { marginBottom: '12px', textAlign: 'left' } }, [
        'Zgoda na przetwarzanie danych osobowych zgodnie z RODO. Należy potwierdzić, '
        + 'zaznaczając checkbox po zapoznaniu pacjenta z klauzulą informacyjną.'
    ]));

    const tbl = el('div', { class: 'psy-patient-detail__field-table' });

    tbl.appendChild(editableRow({
        label: 'Pacjent wyraził zgodę',
        name: 'zgodaRodo',
        value: !!patient.zgodaRodo,
        type: 'checkbox'
    }));
    tbl.appendChild(editableRow({
        label: 'Data wyrażenia zgody',
        name: 'zgodaRodoData',
        value: patient.zgodaRodoData || '',
        type: 'date'
    }));
    tbl.appendChild(editableRow({
        label: 'Komentarz',
        name: 'zgodaRodoKomentarz',
        value: patient.zgodaRodoKomentarz || '',
        type: 'textarea',
        rows: 3,
        placeholder: 'np. zgoda na przesyłanie wyników mailem, zgoda na kontakt z opiekunem…'
    }));

    card.appendChild(tbl);
    wrap.appendChild(card);
    return wrap;
}

/* --- Subtab #4: Inne --- */
function renderSubtabOther(patient) {
    const wrap = el('div', { class: 'psy-patient-detail__subtab-content' });

    const card = el('div', { class: 'psy-patient-detail__card psy-patient-detail__card--full' });
    card.appendChild(el('h2', { class: 'psy-patient-detail__card-title' }, ['Inne informacje']));
    card.appendChild(el('div', { class: 'psy-new-hint', style: { marginBottom: '12px', textAlign: 'left' } }, [
        'Dowolne dodatkowe informacje, które nie mieszczą się w pozostałych sekcjach.'
    ]));

    const tbl = el('div', { class: 'psy-patient-detail__field-table' });
    tbl.appendChild(editableRow({
        label: 'Dodatkowe informacje',
        name: 'innePole',
        value: patient.innePole || '',
        type: 'textarea',
        rows: 8,
        placeholder: 'wpisz dowolne notatki — np. uczulenia, preferencje, ograniczenia, kontakty pomocnicze…'
    }));

    card.appendChild(tbl);
    wrap.appendChild(card);
    return wrap;
}

/* --- Subtab #5: Opieka medyczna --- */
function renderSubtabMedicalCare(patient) {
    const wrap = el('div', { class: 'psy-patient-detail__subtab-content' });

    const card = el('div', { class: 'psy-patient-detail__card psy-patient-detail__card--full' });
    card.appendChild(el('h2', { class: 'psy-patient-detail__card-title' }, ['Opieka medyczna']));
    card.appendChild(el('div', { class: 'psy-new-hint', style: { marginBottom: '12px', textAlign: 'left' } }, [
        'Lista poprzednich kontaktów medycznych pacjenta — z kim pacjent miał wcześniej '
        + 'kontakt terapeutyczny lub psychiatryczny. Klientka, z6.jpg.'
    ]));

    const tbl = el('div', { class: 'psy-patient-detail__field-table' });
    tbl.appendChild(editableRow({
        label: 'Historia kontaktów medycznych',
        name: 'opiekaMedycznaHistoria',
        value: patient.opiekaMedycznaHistoria || '',
        type: 'textarea',
        rows: 8,
        placeholder: 'np. „2024–2025 — dr Kowalski (psychiatra, terapia farmakologiczna). 2023 — mgr Nowak (psycholog, CBT)."…'
    }));

    card.appendChild(tbl);
    wrap.appendChild(card);
    wrap.appendChild(el('div', {
        class: 'psy-new-hint',
        style: { marginTop: '12px', padding: '10px 14px', background: '#FEFCE8', borderRadius: '6px', textAlign: 'left' }
    }, [
        '🚧 W kolejnej iteracji: zamiana wolnego tekstu na strukturalną listę rekordów '
        + '(Imię, Nazwisko, Specjalność, Data od, Data do, Komentarz).'
    ]));

    return wrap;
}

// ---- Karty pacjenta (legacy, używane w „Ogólne") --------------------------

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
        label: 'Drugie imię', name: 'drugieImie', value: patient.drugieImie || '',
        placeholder: '(opcjonalnie)'
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
    // PR-J15 (2026-05-16): Lekarz prowadzący + Placówka → readonly auto-fill.
    // Klientka raport: „tutaj automatycznie musi być — dane z profilu
    // prowadzącego dokumentację" / „najlepiej też automatycznie". W kolejnej
    // fazie pełna integracja z profilem usera (Settings). Na razie placeholder
    // informujący o automatyzacji + ikona 🔒.
    tbl.appendChild(editableRow({
        label: '🔒 Lekarz prowadzący', name: 'lekarz', value: patient.lekarz || '',
        readonly: true,
        placeholder: '(auto z profilu prowadzącego — Faza X)'
    }));
    tbl.appendChild(editableRow({
        label: '🔒 Placówka', name: 'placowka', value: patient.placowka || '',
        readonly: true,
        placeholder: '(auto z profilu prowadzącego — Faza X)'
    }));
    // PR-J15 (2026-05-16): pole „Grupa" USUNIĘTE — klientka nie wie czemu
    // służyło. `patient.grupa` zostaje jako legacy w localStorage (nie kasujemy
    // wartości), po prostu nie renderujemy w UI.
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

// PR-J15 (2026-05-16): jednorazowy parser legacy `patient.adres` (string)
// → 3 osobne pola { ulica, kodPocztowy, miasto }. Heurystyka:
//   "ul. Długa 12, 00-001 Warszawa"   → ulica="ul. Długa 12", kod="00-001", miasto="Warszawa"
//   "ul. Długa 12, Warszawa"          → ulica="ul. Długa 12", miasto="Warszawa"
//   inny format                       → cały string → ulica, reszta puste
function _parseLegacyAdres(legacy) {
    if (!legacy || typeof legacy !== 'string') return { ulica: '', kodPocztowy: '', miasto: '' };
    const parts = legacy.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return { ulica: '', kodPocztowy: '', miasto: '' };
    if (parts.length === 1) return { ulica: parts[0], kodPocztowy: '', miasto: '' };
    if (parts.length === 2) {
        // "ul. ..., [kod] miasto" lub "ul. ..., miasto"
        const m = parts[1].match(/^(\d{2}-\d{3})\s+(.+)$/);
        if (m) return { ulica: parts[0], kodPocztowy: m[1], miasto: m[2] };
        return { ulica: parts[0], kodPocztowy: '', miasto: parts[1] };
    }
    // 3+ części — "ul. ..., kod, miasto"
    return { ulica: parts[0], kodPocztowy: parts[1], miasto: parts.slice(2).join(', ') };
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

    // PR-J15 (2026-05-16): Adres rozbity na 3 osobne pola.
    // Klientka raport: „chyba zrób oddzielnie do wypełnienia · × kod · × miasto
    // · × ul. → wyżej masz przykład ze szwedzkiego". Migracja legacy:
    // jeśli istnieje stare pole `patient.adres` (string) i brak nowych pól →
    // parsujemy do { ulica, kodPocztowy, miasto } przy renderze.
    const _legacyParsed = _parseLegacyAdres(patient.adres);
    const _ulica       = patient.ulica       || _legacyParsed.ulica;
    const _kodPocztowy = patient.kodPocztowy || _legacyParsed.kodPocztowy;
    const _miasto      = patient.miasto      || _legacyParsed.miasto;

    // Adres zamieszkania
    card.appendChild(el('h3', { class: 'psy-patient-detail__card-subtitle' }, ['Adres zamieszkania']));
    const adres = el('div', { class: 'psy-patient-detail__field-table' });
    adres.appendChild(editableRow({
        label: 'Ulica', name: 'ulica', value: _ulica,
        placeholder: 'np. ul. Długa 12 m. 3'
    }));
    adres.appendChild(editableRow({
        label: 'Kod pocztowy', name: 'kodPocztowy', value: _kodPocztowy,
        mono: true, placeholder: '00-000',
        inputAttrs: { maxlength: '6', pattern: '\\d{2}-\\d{3}' }
    }));
    adres.appendChild(editableRow({
        label: 'Miasto', name: 'miasto', value: _miasto,
        placeholder: 'np. Warszawa'
    }));
    card.appendChild(adres);

    // PR-J15 (2026-05-16): Adres korespondencyjny — analogicznie 3 pola.
    // Domyślnie ukryte za checkboxem „Inny niż adres zamieszkania" — gdy
    // odznaczone, pola są zwijane (display:none przez klasę --koresp-hidden).
    card.appendChild(el('h3', { class: 'psy-patient-detail__card-subtitle' }, ['Adres korespondencyjny']));

    const _korespRozny = !!patient.korespRozny;
    const korespToggle = el('div', { class: 'psy-patient-detail__field-row psy-patient-detail__field-row--editable' }, [
        el('label', {
            class: 'psy-patient-detail__field-label',
            for: 'psy-pf-korespRozny'
        }, ['Inny niż adres zamieszkania:']),
        el('div', { class: 'psy-patient-detail__field-value psy-patient-detail__field-value--editable' }, [
            el('input', {
                type: 'checkbox',
                name: 'korespRozny',
                id: 'psy-pf-korespRozny',
                class: 'psy-pdf__input--checkbox',
                checked: _korespRozny
            })
        ])
    ]);
    const korespBox = el('div', {
        class: 'psy-patient-detail__field-table',
        style: { display: _korespRozny ? '' : 'none' },
        dataset: { korespBox: 'true' }
    });
    korespBox.appendChild(editableRow({
        label: 'Ulica (koresp.)', name: 'korespUlica', value: patient.korespUlica || '',
        placeholder: 'np. ul. Krótka 5'
    }));
    korespBox.appendChild(editableRow({
        label: 'Kod pocztowy (koresp.)', name: 'korespKodPocztowy', value: patient.korespKodPocztowy || '',
        mono: true, placeholder: '00-000',
        inputAttrs: { maxlength: '6', pattern: '\\d{2}-\\d{3}' }
    }));
    korespBox.appendChild(editableRow({
        label: 'Miasto (koresp.)', name: 'korespMiasto', value: patient.korespMiasto || '',
        placeholder: 'np. Kraków'
    }));

    const korespWrap = el('div', { class: 'psy-patient-detail__field-table' });
    korespWrap.appendChild(korespToggle);
    korespWrap.appendChild(korespBox);

    // Toggle visibility on checkbox change
    korespToggle.querySelector('input[type="checkbox"]').addEventListener('change', (ev) => {
        korespBox.style.display = ev.target.checked ? '' : 'none';
    });

    card.appendChild(korespWrap);

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
