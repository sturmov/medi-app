// ============================================================================
// psy-textarea - reusable textarea primitive
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyTextarea extends LitElement {
    static properties = {
        textareaId: { type: String, attribute: 'textarea-id' },
        name: { type: String },
        value: { type: String },
        placeholder: { type: String },
        rows: { type: String },
        cols: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        inputClass: { type: String, attribute: 'input-class' },
        minLength: { type: String, attribute: 'min-length' },
        maxLength: { type: String, attribute: 'max-length' },
        autocomplete: { type: String },
        readOnly: { type: Boolean, attribute: 'read-only' },
        disabled: { type: Boolean },
        required: { type: Boolean },
        ariaLabel: { type: String, attribute: 'aria-label' }
    };

    constructor() {
        super();
        this.textareaId = '';
        this.name = '';
        this.value = '';
        this.placeholder = '';
        this.rows = '';
        this.cols = '';
        this.dataField = '';
        this.inputClass = '';
        this.minLength = '';
        this.maxLength = '';
        this.autocomplete = '';
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
            <textarea
                id=${ifDefined(this.textareaId || undefined)}
                name=${ifDefined(this.name || undefined)}
                class=${this._classes()}
                data-field=${ifDefined(this.dataField || undefined)}
                placeholder=${ifDefined(this.placeholder || undefined)}
                rows=${ifDefined(this.rows || undefined)}
                cols=${ifDefined(this.cols || undefined)}
                minlength=${ifDefined(this.minLength || undefined)}
                maxlength=${ifDefined(this.maxLength || undefined)}
                autocomplete=${ifDefined(this.autocomplete || undefined)}
                aria-label=${ifDefined(this.ariaLabel || undefined)}
                ?readonly=${this.readOnly}
                ?disabled=${this.disabled}
                ?required=${this.required}
                @input=${this._onInput}
            >${this.value ?? ''}</textarea>
        `;
    }
}

if (!customElements.get('psy-textarea')) {
    customElements.define('psy-textarea', PsyTextarea);
}
