// ============================================================================
// view-folder-gate.js — ekran startowy: wybór miejsca przechowywania danych.
//
// Widoczny, dopóki nie jest podłączony magazyn i nie wybrano trybu demo.
//   1) ☁️ Dysk Google       — docelowy sposób pracy (działa też na tablecie)
//   2) 📁 Folder na komputerze — tryb testowy / offline (tylko Chrome / Edge)
//   3) 🧪 Tryb demo          — dane przykładowe, tylko w tej przeglądarce
//
// Po połączeniu z Dyskiem Google ekran proponuje od razu drugi krok: Kalendarz
// Google. To osobne okienko Google, bo o dwie zgody naraz Google pyta polami
// wyboru, które są domyślnie odznaczone (patrz `_google-auth.js`). Krok pojawia
// się tylko, gdy kalendarz nie jest jeszcze włączony i nie został odłożony.
//
// Po zakończeniu woła `AppController.afterStorageReady()`.
// ============================================================================

import { Store } from './_store.js';
import { el } from './_dom.js';
import { getCalendarApi, CALENDAR_NAME } from './_calendar-api.js';

let _gateEl = null;
let _busy = false;
let _error = '';
let _step = 'storage';      // 'storage' | 'calendar'

export function shouldShowGate() {
    const s = Store.state;
    if (_gateEl) return true;       // ekran jeszcze pracuje: łączenie albo krok z kalendarzem
    return !(s.devMode === true || s.storageConnected === true);
}

export function showStorageGate() {
    if (!_gateEl || !_gateEl.parentNode) {
        _gateEl = el('div', { class: 'psy-folder-gate', role: 'dialog', 'aria-modal': 'true' });
        document.body.appendChild(_gateEl);
        document.body.classList.add('psy-folder-gate-open');
        _error = '';
        _step = 'storage';
    }
    render();
}

export function hideStorageGate() {
    if (_gateEl && _gateEl.parentNode) _gateEl.parentNode.removeChild(_gateEl);
    _gateEl = null;
    _busy = false;
    _step = 'storage';
    document.body.classList.remove('psy-folder-gate-open');
}

function finish() {
    hideStorageGate();
    if (window.AppController) window.AppController.afterStorageReady();
}

/** Po połączeniu z Dyskiem Google: czy od razu zaproponować Kalendarz Google. */
function wantsCalendarStep() {
    const s = Store.state;
    if (!(s.storageConnected && s.storageKind === 'gdrive')) return false;
    const calendar = getCalendarApi();
    return calendar.status() !== 'ready' && !calendar.isPostponed();
}

/** Uruchamia połączenie; blokuje przyciski na czas pracy i pokazuje ewentualny błąd. */
async function run(action) {
    if (_busy) return;
    _busy = true;
    _error = '';
    render();
    let result = null;
    try {
        result = await action();
    } catch (e) {
        result = { ok: false, error: (e && e.message) || String(e) };
    }
    _busy = false;
    if (result && result.ok) {
        if (wantsCalendarStep()) {
            _step = 'calendar';
            render();
        } else {
            finish();
        }
    } else {
        _error = (result && result.error) || '';
        render();
    }
}

/** Krok 2: jedna zgoda na kalendarz i od razu założenie kalendarza aplikacji. */
async function enableCalendar() {
    if (_busy) return;
    _busy = true;
    _error = '';
    render();
    try {
        const calendar = getCalendarApi();
        if (await calendar.requestPermission()) {
            await calendar.prepare();
            _busy = false;
            finish();
            return;
        }
        _error = 'Google nie przyznał zgody na kalendarz. W okienku Google wybierz „Dalej" / „Zezwól".';
    } catch (e) {
        _error = (e && e.message) || String(e);
    }
    _busy = false;
    render();
}

function skipCalendar() {
    if (_busy) return;
    getCalendarApi().postpone();
    finish();
}

function renderCalendarStep(card) {
    card.appendChild(el('div', { class: 'psy-folder-gate__notice psy-folder-gate__notice--ok' }, [
        el('strong', {}, ['✓ Połączono z Dyskiem Google']),
        el('p', {}, ['Został jeden krok.'])
    ]));
    card.appendChild(el('div', { class: 'psy-folder-gate__notice' }, [
        el('strong', {}, ['Kalendarz Google']),
        el('p', {}, [
            'Terminy wizyt trafią do osobnego kalendarza „' + CALENDAR_NAME + '" na Twoim koncie Google — '
            + 'zobaczysz je także w telefonie. Google zapyta o tę jedną zgodę; pozostałych kalendarzy aplikacja nie zobaczy.'
        ])
    ]));

    if (_error) {
        card.appendChild(el('div', { class: 'psy-folder-gate__notice psy-folder-gate__notice--error' }, [
            el('strong', {}, ['Nie udało się włączyć kalendarza']),
            el('p', {}, [_error])
        ]));
    }
    if (_busy) {
        card.appendChild(el('div', { class: 'psy-folder-gate__notice' }, [
            el('p', {}, ['⏳ Włączanie… (jeśli otworzyło się okienko Google, dokończ w nim)'])
        ]));
    }

    const enable = button('📅 Włącz Kalendarz Google', enableCalendar, { primary: true });
    enable.dataset.action = 'gate-enable-calendar';
    card.appendChild(enable);
    card.appendChild(el('div', { class: 'psy-folder-gate__dev' }, [
        el('button', {
            type: 'button',
            class: 'psy-folder-gate__dev-link',
            dataset: { action: 'gate-skip-calendar' },
            disabled: _busy,
            onclick: skipCalendar
        }, ['Pomiń — włączę później']),
        el('div', { class: 'psy-folder-gate__dev-hint' }, [
            'Bez kalendarza aplikacja działa normalnie; włączysz go przyciskiem na stronie kalendarza albo w Ustawieniach.'
        ])
    ]));
}

function button(label, onClick, { primary = false } = {}) {
    return el('button', {
        type: 'button',
        class: 'btn psy-folder-gate__btn ' + (primary ? 'btn--primary psy-folder-gate__btn--primary' : 'btn--secondary'),
        disabled: _busy,
        onclick: onClick
    }, [label]);
}

function render() {
    if (!_gateEl) return;
    _gateEl.innerHTML = '';

    const s = Store.state;
    const resumeDrive = s.storageKind === 'gdrive' && s.storageStatus === 'needs-auth';
    const resumeLocal = s.storageKind === 'local' && s.storageStatus === 'needs-auth';
    const localSupported = Store.isLocalFolderSupported();

    const card = el('div', { class: 'psy-folder-gate__card' });

    card.appendChild(el('div', { class: 'psy-folder-gate__header' }, [
        el('div', { class: 'psy-folder-gate__icon' }, ['🗂️']),
        el('h1', { class: 'psy-folder-gate__title' }, ['PsychoApp']),
        el('div', { class: 'psy-folder-gate__subtitle' }, ['Dokumentacja psychologiczna'])
    ]));

    if (_step === 'calendar') {
        renderCalendarStep(card);
        _gateEl.appendChild(card);
        return;
    }

    card.appendChild(el('div', { class: 'psy-folder-gate__notice' }, [
        el('p', {}, [
            'Dane pacjentów są zapisywane ',
            el('strong', {}, ['na Twoim Dysku Google']),
            ' — każdy pacjent ma własny folder z czytelnym arkuszem i załącznikami. ',
            'Aplikacja nie ma własnego serwera i widzi wyłącznie pliki, które sama utworzyła.'
        ])
    ]));

    if (_error) {
        card.appendChild(el('div', { class: 'psy-folder-gate__notice psy-folder-gate__notice--error' }, [
            el('strong', {}, ['Nie udało się połączyć']),
            el('p', {}, [_error])
        ]));
    }

    if (_busy) {
        card.appendChild(el('div', { class: 'psy-folder-gate__notice' }, [
            el('p', {}, ['⏳ Łączenie… (jeśli otworzyło się okienko Google, dokończ w nim logowanie)'])
        ]));
    }

    // 1) Dysk Google
    card.appendChild(button(
        resumeDrive
            ? '☁️ Kontynuuj z Dyskiem Google' + (s.storageLabel ? ' (' + s.storageLabel + ')' : '')
            : '☁️ Połącz z Dyskiem Google',
        () => run(() => Store.connectGDrive()),
        { primary: !resumeLocal }
    ));

    // 2) Folder lokalny
    if (resumeLocal) {
        card.appendChild(button(
            '🔓 Przywróć dostęp do folderu „' + (s.storageLabel || '') + '"',
            () => run(() => Store.connectLocalFolder({ reuse: true })),
            { primary: true }
        ));
    }
    if (localSupported) {
        card.appendChild(button(
            resumeLocal ? '📂 Wybierz inny folder' : '📁 Folder na tym komputerze (tryb testowy)',
            () => run(() => Store.connectLocalFolder())
        ));
    }

    // 3) Tryb demo
    card.appendChild(el('div', { class: 'psy-folder-gate__dev' }, [
        el('button', {
            type: 'button',
            class: 'psy-folder-gate__dev-link',
            disabled: _busy,
            onclick: () => run(async () => { Store.enableDevMode(); return { ok: true }; })
        }, ['🧪 Tryb demo — dane przykładowe']),
        el('div', { class: 'psy-folder-gate__dev-hint' }, [
            'Do obejrzenia aplikacji. Dane demo są tylko w tej przeglądarce i nie trafiają na Dysk.'
        ])
    ]));

    _gateEl.appendChild(card);
}
