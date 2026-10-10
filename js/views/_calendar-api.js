// ============================================================================
// _calendar-api.js — terminy (kalendarz).
//
// TERMIN to nie notatka. Kalendarz trzyma plan (kto, kiedy, jaki rodzaj wizyty,
// czy zapłacono); notatka z wizyty powstaje w arkuszu pacjenta i jest z terminem
// powiązana (`visitId`).
//
//   { id, kind: 'visit' | 'other',
//     start, end (ISO), allDay,
//     patientId, patientName, phone, visitType, paid, visitId,   // kind = 'visit'
//     title,                                                      // kind = 'other'
//     note }
//
// GDZIE ŻYJĄ TERMINY
//   • Dysk Google podłączony → osobny kalendarz Google „PsychoApp — wizyty",
//     założony przez aplikację na koncie terapeuty. Aplikacja widzi tylko ten
//     kalendarz. Terapeuta widzi go w zwykłym Kalendarzu Google (telefon), a
//     zmiany zrobione tam pojawiają się w aplikacji.
//   • Tryb demo / folder lokalny → pamięć tej przeglądarki.
//
// „Zajęte": z głównego kalendarza terapeuty pobierana jest wyłącznie informacja
// zajęte / wolne (bez tytułów) — żeby nie umówić wizyty na prywatny termin.
// ============================================================================

import { Store } from './_store.js';
import { googleAuth, googleCall } from './_google-auth.js';
import { GOOGLE_SCOPES, googleEndpoints } from './_config.js';
import { visitTypeLabel } from './_visit-types.js';

export const CALENDAR_NAME = 'PsychoApp — wizyty';
const LS_LOCAL_CALENDAR = 'psy-new:calendar';

/** Tytuł terminu — to, co widać w Kalendarzu Google i w powiadomieniach. */
export function appointmentTitle(a) {
    if (a.kind !== 'visit') return a.title || '(bez tytułu)';
    const parts = [a.patientName || '(pacjent)', visitTypeLabel(a.visitType) || 'wizyta'];
    if (a.phone) parts.push('tel. ' + a.phone);
    parts.push(a.paid ? 'zapłacono' : 'nie zapłacono');
    return parts.join(' · ');
}

function localTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Warsaw'; }
    catch (_) { return 'Europe/Warsaw'; }
}

/* ==========================================================================
   Kalendarz Google
   ========================================================================== */

function toGoogleEvent(a) {
    const allDay = a.allDay === true;
    const ev = {
        summary: appointmentTitle(a),
        description: a.note || '',
        start: allDay ? { date: a.start.slice(0, 10) } : { dateTime: new Date(a.start).toISOString(), timeZone: localTimeZone() },
        end: allDay ? { date: a.end.slice(0, 10) } : { dateTime: new Date(a.end).toISOString(), timeZone: localTimeZone() },
        extendedProperties: {
            private: {
                psy: '1',
                kind: a.kind === 'visit' ? 'visit' : 'other',
                title: a.kind === 'visit' ? '' : (a.title || ''),
                patientId: a.patientId || '',
                patientName: a.patientName || '',
                phone: a.phone || '',
                visitType: a.visitType || '',
                paid: a.paid ? '1' : '0',
                visitId: a.visitId || ''
            }
        }
    };
    return ev;
}

function fromGoogleEvent(ev) {
    const p = (ev.extendedProperties && ev.extendedProperties.private) || {};
    const allDay = !!(ev.start && ev.start.date);
    const ours = p.psy === '1';
    const kind = ours && p.kind === 'visit' ? 'visit' : 'other';
    return {
        id: ev.id,
        kind,
        start: allDay ? ev.start.date : ev.start.dateTime,
        end: allDay ? ev.end.date : ev.end.dateTime,
        allDay,
        // Wydarzenie dopisane ręcznie w Kalendarzu Google nie ma naszych pól — pokazujemy jego tytuł.
        title: kind === 'visit' ? '' : ((ours && p.title) || ev.summary || '(bez tytułu)'),
        patientId: p.patientId || '',
        patientName: p.patientName || '',
        phone: p.phone || '',
        visitType: p.visitType || '',
        paid: p.paid === '1',
        visitId: p.visitId || '',
        note: ev.description || ''
    };
}

function createGoogleCalendarApi() {
    const E = googleEndpoints();
    let calendarId = null;
    let ensuring = null;

    /** Kalendarz aplikacji: identyfikator pamiętany na Dysku; brak / usunięty → zakładamy nowy. */
    function ensureCalendar() {
        if (calendarId) return Promise.resolve(calendarId);
        if (!ensuring) {
            ensuring = (async () => {
                const saved = await Store.getSetting('calendarId');
                if (saved) {
                    try {
                        await googleCall('GET', E.calendar + '/calendars/' + encodeURIComponent(saved));
                        calendarId = saved;
                        return calendarId;
                    } catch (e) {
                        if (e.status !== 404 && e.status !== 410) throw e;
                    }
                }
                const created = await googleCall('POST', E.calendar + '/calendars', {
                    json: {
                        summary: CALENDAR_NAME,
                        description: 'Terminy wizyt z aplikacji PsychoApp. Zmiany godzin zrobione tutaj pojawią się w aplikacji.',
                        timeZone: localTimeZone()
                    }
                });
                calendarId = created.id;
                await Store.setSetting('calendarId', calendarId);
                return calendarId;
            })().finally(() => { ensuring = null; });
        }
        return ensuring;
    }

    const eventsUrl = async (suffix = '') =>
        E.calendar + '/calendars/' + encodeURIComponent(await ensureCalendar()) + '/events' + suffix;

    return {
        kind: 'google',
        /** 'ready' | 'no-permission' (użytkownik nie zaznaczył zgody na kalendarz) */
        status() {
            return googleAuth.hasScope(GOOGLE_SCOPES.calendar) ? 'ready' : 'no-permission';
        },
        /** Ponowne okienko Google — żeby użytkownik mógł dodać brakującą zgodę. */
        async requestPermission() {
            googleAuth.invalidate();
            await googleAuth.getToken();
            return this.status() === 'ready';
        },

        async list(fromISO, toISO) {
            const out = [];
            let pageToken = '';
            do {
                const q = '?singleEvents=true&orderBy=startTime&maxResults=2500'
                    + '&timeMin=' + encodeURIComponent(new Date(fromISO).toISOString())
                    + '&timeMax=' + encodeURIComponent(new Date(toISO).toISOString())
                    + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
                const page = await googleCall('GET', await eventsUrl(q));
                for (const ev of (page.items || [])) {
                    if (ev.status !== 'cancelled' && ev.start && ev.end) out.push(fromGoogleEvent(ev));
                }
                pageToken = page.nextPageToken || '';
            } while (pageToken);
            return out;
        },

        async get(id) {
            const ev = await googleCall('GET', await eventsUrl('/' + encodeURIComponent(id)));
            return ev && ev.status !== 'cancelled' ? fromGoogleEvent(ev) : null;
        },

        async save(a) {
            const body = toGoogleEvent(a);
            const ev = a.id
                ? await googleCall('PATCH', await eventsUrl('/' + encodeURIComponent(a.id)), { json: body })
                : await googleCall('POST', await eventsUrl(), { json: body });
            return fromGoogleEvent(ev);
        },

        async remove(id) {
            try {
                await googleCall('DELETE', await eventsUrl('/' + encodeURIComponent(id)));
            } catch (e) {
                if (e.status !== 404 && e.status !== 410) throw e;      // już usunięte
            }
        },

        /** Zajęte przedziały z głównego kalendarza terapeuty (bez tytułów). Brak zgody → pusto. */
        async busy(fromISO, toISO) {
            if (!googleAuth.hasScope(GOOGLE_SCOPES.freebusy)) return [];
            try {
                const r = await googleCall('POST', E.calendar + '/freeBusy', {
                    json: {
                        timeMin: new Date(fromISO).toISOString(),
                        timeMax: new Date(toISO).toISOString(),
                        items: [{ id: 'primary' }]
                    }
                });
                // Pytamy o jeden kalendarz; klucz odpowiedzi bywa „primary" albo adresem konta.
                const cal = r && r.calendars && (r.calendars.primary || Object.values(r.calendars)[0]);
                return (cal && cal.busy) || [];
            } catch (e) {
                console.warn('[calendar] zajętość niedostępna:', e && e.message);
                return [];
            }
        }
    };
}

/* ==========================================================================
   Kalendarz w przeglądarce (tryb demo / folder lokalny)
   ========================================================================== */

function createLocalCalendarApi() {
    function read() {
        try { return JSON.parse(window.localStorage.getItem(LS_LOCAL_CALENDAR) || '[]') || []; }
        catch (_) { return []; }
    }
    function write(list) {
        try { window.localStorage.setItem(LS_LOCAL_CALENDAR, JSON.stringify(list)); } catch (_) { /* */ }
    }
    return {
        kind: 'local',
        status: () => 'ready',
        async requestPermission() { return true; },
        async list(fromISO, toISO) {
            const from = new Date(fromISO).getTime();
            const to = new Date(toISO).getTime();
            return read().filter((a) => new Date(a.end).getTime() > from && new Date(a.start).getTime() < to);
        },
        async get(id) { return read().find((a) => a.id === id) || null; },
        async save(a) {
            const list = read();
            const saved = Object.assign({}, a, { id: a.id || 'L' + Date.now().toString(36) + Math.floor(Math.random() * 1e4) });
            const i = list.findIndex((x) => x.id === saved.id);
            if (i >= 0) list[i] = saved; else list.push(saved);
            write(list);
            return saved;
        },
        async remove(id) { write(read().filter((a) => a.id !== id)); },
        async busy() { return []; }
    };
}

/* ==========================================================================
   Wybór kalendarza + powiązania z notatkami
   ========================================================================== */

let cached = null;
let cachedFor = '';

/** Kalendarz właściwy dla bieżącego magazynu danych. */
export function getCalendarApi() {
    const st = Store.state;
    const key = st.storageConnected && st.storageKind === 'gdrive' ? 'google:' + st.storageLabel : 'local';
    if (!cached || cachedFor !== key) {
        cached = key === 'local' ? createLocalCalendarApi() : createGoogleCalendarApi();
        cachedFor = key;
    }
    return cached;
}

/** Zmienia wybrane pola terminu (pobiera aktualny stan, żeby nie nadpisać cudzych zmian). */
export async function patchAppointment(id, patch) {
    const api = getCalendarApi();
    const current = await api.get(id);
    if (!current) return null;
    return api.save(Object.assign({}, current, patch));
}

/**
 * Notatka ↔ termin: po zmianie statusu płatności w notatce aktualizuje termin.
 * Błąd kalendarza nie może blokować pracy z notatką — tylko go odnotowujemy.
 */
export async function syncVisitToAppointment(visit) {
    if (!visit || !visit.calendarEventId) return;
    try {
        await patchAppointment(visit.calendarEventId, { paid: visit.paid === true, visitId: visit.id });
    } catch (e) {
        console.warn('[calendar] nie udało się zaktualizować terminu:', e && e.message);
    }
}

/** Notatka usunięta → termin zostaje, ale bez powiązania. */
export async function unlinkVisitFromAppointment(visit) {
    if (!visit || !visit.calendarEventId) return;
    try {
        await patchAppointment(visit.calendarEventId, { visitId: '' });
    } catch (e) {
        console.warn('[calendar] nie udało się odpiąć notatki od terminu:', e && e.message);
    }
}
