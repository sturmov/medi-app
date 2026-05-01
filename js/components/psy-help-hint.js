// ============================================================================
// psy-help-hint - inline podpowiedź (ikona ℹ / ?) z dymkiem tooltipa.
// Używać obok etykiety pola lub pod polem jako kontekstową pomoc.
// API:
//   text      — treść tooltipa (obowiązkowa),
//   icon      — ikona (def. "ℹ"),
//   label     — opcjonalny tekst widoczny obok ikony,
//   placement — "top" | "bottom" | "right" | "left" (def. "top"),
//   trigger   — "hover" | "click" | "both" (def. "both"),
//   variant   — "info" | "ai" | "warn" (tylko CSS).
// Emituje:
//   `psy-hint-open`  — gdy tooltip staje się widoczny,
//   `psy-hint-close` — gdy chowamy.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyHelpHint extends LitElement {
    static properties = {
        text: { type: String },
        icon: { type: String },
        label: { type: String },
        placement: { type: String },
        trigger: { type: String },
        variant: { type: String },
        open: { type: Boolean, reflect: true }
    };

    constructor() {
        super();
        this.text = '';
        this.icon = 'ℹ';
        this.label = '';
        this.placement = 'top';
        this.trigger = 'both';
        this.variant = 'info';
        this.open = false;
        this._onDocumentPointerDown = this._onDocumentPointerDown.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('pointerdown', this._onDocumentPointerDown, true);
    }

    disconnectedCallback() {
        document.removeEventListener('pointerdown', this._onDocumentPointerDown, true);
        super.disconnectedCallback();
    }

    _onDocumentPointerDown(event) {
        if (!this.open) return;
        const path = event.composedPath ? event.composedPath() : [];
        if (path.includes(this)) return;
        if (this.contains(event.target)) return;
        this._setOpen(false);
    }

    _setOpen(value) {
        const next = !!value;
        if (this.open === next) return;
        this.open = next;
        this.dispatchEvent(new CustomEvent(next ? 'psy-hint-open' : 'psy-hint-close', {
            bubbles: true,
            composed: true
        }));
    }

    _onClick() {
        if (this.trigger === 'hover') return;
        this._setOpen(!this.open);
    }

    _onMouseEnter() {
        if (this.trigger === 'click') return;
        this._setOpen(true);
    }

    _onMouseLeave() {
        if (this.trigger === 'click') return;
        // gdy użytkownik kliknął, zostaw otwarte do kliknięcia poza
        if (this.trigger === 'both' && this._wasClicked) return;
        this._setOpen(false);
    }

    _onKeydown(event) {
        if (event.key === 'Escape' && this.open) {
            this._setOpen(false);
        } else if ((event.key === 'Enter' || event.key === ' ') && this.trigger !== 'hover') {
            event.preventDefault();
            this._setOpen(!this.open);
        }
    }

    _triggerClasses() {
        const classes = ['psy-help-hint', `psy-help-hint--${this.variant || 'info'}`];
        if (this.open) classes.push('psy-help-hint--open');
        return classes.join(' ');
    }

    _tooltipClasses() {
        return [
            'psy-help-hint__tooltip',
            `psy-help-hint__tooltip--${this.placement || 'top'}`
        ].join(' ');
    }

    render() {
        return html`
            <span
                class=${this._triggerClasses()}
                tabindex="0"
                role="button"
                aria-expanded=${this.open ? 'true' : 'false'}
                aria-label=${ifDefined(this.label || this.text || 'Pomoc')}
                @click=${this._onClick}
                @mouseenter=${this._onMouseEnter}
                @mouseleave=${this._onMouseLeave}
                @keydown=${this._onKeydown}
            >
                <span class="psy-help-hint__icon" aria-hidden="true">${this.icon || 'ℹ'}</span>
                ${this.label
                    ? html`<span class="psy-help-hint__label">${this.label}</span>`
                    : html``}
                ${this.open && this.text
                    ? html`<span class=${this._tooltipClasses()} role="tooltip">${this.text}</span>`
                    : html``}
            </span>
        `;
    }
}

if (!customElements.get('psy-help-hint')) {
    customElements.define('psy-help-hint', PsyHelpHint);
}
