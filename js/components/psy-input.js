// ============================================================================
// psy-input - reusable input primitive
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyInput extends LitElement {
    static properties = {
        inputId: { type: String, attribute: 'input-id' },
        name: { type: String },
        type: { type: String },
        value: { type: String },
        placeholder: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        inputClass: { type: String, attribute: 'input-class' },
        min: { type: String },
        max: { type: String },
        step: { type: String },
        minLength: { type: String, attribute: 'min-length' },
        maxLength: { type: String, attribute: 'max-length' },
        pattern: { type: String },
        autocomplete: { type: String },
        inputMode: { type: String, attribute: 'input-mode' },
        readOnly: { type: Boolean, attribute: 'read-only' },
        disabled: { type: Boolean },
        required: { type: Boolean },
        ariaLabel: { type: String, attribute: 'aria-label' }
    };

    constructor() {
        super();
        this.inputId = '';
        this.name = '';
        this.type = 'text';
        this.value = '';
        this.placeholder = '';
        this.dataField = '';
        this.inputClass = '';
        this.min = '';
        this.max = '';
        this.step = '';
        this.minLength = '';
        this.maxLength = '';
        this.pattern = '';
        this.autocomplete = '';
        this.inputMode = '';
        this.readOnly = false;
        this.disabled = false;
        this.required = false;
        this.ariaLabel = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['input'];
        if (this.inputClass) {
            classes.push(...String(this.inputClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _onInput(event) {
        this.value = event.target.value;
    }

    render() {
        return html`
            <input
                id=${ifDefined(this.inputId || undefined)}
                name=${ifDefined(this.name || undefined)}
                type=${this.type || 'text'}
                class=${this._classes()}
                data-field=${ifDefined(this.dataField || undefined)}
                placeholder=${ifDefined(this.placeholder || undefined)}
                min=${ifDefined(this.min || undefined)}
                max=${ifDefined(this.max || undefined)}
                step=${ifDefined(this.step || undefined)}
                minlength=${ifDefined(this.minLength || undefined)}
                maxlength=${ifDefined(this.maxLength || undefined)}
                pattern=${ifDefined(this.pattern || undefined)}
                autocomplete=${ifDefined(this.autocomplete || undefined)}
                inputmode=${ifDefined(this.inputMode || undefined)}
                aria-label=${ifDefined(this.ariaLabel || undefined)}
                .value=${this.value ?? ''}
                ?readonly=${this.readOnly}
                ?disabled=${this.disabled}
                ?required=${this.required}
                @input=${this._onInput}
            >
        `;
    }
}

if (!customElements.get('psy-input')) {
    customElements.define('psy-input', PsyInput);
}
