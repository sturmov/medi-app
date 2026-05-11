// ============================================================================
// psy-toast-container - stack powiadomień pozycjonowany w rogu ekranu.
//
// Atrybuty:
//   - position     : "top-right|top-left|bottom-right|bottom-left|top-center|bottom-center"
//                    (default "top-right")
//   - max-visible  : maks. liczba jednocześnie widocznych toastów (default 6)
//   - extra-class  : dodatkowe klasy
//
// Użycie deklaratywne:
//   <psy-toast-container id="toasts"></psy-toast-container>
//   // potem imperatywnie:
//   PsyToastContainer.notify({ variant:'success', message:'Zapisano', title:'OK', duration:0 }, 'toasts')
//
// API (statyczne):
//   PsyToastContainer.notify(options, containerId?)  -> PsyToast
//   PsyToastContainer.getContainer(id?)              -> PsyToastContainer | null
//
// `options`: { variant, title, message, html?, duration, closable, icon, actions? }
//   - `message` : tekst prosty (escape'owany)
//   - `html`    : już gotowy Node / string HTML (trustowany; użyj ostrożnie)
//   - `actions` : tablica { label, variant?, onClick? }
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-toast.js';

const VALID_POSITION = new Set([
    'top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center'
]);

// F5.1 (2026-05-11): produkcyjne domyślne czasy trwania toastów per variant.
// Krótkie info/success znikają po 4 s, ostrzeżenia/błędy wiszą dłużej (8 s),
// można wymusić sticky przez explicit `duration: 0`.
const DEFAULT_DURATION_BY_VARIANT = {
    info: 4000,
    success: 4000,
    warning: 8000,
    danger: 8000
};

export class PsyToastContainer extends LitElement {
    static properties = {
        position: { type: String, reflect: true },
        maxVisible: { type: Number, attribute: 'max-visible' },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.position = 'top-right';
        this.maxVisible = 6;
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('psy-toast-dismiss', this._onToastDismiss);
    }

    disconnectedCallback() {
        this.removeEventListener('psy-toast-dismiss', this._onToastDismiss);
        super.disconnectedCallback();
    }

    _onToastDismiss = (ev) => {
        const t = ev.target;
        if (t && t.tagName && t.tagName.toLowerCase() === 'psy-toast') {
            // Fade out animacją, potem usuń
            t.classList.add('psy-toast--leaving');
            window.setTimeout(() => t.remove(), 180);
        }
    };

    _classes() {
        const pos = VALID_POSITION.has(this.position) ? this.position : 'top-right';
        const classes = [
            'psy-toast-container',
            `psy-toast-container--${pos}`
        ];
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    /**
     * Dodaje toast do tego containera.
     * @param {object} options
     * @returns {HTMLElement} stworzony psy-toast
     */
    push(options = {}) {
        const toast = document.createElement('psy-toast');
        const variant = options.variant || 'info';
        if (options.variant) toast.setAttribute('variant', options.variant);
        if (options.title) toast.setAttribute('title', options.title);
        if (options.icon) toast.setAttribute('icon', options.icon);
        if (options.closable === false) toast.closable = false;
        // F5.1: gdy duration nie podany — użyj variant-default (4 s / 8 s).
        // Explicit `duration: 0` → sticky (manual close).
        if (Number.isFinite(options.duration)) {
            toast.duration = options.duration;
        } else {
            toast.duration = DEFAULT_DURATION_BY_VARIANT[variant] != null
                ? DEFAULT_DURATION_BY_VARIANT[variant]
                : 4000;
        }

        // Zawartość:
        if (options.html instanceof Node) {
            toast.appendChild(options.html);
        } else if (typeof options.html === 'string') {
            const tpl = document.createElement('template');
            tpl.innerHTML = options.html;
            toast.appendChild(tpl.content);
        } else if (options.message != null) {
            toast.textContent = String(options.message);
        }

        // Akcje (slot)
        if (Array.isArray(options.actions) && options.actions.length) {
            const actionsWrap = document.createElement('div');
            actionsWrap.setAttribute('slot', 'actions');
            for (const a of options.actions) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn btn--sm psy-toast__action-btn';
                if (a.variant) btn.classList.add(`btn--${a.variant}`);
                btn.textContent = a.label || 'Akcja';
                if (typeof a.onClick === 'function') {
                    btn.addEventListener('click', (ev) => {
                        a.onClick(ev, toast);
                    });
                }
                actionsWrap.appendChild(btn);
            }
            toast.appendChild(actionsWrap);
        }

        this.prepend(toast); // najnowsze na górze stacka
        this._enforceMaxVisible();
        return toast;
    }

    _enforceMaxVisible() {
        const max = Number(this.maxVisible) || 6;
        const toasts = Array.from(this.querySelectorAll(':scope > psy-toast'));
        if (toasts.length <= max) return;
        // Usuń najstarsze (na końcu listy)
        for (let i = max; i < toasts.length; i += 1) {
            toasts[i].remove();
        }
    }

    render() {
        return html`
            <div class=${this._classes()} aria-live="polite">
                <slot></slot>
            </div>
        `;
    }

    // ----- Statyczne helpery (globalny rejestr kontenerów) -----

    static getContainer(id) {
        if (id) {
            return document.getElementById(id) || null;
        }
        // Pierwszy dostępny kontener w DOM
        return document.querySelector('psy-toast-container');
    }

    /**
     * Tworzy i dodaje toast. Jeśli nie ma żadnego kontenera – tworzy domyślny.
     */
    static notify(options = {}, containerId) {
        let container = PsyToastContainer.getContainer(containerId);
        if (!container) {
            container = document.createElement('psy-toast-container');
            container.id = 'psy-default-toasts';
            document.body.appendChild(container);
        }
        return container.push(options);
    }
}

if (!customElements.get('psy-toast-container')) {
    customElements.define('psy-toast-container', PsyToastContainer);
}

// Udogodnienie dla kodu biznesowego: globalny `window.PsyToast.notify(...)`
if (typeof window !== 'undefined' && !window.PsyToast) {
    window.PsyToast = {
        notify: (options, containerId) => PsyToastContainer.notify(options, containerId)
    };
}

// ============================================================================
// F5.1 (2026-05-11): krótki helper `window.Toast` z metodami per-variant.
//
// Użycie:
//   Toast.success('Zapisano')                           // 4 s
//   Toast.info('Wczytano pacjenta P004')                // 4 s
//   Toast.warning('Folder niedostępny')                 // 8 s
//   Toast.danger('Nie udało się zapisać pliku')         // 8 s, role=alert
//   Toast.sticky({ title:'Wymaga akcji', message:'...', actions:[...] })  // sticky, manual close
//   Toast.dismiss(toastEl)                              // ręczne zamknięcie
//
// Drugi argument metod variant może być:
//   - string  → użyty jako `title`
//   - object  → pełne `options` (title, actions, html, icon, duration, containerId, ...)
// ============================================================================

function _normalizeToastArgs(message, titleOrOpts) {
    let opts = {};
    if (typeof titleOrOpts === 'string') {
        opts.title = titleOrOpts;
    } else if (titleOrOpts && typeof titleOrOpts === 'object') {
        opts = Object.assign({}, titleOrOpts);
    }
    if (message != null && opts.message == null && opts.html == null) {
        opts.message = message;
    }
    return opts;
}

function _toastVariant(variant, message, titleOrOpts) {
    const opts = _normalizeToastArgs(message, titleOrOpts);
    opts.variant = variant;
    const containerId = opts.containerId;
    delete opts.containerId;
    return PsyToastContainer.notify(opts, containerId);
}

if (typeof window !== 'undefined' && !window.Toast) {
    window.Toast = {
        success: (message, titleOrOpts) => _toastVariant('success', message, titleOrOpts),
        info: (message, titleOrOpts) => _toastVariant('info', message, titleOrOpts),
        warning: (message, titleOrOpts) => _toastVariant('warning', message, titleOrOpts),
        danger: (message, titleOrOpts) => _toastVariant('danger', message, titleOrOpts),
        /**
         * Sticky toast (duration=0). `opts` obowiązkowy obiekt — variant default `info`.
         * Zwraca element toasta — można go zapisać i potem `Toast.dismiss(t)`.
         */
        sticky: (opts = {}) => {
            const merged = Object.assign({ variant: 'info', closable: true }, opts, { duration: 0 });
            const containerId = merged.containerId;
            delete merged.containerId;
            return PsyToastContainer.notify(merged, containerId);
        },
        /**
         * Ręczne zamknięcie istniejącego toasta.
         */
        dismiss: (toast) => {
            if (toast && typeof toast.dismiss === 'function') {
                toast.dismiss('api');
            }
        },
        // Surowe API — gdyby ktoś potrzebował pełnej kontroli
        notify: (options, containerId) => PsyToastContainer.notify(options, containerId)
    };
}
