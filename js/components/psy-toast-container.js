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
        if (options.variant) toast.setAttribute('variant', options.variant);
        if (options.title) toast.setAttribute('title', options.title);
        if (options.icon) toast.setAttribute('icon', options.icon);
        if (options.closable === false) toast.closable = false;
        if (Number.isFinite(options.duration)) {
            toast.duration = options.duration;
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
