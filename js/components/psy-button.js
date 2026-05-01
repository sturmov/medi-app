// ============================================================================
// psy-button - reusable button primitive
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const VARIANT_CLASSES = {
    primary: ['btn--primary', 'btn-primary'],
    secondary: ['btn--secondary', 'btn-secondary'],
    danger: ['btn--danger', 'btn-danger'],
    success: ['btn--success', 'btn-success'],
    warning: ['btn--warning', 'btn-warning'],
    'subtle-danger': ['btn--subtle-danger']
};

const SIZE_CLASSES = {
    sm: ['btn--sm', 'btn-sm'],
    lg: ['btn--lg', 'btn-lg']
};

export class PsyButton extends LitElement {
    static properties = {
        variant: { type: String },
        size: { type: String },
        type: { type: String },
        label: { type: String },
        buttonId: { type: String, attribute: 'button-id' },
        name: { type: String },
        value: { type: String },
        title: { type: String },
        ariaLabel: { type: String, attribute: 'aria-label' },
        disabled: { type: Boolean },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.variant = 'secondary';
        this.size = '';
        this.type = 'button';
        this.label = '';
        this.buttonId = '';
        this.name = '';
        this.value = '';
        this.title = '';
        this.ariaLabel = '';
        this.disabled = false;
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _getClasses() {
        const classes = ['btn'];

        if (VARIANT_CLASSES[this.variant]) {
            classes.push(...VARIANT_CLASSES[this.variant]);
        }

        if (SIZE_CLASSES[this.size]) {
            classes.push(...SIZE_CLASSES[this.size]);
        }

        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }

        return classes.join(' ');
    }

    render() {
        return html`
            <button
                type=${this.type || 'button'}
                id=${ifDefined(this.buttonId || undefined)}
                name=${ifDefined(this.name || undefined)}
                value=${ifDefined(this.value || undefined)}
                class=${this._getClasses()}
                title=${ifDefined(this.title || undefined)}
                aria-label=${ifDefined(this.ariaLabel || undefined)}
                ?disabled=${this.disabled}
            >
                <slot>${this.label}</slot>
            </button>
        `;
    }
}

if (!customElements.get('psy-button')) {
    customElements.define('psy-button', PsyButton);
}
