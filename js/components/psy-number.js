// ============================================================================
// psy-number - pole liczbowe z opcjonalną jednostką (sufiksem).
// API:
//   label, value, field-id, name, data-field,
//   min, max, step,
//   unit        — opcjonalny tekst po prawej (np. "min", "mg", "lat"),
//   placeholder, hint, disabled, required, read-only,
//   align="right" — domyślnie dla liczb tekst wyrównany do prawej.
// Emituje `psy-change` z { value: Number|null }.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-label.js';

export class PsyNumber extends LitElement {
    static properties = {
        fieldId: { type: String, attribute: 'field-id' },
        name: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        label: { type: String },
        labelClass: { type: String, attribute: 'label-class' },
        value: { type: String },
        min: { type: String },
        max: { type: String },
        step: { type: String },
        unit: { type: String },
        placeholder: { type: String },
        controlClass: { type: String, attribute: 'control-class' },
        groupClass: { type: String, attribute: 'group-class' },
        hint: { type: String },
        hintId: { type: String, attribute: 'hint-id' },
        readOnly: { type: Boolean, attribute: 'read-only' },
        required: { type: Boolean },
        disabled: { type: Boolean }
    };

    constructor() {
        super();
        this.fieldId = '';
        this.name = '';
        this.dataField = '';
        this.label = '';
        this.labelClass = '';
        this.value = '';
        this.min = '';
        this.max = '';
        this.step = '';
        this.unit = '';
        this.placeholder = '';
        this.controlClass = '';
        this.groupClass = '';
        this.hint = '';
        this.hintId = '';
        this.readOnly = false;
        this.required = false;
        this.disabled = false;
    }

    createRenderRoot() {
        return this;
    }

    _groupClasses() {
        const classes = ['form-group', 'psy-form-field', 'psy-form-field--number'];
        if (this.groupClass) {
            classes.push(...String(this.groupClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _controlClasses() {
        const classes = ['input', 'psy-number__input'];
        if (this.controlClass) {
            classes.push(...String(this.controlClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _onInput(event) {
        const raw = event.target.value;
        this.value = raw;
        const parsed = raw === '' ? null : Number(raw);
        this.dispatchEvent(new CustomEvent('psy-change', {
            detail: { value: Number.isNaN(parsed) ? null : parsed, raw },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div class=${this._groupClasses()}>
                ${this.label
                    ? html`<psy-label for-id=${ifDefined(this.fieldId || undefined)} extra-class=${ifDefined(this.labelClass || undefined)} text=${this.label}></psy-label>`
                    : html``}
                <div class="psy-number__wrap">
                    <input
                        type="number"
                        class=${this._controlClasses()}
                        id=${ifDefined(this.fieldId || undefined)}
                        name=${ifDefined(this.name || undefined)}
                        data-field=${ifDefined(this.dataField || undefined)}
                        min=${ifDefined(this.min || undefined)}
                        max=${ifDefined(this.max || undefined)}
                        step=${ifDefined(this.step || undefined)}
                        placeholder=${ifDefined(this.placeholder || undefined)}
                        inputmode="numeric"
                        .value=${this.value ?? ''}
                        ?readonly=${this.readOnly}
                        ?required=${this.required}
                        ?disabled=${this.disabled}
                        @input=${this._onInput}
                    >
                    ${this.unit
                        ? html`<span class="psy-number__unit" aria-hidden="true">${this.unit}</span>`
                        : html``}
                </div>
                ${this.hint
                    ? html`<small class="form-hint" id=${ifDefined(this.hintId || undefined)}>${this.hint}</small>`
                    : html``}
            </div>
        `;
    }
}

if (!customElements.get('psy-number')) {
    customElements.define('psy-number', PsyNumber);
}
