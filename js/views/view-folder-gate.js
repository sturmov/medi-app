// ============================================================================
// view-folder-gate.js — ekran startowy: wybór miejsca przechowywania danych.
//
// Widoczny, dopóki nie jest podłączony magazyn i nie wybrano trybu demo.
//   1) ☁️ Dysk Google       — docelowy sposób pracy (działa też na tablecie)
//   2) 📁 Folder na komputerze — tryb testowy / offline (tylko Chrome / Edge)
//   3) 🧪 Tryb demo          — dane przykładowe, tylko w tej przeglądarce
//
// Po udanym połączeniu woła `AppController.afterStorageReady()`.
// ============================================================================

import { Store } from './_store.js';
import { el } from './_dom.js';

let _gateEl = null;
let _busy = false;
let _error = '';

export function shouldShowGate() {
    const s = Store.state;
    return !(s.devMode === true || s.storageConnected === true);
}

export function showStorageGate() {
    if (!_gateEl || !_gateEl.parentNode) {
        _gateEl = el('div', { class: 'psy-folder-gate', role: 'dialog', 'aria-modal': 'true' });
        document.body.appendChild(_gateEl);
        document.body.classList.add('psy-folder-gate-open');
        _error = '';
    }
    render();
}

export function hideStorageGate() {
    if (_gateEl && _gateEl.parentNode) _gateEl.parentNode.removeChild(_gateEl);
    _gateEl = null;
    _busy = false;
    document.body.classList.remove('psy-folder-gate-open');
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
        hideStorageGate();
        if (window.AppController) window.AppController.afterStorageReady();
    } else {
        _error = (result && result.error) || '';
        render();
    }
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
