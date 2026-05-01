// ============================================================================
// view-folder-gate.js — modal blokujący apkę dopóki user nie wybierze
// trybu storage'u (folder lokalny / Drive disabled / tryb dev).
//
// Pojawia się gdy `Store.state.folderStatus` ∈ {'init', 'denied', 'unsupported'}
// i `state.devMode === false`. Po wyborze (`connectLocalFolder` / `enableDevMode`)
// gate się chowa, apka rusza.
//
// Wzorowany na folder-gate z `index.html` (legacy.html) — analogiczny UX.
// ============================================================================

import { Store } from './_store.js';
import { isFileSystemAccessSupported } from './_folder-handle.js';

let _gateEl = null;

/** Czy gate powinien być widoczny dla aktualnego stanu Store? */
export function shouldShowGate() {
    const s = Store.state;
    if (s.devMode === true) return false;            // user wybrał tryb dev
    if (s.folderConnected === true) return false;    // folder podpięty
    return true;                                      // init / denied / unsupported
}

/** Pokaż gate (idempotentne — wielokrotny call nic nie psuje). */
export function showFolderGate() {
    if (_gateEl && _gateEl.parentNode) {
        _renderContent();
        return;
    }
    _gateEl = el('div', { class: 'psy-folder-gate', role: 'dialog', 'aria-modal': 'true' });
    document.body.appendChild(_gateEl);
    document.body.classList.add('psy-folder-gate-open');
    _renderContent();
}

/** Ukryj gate. */
export function hideFolderGate() {
    if (_gateEl && _gateEl.parentNode) {
        _gateEl.parentNode.removeChild(_gateEl);
    }
    _gateEl = null;
    document.body.classList.remove('psy-folder-gate-open');
}

/* ---- Render --------------------------------------------------------------- */

function _renderContent() {
    if (!_gateEl) return;
    _gateEl.innerHTML = '';

    const supported = isFileSystemAccessSupported();
    const status = Store.state.folderStatus;   // 'init' | 'denied' | 'unsupported'
    const folderName = Store.state.folderName;

    const card = el('div', { class: 'psy-folder-gate__card' });

    // Header
    card.appendChild(el('div', { class: 'psy-folder-gate__header' }, [
        el('div', { class: 'psy-folder-gate__icon' }, ['📁']),
        el('h1', { class: 'psy-folder-gate__title' }, ['PsychoApp']),
        el('div', { class: 'psy-folder-gate__subtitle' }, [
            'Aplikacja do dokumentacji psychologicznej'
        ])
    ]));

    // Info / komunikat
    if (status === 'denied' && folderName) {
        // Mamy zapamiętany folder, ale permission expired po reload
        card.appendChild(el('div', { class: 'psy-folder-gate__notice psy-folder-gate__notice--warning' }, [
            el('strong', {}, ['🔒 Wymagane ponowne potwierdzenie dostępu']),
            el('p', {}, [
                'Aplikacja pamięta poprzednio wybrany folder „',
                el('strong', {}, [folderName]),
                '", ale przeglądarka wymaga ponownego potwierdzenia dostępu po restarcie.'
            ])
        ]));
        card.appendChild(_btnReauthorize());
        card.appendChild(_btnPickNewFolder());
    } else if (!supported) {
        // Firefox / Safari / starsze Chrome
        card.appendChild(el('div', { class: 'psy-folder-gate__notice psy-folder-gate__notice--error' }, [
            el('strong', {}, ['⚠ Twoja przeglądarka nie wspiera File System Access API']),
            el('p', {}, [
                'Aby podpiąć folder lokalny, użyj ',
                el('strong', {}, ['Chrome']),
                ' lub ',
                el('strong', {}, ['Edge']),
                ' na komputerze stacjonarnym.'
            ])
        ]));
    } else {
        // Standard — folder gate przy starcie
        card.appendChild(el('div', { class: 'psy-folder-gate__notice' }, [
            el('p', {}, [
                'Aplikacja zapisuje dane pacjentów do wybranego folderu na Twoim komputerze. ',
                el('strong', {}, ['Wszystkie dane pozostają u Ciebie']),
                ' — żadne informacje nie są wysyłane na serwer.'
            ])
        ]));
        card.appendChild(_btnConnect());
    }

    // Drive — disabled (pojawi się w Fazie 4)
    card.appendChild(_btnDriveDisabled());

    // Tryb dev — mały link pod CTA
    card.appendChild(el('div', { class: 'psy-folder-gate__dev' }, [
        el('button', {
            type: 'button',
            class: 'psy-folder-gate__dev-link',
            onclick: () => {
                Store.enableDevMode();
                hideFolderGate();
                if (window.AppController) window.AppController._renderView(true);
            }
        }, ['🧪 Tryb deweloperski (localStorage)']),
        el('div', { class: 'psy-folder-gate__dev-hint' }, [
            'Tylko do testów — dane będą trzymane w przeglądarce ',
            'i utracone po wyczyszczeniu danych witryny.'
        ])
    ]));

    _gateEl.appendChild(card);
}

function _btnConnect() {
    return el('button', {
        type: 'button',
        class: 'btn btn--primary psy-folder-gate__btn psy-folder-gate__btn--primary',
        onclick: async () => {
            const result = await Store.connectLocalFolder();
            if (result && result.ok) {
                hideFolderGate();
                if (window.AppController) window.AppController._renderView(true);
            } else {
                // aborted / denied / unsupported → re-render z błędem
                _renderContent();
            }
        }
    }, ['📁 Połącz folder z pacjentami']);
}

function _btnReauthorize() {
    return el('button', {
        type: 'button',
        class: 'btn btn--primary psy-folder-gate__btn psy-folder-gate__btn--primary',
        onclick: async () => {
            const result = await Store.reauthorizeLocalFolder();
            if (result && result.ok) {
                hideFolderGate();
                if (window.AppController) window.AppController._renderView(true);
            } else {
                _renderContent();
            }
        }
    }, ['🔓 Przywróć dostęp do folderu „' + (Store.state.folderName || '') + '"']);
}

function _btnPickNewFolder() {
    return el('button', {
        type: 'button',
        class: 'btn btn--secondary psy-folder-gate__btn',
        onclick: async () => {
            await Store.disconnectLocalFolder();
            const result = await Store.connectLocalFolder();
            if (result && result.ok) {
                hideFolderGate();
                if (window.AppController) window.AppController._renderView(true);
            } else {
                _renderContent();
            }
        }
    }, ['📂 Wybierz inny folder']);
}

function _btnDriveDisabled() {
    return el('button', {
        type: 'button',
        class: 'btn btn--secondary psy-folder-gate__btn psy-folder-gate__btn--disabled',
        disabled: true,
        title: 'Integracja z Google Drive zostanie aktywowana w Fazie 4',
        onclick: (e) => e.preventDefault()
    }, ['☁️ Google Drive (wkrótce — Faza 4)']);
}

/* ---- Mini DOM helper ------------------------------------------------------ */

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
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
