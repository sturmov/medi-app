// ============================================================================
// view-calendar.js — kalendarz terminów.
//
//   renderCalendar()              strona główna: wszystkie terminy
//   renderCalendar({ patientId }) kalendarz jednego pacjenta (terminy innych
//                                 pacjentów widać tylko jako „zajęte")
//
// Na kalendarzu:
//   • terminy pacjentów — imię i nazwisko, rodzaj wizyty, telefon, płatność,
//     znaczek 📝 gdy jest już notatka;
//   • inne wpisy terapeuty (urlop, przerwa) — z tytułem;
//   • „zajęte" — prywatne terminy z głównego kalendarza Google, bez treści;
//   • dni ustawowo wolne od pracy (liczone lokalnie).
//
// Klik w wolne miejsce (lub przeciągnięcie zakresu) otwiera panel umawiania
// z prawej strony. Termin można przeciągnąć na inną godzinę / dzień i rozciągnąć.
// Klik w termin → panel: zmiana, „Napisz notatkę", usunięcie.
//
// Umawianie ma jawny przycisk „Umów wizytę" (wyjątek od autozapisu): termin
// powstaje dopiero, gdy wiadomo kto, kiedy i na jak długo.
//
// Komponent kalendarza: FullCalendar (MIT), lokalna kopia w lib/fullcalendar/.
// ============================================================================

import { Store } from './_store.js';
import { el, toast } from './_dom.js';
import { openConfirm } from './_modal.js';
import { VISIT_TYPES, visitTypeLabel } from './_visit-types.js';
import { getCalendarApi, appointmentTitle, CALENDAR_NAME } from './_calendar-api.js';
import { holidaysBetween } from './_holidays-pl.js';

const DEFAULT_MINUTES = 50;

/* ---------------- daty (czas lokalny) ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const localTime = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
const fromLocal = (date, time) => new Date(date + 'T' + (time || '00:00') + ':00');
const addMinutes = (d, m) => new Date(d.getTime() + m * 60000);
const addDays = (dateStr, n) => { const d = fromLocal(dateStr); d.setDate(d.getDate() + n); return localDate(d); };

function patientName(p) {
    return ((p.imie || '') + ' ' + (p.nazwisko || '')).trim() || p.id;
}

/* ---------------- FullCalendar: ładowany przy pierwszym użyciu ---------------- */
let fcLoading = null;
function loadFullCalendar() {
    if (window.FullCalendar) return Promise.resolve();
    if (!fcLoading) {
        const script = (src) => new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Nie udało się wczytać komponentu kalendarza (' + src + ').'));
            document.head.appendChild(s);
        });
        fcLoading = script('lib/fullcalendar/index.global.min.js')
            .then(() => script('lib/fullcalendar/pl.global.min.js'))
            .catch((e) => { fcLoading = null; throw e; });
    }
    return fcLoading;
}

/** Zakładki strony głównej: Kalendarz | Pacjenci. */
export function renderHomeTabs(active) {
    const tab = (id, label, hash) => el('a', {
        href: hash,
        class: 'psy-home-tabs__tab' + (active === id ? ' psy-home-tabs__tab--active' : '')
    }, [label]);
    return el('nav', { class: 'psy-home-tabs' }, [
        tab('calendar', '📅 Kalendarz', '#/calendar'),
        tab('patients', '👥 Pacjenci', '#/patients')
    ]);
}

/* ==========================================================================
   Widok
   ========================================================================== */
export function renderCalendar(opts = {}) {
    const patient = opts.patientId ? (Store.state.patients.find((p) => p.id === opts.patientId) || null) : null;
    const api = getCalendarApi();

    let cal = null;
    let loaded = [];            // terminy z aktualnie widocznego zakresu
    let destroyed = false;

    const root = el('div', { class: 'psy-new-view psy-cal-view', dataset: { live: 'true' } });

    /* ---------------- nagłówek ---------------- */
    const summaryEl = el('div', { class: 'psy-new-view__subtitle' }, [
        patient ? patientName(patient) + ' · terminy tego pacjenta' : ''
    ]);
    if (!patient) renderHomeSummary();
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            patient ? el('h1', { class: 'psy-new-view__title' }, ['Kalendarz']) : renderHomeTabs('calendar'),
            summaryEl
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            el('button', {
                class: 'btn btn--primary',
                dataset: { action: 'book' },
                onclick: () => {
                    const start = nextFullHalfHour();
                    openPanel({ kind: 'visit', start, end: addMinutes(start, DEFAULT_MINUTES), allDay: false });
                }
            }, ['+ Umów wizytę'])
        ])
    ]));

    const noticeEl = el('div', { class: 'psy-cal__notice', style: { display: 'none' } });
    root.appendChild(noticeEl);

    // FullCalendar ustawia własną wysokość (100%) na swoim elemencie — rozmiar nadaje mu ramka.
    const calEl = el('div', { class: 'psy-cal__fc' });
    const hostEl = el('div', { class: 'psy-cal__host' }, [calEl]);
    const panelEl = el('aside', { class: 'psy-cal__panel', style: { display: 'none' } });
    const layoutEl = el('div', { class: 'psy-cal' }, [hostEl, panelEl]);
    root.appendChild(layoutEl);

    function nextFullHalfHour() {
        const d = new Date();
        d.setSeconds(0, 0);
        d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
        return d;
    }

    function showNotice(kind, children) {
        noticeEl.className = 'psy-cal__notice psy-cal__notice--' + kind;
        noticeEl.innerHTML = '';
        for (const c of children) noticeEl.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        noticeEl.style.display = '';
    }
    function clearNotice() { noticeEl.style.display = 'none'; }

    /* ---------------- zgody Google ---------------- */
    function ready() { return api.status() === 'ready'; }
    let enableProblem = '';     // co poszło nie tak przy ostatniej próbie włączenia kalendarza

    /**
     * Kalendarz Google nie jest jeszcze włączony. Jedno kliknięcie = jedno okienko
     * Google z jedną zgodą (bez pól wyboru, które można przeoczyć).
     */
    function showEnableNotice() {
        const btn = el('button', { class: 'btn btn--primary btn--sm', dataset: { action: 'enable-calendar' } },
            ['Włącz Kalendarz Google']);
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                if (await api.requestPermission()) {
                    enableProblem = '';
                    clearNotice();
                    renderHomeSummary();
                    cal.refetchEvents();
                    toast('success', 'Kalendarz Google włączony', 'Terminy zapisują się w kalendarzu „' + CALENDAR_NAME + '".');
                    return;
                }
                enableProblem = 'Google nie przyznał zgody. W okienku Google wybierz „Dalej" / „Zezwól" — spróbuj jeszcze raz.';
            } catch (e) {
                enableProblem = String(e && e.message || e);
            }
            if (!destroyed) showEnableNotice();
        });
        showNotice('warning', [
            el('div', { class: 'psy-cal__notice-text' }, [
                el('strong', {}, ['Kalendarz Google nie jest jeszcze włączony. ']),
                'Po kliknięciu Google zapyta o jedną zgodę: na własny kalendarz aplikacji „' + CALENDAR_NAME
                    + '". Pozostałych kalendarzy aplikacja nie zobaczy.',
                enableProblem ? el('div', { class: 'psy-cal__notice-problem' }, [enableProblem]) : null
            ]),
            btn
        ]);
    }

    /**
     * Podtytuł strony głównej. Przy kalendarzu Google także (nieobowiązkowe)
     * włączenie „zajętych" z głównego kalendarza — to osobna zgoda.
     */
    function renderHomeSummary() {
        if (patient) return;
        summaryEl.innerHTML = '';
        summaryEl.appendChild(document.createTextNode(api.kind === 'google'
            ? 'Terminy z kalendarza Google „' + CALENDAR_NAME + '"'
            : 'Terminy zapisane w tej przeglądarce (bez połączenia z Dyskiem Google)'));
        if (api.kind !== 'google' || !ready() || api.busyStatus() !== 'no-permission') return;
        summaryEl.appendChild(document.createTextNode(' · '));
        summaryEl.appendChild(el('button', {
            type: 'button', class: 'psy-cal__link', dataset: { action: 'enable-busy' },
            title: 'Google zapyta o zgodę na odczyt samej zajętości głównego kalendarza — bez tytułów i szczegółów.',
            onclick: async () => {
                try {
                    if (await api.requestBusyPermission()) {
                        renderHomeSummary();
                        cal.refetchEvents();
                    } else {
                        toast('warning', 'Bez zmian', 'Google nie przyznał zgody na odczyt zajętości.');
                    }
                } catch (e) {
                    toast('warning', 'Nie udało się uzyskać zgody', String(e && e.message || e));
                }
            }
        }, ['pokaż też moje prywatne terminy jako „zajęte"']));
    }

    /* ---------------- zdarzenia na kalendarzu ---------------- */
    function toCalendarEvent(a) {
        const ownVisit = a.kind === 'visit' && (!patient || a.patientId === patient.id);
        if (patient && !ownVisit) {
            // Kalendarz pacjenta: cudza wizyta = „zajęte"; inny wpis (urlop) = tło z tytułem.
            return {
                id: 'busy-' + a.id, start: a.start, end: a.end, allDay: a.allDay,
                display: 'background', classNames: ['psy-cal-busy'],
                title: a.kind === 'visit' ? 'zajęte' : (a.title || 'zajęte'),
                extendedProps: { kind: 'busy' }
            };
        }
        return {
            id: a.id, start: a.start, end: a.end, allDay: a.allDay,
            title: appointmentTitle(a),
            classNames: a.kind === 'visit'
                ? ['psy-cal-ev', a.paid ? 'psy-cal-ev--paid' : 'psy-cal-ev--unpaid']
                : ['psy-cal-ev', 'psy-cal-ev--other'],
            extendedProps: { kind: a.kind, appt: a }
        };
    }

    function holidayEvents(info) {
        return holidaysBetween(localDate(info.start), localDate(info.end)).map((h) => ({
            id: 'holiday-' + h.date, start: h.date, allDay: true, title: h.name,
            // w kalendarzu pacjenta święto jest tłem — lista pokazuje wtedy same terminy pacjenta
            display: patient ? 'background' : 'auto',
            editable: false, classNames: ['psy-cal-holiday'], extendedProps: { kind: 'holiday' }
        }));
    }

    /**
     * Źródło zdarzeń dla FullCalendar. Celowo NIE jest funkcją async: FullCalendar
     * potraktowałby zwróconą obietnicę jako drugi wynik (i wysypał się na `undefined`,
     * gdy widok został zamknięty w trakcie pobierania).
     */
    function fetchEvents(info, success, failure) {
        loadEvents(info).then(
            (events) => { if (!destroyed) success(events); },
            (e) => {
                if (destroyed) return;
                if (!ready()) {
                    // Google odpowiedział, że token nie obejmuje kalendarza — prosimy o zgodę zamiast straszyć błędem.
                    loaded = [];
                    enableProblem = String(e && e.message || e);
                    showEnableNotice();
                    success(holidayEvents(info));
                    return;
                }
                console.error('[calendar] wczytywanie terminów', e);
                showNotice('error', [
                    'Nie udało się wczytać terminów: ' + String(e && e.message || e) + ' ',
                    el('button', { class: 'btn btn--secondary btn--sm', onclick: () => cal.refetchEvents() }, ['Spróbuj ponownie'])
                ]);
                failure(e);
            }
        );
    }

    async function loadEvents(info) {
        if (!ready()) {
            loaded = [];
            showEnableNotice();
            return holidayEvents(info);
        }
        const [appointments, busy] = await Promise.all([
            api.list(info.start.toISOString(), info.end.toISOString()),
            api.busy(info.start.toISOString(), info.end.toISOString())
        ]);
        if (destroyed) return [];
        loaded = appointments;
        clearNotice();
        if (patient) refreshPatientSummary(); else renderHomeSummary();
        return [
            ...appointments.map(toCalendarEvent),
            ...busy.map((b, i) => ({
                id: 'private-' + i + '-' + b.start, start: b.start, end: b.end,
                display: 'background', classNames: ['psy-cal-busy'], title: 'zajęte',
                extendedProps: { kind: 'busy' }
            })),
            ...holidayEvents(info)
        ];
    }

    /** Kalendarz pacjenta: w podtytule najbliższy termin. */
    async function refreshPatientSummary() {
        try {
            const now = new Date();
            const upcoming = (await api.list(now.toISOString(), addMinutes(now, 60 * 24 * 365).toISOString()))
                .filter((a) => a.kind === 'visit' && a.patientId === patient.id)
                .sort((a, b) => new Date(a.start) - new Date(b.start));
            if (destroyed) return;
            const next = upcoming[0];
            summaryEl.textContent = patientName(patient) + ' · ' + (next
                ? 'najbliższy termin: ' + localDate(new Date(next.start)) + ' ' + localTime(new Date(next.start))
                    + ' (' + visitTypeLabel(next.visitType) + ')' + (upcoming.length > 1 ? ' · zaplanowanych: ' + upcoming.length : '')
                : 'brak zaplanowanych terminów');
        } catch (_) { /* podtytuł jest tylko informacją */ }
    }

    function eventContent(arg) {
        const p = arg.event.extendedProps;
        const view = arg.view.type;
        if (p.kind === 'busy' || arg.event.display === 'background') {
            return { domNodes: [el('div', { class: 'psy-cal-busy__label' }, [arg.event.title || 'zajęte'])] };
        }
        if (p.kind === 'visit' && p.appt) {
            const a = p.appt;
            const paidLong = el('span', { class: 'psy-cal-ev__pay psy-cal-ev__pay--' + (a.paid ? 'paid' : 'unpaid') },
                [a.paid ? '✓ zapłacono' : 'nie zapłacono']);
            const meta = [visitTypeLabel(a.visitType), a.phone].filter(Boolean).join(' · ');
            if (view.startsWith('list')) {
                return { domNodes: [el('span', { class: 'psy-cal-ev__listline' }, [
                    el('strong', {}, [a.patientName || '(pacjent)']), ' · ' + meta + ' · ', paidLong, a.visitId ? ' 📝' : ''
                ])] };
            }
            // Tydzień / dzień / miesiąc: mało miejsca — najpierw to, co najważniejsze
            // (godzina, nazwisko, płatność); reszta w drugiej linii i w dymku.
            const start = arg.event.allDay || !arg.event.start ? '' : localTime(arg.event.start) + ' ';
            return { domNodes: [el('div', { class: 'psy-cal-ev__box' }, [
                el('div', { class: 'psy-cal-ev__line1' }, [
                    start ? el('span', { class: 'psy-cal-ev__time' }, [start]) : null,
                    el('strong', {}, [a.patientName || '(pacjent)']),
                    a.visitId ? el('span', { title: 'Jest notatka z tej wizyty' }, [' 📝']) : null
                ]),
                el('div', { class: 'psy-cal-ev__line2' }, [
                    el('span', { class: 'psy-cal-ev__pay psy-cal-ev__pay--' + (a.paid ? 'paid' : 'unpaid') },
                        [a.paid ? '✓ zapł.' : 'nie zapł.']),
                    meta ? ' · ' + meta : ''
                ])
            ])] };
        }
        return { domNodes: [el('div', { class: 'psy-cal-ev__box' }, [
            arg.timeText && !arg.event.allDay ? el('span', { class: 'psy-cal-ev__time' }, [arg.timeText + ' ']) : null,
            arg.event.title
        ])] };
    }

    async function onMoved(info) {
        const a = info.event.extendedProps.appt;
        if (!a) { info.revert(); return; }
        const start = info.event.start;
        const allDay = info.event.allDay;
        const end = info.event.end || (allDay ? fromLocal(addDays(localDate(start), 1)) : addMinutes(start, DEFAULT_MINUTES));
        try {
            const saved = await api.save(Object.assign({}, a, {
                allDay,
                start: allDay ? localDate(start) : start.toISOString(),
                end: allDay ? localDate(end) : end.toISOString()
            }));
            info.event.setExtendedProp('appt', saved);
            const i = loaded.findIndex((x) => x.id === saved.id);
            if (i >= 0) loaded[i] = saved;
            if (patient) refreshPatientSummary();
        } catch (e) {
            info.revert();
            toast('error', 'Nie udało się przenieść terminu', String(e && e.message || e));
        }
    }

    /* ---------------- panel: umawianie / edycja ---------------- */
    function closePanel() {
        panelEl.style.display = 'none';
        panelEl.innerHTML = '';
        layoutEl.classList.remove('psy-cal--panel-open');
        if (cal) { cal.unselect(); cal.updateSize(); }
    }

    function overlapping(start, end, ownId) {
        return loaded.filter((a) => a.id !== ownId && !a.allDay
            && new Date(a.start) < end && new Date(a.end) > start);
    }

    function openPanel(source) {
        if (!ready()) {
            if (cal) cal.unselect();
            toast('warning', 'Najpierw włącz Kalendarz Google', 'Przycisk jest nad kalendarzem.');
            return;
        }
        const existing = !!source.id;
        const startDate = source.allDay ? fromLocal(String(source.start).slice(0, 10), '09:00') : new Date(source.start);
        const endDate = source.allDay ? addMinutes(startDate, DEFAULT_MINUTES) : new Date(source.end);

        const form = {
            id: source.id || '',
            kind: source.kind || 'visit',
            patientId: source.patientId || (patient ? patient.id : ''),
            patientName: source.patientName || (patient ? patientName(patient) : ''),
            phone: source.phone || (patient ? (patient.telefon || '') : ''),
            visitType: source.visitType || '',
            paid: source.paid === true,
            visitId: source.visitId || '',
            title: source.title || '',
            note: source.note || '',
            allDay: source.allDay === true && source.kind === 'other',
            date: source.allDay ? String(source.start).slice(0, 10) : localDate(startDate),
            time: localTime(startDate),
            minutes: Math.max(5, Math.round((endDate - startDate) / 60000)) || DEFAULT_MINUTES,
            // wpis całodniowy: ostatni dzień (w Google koniec jest „do, ale bez")
            lastDay: source.allDay && source.end ? addDays(String(source.end).slice(0, 10), -1) : ''
        };
        if (!form.visitType) form.visitType = defaultVisitType(form.patientId);

        panelEl.innerHTML = '';
        panelEl.style.display = '';
        layoutEl.classList.add('psy-cal--panel-open');
        if (cal) cal.updateSize();

        const warnEl = el('div', { class: 'psy-cal__warn', style: { display: 'none' } });
        const bodyEl = el('div', { class: 'psy-cal__panel-body' });
        const saveBtn = el('button', { class: 'btn btn--primary', dataset: { action: 'save' } }, ['']);

        function times() {
            if (form.kind === 'other' && form.allDay) {
                const last = form.lastDay && form.lastDay >= form.date ? form.lastDay : form.date;
                return { allDay: true, start: form.date, end: addDays(last, 1) };
            }
            const start = fromLocal(form.date, form.time);
            return { allDay: false, start, end: addMinutes(start, Number(form.minutes) || DEFAULT_MINUTES) };
        }

        function refreshWarning() {
            const t = times();
            const clash = t.allDay ? [] : overlapping(t.start, t.end, form.id);
            if (clash.length) {
                warnEl.textContent = '⚠ W tym czasie jest już: ' + clash.map((a) =>
                    localTime(new Date(a.start)) + ' ' + (a.kind === 'visit' ? a.patientName : a.title)).join(', ');
                warnEl.style.display = '';
            } else {
                warnEl.style.display = 'none';
            }
        }

        const field = (label, control) => el('label', { class: 'psy-cal__field' }, [
            el('span', { class: 'psy-cal__field-label' }, [label]), control
        ]);
        const input = (type, key, extra = {}) => {
            const node = el('input', Object.assign({ type, class: 'psy-vf__input', name: 'cal-' + key }, extra));
            if (type === 'checkbox') node.checked = !!form[key]; else node.value = form[key] == null ? '' : form[key];
            node.addEventListener(type === 'checkbox' ? 'change' : 'input', () => {
                form[key] = type === 'checkbox' ? node.checked : node.value;
                if (key === 'allDay') renderBody();
                refreshWarning();
            });
            return node;
        };

        function patientPicker() {
            if (form.patientId) {
                return el('div', { class: 'psy-cal__patient' }, [
                    el('strong', {}, [form.patientName]),
                    form.phone ? el('span', { class: 'psy-new-hint' }, [' · ' + form.phone]) : null,
                    (patient || existing) ? null : el('button', {
                        type: 'button', class: 'psy-cal__link',
                        onclick: () => { form.patientId = ''; form.patientName = ''; form.phone = ''; renderBody(); }
                    }, ['zmień'])
                ]);
            }
            const results = el('div', { class: 'psy-cal__patient-results' });
            const search = el('input', {
                type: 'search', class: 'psy-vf__input', name: 'cal-patient-search',
                placeholder: 'Szukaj pacjenta (nazwisko, imię, kod)…', autocomplete: 'off'
            });
            const show = () => {
                const q = search.value.trim().toLowerCase();
                results.innerHTML = '';
                const list = Store.state.patients.filter((p) => !p.archived)
                    .filter((p) => !q || (patientName(p) + ' ' + p.id + ' ' + (p.pesel || '')).toLowerCase().includes(q))
                    .slice(0, 8);
                for (const p of list) {
                    results.appendChild(el('button', {
                        type: 'button', class: 'psy-cal__patient-option', dataset: { patientId: p.id },
                        onclick: () => {
                            form.patientId = p.id;
                            form.patientName = patientName(p);
                            form.phone = p.telefon || '';
                            form.visitType = defaultVisitType(p.id);
                            renderBody();
                        }
                    }, [patientName(p), el('span', { class: 'psy-new-hint' }, [' · ' + p.id])]));
                }
                if (!list.length) results.appendChild(el('div', { class: 'psy-new-hint' }, ['Brak pasujących pacjentów.']));
            };
            search.addEventListener('input', show);
            show();
            setTimeout(() => { try { search.focus(); } catch (_) { /* */ } }, 0);
            return el('div', {}, [search, results]);
        }

        function renderBody() {
            bodyEl.innerHTML = '';
            if (!existing && !patient) {
                const kindBtn = (kind, label) => el('button', {
                    type: 'button',
                    class: 'psy-cal__kind' + (form.kind === kind ? ' psy-cal__kind--active' : ''),
                    dataset: { kind },
                    onclick: () => { form.kind = kind; renderBody(); }
                }, [label]);
                bodyEl.appendChild(el('div', { class: 'psy-cal__kinds' }, [
                    kindBtn('visit', 'Wizyta pacjenta'), kindBtn('other', 'Inny wpis (urlop, przerwa)')
                ]));
            }

            if (form.kind === 'visit') {
                bodyEl.appendChild(field('Pacjent', patientPicker()));
                const typeSel = el('select', { class: 'psy-vf__select', name: 'cal-visitType' },
                    VISIT_TYPES.map((t) => el('option', { value: t.id, selected: t.id === form.visitType }, [t.label])));
                typeSel.addEventListener('change', () => { form.visitType = typeSel.value; });
                bodyEl.appendChild(field('Rodzaj wizyty', typeSel));
            } else {
                bodyEl.appendChild(field('Tytuł', input('text', 'title', { placeholder: 'np. Urlop, Szkolenie' })));
                bodyEl.appendChild(el('label', { class: 'psy-cal__check' }, [input('checkbox', 'allDay'), ' cały dzień']));
            }

            if (form.kind === 'other' && form.allDay) {
                bodyEl.appendChild(el('div', { class: 'psy-cal__row' }, [
                    field('Od dnia', input('date', 'date')),
                    field('Do dnia', input('date', 'lastDay'))
                ]));
            } else {
                bodyEl.appendChild(el('div', { class: 'psy-cal__row' }, [
                    field('Data', input('date', 'date')),
                    field('Godzina', input('time', 'time', { step: '300' })),
                    field('Minut', input('number', 'minutes', { min: '5', step: '5' }))
                ]));
            }

            if (form.kind === 'visit') {
                bodyEl.appendChild(el('label', { class: 'psy-cal__check' }, [input('checkbox', 'paid'), ' zapłacono']));
            }
            const note = el('textarea', { class: 'psy-vf__textarea', name: 'cal-note', rows: 2, placeholder: 'notatka do terminu (opcjonalnie)' });
            note.value = form.note;
            note.addEventListener('input', () => { form.note = note.value; });
            bodyEl.appendChild(field('Notatka', note));

            saveBtn.textContent = existing ? 'Zapisz zmiany' : (form.kind === 'visit' ? 'Umów wizytę' : 'Dodaj wpis');
            refreshWarning();
        }

        async function save() {
            if (form.kind === 'visit' && !form.patientId) { toast('warning', 'Wybierz pacjenta', 'Termin wizyty musi mieć pacjenta.'); return; }
            if (form.kind === 'other' && !form.title.trim()) { toast('warning', 'Podaj tytuł', 'Np. „Urlop".'); return; }
            if (!form.date) { toast('warning', 'Podaj datę', ''); return; }
            const t = times();
            const appointment = {
                id: form.id, kind: form.kind,
                allDay: t.allDay,
                start: t.allDay ? t.start : t.start.toISOString(),
                end: t.allDay ? t.end : t.end.toISOString(),
                patientId: form.kind === 'visit' ? form.patientId : '',
                patientName: form.kind === 'visit' ? form.patientName : '',
                phone: form.kind === 'visit' ? form.phone : '',
                visitType: form.kind === 'visit' ? form.visitType : '',
                paid: form.kind === 'visit' && form.paid,
                visitId: form.visitId,
                title: form.kind === 'other' ? form.title.trim() : '',
                note: form.note
            };
            saveBtn.disabled = true;
            try {
                const saved = await api.save(appointment);
                // Płatność zmieniona przy terminie → ta sama w powiązanej notatce.
                if (saved.kind === 'visit' && saved.visitId) {
                    await Store.ensurePatientLoaded(saved.patientId);
                    const visit = Store.getVisitById(saved.visitId);
                    if (visit && visit.paid !== saved.paid) Store.updateVisit(visit.id, { paid: saved.paid });
                }
                closePanel();
                cal.refetchEvents();
                toast('success', existing ? 'Zapisano termin' : (saved.kind === 'visit' ? 'Umówiono wizytę' : 'Dodano wpis'),
                    saved.allDay ? '' : localDate(new Date(saved.start)) + ' ' + localTime(new Date(saved.start)));
            } catch (e) {
                saveBtn.disabled = false;
                toast('error', 'Nie udało się zapisać terminu', String(e && e.message || e));
            }
        }
        saveBtn.addEventListener('click', save);

        function openNote() {
            Store.selectPatient(form.patientId);
            if (form.visitId) {
                window.location.hash = '#/visit/form/' + form.visitId;
                return;
            }
            const q = new URLSearchParams({ date: form.date, time: form.time, event: form.id, paid: form.paid ? '1' : '0' });
            window.location.hash = '#/visit/form/new/' + form.visitType + '?' + q.toString();
        }

        const extra = [];
        if (existing && form.kind === 'visit') {
            extra.push(el('button', { class: 'btn btn--secondary', dataset: { action: 'note' }, onclick: openNote },
                [form.visitId ? '📝 Otwórz notatkę' : '📝 Napisz notatkę']));
            if (!patient) {
                extra.push(el('button', {
                    class: 'btn btn--secondary',
                    onclick: () => { Store.selectPatient(form.patientId); window.location.hash = '#/history'; }
                }, ['Historia pacjenta']));
            }
        }
        if (existing) {
            extra.push(el('button', {
                class: 'btn btn--danger', dataset: { action: 'delete' },
                onclick: async () => {
                    const ok = await openConfirm({
                        title: 'Usunąć termin?',
                        message: 'Termin zniknie z kalendarza.' + (form.visitId ? ' Notatka z wizyty zostaje w historii pacjenta.' : ''),
                        confirmLabel: 'Usuń termin',
                        variant: 'danger'
                    });
                    if (!ok) return;
                    try {
                        await api.remove(form.id);
                        closePanel();
                        cal.refetchEvents();
                    } catch (e) {
                        toast('error', 'Nie udało się usunąć terminu', String(e && e.message || e));
                    }
                }
            }, ['Usuń termin']));
        }

        panelEl.appendChild(el('div', { class: 'psy-cal__panel-head' }, [
            el('strong', {}, [existing ? 'Termin' : 'Nowy termin']),
            el('button', { type: 'button', class: 'psy-cal__link', title: 'Zamknij', onclick: closePanel }, ['✕'])
        ]));
        panelEl.appendChild(bodyEl);
        panelEl.appendChild(warnEl);
        panelEl.appendChild(el('div', { class: 'psy-cal__panel-actions' }, [
            saveBtn,
            el('button', { class: 'btn btn--secondary', onclick: closePanel }, ['Anuluj'])
        ]));
        if (extra.length) panelEl.appendChild(el('div', { class: 'psy-cal__panel-extra' }, extra));
        renderBody();
    }

    /** Pacjent bez żadnej wizyty → „1sze spotkanie", w pozostałych przypadkach „Kolejne spotkanie". */
    function defaultVisitType(patientId) {
        if (!patientId) return 'next_meeting';
        const hadVisit = !!Store.getLastVisitDate(patientId)
            || loaded.some((a) => a.kind === 'visit' && a.patientId === patientId);
        return hadVisit ? 'next_meeting' : 'first_meeting';
    }

    /* ---------------- start ---------------- */
    loadFullCalendar().then(() => {
        if (destroyed) return;
        const holidayDates = new Set();
        cal = new window.FullCalendar.Calendar(calEl, {
            locale: 'pl',
            firstDay: 1,
            initialView: patient ? 'listHalf' : 'timeGridWeek',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'timeGridDay,timeGridWeek,dayGridMonth,' + (patient ? 'listHalf' : 'listWeek')
            },
            views: { listHalf: { type: 'list', duration: { months: 6 }, buttonText: 'Lista' } },
            buttonText: { list: 'Lista' },
            height: '100%',
            expandRows: true,
            slotMinTime: '07:00:00',
            slotMaxTime: '21:00:00',
            slotDuration: '00:30:00',
            snapDuration: '00:15:00',       // klik w górną połowę wiersza = pełna godzina / wpół
            slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
            eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
            nowIndicator: true,
            dayMaxEvents: true,
            selectable: true,
            selectMirror: true,
            unselectAuto: false,
            editable: true,
            longPressDelay: 350,
            noEventsText: patient ? 'Brak terminów tego pacjenta w tym okresie.' : 'Brak terminów w tym okresie.',
            events: fetchEvents,
            eventContent,
            eventDidMount: (info) => { if (info.event.title) info.el.title = info.event.title; },
            datesSet: (info) => {
                holidayDates.clear();
                for (const h of holidaysBetween(localDate(info.start), localDate(info.end))) holidayDates.add(h.date);
            },
            dayCellClassNames: (arg) => (holidayDates.has(localDate(arg.date)) ? ['psy-cal-day--holiday'] : []),
            select: (info) => {
                let start = info.start;
                let end = info.end;
                if (info.allDay) {                       // klik w dzień (widok miesiąca)
                    start = fromLocal(localDate(info.start), '09:00');
                    end = addMinutes(start, DEFAULT_MINUTES);
                } else if (end - start <= 30 * 60000) {  // pojedynczy klik w godzinę
                    end = addMinutes(start, DEFAULT_MINUTES);
                }
                openPanel({ kind: 'visit', start, end, allDay: false });
            },
            eventClick: (info) => {
                const p = info.event.extendedProps;
                if (!p.appt) return;
                openPanel(p.appt);
            },
            eventDrop: onMoved,
            eventResize: onMoved
        });
        cal.render();
        root.psyCalendar = cal;       // dla testów
    }).catch((e) => {
        showNotice('error', [String(e && e.message || e)]);
    });

    root.psyTeardown = () => {
        destroyed = true;
        if (cal) { try { cal.destroy(); } catch (_) { /* */ } }
    };

    return root;
}
