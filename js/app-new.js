// ============================================================================
// app-new.js — kontroler aplikacji: nawigacja (hash), powłoka (topbar, menu
// boczne) i widoki list. Formularze i magazyn danych żyją w `js/views/`.
//
//   • `Store` (`views/_store.js`) — stan + zapis do magazynu (Dysk Google /
//     folder lokalny) albo tryb demo.
//   • Wizyta jest jedynym źródłem prawdy; Leki / Diagnozy / Parametry / Plan
//     leczenia to osie czasu wyliczane z wizyt (tylko do odczytu).
//   • Widoki z `data-live="true"` (formularze) nie są przerysowywane przy
//     zmianach Store; przed zdjęciem z ekranu dostają `psyTeardown()`.
// ============================================================================

import './components/psy-toast.js';
import './components/psy-toast-container.js';

import { Store } from './views/_store.js';
import { APP_MENU, APP_PATIENTS_ROUTE, APP_SETTINGS_ROUTE, APP_DEFAULT_ROUTE } from './views/_menu.js';
import { VISIT_TYPES, visitTypeById } from './views/_visit-types.js';
import { FAKE_MED_DICT } from './views/_meds-dict.js';
import { describeVisit } from './views/_visit-describe.js';
import { el, toast } from './views/_dom.js';
import { getGoogleClientId, setGoogleClientId, DEFAULT_GOOGLE_CLIENT_ID } from './views/_config.js';

import { openConfirm } from './views/_modal.js';
import { renderVisitForm } from './views/view-visit-form.js';
import { renderPatientDetail } from './views/view-patient-detail.js';
import { renderTestRunner } from './views/view-test-runner.js';
import {
    renderMedsExtract, renderTestsExtract, renderRecommendationsExtract, renderTreatmentPlanExtract,
    renderDiagnosesExtract, renderParametersExtract, renderDocumentsExtract
} from './views/view-extracts.js';
import { renderCalendar, renderHomeTabs } from './views/view-calendar.js';
import { syncVisitToAppointment, getCalendarApi, CALENDAR_NAME } from './views/_calendar-api.js';

import { showStorageGate, hideStorageGate, shouldShowGate } from './views/view-folder-gate.js';
import { installAutogrow } from './views/_autogrow.js';


// ---- helpers ---------------------------------------------------------------

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

/**
 * PR-J16 (2026-05-30) — pełny format wieku z miesiącami: "X lat Y mies."
 * (lub "0 lat 8 mies." dla niemowląt). Klientka prosi o widoczne miesiące,
 * szczególnie istotne przy małych dzieciach. Zwraca `null` gdy brak danych
 * (brak `dataUrodzenia` ORAZ brak `wiek`).
 *
 * Dla legacy `patient.wiek` (string typu "37" lub "37 lat") — zwracamy jako-jak.
 */
function _formatPatientAgeFull(patient) {
    if (!patient) return null;
    if (patient.dataUrodzenia) {
        const d = new Date(patient.dataUrodzenia);
        if (!isNaN(d.getTime())) {
            const now = new Date();
            let years = now.getFullYear() - d.getFullYear();
            let months = now.getMonth() - d.getMonth();
            if (now.getDate() < d.getDate()) months -= 1;
            if (months < 0) {
                years -= 1;
                months += 12;
            }
            if (years < 0) return null;
            return years + ' lat ' + months + ' mies.';
        }
    }
    if (patient.wiek) {
        const w = String(patient.wiek).trim();
        // Już sformatowany ("37 lat 4 mies.") — zwróć as-is.
        if (/lat|mies/.test(w)) return w;
        // Sama liczba — dodaj " lat".
        if (/^\d+$/.test(w)) return w + ' lat';
        return w;
    }
    return null;
}

/**
 * PR-J16 (2026-05-30) — read-only popover z detalami pacjenta, pojawia się
 * przy hoverze na sticky pasek pacjenta. Klientka: „jak najedziesz na top
 * panel pacjenta to wyskakuje panel read only z detalami pacjenta".
 *
 * Zakres pól (Wariant A wybrany przez PO): komplet karty „Pacjent"
 * (imię, II imię, nazwisko, PESEL, płeć, data urodzenia, wiek, obywatelstwo,
 * lekarz, placówka) + Kontakt (telefon, e-mail) + Adres zamieszkania
 * (ulica, kod, miasto — z fallbackiem do legacy `patient.adres`).
 *
 * Mechanizm pokazywania: CSS-only `.psy-new-patient-tag-wrap:hover` — popover
 * sam pokazuje się/chowa. Brak event-listenerów = brak race-condition z lupą
 * lub click-outside.
 */
function _buildPatientPreviewPopover(p) {
    if (!p) return null;

    function row(label, value) {
        const isEmpty = value == null || value === '' || value === '—';
        return el('div', { class: 'psy-new-patient-tag__preview-row' }, [
            el('span', { class: 'psy-new-patient-tag__preview-label' }, [label]),
            el('span', {
                class: 'psy-new-patient-tag__preview-value'
                    + (isEmpty ? ' psy-new-patient-tag__preview-value--empty' : '')
            }, [isEmpty ? '—' : String(value)])
        ]);
    }

    function section(title, rows) {
        const visibleRows = rows.filter(Boolean);
        if (!visibleRows.length) return null;
        return el('div', { class: 'psy-new-patient-tag__preview-section' }, [
            el('div', { class: 'psy-new-patient-tag__preview-section-title' }, [title]),
            el('div', { class: 'psy-new-patient-tag__preview-grid' }, visibleRows)
        ]);
    }

    const ageFull = _formatPatientAgeFull(p);

    // Adres — priorytet nowe pola (ulica/kodPocztowy/miasto), fallback do legacy `adres`.
    const addressLine = (() => {
        const parts = [];
        if (p.ulica) parts.push(p.ulica);
        const cityLine = [p.kodPocztowy, p.miasto].filter(Boolean).join(' ');
        if (cityLine) parts.push(cityLine);
        if (parts.length) return parts.join(', ');
        return p.adres || '';
    })();

    const popover = el('div', {
        class: 'psy-new-patient-tag__preview',
        role: 'tooltip',
        'aria-label': 'Szczegóły pacjenta (podgląd)'
    }, [
        // Nagłówek z imieniem i nazwiskiem + kod pacjenta
        el('div', { class: 'psy-new-patient-tag__preview-header' }, [
            el('span', { class: 'psy-new-patient-tag__preview-name' }, [
                ((p.imie || '') + ' ' + (p.drugieImie ? '(' + p.drugieImie + ') ' : '') +
                 (p.nazwisko || '')).trim() || '— bez nazwiska —'
            ]),
            p.id
                ? el('span', { class: 'psy-new-patient-tag__preview-code' }, ['kod: ' + p.id])
                : null
        ].filter(Boolean)),

        // Sekcja: Pacjent
        section('Pacjent', [
            row('Imię',           p.imie),
            row('Drugie imię',    p.drugieImie),
            row('Nazwisko',       p.nazwisko),
            row('PESEL',          p.pesel),
            row('Płeć',           p.plec),
            row('Data urodzenia', p.dataUrodzenia),
            row('Wiek',           ageFull),
            row('Obywatelstwo',   p.obywatelstwo),
            row('Lekarz prowadzący', p.lekarz),
            row('Placówka',       p.placowka)
        ]),

        // Sekcja: Kontakt
        section('Kontakt', [
            row('Telefon', p.telefon),
            row('E-mail',  p.email)
        ]),

        // Sekcja: Adres zamieszkania
        section('Adres zamieszkania', [
            row('Ulica',        p.ulica),
            row('Kod pocztowy', p.kodPocztowy),
            row('Miasto',       p.miasto),
            // Fallback z legacy `adres` — pokazujemy tylko gdy brak nowych pól
            (!p.ulica && !p.kodPocztowy && !p.miasto && p.adres)
                ? row('Adres (legacy)', p.adres)
                : null
        ]),

        // Stopka — hint nawigacyjny
        el('div', { class: 'psy-new-patient-tag__preview-footer' }, [
            '💡 Dane identyfikacyjne (pełna karta): kliknij nazwisko pacjenta.'
        ])
    ].filter(Boolean));

    return popover;
}


// Stan filtrów per widok (utrzymywany pomiędzy re-renderami)
const _viewFilters = {
    patientsArchived: 'active'  // 'active' | 'archived' | 'all'
    // historyShowDrafts usunięty po PO 2026-05-01 (status Robocza/Zamknięta wycofany)
};

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
            renderHomeTabs('patients'),
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
            const lastVisit = Store.getLastVisitDate(p.id);
            const loadError = Store.getPatientLoadError(p.id);
            const nameCell = [
                (p.imie || '') + ' ' + (p.nazwisko || ''),
                p.minor ? el('span', { style: { color: '#EC4899', marginLeft: '6px' }, title: 'Niepełnoletni' }, ['●']) : null,
                p.archived ? el('span', { class: 'psy-new-badge psy-new-badge--neutral', style: { marginLeft: '6px' } }, ['archiwum']) : null,
                loadError ? el('span', { style: { color: '#B45309', marginLeft: '6px' }, title: 'Nie udało się odczytać danych: ' + loadError }, ['⚠ błąd odczytu']) : null
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
                el('td', {}, [lastVisit || '—']),
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

/** Dane identyfikacyjne bieżącego pacjenta (klik w jego pasek u góry ekranu). */
function goToPatientData() {
    window.location.hash = '#/patient-data';
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
                        syncVisitToAppointment(Store.togglePaid(v.id));
                    }
                }, [v.paid ? '✓ Zapłacono' : '☐ Nie zapłacono'])
            ])
        ]);

        // Treść: wszystkie wypełnione pola pogrupowane po sekcjach formularza —
        // z tego samego źródła co formularz i arkusz (`describeVisit`).
        const described = describeVisit(v);
        let bodyNode;
        if (described.sections.length || described.other.length) {
            bodyNode = el('div', { class: 'psy-history-paragraph__body' });
            const fieldsGrid = (fields) => {
                const grid = el('div', { class: 'psy-history-paragraph__fields' });
                for (const f of fields) {
                    grid.appendChild(el('div', { class: 'psy-history-paragraph__field-label' }, [f.label + ':']));
                    grid.appendChild(el('div', { class: 'psy-history-paragraph__field-value' }, [f.value || '—']));
                    if (f.notes) {
                        grid.appendChild(el('div', { class: 'psy-history-paragraph__field-notes' }, ['↳ ' + f.notes]));
                    }
                }
                return grid;
            };
            for (const section of described.sections) {
                const sectionEl = el('div', { class: 'psy-history-paragraph__section' }, [
                    el('div', { class: 'psy-history-paragraph__section-title' }, [section.title])
                ]);
                if (section.comment) {
                    sectionEl.appendChild(el('div', { class: 'psy-history-paragraph__section-comment' }, [section.comment]));
                }
                if (section.fields.length) sectionEl.appendChild(fieldsGrid(section.fields));
                bodyNode.appendChild(sectionEl);
            }
            if (described.other.length) {
                bodyNode.appendChild(el('div', { class: 'psy-history-paragraph__section' }, [
                    el('div', { class: 'psy-history-paragraph__section-title' }, ['Pozostałe pola']),
                    fieldsGrid(described.other)
                ]));
            }
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


// ----- Wyciągi z wizyt -------------------------------------------------------
//
// Leki, Testy, Zalecenia, Plan leczenia, Diagnozy, Parametry i Dokumenty są
// wyłącznie do odczytu: pokazują to, co wpisano w wizytach, z datą i rodzajem
// wizyty, a kliknięcie rekordu otwiera tę wizytę. Patrz `view-extracts.js`.

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

// ----- Formularze (delegaty) ------------------------------------------------

function viewVisitForm() {
    const hash = window.location.hash || '';
    // Identyfikatory typów zawierają podkreślnik (np. `first_meeting`).
    const mNew = hash.match(/^#\/visit\/form\/new(?:\/([\w-]+))?/);
    if (mNew) {
        // Wejście z kalendarza: `?date=…&time=…&event=…&paid=1` (termin, z którego powstaje notatka).
        const q = new URLSearchParams(hash.split('?')[1] || '');
        return renderVisitForm({
            isNew: true, typeId: mNew[1] || null,
            date: q.get('date') || '', time: q.get('time') || '',
            eventId: q.get('event') || '', paid: q.get('paid') === '1'
        });
    }
    const mEdit = hash.match(/^#\/visit\/form\/([^/?]+)/);
    if (mEdit) {
        // `?focus=sekcja::pole` — akapit do pokazania po powrocie (np. z testu).
        const q = new URLSearchParams(hash.split('?')[1] || '');
        return renderVisitForm({ visitId: decodeURIComponent(mEdit[1]), focus: q.get('focus') || '' });
    }
    return renderVisitForm({ isNew: true });
}

// Karta pacjenta jest jednym miejscem podglądu i edycji:
// `#/patients/new`, `#/patients/edit/:id` i `#/patients/detail/:id`.
function viewPatientForm() {
    const m = (window.location.hash || '').match(/^#\/patients\/edit\/([^/?]+)/);
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
    // Test uruchamia się z wizyty: `?visit=…` wskazuje, w której zapisać wynik.
    const q = new URLSearchParams(hash.split('?')[1] || '');
    return renderTestRunner({ code: m ? decodeURIComponent(m[1]) : null, visitId: q.get('visit') || '' });
}

// Strona główna: kalendarz wszystkich terminów. Kalendarz pacjenta: tylko jego terminy.
function viewHomeCalendar() {
    return renderCalendar();
}

function viewPatientCalendar() {
    const cp = Store.state.currentPatient;
    if (!cp) return noPatientView('Kalendarz', '🗓️');
    return renderCalendar({ patientId: cp.id });
}

// Dane identyfikacyjne bieżącego pacjenta (route `#/patient-data`). Nie ma ich
// w menu bocznym — otwiera je kliknięcie w nazwisko na górnym pasku.
function viewPatientData() {
    const cp = Store.state.currentPatient;
    if (!cp) return noPatientView('Dane identyfikacyjne', '📇');
    return renderPatientDetail({ id: cp.id, tab: 'patient' });
}


// ----- Ustawienia -------------------------------------------------------------

function storageDescription() {
    const st = Store.state;
    if (st.storageConnected && st.storageKind === 'gdrive') {
        return '☁️ Dysk Google' + (st.storageLabel ? ' — ' + st.storageLabel.replace(/^Google Drive · /, '') : '');
    }
    if (st.storageConnected && st.storageKind === 'local') return '📁 Folder na tym komputerze — ' + st.storageLabel;
    if (st.devMode) return '🧪 Tryb demo — dane przykładowe, tylko w tej przeglądarce';
    return 'Niepodłączone';
}

function viewSettings() {
    const st = Store.state;
    const root = el('div', { class: 'psy-new-view' });
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Ustawienia']),
            el('div', { class: 'psy-new-view__subtitle' }, ['Miejsce przechowywania danych · Google · Baza leków'])
        ])
    ]));

    const body = el('div', { class: 'psy-new-view__body' });

    /* --- Magazyn danych --- */
    body.appendChild(el('h3', {}, ['Gdzie są dane pacjentów']));
    body.appendChild(el('div', { class: 'psy-new-row', style: { marginBottom: '8px' } }, [
        el('span', { class: 'psy-new-badge psy-new-badge--' + (st.storageConnected ? 'success' : 'neutral') },
            [storageDescription()]),
        el('button', {
            class: 'btn btn--secondary btn--sm',
            onclick: async () => {
                if (!st.storageConnected && !st.devMode) { showStorageGate(); return; }
                if (Store.hasUnsavedChanges()) {
                    const saved = await Store.flushNow();
                    if (!saved) {
                        toast('warning', 'Są niezapisane zmiany', 'Najpierw przywróć połączenie, żeby zmiany się zapisały.');
                        return;
                    }
                }
                const ok = await openConfirm({
                    title: 'Zmienić miejsce przechowywania danych?',
                    message: st.devMode
                        ? 'Wyjdziesz z trybu demo. Dane przykładowe zostaną w tej przeglądarce.'
                        : 'Aplikacja odłączy się od obecnego magazynu. Dane pacjentów ZOSTAJĄ tam, gdzie są — '
                          + 'możesz połączyć się ponownie w każdej chwili.',
                    confirmLabel: 'Odłącz',
                    variant: 'primary'
                });
                if (!ok) return;
                await Store.disconnectStorage();
                window.location.hash = APP_PATIENTS_ROUTE;
                showStorageGate();
            }
        }, [st.storageConnected || st.devMode ? 'Zmień / odłącz' : 'Połącz'])
    ]));
    body.appendChild(el('div', { class: 'psy-new-hint', style: { marginBottom: '18px' } }, [
        'Na Dysku Google aplikacja zakłada folder „pacjenci", a w nim folder każdego pacjenta z jego arkuszem '
        + 'i załącznikami. Arkusz ma czytelne zakładki (Pacjent, Wizyty, Leki, Diagnozy…), więc dane da się '
        + 'przeglądać także bez aplikacji. Aplikacja nie ma własnego serwera ani kopii danych.'
    ]));

    /* --- Zgody Google: co aplikacja może, z możliwością włączenia brakujących --- */
    if (st.storageKind === 'gdrive' && st.storageConnected) {
        const calendar = getCalendarApi();
        const permission = (label, hint, granted, action, request) => el('div', { class: 'psy-new-row', style: { marginBottom: '6px' } }, [
            el('span', { class: 'psy-new-badge psy-new-badge--' + (granted ? 'success' : 'neutral'), dataset: { permission: action } },
                [(granted ? '✓ ' : '✗ ') + label]),
            el('span', { class: 'psy-new-hint' }, [hint]),
            granted || !request ? null : el('button', {
                class: 'btn btn--secondary btn--sm',
                dataset: { action: 'enable-' + action },
                onclick: async () => {
                    try {
                        if (!(await request())) toast('warning', 'Bez zmian', 'Google nie przyznał tej zgody.');
                    } catch (e) {
                        toast('warning', 'Nie udało się uzyskać zgody', String(e && e.message || e));
                    }
                    AppController._renderView(true);
                }
            }, ['Włącz'])
        ]);
        body.appendChild(el('h3', { style: { marginTop: '8px' } }, ['Google — na co aplikacja ma zgodę']));
        body.appendChild(permission('Dysk Google', 'tylko pliki i foldery założone przez tę aplikację', true, 'drive', null));
        body.appendChild(permission('Kalendarz Google', 'tylko własny kalendarz aplikacji „' + CALENDAR_NAME + '"',
            calendar.status() === 'ready', 'calendar', () => calendar.requestPermission()));
        body.appendChild(permission('Zajętość głównego kalendarza', 'same przedziały zajęte / wolne, bez tytułów (nieobowiązkowe)',
            calendar.busyStatus() === 'ready', 'busy', () => calendar.requestBusyPermission()));
        body.appendChild(el('div', { class: 'psy-new-hint', style: { marginBottom: '18px' } }, [
            'Każdą zgodę Google potwierdza w osobnym okienku. Cofnąć je można w każdej chwili: '
            + 'konto Google → Bezpieczeństwo → Aplikacje i usługi innych firm.'
        ]));
    }

    /* --- Google --- */
    const clientInput = el('input', {
        type: 'text',
        value: getGoogleClientId(),
        spellcheck: 'false',
        style: { flex: '1', padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: '6px', fontFamily: 'monospace', fontSize: '12px' }
    });
    body.appendChild(el('h3', { style: { marginTop: '8px' } }, ['Google — konfiguracja (dla administratora)']));
    body.appendChild(el('div', { class: 'psy-new-row', style: { marginBottom: '6px' } }, [
        el('label', { style: { minWidth: '150px' } }, ['Identyfikator klienta OAuth:']),
        clientInput,
        el('button', {
            class: 'btn btn--secondary btn--sm',
            onclick: () => {
                setGoogleClientId(clientInput.value);
                clientInput.value = getGoogleClientId();
                toast('success', 'Zapisano', 'Nowy identyfikator zadziała przy następnym łączeniu z Dyskiem Google.');
            }
        }, ['Zapisz']),
        el('button', {
            class: 'btn btn--secondary btn--sm',
            title: 'Przywróć identyfikator wbudowany w aplikację',
            onclick: () => { setGoogleClientId(''); clientInput.value = DEFAULT_GOOGLE_CLIENT_ID; }
        }, ['Domyślny'])
    ]));
    body.appendChild(el('div', { class: 'psy-new-hint', style: { marginBottom: '18px' } }, [
        'W konsoli Google Cloud, przy tym kliencie OAuth, w „Authorized JavaScript origins" musi być adres: ',
        el('code', {}, [window.location.origin]),
        '. W projekcie muszą być włączone „Google Drive API", „Google Sheets API" i „Google Calendar API".'
    ]));

    /* --- Tryb demo --- */
    if (st.devMode) {
        body.appendChild(el('h3', { style: { marginTop: '8px' } }, ['Tryb demo']));
        body.appendChild(el('div', { class: 'psy-new-row', style: { marginBottom: '18px', gap: '8px' } }, [
            el('span', { class: 'psy-new-badge psy-new-badge--neutral' }, [
                st.patients.length + ' pacjentów · ' + st.visits.length + ' wizyt · ' + st.tests.length + ' testów'
            ]),
            el('button', {
                class: 'btn btn--secondary btn--sm',
                onclick: async () => {
                    const ok = await openConfirm({
                        title: 'Przywrócić dane przykładowe?',
                        message: 'Zmiany wprowadzone w trybie demo zostaną zastąpione danymi przykładowymi.',
                        confirmLabel: 'Przywróć',
                        variant: 'primary'
                    });
                    if (ok) { Store.resetAll(); window.location.hash = APP_PATIENTS_ROUTE; }
                }
            }, ['Przywróć dane przykładowe']),
            el('button', {
                class: 'btn btn--danger btn--sm',
                onclick: async () => {
                    const ok = await openConfirm({
                        title: 'Wyczyścić dane demo?',
                        message: 'Lista pacjentów trybu demo będzie pusta (jak przy pierwszym uruchomieniu).',
                        confirmLabel: 'Wyczyść',
                        variant: 'danger'
                    });
                    if (ok) { Store.wipeAll(); window.location.hash = APP_PATIENTS_ROUTE; }
                }
            }, ['Wyczyść dane demo'])
        ]));
    }

    /* --- Baza leków --- */
    body.appendChild(el('h3', { style: { marginTop: '8px' } }, ['Baza leków psychotropowych (' + FAKE_MED_DICT.length + ')']));
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

    // Wyciągi z wizyt (tylko do odczytu) — patrz `view-extracts.js`
    '#/meds':                 { renderer: renderMedsExtract,            menuId: 'meds',            needsPatient: true },
    '#/tests/run':            { renderer: viewTestRunner,               menuId: 'tests',           needsPatient: true },
    '#/tests':                { renderer: renderTestsExtract,           menuId: 'tests',           needsPatient: true },
    '#/recommendations':      { renderer: renderRecommendationsExtract, menuId: 'recommendations', needsPatient: true },
    '#/treatment-plan':       { renderer: renderTreatmentPlanExtract,   menuId: 'treatment-plan',  needsPatient: true },
    '#/diagnoses':            { renderer: renderDiagnosesExtract,       menuId: 'diagnoses',       needsPatient: true },
    '#/parameters':           { renderer: renderParametersExtract,      menuId: 'parameters',      needsPatient: true },
    '#/documents':            { renderer: renderDocumentsExtract,       menuId: 'documents',       needsPatient: true },

    // Wizyty (PO 2026-05-01: route `#/visit/detail` USUNIĘTE — wszystkie
    // kliknięcia w wizytę otwierają formularz wizyty; redundantny widok).
    '#/visit/form':           { renderer: viewVisitForm,           menuId: 'history',         needsPatient: true },
    '#/visit/new':            { renderer: viewVisitNew,            menuId: 'visit-new',       needsPatient: true },

    // Dane identyfikacyjne bieżącego pacjenta (bez pozycji w menu — klik w nazwisko na górnym pasku)
    '#/patient-data':         { renderer: viewPatientData,         menuId: null,              needsPatient: true },

    // Kalendarz
    '#/calendar':             { renderer: viewHomeCalendar,        menuId: null },
    '#/patient-calendar':     { renderer: viewPatientCalendar,     menuId: 'patient-calendar', needsPatient: true },

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
        this.storageBtnEl = document.getElementById('btn-storage');
        this._lastSaveStatus = null;

        this._bindTopbar();
        this._renderSidebar();

        document.getElementById('psy-new-menu-toggle').addEventListener('click', () => {
            this.shellEl.classList.toggle('psy-new-shell--menu-open');
        });

        window.addEventListener('hashchange', () => this._onHashChange());
        // Obrót tabletu / zmiana szerokości okna.
        window.matchMedia('(max-width: 900px)').addEventListener('change', () => this._applyFormMode());

        // Po zamknięciu okna potwierdzenia: odśwież widoki list (formularze „live"
        // zostają nietknięte — same pilnują swojego stanu).
        window.addEventListener('psy-modal-closed', () => {
            this._renderView(false);
            this._updateSidebarActive();
            this._renderPatientTag();
        });

        Store.subscribe((state) => {
            this._renderPatientTag();
            this._updateSaveIndicator(state.saveStatus);
            this._updateStorageBadge();
            this._renderView(false);
            this._updateSidebarActive();
        });

        // Ostatnio używany magazyn: folder lokalny wraca sam; Dysk Google — sam po
        // odświeżeniu strony (sesja karty), a w nowej karcie lub po godzinie wymaga
        // jednego kliknięcia (przeglądarka nie pozwala otworzyć logowania bez gestu).
        await Store.restoreStorage();

        if (shouldShowGate()) {
            showStorageGate();
            this._updateSaveIndicator(Store.state.saveStatus);
            this._updateStorageBadge();
            return;
        }
        this.afterStorageReady();
    },

    /** Magazyn wybrany (przy starcie albo na ekranie startowym) — pokaż aplikację. */
    afterStorageReady() {
        hideStorageGate();
        this._renderPatientTag();
        this._updateSaveIndicator(Store.state.saveStatus);
        this._updateStorageBadge();
        if (!window.location.hash) window.location.hash = APP_DEFAULT_ROUTE;   // → hashchange
        else this._onHashChange();
    },

    _bindTopbar() {
        this.storageBtnEl.addEventListener('click', () => {
            const st = Store.state;
            if (st.storageConnected && st.storageStatus === 'needs-auth') Store.reconnectStorage();
            else if (st.storageConnected || st.devMode) window.location.hash = APP_SETTINGS_ROUTE;
            else showStorageGate();
        });
        document.getElementById('btn-settings').addEventListener('click', () => {
            window.location.hash = APP_SETTINGS_ROUTE;
        });
        document.getElementById('btn-home').addEventListener('click', () => {
            window.location.hash = APP_DEFAULT_ROUTE;
        });
    },

    _updateStorageBadge() {
        const btn = this.storageBtnEl;
        if (!btn) return;
        const st = Store.state;
        btn.classList.remove('psy-new-topbar__btn--connected', 'psy-new-topbar__btn--devmode');
        if (st.storageConnected && st.storageStatus === 'needs-auth') {
            btn.textContent = '⚠ Połącz ponownie';
            btn.title = 'Połączenie z magazynem wymaga odnowienia — kliknij';
            btn.classList.add('psy-new-topbar__btn--devmode');
        } else if (st.storageConnected) {
            btn.textContent = st.storageKind === 'gdrive' ? '☁️ Dysk Google' : '📁 ' + (st.storageLabel || 'folder');
            btn.title = 'Dane: ' + storageDescription();
            btn.classList.add('psy-new-topbar__btn--connected');
        } else if (st.devMode) {
            btn.textContent = '🧪 Tryb demo';
            btn.title = 'Dane przykładowe, tylko w tej przeglądarce — kliknij, aby podłączyć magazyn';
            btn.classList.add('psy-new-topbar__btn--devmode');
        } else {
            btn.textContent = 'Dane: niepodłączone';
            btn.title = 'Wybierz miejsce przechowywania danych';
        }
    },

    _updateSaveIndicator(status) {
        if (!this.saveIndicatorEl) return;
        if (this._lastSaveStatus === status) return;
        this._lastSaveStatus = status;

        const node = this.saveIndicatorEl;
        node.classList.remove(
            'psy-new-topbar__save--idle', 'psy-new-topbar__save--saving',
            'psy-new-topbar__save--saved', 'psy-new-topbar__save--error'
        );
        const map = {
            saving: ['psy-new-topbar__save--saving', '⟳ Zapisywanie…'],
            saved:  ['psy-new-topbar__save--saved',  '✓ Zapisano'],
            error:  ['psy-new-topbar__save--error',  '⚠ Niezapisane'],
            idle:   ['psy-new-topbar__save--idle',   '💾 Autozapis']
        };
        const [cls, text] = map[status] || map.idle;
        node.classList.add(cls);
        node.textContent = text;
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
        if (shouldShowGate()) return;                       // ekran startowy przykrywa aplikację
        const resolved = resolveRoute(window.location.hash);
        if (resolved.needsPatient && !Store.state.currentPatient) {
            toast('warning', 'Wybierz pacjenta', 'Aby przejść do tej sekcji, najpierw wybierz pacjenta.');
            window.location.hash = APP_PATIENTS_ROUTE;
            return;
        }
        this._renderView(true);
        this._updateSidebarActive();
    },

    /** Pacjent, którego pełne dane są potrzebne do wyświetlenia bieżącej trasy. */
    _patientIdForRoute(resolved) {
        const m = (window.location.hash || '').match(/^#\/patients\/(?:detail|edit)\/([^/?]+)/);
        if (m) return decodeURIComponent(m[1]);
        if (resolved.needsPatient) return Store.state.currentPatient ? Store.state.currentPatient.id : null;
        return null;
    },

    /**
     * @param {boolean} force — true: zawsze rysuj (zmiana trasy); false: odświeżenie
     *   po zmianie danych, pomijane dla widoków „live" (formularzy).
     */
    _renderView(force = false) {
        if (document.body.classList.contains('psy-modal-open')) return;
        if (shouldShowGate()) return;                       // ekran startowy przykrywa aplikację

        const current = this.mainEl.firstElementChild;
        if (!force && current && current.dataset && current.dataset.live === 'true') return;

        // Widok schodzi z ekranu — daj mu dokończyć zapis.
        if (current && typeof current.psyTeardown === 'function') {
            try { current.psyTeardown(); } catch (e) { console.error('[teardown]', e); }
        }

        const resolved = resolveRoute(window.location.hash);
        this.mainEl.innerHTML = '';

        let node;
        const pid = this._patientIdForRoute(resolved);
        if (pid && !Store.isPatientLoaded(pid)) {
            node = this._patientLoadingView(pid);
        } else {
            try {
                node = resolved.renderer();
            } catch (e) {
                console.error('[renderView]', e);
                node = emptyState('⚠', 'Błąd wyświetlania', String(e && e.message || e), []);
            }
        }
        this.mainEl.appendChild(node);

        this._applyFormMode();
    },

    /** Formularz wizyty zwęża menu boczne do ikon — ale nie na wąskim ekranie,
     *  gdzie menu jest wysuwane i ma pokazywać pełne nazwy. */
    _applyFormMode() {
        const narrow = window.matchMedia('(max-width: 900px)').matches;
        this.shellEl.classList.toggle('psy-new-shell--form-mode',
            !narrow && !!this.mainEl.querySelector('.psy-form-toolbar'));
    },

    /** Dane pacjenta jeszcze nie pobrane z magazynu: pobierz i pokaż stan. */
    _patientLoadingView(pid) {
        const root = el('div', { class: 'psy-new-view' });
        const body = el('div', { class: 'psy-new-view__body' });
        const error = Store.getPatientLoadError(pid);
        if (error) {
            body.appendChild(emptyState('⚠', 'Nie udało się wczytać danych pacjenta', error, [
                {
                    label: 'Spróbuj ponownie', variant: 'primary',
                    onClick: () => { Store.ensurePatientLoaded(pid, { retry: true }); this._renderView(true); }
                },
                { label: 'Lista pacjentów', onClick: () => (window.location.hash = APP_PATIENTS_ROUTE) }
            ]));
        } else {
            body.appendChild(emptyState('⏳', 'Wczytuję dane pacjenta…', 'Pobieram arkusz pacjenta.', []));
            // Zakończenie wczytywania zgłasza Store (subskrypcja przerysuje widok).
            Store.ensurePatientLoaded(pid);
        }
        root.appendChild(body);
        return root;
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
        //
        // PR-J16 (2026-05-30):
        //   - Wiek z miesiącami ("X lat Y mies.") — klientka prosi o widoczne
        //     miesiące (istotne przy dzieciach).
        //   - Hover popover z read-only detalami — opakowanie .psy-new-patient-tag-wrap
        //     zawiera tag + ukryty popover; CSS pokazuje go na hover wrappera.

        const ageNum = _computePatientAgeYears(p);
        const ageFull = _formatPatientAgeFull(p);   // "X lat Y mies."
        const adult = ageNum >= 18;
        const minorBadge = ageNum != null
            ? (adult
                ? el('span', {
                    class: 'psy-new-patient-tag__badge psy-new-patient-tag__badge--adult',
                    title: 'Wiek: ' + (ageFull || ageNum + ' lat') + ' (pełnoletni)'
                }, ['✓ Pełnoletni'])
                : el('span', {
                    class: 'psy-new-patient-tag__badge psy-new-patient-tag__badge--minor',
                    title: 'Wiek: ' + (ageFull || ageNum + ' lat') + ' (nieletni)'
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
            title: 'Otwórz dane identyfikacyjne'
        }, [
            // PESEL na początku (klientka, z3.jpg)
            p.pesel
                ? el('span', {
                    class: 'psy-new-patient-tag__field psy-new-patient-tag__field--pesel',
                    title: 'PESEL',
                    onclick: goToPatientData
                }, [p.pesel])
                : null,

            // Ikona płci
            sexIcon
                ? el('span', {
                    class: 'psy-new-patient-tag__sex psy-new-patient-tag__sex--' + sexIcon.cls,
                    title: 'Płeć: ' + (p.plec || 'nieznana'),
                    onclick: goToPatientData
                }, [sexIcon.glyph])
                : null,

            // Imię + drugie imię + nazwisko (klikalne → detale)
            el('span', {
                class: 'psy-new-patient-tag__name',
                onclick: goToPatientData,
                title: 'Otwórz dane identyfikacyjne'
            }, [nameParts]),

            // Wiek (PR-J16: format "X lat Y mies." z miesiącami)
            ageFull
                ? el('span', {
                    class: 'psy-new-patient-tag__field',
                    title: 'Wiek pacjenta (lata i miesiące)'
                }, [ageFull])
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

        // PR-J16 (2026-05-30): wrapper z hover-popover (read-only podgląd).
        // Klientka: „jak najedziesz na top panel pacjenta to wyskakuje panel
        // read only z detalami pacjenta". Implementacja CSS-only — wrapper
        // .psy-new-patient-tag-wrap pokazuje popover na :hover (transition
        // delay 250 ms żeby nie błyskało przy przelotach).
        const wrap = el('div', { class: 'psy-new-patient-tag-wrap' }, [
            tag,
            _buildPatientPreviewPopover(p)
        ]);

        this.patientHostEl.appendChild(wrap);
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
