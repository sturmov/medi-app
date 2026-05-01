// ============================================================================
// psy-status-badge - pigułka ze statusem.
//
// Atrybuty:
//   - variant  : "info|success|warning|danger|neutral"   (default "neutral")
//   - icon     : opcjonalny znak / emoji przed etykietą
//   - label    : tekst etykiety (alternatywa do slotu)
//   - dot      : Boolean - sama kolorowa kropka (bez padding/label)
//   - size     : "xs|sm|md"                              (default "sm")
//   - extra-class
//
// Slot domyślny : dodatkowa treść po labelu (np. wartość liczbowa)
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const VALID_VARIANT = new Set(['info', 'success', 'warning', 'danger', 'neutral']);
const VALID_SIZE = new Set(['xs', 'sm', 'md']);

export class PsyStatusBadge extends LitElement {
    static properties = {
        variant: { type: String, reflect: true },
        icon: { type: String },
        label: { type: String },
        dot: { type: Boolean, reflect: true },
        size: { type: String, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.variant = 'neutral';
        this.icon = '';
        this.label = '';
        this.dot = false;
        this.size = 'sm';
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const variant = VALID_VARIANT.has(this.variant) ? this.variant : 'neutral';
        const size = VALID_SIZE.has(this.size) ? this.size : 'sm';
        const classes = [
            'psy-status-badge',
            `psy-status-badge--${variant}`,
            `psy-status-badge--${size}`
        ];
        if (this.dot) classes.push('psy-status-badge--dot');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    render() {
        if (this.dot) {
            return html`
                <span
                    class=${this._classes()}
                    role=${ifDefined(this.label ? 'status' : undefined)}
                    aria-label=${ifDefined(this.label || undefined)}
                ></span>
            `;
        }

        return html`
            <span
                class=${this._classes()}
                role="status"
            >
                ${this.icon ? html`<span class="psy-status-badge__icon" aria-hidden="true">${this.icon}</span>` : null}
                ${this.label ? html`<span class="psy-status-badge__label">${this.label}</span>` : null}
                <slot></slot>
            </span>
        `;
    }
}

if (!customElements.get('psy-status-badge')) {
    customElements.define('psy-status-badge', PsyStatusBadge);
}
