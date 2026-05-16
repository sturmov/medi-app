// ============================================================================
// app-new.js — kontroler nowej aplikacji (app.html).
//
// Po refaktorze 2026-04-30 (CRUD inline + autozapis + runner testów):
//   - wszystkie formularze CRUD (Pacjent, Lek, Diagnoza, Zalecenie, Wizyta) są
//     widokami inline z autozapisem (route-based, brak modali);
//   - runner testów (PHQ-9, GAD-7) zamiast „toast PR-16";
//   - status wizyty: closed=false (Robocza, można skasować) / closed=true
//     (Zamknięta — wpis medyczny, bez kasacji z UI);
//   - jedyny modal w UI to `openConfirm` („Czy na pewno usunąć?").
//
// Architektura:
//   - statyczny shell HTML w app.html (#psy-new-shell, #psy-new-sidebar, …)
//   - vanilla JS kontroler `AppController` zarządza nawigacją/render
//   - `Store` (`js/views/_store.js`) trzyma dane + persystencję w localStorage
//   - widoki listy żyją w tym pliku, formularze inline w `js/views/view-*-form.js`,
//     formularz wizyty w `js/views/view-visit-form.js`, runner w `view-test-runner.js`.
//
// LIVE-VIEW: widoki formularzy mają `data-live="true"` na rootu — `_renderView()`
// pomija pasywny re-render (autozapis nie zabija formularza/focusu/scroll).
// ============================================================================

import './components/psy-toast.js';
import './components/psy-toast-container.js';

import { Store } from './views/_store.js';
import { APP_MENU, APP_PATIENTS_ROUTE, APP_SETTINGS_ROUTE, APP_DEFAULT_ROUTE } from './views/_menu.js';

import {
    VISIT_TYPES,
    visitTypeById,
    FAKE_MED_DICT
} from './views/_fake-data.js';

import { openConfirm } from './views/_modal.js';
import { renderVisitForm } from './views/view-visit-form.js';
import { renderDiagnosisForm } from './views/view-diagnosis-form.js';
import { renderRecommendationForm } from './views/view-recommendation-form.js';
import { renderMedForm } from './views/view-med-form.js';
import { renderPatientForm } from './views/view-patient-form.js';
import { renderPatientDetail } from './views/view-patient-detail.js';
import { renderTestRunner } from './views/view-test-runner.js';
import { renderTreatmentPlan } from './views/view-treatment-plan.js';
import { renderParameters } from './views/view-parameters.js';
import { renderDocuments } from './views/view-documents.js';
import { listAvailableTests } from './views/_tests-catalog.js';

import { showFolderGate, hideFolderGate, shouldShowGate } from './views/view-folder-gate.js';
import { installAutogrow } from './views/_autogrow.js';


// ---- helpers ---------------------------------------------------------------

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
    if (patient.wiek) return patient.wiek;
    if (patient.dataUrodzenia) {
        const d = new Date(patient.dataUrodzenia);
        if (!isNaN(d.getTime())) {
            const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
            return age + ' lat';
        }
    }
    return '';
}

/** PR-J2 (2026-05-11) — wiek pacjenta jako liczba (do badge'a pełnoletni/nieletni).
 *  Zwraca `null` gdy nie da się policzyć. */
function _computePatientAgeYears(patient) {
    if (!patient) return null;
    if (patient.dataUrodzenia) {
        const d = new Date(patient.dataUrodzenia);
        if (!isNaN(d.getTime())) {
            return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
        }
    }
    if (patient.wiek) {
        const n = parseInt(String(patient.wiek).replace(/\D/g, ''), 10);
        if (!isNaN(n)) return n;
    }
    return null;
}

/** PR-J2 (2026-05-11) — ikona płci dla paska pacjenta. */
function _sexIcon(plec) {
    if (!plec) return null;
    const s = String(plec).toLowerCase();
    if (s.startsWith('k')) return { glyph: '♀', cls: 'female' };
    if (s.startsWith('m')) return { glyph: '♂', cls: 'male' };
    return { glyph: '⚧', cls: 'other' };
}


function toast(variant, title, message) {
    if (window.PsyToast) {
        window.PsyToast.notify({ variant, title, message }, 'psy-app-toasts');
    }
}

function visitTypeLabel(type) {
    const t = visitTypeById(type);
    return t ? t.label : type;
}

// Stan filtrów per widok (utrzymywany pomiędzy re-renderami)
const _viewFilters = {
    patientsArchived: 'active'  // 'active' | 'archived' | 'all'
    // historyShowDrafts usunięty po PO 2026-05-01 (status Robocza/Zamknięta wycofany)
};

// Pamięć dla pickera testów (czy jest otwarty na liście Testów)
let _testsPickerOpen = false;

// PR-J3 (2026-05-11): stan submenu „Nowa wizyta" w sidebarze.
// Klientka (z2.jpg): klik „+ Nowa wizyta" rozwija/zwija listę kafelków typów.
// Stan trzymany w pamięci pomiędzy re-renderami. Domyślnie zamknięte.
let _sidebarVisitMenuOpen = false;


// ============================================================================
// VIEWS
// ============================================================================

// ----- Patients -------------------------------------------------------------

function viewPatients() {
    const allPatients = Store.state.patients;
    const current = Store.state.currentPatient;

    function applyArchivedFilter(list) {
        const mode = _viewFilters.patientsArchived;
        if (mode === 'all') return list;
        if (mode === 'archived') return list.filter((p) => p.archived === true);
        return list.filter((p) => !p.archived);
    }
    const patients = applyArchivedFilter(allPatients);

    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Pacjenci']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patients.length + ' ' + (patients.length === 1 ? 'pacjent' : 'pacjentów') +
                ' · ' + allPatients.length + ' łącznie w bazie'
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            el('button', {
                class: 'btn btn--primary',
                onclick: () => { window.location.hash = '#/patients/new'; }
            }, ['+ Nowy pacjent'])
        ])
    ]));

    // Toolbar (search + filter)
    const toolbar = el('div', { class: 'psy-new-toolbar' }, [
        el('div', { class: 'psy-new-toolbar__search' }, [
            el('input', {
                type: 'search',
                placeholder: 'Szukaj pacjenta (imię, nazwisko, PESEL)...',
                oninput: (e) => {
                    const q = (e.target.value || '').toLowerCase();
                    filterRows(root, q);
                }
            })
        ]),
        el('div', { class: 'psy-new-toolbar__filters' }, [
            el('select', {
                onchange: (e) => {
                    _viewFilters.patientsArchived = e.target.value;
                    AppController._renderView(true);
                }
            }, [
                el('option', { value: 'active',   selected: _viewFilters.patientsArchived === 'active' },   ['Aktywni']),
                el('option', { value: 'archived', selected: _viewFilters.patientsArchived === 'archived' }, ['Archiwalni']),
                el('option', { value: 'all',      selected: _viewFilters.patientsArchived === 'all' },      ['Wszyscy'])
            ])
        ])
    ]);
    root.appendChild(toolbar);

    const body = el('div', { class: 'psy-new-view__body psy-new-view__body--plain' });
    if (!patients.length) {
        const msg = _viewFilters.patientsArchived === 'archived'
            ? 'Brak zarchiwizowanych pacjentów.'
            : 'Dodaj pierwszego pacjenta, aby rozpocząć pracę.';
        body.appendChild(emptyState('📋', 'Brak pacjentów', msg, [
            { label: '+ Nowy pacjent', variant: 'primary', onClick: () => (window.location.hash = '#/patients/new') }
        ]));
    } else {
        const table = el('table', { class: 'psy-new-table' });
        table.appendChild(el('thead', {}, [
            el('tr', {}, [
                el('th', { style: { width: '80px' } }, ['Kod']),
                el('th', {}, ['Pacjent']),
                el('th', { style: { width: '100px' } }, ['Wiek']),
                el('th', { style: { width: '170px' } }, ['Telefon']),
                el('th', { style: { width: '150px' } }, ['Ostatnia wizyta']),
                el('th', { style: { width: '170px', textAlign: 'right' } }, ['Akcje'])
            ])
        ]));
        const tbody = el('tbody', {});
        for (const p of patients) {
            const visits = Store.getVisits(p.id);
            const nameCell = [
                (p.imie || '') + ' ' + (p.nazwisko || ''),
                p.minor ? el('span', { style: { color: '#EC4899', marginLeft: '6px' }, title: 'Niepełnoletni' }, ['●']) : null,
                p.archived ? el('span', { class: 'psy-new-badge psy-new-badge--neutral', style: { marginLeft: '6px' } }, ['archiwum']) : null
            ];
            const tr = el('tr', {
                'data-patient-id': p.id,
                'data-search': ((p.imie || '') + ' ' + (p.nazwisko || '') + ' ' + (p.pesel || '') + ' ' + p.id).toLowerCase(),
                class: current && current.id === p.id ? 'selected' : '',
                title: 'Kliknij wiersz, aby otworzyć kartę pacjenta',
                style: { cursor: 'pointer' },
                onclick: () => goToDetail(p)
            }, [
                el('td', {}, [el('strong', {}, [p.id])]),
                el('td', {}, nameCell),
                el('td', {}, [ageOf(p)]),
                el('td', {}, [p.telefon || '—']),
                el('td', {}, [visits.length ? visits[0].date : '—']),
                el('td', { class: 'psy-row-actions', style: { textAlign: 'right' } }, [
                    // Akcja PO 2026-05-01: na liście tylko „Wybierz".
                    // Edycja i archiwizacja są w widoku detali pacjenta.
                    el('button', {
                        class: 'btn btn--primary btn--sm',
                        title: 'Wybierz pacjenta i otwórz historię wizyt',
                        onclick: (e) => { e.stopPropagation(); selectAndGo(p); }
                    }, ['Wybierz'])
                ])
            ]);
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        body.appendChild(table);
    }
    root.appendChild(body);
    return root;
}

function filterRows(viewRoot, query) {
    viewRoot.querySelectorAll('tbody tr').forEach((tr) => {
        const search = tr.getAttribute('data-search') || '';
        tr.style.display = !query || search.includes(query) ? '' : 'none';
    });
}

function selectAndGo(patient) {
    Store.selectPatient(patient);
    window.location.hash = '#/history';
}

// Otwórz detale pacjenta (read-only) bez wybierania go jako aktywnego.
// (PO 2026-05-01: klik w wiersz listy lub w tag pacjenta otwiera widok detali)
function goToDetail(patient) {
    window.location.hash = '#/patients/detail/' + patient.id;
}

// ----- History --------------------------------------------------------------
//
// PR-J5 (2026-05-11): historia wizyt = strumień akapitów (klientka, z5.jpg).
//   • układ od najnowszej do najstarszej (im niżej scrolluję, tym starsze);
//   • każda wizyta = osobny <article> z nagłówkiem i pełnym opisem;
//   • nagłówek: [NAZWA NOTATKI] · typ · data · godzina · badge płatność;
//   • body: WSZYSTKIE wypełnione pola z `visit.data._raw` (bez skrótów!);
//   • klik akapitu → `#/visit/form/:id` (= edit, jedyne miejsce edycji);
//   • tło: paid=false → `psy-history-paragraph--unpaid` (żółtawe).
//
// Wcześniejszy widok tabeli (PR-G) usunięty.

/** Sformatuj surowy klucz z `_raw` (np. `cosWaznego`, `visitData.osoby`)
 *  na czytelną etykietę. Dla nieznanych kluczy — naturalna konwersja
 *  camelCase / kropki → spacje + capitalize. */
function _prettyVisitFieldLabel(rawKey) {
    if (!rawKey) return '';
    // Zdejmij prefix sekcji ze schematu (np. `visitData.`, `wywiad.`)
    let key = String(rawKey).replace(/^[a-zA-Z]+\./, '');
    // Pomiń techniczne kotwice
    if (key === '__comment' || key === '__notes' || key.endsWith('.__notes') || key.endsWith('.__comment')) {
        return '';
    }
    const map = {
        rodzajWizyty:           'Rodzaj wizyty',
        osobyObecne:            'Osoby obecne',
        powodKonsultacji:       'Powód konsultacji',
        objawyDepresyjne:       'Objawy depresyjne',
        objawyLekowe:           'Objawy lękowe',
        hipotezaDiagnostyczna:  'Hipoteza diagnostyczna',
        plan:                   'Plan',
        planNaNastepne:         'Plan na następne spotkanie',
        cosWaznego:             'Co ważnego',
        historiaEdukacji:       'Historia edukacji',
        historiaRodzinna:       'Historia rodzinna',
        zasoby:                 'Zasoby pacjenta',
        data:                   'Data',
        czasOd:                 'Godzina rozpoczęcia',
        czasTrwania:            'Czas trwania (min)',
        osoby:                  'Osoby',
        uczestnicy:             'Uczestnicy'
    };
    if (map[key]) return map[key];
    // Fallback: camelCase / kebab / snake → naturalna fraza
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
}

/** Zwróć tablicę `{label, value}` z `_raw` — w kolejności wstawienia,
 *  pomijając puste, techniczne, etykiety bez wartości. */
function _extractVisitContent(raw) {
    if (!raw || typeof raw !== 'object') return [];
    const out = [];
    for (const [k, v] of Object.entries(raw)) {
        const label = _prettyVisitFieldLabel(k);
        if (!label) continue;
        // Pusta wartość (null/empty string/empty array)
        if (v == null) continue;
        let display = '';
        if (Array.isArray(v)) {
            if (!v.length) continue;
            display = v.join(', ');
        } else if (typeof v === 'boolean') {
            display = v ? 'tak' : 'nie';
        } else {
            display = String(v).trim();
            if (!display) continue;
        }
        out.push({ label, value: display });
    }
    return out;
}

function viewHistory() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatientView('Historia wizyt', '🗓️');

    // `Store.getVisits` zwraca już posortowane od najnowszej (po dacie+godzinie).
    const visits = Store.getVisits(patient.id);
    const unpaidCount = visits.filter((v) => !v.paid).length;

    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Historia wizyt']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ' + visits.length +
                ' ' + (visits.length === 1 ? 'wizyta' : 'wizyt') +
                (unpaidCount > 0
                    ? ` · ${unpaidCount} niezapłacon${unpaidCount === 1 ? 'a' : 'e'}`
                    : '') +
                ' · od najnowszej do najstarszej'
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            el('button', {
                class: 'btn btn--primary',
                onclick: () => (window.location.hash = '#/visit/new')
            }, ['+ Nowa wizyta'])
        ])
    ]));

    const body = el('div', { class: 'psy-new-view__body psy-new-view__body--plain' });

    if (!visits.length) {
        body.appendChild(emptyState('🗓️', 'Brak wizyt',
            'Pacjent nie ma jeszcze wizyt. Dodaj pierwszą klikając przycisk poniżej.', [
            { label: '+ Dodaj pierwszą wizytę', variant: 'primary', onClick: () => (window.location.hash = '#/visit/new') }
        ]));
        root.appendChild(body);
        return root;
    }

    // Strumień akapitów
    const stream = el('div', { class: 'psy-history-paragraphs' });

    for (const v of visits) {
        const typeObj = visitTypeById(v.type);
        const typeLabel = typeObj ? typeObj.label : (v.type || '');
        const typeIcon  = typeObj ? typeObj.icon : '📝';
        // Tytuł akapitu = nazwa notatki (czyli label typu wizyty, klientka z5.jpg)
        const noteTitle = typeObj ? (typeObj.shortLabel || typeObj.label) : 'Notatka';

        // Header: [ikona + NAZWA NOTATKI] · typ · data · godzina · płatność
        const header = el('div', { class: 'psy-history-paragraph__header' }, [
            el('span', { class: 'psy-history-paragraph__title' }, [
                (typeIcon ? typeIcon + ' ' : '') + noteTitle
            ]),
            el('span', { class: 'psy-history-paragraph__type' }, [
                '· ' + typeLabel
            ]),
            el('span', { class: 'psy-history-paragraph__date' }, [
                '· ' + (v.date || '—') + (v.time ? ' · ' + v.time : '')
            ]),
            el('span', { class: 'psy-history-paragraph__payment' }, [
                el('span', {
                    class: 'psy-new-badge psy-new-badge--clickable ' +
                        (v.paid ? 'psy-new-badge--success' : 'psy-new-badge--warning'),
                    title: 'Kliknij, aby zmienić stan płatności',
                    onclick: (ev) => {
                        ev.stopPropagation();
                        Store.togglePaid(v.id);
                    }
                }, [v.paid ? '✓ Zapłacono' : '☐ Nie zapłacono'])
            ])
        ]);

        // Body: pełna treść (wszystkie pola z `_raw`), bez skrótu `summary`.
        const raw = v.data && v.data._raw;
        const entries = _extractVisitContent(raw);

        let bodyNode;
        if (entries.length) {
            const dl = el('dl', {});
            for (const { label, value } of entries) {
                dl.appendChild(el('dt', {}, [label]));
                dl.appendChild(el('dd', {}, [value]));
            }
            bodyNode = el('div', { class: 'psy-history-paragraph__body' }, [dl]);
        } else if (v.summary && v.summary.trim()) {
            // Fallback dla starych wizyt bez `_raw`
            bodyNode = el('div', { class: 'psy-history-paragraph__body' }, [v.summary]);
        } else {
            bodyNode = el('div', {
                class: 'psy-history-paragraph__body psy-history-paragraph__body--empty'
            }, ['(notatka pusta — kliknij, aby otworzyć i uzupełnić)']);
        }

        const article = el('article', {
            class: 'psy-history-paragraph' + (v.paid ? '' : ' psy-history-paragraph--unpaid'),
            title: 'Otwórz notatkę',
            onclick: () => { window.location.hash = '#/visit/form/' + v.id; }
        }, [header, bodyNode]);

        stream.appendChild(article);
    }

    body.appendChild(stream);
    root.appendChild(body);
    return root;
}


// ----- Meds ----------------------------------------------------------------

function viewMeds() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatientView('Leki', '💊');
    const meds = Store.getMeds(patient.id);

    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Leki']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ' + meds.length +
                ' ' + (meds.length === 1 ? 'lek' : 'leków')
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            el('button', {
                class: 'btn btn--primary',
                onclick: () => { window.location.hash = '#/meds/new'; }
            }, ['+ Dodaj lek'])
        ])
    ]));

    const body = el('div', { class: 'psy-new-view__body psy-new-view__body--plain' });
    if (!meds.length) {
        body.appendChild(emptyState('💊', 'Brak leków',
            'Pacjent nie ma przypisanych leków.', [
            { label: '+ Pierwszy lek', variant: 'primary', onClick: () => (window.location.hash = '#/meds/new') }
        ]));
    } else {
        const table = el('table', { class: 'psy-new-table' });
        table.appendChild(el('thead', {}, [
            el('tr', {}, [
                el('th', {}, ['Nazwa handlowa']),
                el('th', {}, ['Substancja']),
                el('th', { style: { width: '160px' } }, ['Aktualna dawka']),
                el('th', { style: { width: '140px' } }, ['Max dawka']),
                el('th', { style: { width: '120px' } }, ['Od kiedy']),
                el('th', {}, ['Notatki']),
                el('th', { style: { width: '100px', textAlign: 'right' } }, ['Akcje'])
            ])
        ]));
        const tbody = el('tbody', {});
        for (const m of meds) {
            tbody.appendChild(el('tr', {}, [
                el('td', {}, [el('strong', {}, [m.name || '(bez nazwy)'])]),
                el('td', {}, [m.substance || '—']),
                el('td', {}, [m.dose || '—']),
                el('td', { style: { color: '#B91C1C', fontWeight: '600' } }, [m.maxDose || '—']),
                el('td', {}, [m.prescribedAt || '—']),
                el('td', { style: { color: '#475569' } }, [m.notes || '']),
                el('td', { class: 'psy-row-actions', style: { textAlign: 'right' } }, [
                    el('button', {
                        class: 'btn btn--secondary btn--sm btn--icon',
                        title: 'Edytuj',
                        onclick: () => { window.location.hash = '#/meds/edit/' + m.id; }
                    }, ['✎']),
                    el('button', {
                        class: 'btn btn--danger btn--sm btn--icon',
                        title: 'Usuń lek',
                        onclick: async () => {
                            const ok = await openConfirm({
                                title: 'Usunąć lek?',
                                message: `Czy na pewno usunąć „${m.name || '(bez nazwy)'}" z listy leków pacjenta?`,
                                confirmLabel: 'Usuń',
                                variant: 'danger'
                            });
                            if (ok) {
                                Store.removeMed(m.id);
                                toast('info', 'Usunięto lek', m.name || '');
                            }
                        }
                    }, ['🗑'])
                ])
            ]));
        }
        table.appendChild(tbody);
        body.appendChild(table);
    }
    root.appendChild(body);
    return root;
}

// ----- Diagnoses -----------------------------------------------------------

function viewDiagnoses() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatientView('Diagnozy', '🏥');
    const diagnoses = Store.getDiagnoses(patient.id);

    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Diagnozy']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ' + diagnoses.length +
                ' ' + (diagnoses.length === 1 ? 'rozpoznanie' : 'rozpoznań') + ' (ICD-10)'
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            el('button', {
                class: 'btn btn--primary',
                onclick: () => { window.location.hash = '#/diagnoses/new'; }
            }, ['+ Dodaj diagnozę'])
        ])
    ]));

    const body = el('div', { class: 'psy-new-view__body' });
    if (!diagnoses.length) {
        body.appendChild(emptyState('🏥', 'Brak diagnoz',
            'Pacjent nie ma przypisanych rozpoznań.', [
            { label: '+ Pierwsza diagnoza', variant: 'primary', onClick: () => (window.location.hash = '#/diagnoses/new') }
        ]));
    } else {
        const stack = el('div', { class: 'psy-new-stack' });
        for (const d of diagnoses) {
            const statusVariant = d.status === 'aktualne' ? 'success'
                : d.status === 'w remisji' ? 'info'
                : 'neutral';
            const card = el('div', {
                style: {
                    padding: '12px 14px',
                    background: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderLeft: '4px solid #2563EB',
                    borderRadius: '8px'
                }
            }, [
                el('div', { class: 'psy-new-row' }, [
                    el('strong', {
                        style: { fontFamily: 'monospace', fontSize: '15px', color: '#1D4ED8', minWidth: '70px' }
                    }, [d.code || '—']),
                    el('span', { style: { flex: '1' } }, [d.description || '(brak opisu)']),
                    el('span', { class: 'psy-new-badge psy-new-badge--' + statusVariant }, [d.status || 'aktualne']),
                    el('span', { class: 'psy-new-hint' }, ['od ' + (d.assignedAt || '—')]),
                    el('div', { class: 'psy-row-actions' }, [
                        el('button', {
                            class: 'btn btn--secondary btn--sm btn--icon',
                            title: 'Edytuj',
                            onclick: () => { window.location.hash = '#/diagnoses/edit/' + d.id; }
                        }, ['✎']),
                        el('button', {
                            class: 'btn btn--danger btn--sm btn--icon',
                            title: 'Usuń diagnozę',
                            onclick: async () => {
                                const ok = await openConfirm({
                                    title: 'Usunąć diagnozę?',
                                    message: `Czy na pewno usunąć rozpoznanie „${d.code || ''} — ${d.description || ''}"?`,
                                    confirmLabel: 'Usuń',
                                    variant: 'danger'
                                });
                                if (ok) {
                                    Store.removeDiagnosis(d.id);
                                    toast('info', 'Usunięto diagnozę', d.code || '');
                                }
                            }
                        }, ['🗑'])
                    ])
                ]),
                d.author || d.notes
                    ? el('div', { class: 'psy-new-hint', style: { marginTop: '6px' } }, [
                        d.author ? 'Autor: ' + d.author : '',
                        d.author && d.notes ? ' · ' : '',
                        d.notes || ''
                    ])
                    : null
            ]);
            stack.appendChild(card);
        }
        body.appendChild(stack);
    }
    root.appendChild(body);
    return root;
}

// ----- Recommendations -----------------------------------------------------

function viewRecommendations() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatientView('Zalecenia', '📋');
    const recs = Store.getRecommendations(patient.id);

    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Zalecenia']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ' + recs.length +
                ' ' + (recs.length === 1 ? 'zalecenie' : 'zaleceń')
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            el('button', {
                class: 'btn btn--primary',
                onclick: () => { window.location.hash = '#/recommendations/new'; }
            }, ['+ Nowe zalecenie'])
        ])
    ]));

    const body = el('div', { class: 'psy-new-view__body' });
    if (!recs.length) {
        body.appendChild(emptyState('📋', 'Brak zaleceń',
            'Brak zapisanych zaleceń dla tego pacjenta.', [
            { label: '+ Pierwsze zalecenie', variant: 'primary', onClick: () => (window.location.hash = '#/recommendations/new') }
        ]));
    } else {
        const stack = el('div', { class: 'psy-new-stack' });
        for (const r of recs) {
            const card = el('div', {
                class: 'psy-recommendation' + (r.done ? ' psy-recommendation--done' : '')
            }, [
                el('div', { class: 'psy-recommendation__header' }, [
                    el('input', {
                        type: 'checkbox',
                        class: 'psy-recommendation__toggle',
                        checked: !!r.done,
                        title: r.done ? 'Oznacz jako niewykonane' : 'Oznacz jako zrealizowane',
                        onchange: () => Store.toggleRecommendationDone(r.id)
                    }),
                    el('span', { class: 'psy-recommendation__title' }, [r.title || '(bez tytułu)']),
                    el('span', { class: 'psy-new-hint' }, [r.createdAt || '—']),
                    el('div', { class: 'psy-recommendation__actions' }, [
                        el('button', {
                            class: 'btn btn--secondary btn--sm btn--icon',
                            title: 'Edytuj',
                            onclick: () => { window.location.hash = '#/recommendations/edit/' + r.id; }
                        }, ['✎']),
                        el('button', {
                            class: 'btn btn--danger btn--sm btn--icon',
                            title: 'Usuń zalecenie',
                            onclick: async () => {
                                const ok = await openConfirm({
                                    title: 'Usunąć zalecenie?',
                                    message: `Czy na pewno usunąć zalecenie „${r.title || ''}"?`,
                                    confirmLabel: 'Usuń',
                                    variant: 'danger'
                                });
                                if (ok) {
                                    Store.removeRecommendation(r.id);
                                    toast('info', 'Usunięto zalecenie', r.title || '');
                                }
                            }
                        }, ['🗑'])
                    ])
                ]),
                el('div', { class: 'psy-recommendation__content' }, [r.content || ''])
            ]);
            stack.appendChild(card);
        }
        body.appendChild(stack);
    }
    root.appendChild(body);
    return root;
}

// ----- Tests ---------------------------------------------------------------

function viewTests() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatientView('Testy', '📊');
    const results = Store.getTests(patient.id);

    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Testy']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ' + results.length +
                ' ' + (results.length === 1 ? 'wynik' : 'wyników')
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            el('button', {
                class: 'btn btn--primary',
                onclick: () => {
                    _testsPickerOpen = !_testsPickerOpen;
                    AppController._renderView(true);
                }
            }, [_testsPickerOpen ? '✕ Zamknij wybór' : '+ Uruchom test'])
        ])
    ]));

    // Inline picker testów
    if (_testsPickerOpen) {
        const picker = el('div', {
            class: 'psy-new-tests-picker',
            style: {
                marginBottom: '14px',
                padding: '12px 14px',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px'
            }
        });
        picker.appendChild(el('div', {
            class: 'psy-new-hint',
            style: { marginBottom: '10px', fontSize: '12.5px', fontWeight: '600' }
        }, ['Wybierz test do uruchomienia:']));

        const cardsRow = el('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '10px'
            }
        });
        for (const t of listAvailableTests()) {
            cardsRow.appendChild(el('div', {
                class: 'psy-new-visit-card',
                style: { cursor: 'pointer', padding: '12px' },
                tabindex: '0',
                onclick: () => {
                    _testsPickerOpen = false;
                    window.location.hash = '#/tests/run/' + encodeURIComponent(t.code);
                },
                onkeydown: (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        _testsPickerOpen = false;
                        window.location.hash = '#/tests/run/' + encodeURIComponent(t.code);
                    }
                }
            }, [
                el('div', { class: 'psy-new-visit-card__icon' }, ['📊']),
                el('div', {}, [
                    el('div', { class: 'psy-new-visit-card__title' }, [t.code]),
                    el('div', { class: 'psy-new-visit-card__desc' }, [
                        t.description + ' · ' + t.questions + ' pytań'
                    ])
                ])
            ]));
        }
        picker.appendChild(cardsRow);
        root.appendChild(picker);
    }

    const body = el('div', { class: 'psy-new-view__body psy-new-view__body--plain' });
    if (!results.length) {
        body.appendChild(emptyState('📊', 'Brak wyników',
            'Pacjent nie wypełnił jeszcze żadnego testu.',
            [
                {
                    label: '+ Uruchom pierwszy test',
                    variant: 'primary',
                    onClick: () => {
                        _testsPickerOpen = true;
                        AppController._renderView(true);
                    }
                }
            ]
        ));
    } else {
        const table = el('table', { class: 'psy-new-table' });
        table.appendChild(el('thead', {}, [
            el('tr', {}, [
                el('th', { style: { width: '100px' } }, ['Kod']),
                el('th', {}, ['Nazwa']),
                el('th', { style: { width: '130px' } }, ['Data']),
                el('th', { style: { width: '90px', textAlign: 'right' } }, ['Wynik']),
                el('th', {}, ['Interpretacja']),
                el('th', { style: { width: '60px', textAlign: 'right' } }, [''])
            ])
        ]));
        const tbody = el('tbody', {});
        for (const t of results) {
            tbody.appendChild(el('tr', {}, [
                el('td', {}, [el('strong', {}, [t.code])]),
                el('td', {}, [t.name]),
                el('td', {}, [t.date]),
                el('td', { style: { textAlign: 'right', fontWeight: '700' } }, [String(t.score)]),
                el('td', { style: { color: '#475569' } }, [
                    t.redFlag ? el('span', { style: { color: '#DC2626', fontWeight: '600', marginRight: '4px' }, title: 'Czerwona flaga' }, ['🚨 ']) : null,
                    t.interpretation || ''
                ]),
                el('td', { class: 'psy-row-actions', style: { textAlign: 'right' } }, [
                    el('button', {
                        class: 'btn btn--danger btn--sm btn--icon',
                        title: 'Usuń wynik',
                        onclick: async () => {
                            const ok = await openConfirm({
                                title: 'Usunąć wynik testu?',
                                message: `Czy na pewno usunąć wynik testu „${t.code}" z dnia ${t.date}?`,
                                confirmLabel: 'Usuń',
                                variant: 'danger'
                            });
                            if (ok) {
                                Store.removeTest(t.id);
                                toast('info', 'Usunięto wynik', t.code + ' · ' + t.date);
                            }
                        }
                    }, ['🗑'])
                ])
            ]));
        }
        table.appendChild(tbody);
        body.appendChild(table);
    }
    root.appendChild(body);
    return root;
}

// ----- Visit New (typ-picker) -----------------------------------------------

function viewVisitNew() {
    const patient = Store.state.currentPatient;
    if (!patient) return noPatientView('Nowa wizyta', '👤');

    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['+ Nowa wizyta']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                'Wybierz typ wizyty dla pacjenta: ' + patient.imie + ' ' + patient.nazwisko
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            el('button', {
                class: 'btn btn--secondary',
                onclick: () => (window.location.hash = '#/history')
            }, ['← Wróć do historii'])
        ])
    ]));

    // Klik karty typu → bezpośrednio do formularza wizyty (lazy create:
    // rekord powstanie dopiero przy 1. wpisie pola w formularzu).
    const picker = el('div', { class: 'psy-new-visit-picker' });
    for (const t of VISIT_TYPES) {
        picker.appendChild(el('div', {
            class: 'psy-new-visit-card',
            tabindex: '0',
            onclick: () => (window.location.hash = '#/visit/form/new/' + t.id),
            onkeydown: (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    window.location.hash = '#/visit/form/new/' + t.id;
                }
            }
        }, [
            el('div', { class: 'psy-new-visit-card__icon' }, [t.icon]),
            el('div', {}, [
                el('div', { class: 'psy-new-visit-card__title' }, [t.label]),
                el('div', { class: 'psy-new-visit-card__desc' }, [t.description]),
                el('span', { class: 'psy-new-badge psy-new-badge--info' }, [t.recommendedFor])
            ])
        ]));
    }
    root.appendChild(picker);
    return root;
}

// ----- Visit Form (delegat) ------------------------------------------------
//
// PO 2026-05-01: `viewVisitDetail` i route `#/visit/detail/:id` zostały
// USUNIĘTE — wszystkie kliknięcia w wizytę otwierają formularz wizyty
// (= jedyne miejsce edycji i podglądu, z 🗑 w nagłówku).

function viewVisitForm() {
    const hash = window.location.hash || '';
    const mNew = hash.match(/^#\/visit\/form\/new(?:\/([a-zA-Z0-9-]+))?/);
    if (mNew) {
        return renderVisitForm({ isNew: true, typeId: mNew[1] || null });
    }
    const mEdit = hash.match(/^#\/visit\/form\/([^/?]+)/);
    if (mEdit) {
        return renderVisitForm({ visitId: decodeURIComponent(mEdit[1]) });
    }
    return renderVisitForm({ isNew: true });
}

// ----- Diagnosis / Recommendation / Med / Patient / Test runner (delegaty) -

function viewDiagnosisForm() {
    const hash = window.location.hash || '';
    const m = hash.match(/^#\/diagnoses\/edit\/([^/?]+)/);
    return renderDiagnosisForm({ id: m ? decodeURIComponent(m[1]) : null });
}

function viewRecommendationForm() {
    const hash = window.location.hash || '';
    const m = hash.match(/^#\/recommendations\/edit\/([^/?]+)/);
    return renderRecommendationForm({ id: m ? decodeURIComponent(m[1]) : null });
}

function viewMedForm() {
    const hash = window.location.hash || '';
    const m = hash.match(/^#\/meds\/edit\/([^/?]+)/);
    return renderMedForm({ id: m ? decodeURIComponent(m[1]) : null });
}

// PR-H (2026-05-01 cd. 2): „edit pacjenta = view detali" — jedno miejsce.
// `viewPatientForm` to teraz cienki delegat na `viewPatientDetail`:
//   • #/patients/new            → renderPatientDetail({ id: null })
//   • #/patients/edit/:id       → renderPatientDetail({ id })
// Plik `view-patient-form.js` zostaje jako legacy (do skasowania w kolejnym PR).
function viewPatientForm() {
    const hash = window.location.hash || '';
    const m = hash.match(/^#\/patients\/edit\/([^/?]+)/);
    return renderPatientDetail({ id: m ? decodeURIComponent(m[1]) : null, tab: 'patient' });
}

// Detale pacjenta — single-column layout (PR-J10).
// Param `tab` (Pacjent/Dokumenty) został wycofany — Dokumenty są w głównym
// sidebarze pod osobnym route'em `#/documents`.
function viewPatientDetail() {
    const hash = window.location.hash || '';
    const m = hash.match(/^#\/patients\/detail\/([^/?]+)/);
    const id = m ? decodeURIComponent(m[1]) : null;
    return renderPatientDetail({ id });
}


function viewTestRunner() {
    const hash = window.location.hash || '';
    const m = hash.match(/^#\/tests\/run\/([^/?]+)/);
    return renderTestRunner({ code: m ? decodeURIComponent(m[1]) : null });
}

// PR-J (2026-05-11): nowe sekcje w sidebarze.
//
// Plan leczenia (route `#/treatment-plan`) — drzewo celów L1 + zadania per cel.
function viewTreatmentPlan() {
    return renderTreatmentPlan();
}

// Parametry (route `#/parameters`) — wzrost/waga/BMI/ciśnienie/tętno.
function viewParameters() {
    return renderParameters();
}

// Dokumenty (route `#/documents`) — stub UI uploadera + lista placeholder.
function viewDocuments() {
    return renderDocuments();
}

// Dane identyfikacyjne (route `#/patient-data`, rename z „Pacjent") —
// delegat na widok detali pacjenta (`view-patient-detail.js`) z bieżącym
// pacjentem ze Store. Klientka prosiła o tę nazwę w menu (z2.jpg + z4.jpg).
function viewPatientData() {
    const cp = Store.state.currentPatient;
    if (!cp) return noPatientView('Dane identyfikacyjne', '📇');
    return renderPatientDetail({ id: cp.id, tab: 'patient' });
}


// ----- Settings -------------------------------------------------------------

function viewSettings() {
    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Ustawienia']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                'Integracje · Baza leków · UI · Backlog'
            ])
        ])
    ]));

    const body = el('div', { class: 'psy-new-view__body' });

    body.appendChild(el('h3', {}, ['Integracje']));
    body.appendChild(el('div', { class: 'psy-new-stack', style: { marginBottom: '18px' } }, [
        el('div', { class: 'psy-new-row' }, [
            el('span', { class: 'psy-new-badge psy-new-badge--neutral' }, ['📁 Folder lokalny: niepodpięty']),
            el('button', {
                class: 'btn btn--secondary btn--sm',
                onclick: () => document.getElementById('btn-connect-folder').click()
            }, ['Połącz folder'])
        ]),
        el('div', { class: 'psy-new-row' }, [
            el('span', { class: 'psy-new-badge psy-new-badge--neutral' }, ['☁️ Google Drive: niepodpięty']),
            el('button', {
                class: 'btn btn--secondary btn--sm',
                onclick: () => document.getElementById('btn-connect-drive').click()
            }, ['Połącz Drive'])
        ]),
        el('div', { class: 'psy-new-row' }, [
            el('label', { style: { minWidth: '200px' } }, ['Nazwa folderu głównego w Drive:']),
            el('input', {
                type: 'text',
                value: 'pacjenci',
                style: { flex: '1', padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: '6px' }
            })
        ])
    ]));

    body.appendChild(el('h3', { id: 'dev-data', style: { marginTop: '22px' } }, ['Stan lokalnego folderu (dev)']));
    body.appendChild(el('div', { class: 'psy-new-hint', style: { marginBottom: '8px' } }, [
        'Aplikacja działa obecnie w trybie dev — całość bazy pacjentów żyje w ' +
        'localStorage przeglądarki (klucz ',
        el('code', {}, ['psy-new:data']),
        '). Przy pierwszym uruchomieniu została zaseedowana z `_fake-data.js`.'
    ]));
    body.appendChild(el('div', { class: 'psy-new-row', style: { marginBottom: '12px' } }, [
        el('span', { class: 'psy-new-badge psy-new-badge--neutral' }, [
            Store.state.patients.length + ' pacjentów · ' +
            Store.state.visits.length + ' wizyt · ' +
            Store.state.meds.length + ' leków · ' +
            Store.state.diagnoses.length + ' diagnoz · ' +
            Store.state.recommendations.length + ' zaleceń · ' +
            Store.state.tests.length + ' testów'
        ])
    ]));
    body.appendChild(el('div', { class: 'psy-new-row', style: { marginBottom: '18px', gap: '8px' } }, [
        el('button', {
            class: 'btn btn--secondary btn--sm',
            title: 'Wyczyść localStorage i wczytaj demo (5 pacjentów z fake-data.js)',
            onclick: async () => {
                const ok = await openConfirm({
                    title: 'Odłączyć folder i wczytać demo?',
                    message: 'Wszystkie zmiany wprowadzone w tej sesji zostaną utracone. Dane zostaną przywrócone do początkowych fake-data (5 pacjentów).',
                    confirmLabel: 'Wczytaj demo',
                    variant: 'primary'
                });
                if (ok) {
                    Store.resetAll();
                    toast('info', 'Wczytano demo', 'Zreseedowano z _fake-data.js.');
                    window.location.hash = '#/patients';
                }
            }
        }, ['🔌 Odłącz folder & wczytaj demo']),
        el('button', {
            class: 'btn btn--danger btn--sm',
            title: 'Wyczyść WSZYSTKO — pusta baza (jak po pierwszym uruchomieniu przed podpięciem folderu/Drive)',
            onclick: async () => {
                const ok = await openConfirm({
                    title: 'Wyczyścić wszystko do zera?',
                    message: 'Symulujesz pierwsze uruchomienie aplikacji. Cała lokalna baza zostanie usunięta — pacjenci, wizyty, leki, diagnozy, zalecenia, testy. Operacji nie da się cofnąć.',
                    confirmLabel: 'Wyczyść wszystko',
                    variant: 'danger'
                });
                if (ok) {
                    Store.wipeAll();
                    toast('warning', 'Wyczyszczono wszystko', 'Aplikacja w stanie pierwszego uruchomienia.');
                    window.location.hash = '#/patients';
                }
            }
        }, ['🧹 Wyczyść wszystko (czysty start)'])
    ]));

    body.appendChild(el('h3', { style: { marginTop: '20px' } }, ['Baza leków psychotropowych (' + FAKE_MED_DICT.length + ')']));
    const table = el('table', { class: 'psy-new-table' });
    table.appendChild(el('thead', {}, [
        el('tr', {}, [
            el('th', {}, ['Nazwa handlowa']),
            el('th', {}, ['Substancja']),
            el('th', { style: { width: '160px' } }, ['Max dawka']),
            el('th', { style: { width: '200px' } }, ['Grupa'])
        ])
    ]));
    const tbody = el('tbody', {});
    for (const m of FAKE_MED_DICT) {
        tbody.appendChild(el('tr', {}, [
            el('td', {}, [el('strong', {}, [m.name])]),
            el('td', {}, [m.substance]),
            el('td', { style: { color: '#B91C1C', fontWeight: '600' } }, [m.maxDose]),
            el('td', {}, [el('span', { class: 'psy-new-badge psy-new-badge--info' }, [m.group])])
        ]));
    }
    table.appendChild(tbody);
    body.appendChild(table);

    root.appendChild(body);
    return root;
}

// ----- Shared helpers -------------------------------------------------------

function noPatientView(title, icon) {
    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, [title])
        ])
    ]));
    const body = el('div', { class: 'psy-new-view__body' });
    body.appendChild(emptyState(icon, 'Wybierz pacjenta',
        'Aby zobaczyć tę sekcję, najpierw wybierz pacjenta z listy.', [
        { label: 'Przejdź do listy pacjentów', variant: 'primary', onClick: () => (window.location.hash = '#/patients') }
    ]));
    root.appendChild(body);
    return root;
}

function emptyState(icon, title, description, actions = []) {
    const wrap = el('div', { class: 'psy-new-empty' }, [
        el('div', { class: 'psy-new-empty__icon' }, [icon]),
        el('div', { class: 'psy-new-empty__title' }, [title]),
        el('div', { class: 'psy-new-empty__description' }, [description])
    ]);
    if (actions.length) {
        const actionsRow = el('div', { class: 'psy-new-empty__actions' });
        for (const a of actions) {
            actionsRow.appendChild(el('button', {
                class: 'btn btn--' + (a.variant || 'secondary'),
                onclick: a.onClick
            }, [a.label]));
        }
        wrap.appendChild(actionsRow);
    }
    return wrap;
}

// ============================================================================
// AppController + ROUTING
// ============================================================================

// UWAGA: kolejność kluczy ma znaczenie — `resolveRoute` używa `startsWith`
// w iteracji po `Object.keys`. Dłuższe/specyficzne prefiksy MUSZĄ być przed
// krótszymi (np. `#/patients/edit` przed `#/patients`).
const ROUTE_MAP = {
    // Pacjenci
    '#/patients/new':         { renderer: viewPatientForm,         menuId: null },
    '#/patients/edit':        { renderer: viewPatientForm,         menuId: null },
    '#/patients/detail':      { renderer: viewPatientDetail,       menuId: null },
    '#/patients':             { renderer: viewPatients,            menuId: null },

    // Diagnozy
    '#/diagnoses/new':        { renderer: viewDiagnosisForm,       menuId: 'diagnoses',       needsPatient: true },
    '#/diagnoses/edit':       { renderer: viewDiagnosisForm,       menuId: 'diagnoses',       needsPatient: true },
    '#/diagnoses':            { renderer: viewDiagnoses,           menuId: 'diagnoses',       needsPatient: true },

    // Zalecenia
    '#/recommendations/new':  { renderer: viewRecommendationForm,  menuId: 'recommendations', needsPatient: true },
    '#/recommendations/edit': { renderer: viewRecommendationForm,  menuId: 'recommendations', needsPatient: true },
    '#/recommendations':      { renderer: viewRecommendations,     menuId: 'recommendations', needsPatient: true },

    // Leki
    '#/meds/new':             { renderer: viewMedForm,             menuId: 'meds',            needsPatient: true },
    '#/meds/edit':            { renderer: viewMedForm,             menuId: 'meds',            needsPatient: true },
    '#/meds':                 { renderer: viewMeds,                menuId: 'meds',            needsPatient: true },

    // Testy
    '#/tests/run':            { renderer: viewTestRunner,          menuId: 'tests',           needsPatient: true },
    '#/tests':                { renderer: viewTests,               menuId: 'tests',           needsPatient: true },

    // Wizyty (PO 2026-05-01: route `#/visit/detail` USUNIĘTE — wszystkie
    // kliknięcia w wizytę otwierają formularz wizyty; redundantny widok).
    '#/visit/form':           { renderer: viewVisitForm,           menuId: 'history',         needsPatient: true },
    '#/visit/new':            { renderer: viewVisitNew,            menuId: 'visit-new',       needsPatient: true },

    // PR-J (2026-05-11): nowe sekcje pacjenta
    '#/treatment-plan':       { renderer: viewTreatmentPlan,       menuId: 'treatment-plan',  needsPatient: true },
    '#/patient-data':         { renderer: viewPatientData,         menuId: 'patient-data',    needsPatient: true },
    '#/parameters':           { renderer: viewParameters,          menuId: 'parameters',      needsPatient: true },
    '#/documents':            { renderer: viewDocuments,           menuId: 'documents',       needsPatient: true },

    // Pozostałe
    '#/history':              { renderer: viewHistory,             menuId: 'history',         needsPatient: true },
    '#/settings':             { renderer: viewSettings,            menuId: null }
};


function resolveRoute(hash) {
    const h = (hash || '').split('?')[0];
    if (ROUTE_MAP[h]) return { hash: h, ...ROUTE_MAP[h] };
    for (const key of Object.keys(ROUTE_MAP)) {
        if (h.startsWith(key + '/') || h === key) {
            return { hash: h, ...ROUTE_MAP[key] };
        }
    }
    return { hash: APP_DEFAULT_ROUTE, ...ROUTE_MAP[APP_DEFAULT_ROUTE] };
}

const AppController = {
    async init() {
        this.shellEl = document.getElementById('psy-new-shell');
        this.sidebarEl = document.getElementById('psy-new-sidebar');
        this.mainEl = document.getElementById('psy-new-main');
        this.patientHostEl = document.getElementById('psy-new-topbar-patient');
        this.saveIndicatorEl = document.getElementById('save-indicator');
        this.folderStatusEl = document.getElementById('folder-status');
        this._lastSaveStatus = null;
        this._lastRenderedHash = null;

        this._bindTopbar();
        this._renderSidebar();

        document.getElementById('psy-new-menu-toggle').addEventListener('click', () => {
            this.shellEl.classList.toggle('psy-new-shell--menu-open');
        });

        // Hash change → force re-render (zmiana widoku, force=true)
        window.addEventListener('hashchange', () => this._onHashChange());

        // Po zamknięciu modala — force re-render (modal mógł zmienić Store)
        window.addEventListener('psy-modal-closed', () => {
            this._renderView(true);
            this._updateSidebarActive();
            this._renderPatientTag();
        });

        // Store subscription — pasywny re-render (pomija widoki z data-live)
        Store.subscribe((state) => {
            this._renderPatientTag();
            this._updateSaveIndicator(state.saveStatus);
            this._updateFolderStatusBadge();
            this._renderView(false);
            this._updateSidebarActive();
        });

        // PR-I: spróbuj odzyskać podpięcie folderu z poprzedniej sesji
        // (IndexedDB). Jeśli się udało → state.folderConnected=true.
        // Jeśli permission expired → state.folderStatus='denied' + folderName
        // (gate pokaże opcję „Przywróć dostęp").
        await Store.restoreLocalFolder();

        // Folder gate — pokaż gdy nie ma trybu storage'u (init/denied/unsupported
        // i devMode=false). Apka się NIE rusza dopóki gate jest widoczny.
        if (shouldShowGate()) {
            showFolderGate();
            // Mimo że gate pokazany, ustaw resztę bootstrap'u (sidebar/topbar/route)
            // — nie robimy renderView, bo gate to przykrywa.
            Store.restoreLastPatient();
            this._updateSaveIndicator(Store.state.saveStatus);
            this._updateFolderStatusBadge();
            console.log('[PsychoApp new] initialized — folder gate active');
            return;
        }

        Store.restoreLastPatient();

        if (!window.location.hash) {
            window.location.hash = APP_DEFAULT_ROUTE;
        } else {
            this._onHashChange();
        }

        this._renderPatientTag();
        this._updateSaveIndicator(Store.state.saveStatus);
        this._updateFolderStatusBadge();
        this._renderView(true);
        this._updateSidebarActive();

        console.log('[PsychoApp new] initialized — ' +
            (Store.state.folderConnected ? 'folder: ' + Store.state.folderName : 'devmode'));
    },

    _bindTopbar() {
        // PR-I: przycisk „Folder pacjentów" — jeśli niepodpięty, pokaż gate;
        // jeśli podpięty, pokaż menu z opcją odpięcia.
        document.getElementById('btn-connect-folder').addEventListener('click', async () => {
            if (Store.isLocalConnected()) {
                // Już podpięty — pokaż info + opcja odpięcia
                const ok = await window.confirm(
                    'Folder „' + Store.state.folderName + '" jest podpięty.\n\n' +
                    'Czy chcesz go odpiąć? Dane zostaną w localStorage przeglądarki, ' +
                    'ale przestaną się synchronizować z folderem.'
                );
                if (ok) {
                    await Store.disconnectLocalFolder();
                    toast('info', 'Folder odłączony', 'Aplikacja przeszła w tryb localStorage.');
                    showFolderGate();
                }
            } else {
                // Niepodpięty — pokaż gate
                showFolderGate();
            }
        });
        document.getElementById('btn-connect-drive').addEventListener('click', () => {
            toast('info', 'Google Drive', 'Integracja z Drive zostanie aktywowana w Fazie 4 (PR-19).');
        });
        document.getElementById('btn-settings').addEventListener('click', () => {
            window.location.hash = APP_SETTINGS_ROUTE;
        });
    },

    _updateFolderStatusBadge() {
        const btn = document.getElementById('btn-connect-folder');
        if (!btn) return;
        if (Store.isLocalConnected()) {
            btn.textContent = '📁 ' + (Store.state.folderName || 'folder');
            btn.classList.add('psy-new-topbar__btn--connected');
            btn.title = 'Folder podpięty: ' + Store.state.folderName + ' — kliknij aby odłączyć';
        } else if (Store.state.devMode) {
            btn.textContent = '🧪 Tryb dev';
            btn.classList.remove('psy-new-topbar__btn--connected');
            btn.classList.add('psy-new-topbar__btn--devmode');
            btn.title = 'Tryb deweloperski (localStorage) — kliknij aby podpiąć folder';
        } else {
            btn.textContent = '📁 Folder pacjentów';
            btn.classList.remove('psy-new-topbar__btn--connected');
            btn.classList.remove('psy-new-topbar__btn--devmode');
            btn.title = 'Podpiej folder z pacjentami';
        }
    },

    _updateSaveIndicator(status) {
        if (!this.saveIndicatorEl) return;
        if (this._lastSaveStatus === status) return;
        this._lastSaveStatus = status;

        const elNode = this.saveIndicatorEl;
        elNode.classList.remove(
            'psy-new-topbar__save--idle',
            'psy-new-topbar__save--saving',
            'psy-new-topbar__save--saved',
            'psy-new-topbar__save--error'
        );

        switch (status) {
            case 'saving':
                elNode.classList.add('psy-new-topbar__save--saving');
                elNode.textContent = '⟳ Zapisywanie...';
                break;
            case 'saved':
                elNode.classList.add('psy-new-topbar__save--saved');
                elNode.textContent = '✓ Zapisano';
                break;
            case 'error':
                elNode.classList.add('psy-new-topbar__save--error');
                elNode.textContent = '⚠ Błąd zapisu';
                break;
            case 'idle':
            default:
                elNode.classList.add('psy-new-topbar__save--idle');
                elNode.textContent = '💾 Autozapis (lokalnie)';
                break;
        }
    },

    _renderSidebar() {
        this.sidebarEl.innerHTML = '';
        const nav = el('ul', { class: 'psy-new-sidebar__nav' });

        for (const item of APP_MENU) {
            // PR-J3 (2026-05-11): „+ Nowa wizyta" obsługuje submenu (kafelki
            // typów notatek wizyt). Klik rozwija/zwija listę. Pozostałe
            // pozycje działają normalnie (nawigacja).
            const isSubmenu = item.submenu === true;
            const expanded  = isSubmenu && _sidebarVisitMenuOpen;

            // PR-J11 (2026-05-11): bez ikon przy elementach menu — klientka
            // jasno: same etykiety. Render samej etykiety + ewentualnego
            // chevronu dla submenu.
            const labelChildren = [
                el('span', { class: 'psy-new-sidebar__label' }, [item.label])
            ];
            // Strzałka rozwijania dla submenu — ▾ (open) / ▸ (closed)
            if (isSubmenu) {
                labelChildren.push(el('span', {
                    class: 'psy-new-sidebar__chevron',
                    'aria-hidden': 'true'
                }, [expanded ? '▾' : '▸']));
            }

            const li = el('li', {
                class: 'psy-new-sidebar__item'
                    + (item.cta ? ' psy-new-sidebar__item--cta' : '')
                    + (isSubmenu ? ' psy-new-sidebar__item--has-submenu' : '')
                    + (expanded ? ' psy-new-sidebar__item--expanded' : ''),
                'data-menu-id': item.id,
                // PR-J14: krótka etykieta + pełna etykieta w trybie compact-sidebar
                // (form-mode). CSS w `form-toolbar.css` używa `attr(data-icon)` jako
                // główny wskaźnik (PR-J14c, klientka 2026-05-14: ikony zamiast tekstu),
                // z fallbackiem `data-short` gdy ikony brak. `data-label` = tooltip.
                'data-short': item.short || item.label.slice(0, 4),
                'data-icon': item.icon || '',
                'data-label': item.label,
                title: item.label,
                onclick: () => this._onMenuClick(item)
            }, labelChildren);

            nav.appendChild(li);

            // Submenu — render tylko gdy rozwinięte
            if (isSubmenu && expanded) {
                const submenu = el('ul', { class: 'psy-new-sidebar__submenu' });
                for (const t of VISIT_TYPES) {
                    submenu.appendChild(el('li', {
                        class: 'psy-new-sidebar__submenu-item',
                        title: t.description,
                        onclick: (ev) => {
                            ev.stopPropagation();
                            if (!Store.state.currentPatient) {
                                toast('warning', 'Wybierz pacjenta',
                                    'Aby utworzyć wizytę, najpierw wybierz pacjenta.');
                                window.location.hash = APP_PATIENTS_ROUTE;
                                return;
                            }
                            // Zwiń submenu po wyborze (mniej zaśmieconego widoku)
                            _sidebarVisitMenuOpen = false;
                            window.location.hash = '#/visit/form/new/' + t.id;
                        }
                    }, [
                        // PR-J11: bez ikony typu wizyty w submenu — sama etykieta.
                        el('span', { class: 'psy-new-sidebar__submenu-label' }, [t.shortLabel || t.label])
                    ]));
                }
                nav.appendChild(submenu);
            }
        }
        this.sidebarEl.appendChild(nav);
    },

    _onMenuClick(item) {
        // PR-J3 (2026-05-11): „+ Nowa wizyta" z submenu = rozwija/zwija
        // listę kafelków typów, bez nawigacji. Reszta pozycji = nawigacja.
        if (item.submenu === true) {
            if (!Store.state.currentPatient) {
                toast('warning', 'Wybierz pacjenta',
                    'Aby utworzyć wizytę, najpierw wybierz pacjenta z listy.');
                window.location.hash = APP_PATIENTS_ROUTE;
                return;
            }
            _sidebarVisitMenuOpen = !_sidebarVisitMenuOpen;
            this._renderSidebar();
            this._updateSidebarActive();
            return;
        }

        if (!Store.state.currentPatient) {
            toast('warning', 'Wybierz pacjenta', 'Aby użyć tej sekcji, najpierw wybierz pacjenta z listy.');
            window.location.hash = APP_PATIENTS_ROUTE;
            return;
        }
        window.location.hash = item.route;
        this.shellEl.classList.remove('psy-new-shell--menu-open');
    },


    _onHashChange() {
        const resolved = resolveRoute(window.location.hash);
        Store.setRoute(resolved.hash);

        if (resolved.needsPatient && !Store.state.currentPatient) {
            toast('warning', 'Wybierz pacjenta', 'Aby przejść do tej sekcji, najpierw wybierz pacjenta.');
            window.location.hash = APP_PATIENTS_ROUTE;
            return;
        }

        // Zmiana hasha → force re-render
        this._renderView(true);
        this._updateSidebarActive();
    },

    /**
     * @param {boolean} force — jeśli true, renderuje zawsze; jeśli false (domyślny
     *   pasywny re-render po Store.subscribe), pomija gdy aktualnie renderowany
     *   widok ma `data-live="true"` (formularz z autozapisem trzyma stan sam).
     */
    _renderView(force = false) {
        // Modal aktywny → pomijamy (klasycznie — żeby nie zabić formularza w modalu)
        if (document.body.classList.contains('psy-modal-open')) {
            return;
        }

        // Pasywny re-render i widok jest „live" → pomijamy
        if (!force && this.mainEl.firstElementChild &&
            this.mainEl.firstElementChild.dataset &&
            this.mainEl.firstElementChild.dataset.live === 'true') {
            return;
        }

        const resolved = resolveRoute(window.location.hash);
        this.mainEl.innerHTML = '';
        try {
            const node = resolved.renderer();
            this.mainEl.appendChild(node);
            this._lastRenderedHash = resolved.hash;
        } catch (e) {
            console.error('[renderView]', e);
            this.mainEl.appendChild(emptyState('⚠', 'Błąd renderowania', String(e && e.message || e), []));
        }

        // PR-J14: tryb form-mode shellu (sidebar zwężony do 56 px ze skrótami
        // literowymi). Heurystyka: aktywujemy gdy widok zawiera `.psy-form-toolbar`
        // (komponent pasek-narzędzi). Dzięki temu Etap B (pacjent/lek/diagnoza)
        // dostanie zachowanie automatycznie — bez extra konfiguracji per route.
        const isFormMode = !!this.mainEl.querySelector('.psy-form-toolbar');
        this.shellEl.classList.toggle('psy-new-shell--form-mode', isFormMode);
    },

    _updateSidebarActive() {
        const activeId = resolveRoute(window.location.hash).menuId;
        const items = this.sidebarEl.querySelectorAll('.psy-new-sidebar__item');
        items.forEach((li) => {
            li.classList.toggle('active', li.getAttribute('data-menu-id') === activeId);
            const mid = li.getAttribute('data-menu-id');
            const menuItem = APP_MENU.find((m) => m.id === mid);
            if (menuItem && !Store.state.currentPatient) {
                li.classList.add('disabled');
            } else {
                li.classList.remove('disabled');
            }
        });
    },

    _renderPatientTag() {
        this.patientHostEl.innerHTML = '';
        const p = Store.state.currentPatient;
        if (!p) return;

        // PR-J2 (2026-05-11): sticky profil pacjenta — wyrazisty pasek
        // (laptop 14"/tablet) z PESEL · ikona płci · imię (II imię) nazwisko ·
        // wiek · telefon · mail · badge auto „Pełnoletni" / „Nieletni" · 🔍 lupa.
        // Lupa otwiera popover z search'em pacjenta — klik wyniku natychmiast
        // przełącza pacjenta + redirect do detali.

        const ageNum = _computePatientAgeYears(p);
        const adult = ageNum >= 18;
        const minorBadge = ageNum != null
            ? (adult
                ? el('span', {
                    class: 'psy-new-patient-tag__badge psy-new-patient-tag__badge--adult',
                    title: 'Wiek: ' + ageNum + ' lat (pełnoletni)'
                }, ['✓ Pełnoletni'])
                : el('span', {
                    class: 'psy-new-patient-tag__badge psy-new-patient-tag__badge--minor',
                    title: 'Wiek: ' + ageNum + ' lat (nieletni)'
                }, ['⚠ Nieletni']))
            : null;

        const sexIcon = _sexIcon(p.plec);

        // Nazwisko: Imię (II imię) Nazwisko
        const nameParts = [
            p.imie || '',
            p.drugieImie ? ' (' + p.drugieImie + ')' : '',
            p.nazwisko ? ' ' + p.nazwisko : ''
        ].join('').trim() || '— bez nazwiska —';

        const tag = el('div', {
            class: 'psy-new-patient-tag psy-new-patient-tag--big psy-new-patient-tag--clickable',
            title: 'Otwórz kartę pacjenta'
        }, [
            // PESEL na początku (klientka, z3.jpg)
            p.pesel
                ? el('span', {
                    class: 'psy-new-patient-tag__field psy-new-patient-tag__field--pesel',
                    title: 'PESEL',
                    onclick: () => goToDetail(p)
                }, [p.pesel])
                : null,

            // Ikona płci
            sexIcon
                ? el('span', {
                    class: 'psy-new-patient-tag__sex psy-new-patient-tag__sex--' + sexIcon.cls,
                    title: 'Płeć: ' + (p.plec || 'nieznana'),
                    onclick: () => goToDetail(p)
                }, [sexIcon.glyph])
                : null,

            // Imię + drugie imię + nazwisko (klikalne → detale)
            el('span', {
                class: 'psy-new-patient-tag__name',
                onclick: () => goToDetail(p),
                title: 'Otwórz dane identyfikacyjne'
            }, [nameParts]),

            // Wiek
            ageNum != null
                ? el('span', { class: 'psy-new-patient-tag__field' }, [ageNum + ' lat'])
                : null,

            // Telefon
            p.telefon
                ? el('span', {
                    class: 'psy-new-patient-tag__field psy-new-patient-tag__field--tel',
                    title: 'Telefon'
                }, ['📞 ' + p.telefon])
                : null,

            // E-mail
            p.email
                ? el('span', {
                    class: 'psy-new-patient-tag__field psy-new-patient-tag__field--mail',
                    title: 'E-mail'
                }, ['✉ ' + p.email])
                : null,

            // Badge pełnoletni / nieletni (auto z daty urodzenia)
            minorBadge,

            // 🔍 Lupa — wyszukiwarka pacjenta (PR-J2)
            el('button', {
                type: 'button',
                class: 'psy-new-patient-tag__search',
                title: 'Wyszukaj pacjenta (Ctrl+K)',
                onclick: (ev) => {
                    ev.stopPropagation();
                    AppController._togglePatientSearchPopover();
                }
            }, ['🔍']),

            // „Zmień" — kierunek do listy pacjentów (back-compat)
            el('button', {
                class: 'psy-new-patient-tag__change',
                title: 'Otwórz listę pacjentów',
                onclick: (e) => {
                    e.stopPropagation();
                    window.location.hash = APP_PATIENTS_ROUTE;
                }
            }, ['Zmień'])
        ].filter(Boolean));

        this.patientHostEl.appendChild(tag);
    },

    /** PR-J2: popover z wyszukiwarką pacjenta (lupa). */
    _togglePatientSearchPopover() {
        // Toggle: jeśli istnieje — zamknij; jeśli nie — otwórz.
        const existing = document.getElementById('psy-new-patient-search-popover');
        if (existing) {
            existing.remove();
            return;
        }
        this._showPatientSearchPopover();
    },

    _showPatientSearchPopover() {
        const popover = el('div', {
            id: 'psy-new-patient-search-popover',
            class: 'psy-new-search-popover',
            role: 'dialog',
            'aria-label': 'Wyszukaj pacjenta'
        });

        const input = el('input', {
            type: 'search',
            class: 'psy-new-search-popover__input',
            placeholder: 'Imię, nazwisko, kod lub PESEL…',
            autocomplete: 'off'
        });

        const results = el('div', { class: 'psy-new-search-popover__results' });

        function close() {
            popover.remove();
            document.removeEventListener('keydown', onKeydown);
            document.removeEventListener('mousedown', onClickOutside);
        }

        function pickPatient(p) {
            Store.selectPatient(p);
            close();
            window.location.hash = '#/patients/detail/' + p.id;
        }

        function renderResults() {
            results.innerHTML = '';
            const q = (input.value || '').trim().toLowerCase();
            const allPatients = Store.state.patients
                .filter((p) => !p.archived);   // tylko aktywni w wyszukiwarce
            const matched = q
                ? allPatients.filter((p) => {
                    const s = [
                        p.imie || '', p.nazwisko || '', p.drugieImie || '',
                        p.pesel || '', p.id || '', p.kodPacjenta || '',
                        p.telefon || '', p.email || ''
                    ].join(' ').toLowerCase();
                    return s.includes(q);
                })
                : allPatients.slice(0, 12);

            if (!matched.length) {
                results.appendChild(el('div', { class: 'psy-new-search-popover__empty' }, [
                    q ? 'Brak pacjentów pasujących do „' + q + '"' : 'Brak aktywnych pacjentów.'
                ]));
                return;
            }
            for (const p of matched.slice(0, 12)) {
                results.appendChild(el('div', {
                    class: 'psy-new-search-popover__item',
                    title: 'Otwórz kartę pacjenta',
                    onclick: () => pickPatient(p)
                }, [
                    el('span', { class: 'psy-new-search-popover__item-code' }, [p.id || '']),
                    el('span', { class: 'psy-new-search-popover__item-name' }, [
                        (p.imie || '') + ' ' + (p.nazwisko || '')
                    ]),
                    el('span', { class: 'psy-new-search-popover__item-meta' }, [
                        p.pesel ? p.pesel : (p.telefon || '')
                    ])
                ]));
            }
        }

        function onKeydown(ev) {
            if (ev.key === 'Escape') { close(); return; }
            if (ev.key === 'Enter') {
                // Wybierz pierwszy wynik
                const first = results.querySelector('.psy-new-search-popover__item');
                if (first) first.click();
            }
        }

        function onClickOutside(ev) {
            if (!popover.contains(ev.target)) close();
        }

        input.addEventListener('input', renderResults);
        document.addEventListener('keydown', onKeydown);
        // setTimeout, bo `mousedown` z kliknięcia lupy by od razu zamknął
        setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);

        popover.appendChild(input);
        popover.appendChild(results);

        // Pozycjonuj popover obok przycisku lupy
        const btn = this.patientHostEl.querySelector('.psy-new-patient-tag__search');
        if (btn) {
            const rect = btn.getBoundingClientRect();
            popover.style.position = 'fixed';
            popover.style.top = (rect.bottom + 6) + 'px';
            popover.style.right = (window.innerWidth - rect.right) + 'px';
            popover.style.zIndex = '1500';
        }

        document.body.appendChild(popover);
        renderResults();
        input.focus();
    }


};

// Eksportuj, aby moduły mogły wymusić re-render (np. zmiana filtra)
window.AppController = AppController;

// Bootstrap — idempotentny
let _initDone = false;
function bootstrap() {
    if (_initDone) return;
    _initDone = true;
    try {
        // PR-J16c (2026-05-16): globalny auto-grow dla wszystkich <textarea>.
        // Klientka: „scroll textarea nie wchodzi w grę. każdy enter się liczy".
        // Musi być zainstalowany PRZED init() — observer łapie też textareas
        // tworzone w pierwszym renderze widoku.
        installAutogrow();
        AppController.init();
    } catch (e) {
        console.error('[AppController.init]', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}
