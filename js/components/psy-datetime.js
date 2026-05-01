// ============================================================================
// psy-datetime - wrapper na <input type="datetime-local">.
// API: label, value (ISO `YYYY-MM-DDTHH:mm`), field-id, name, data-field,
// min, max, step, hint, disabled, required, read-only.
// Emituje `psy-change` z { value }.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-label.js';

export class PsyDatetime extends LitElement {
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
        // używamy klasy --date (ten sam odcień co kalendarz) plus --datetime
        const classes = [
            'form-group',
            'psy-form-field',
            'psy-form-field--date',
            'psy-form-field--datetime'
        ];
        if (this.groupClass) {
            classes.push(...String(this.groupClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _controlClasses() {
        const classes = ['input'];
        if (this.controlClass) {
            classes.push(...String(this.controlClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _onInput(event) {
        this.value = event.target.value;
        this.dispatchEvent(new CustomEvent('psy-change', {
            detail: { value: this.value },
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
                <input
                    type="datetime-local"
                    class=${this._controlClasses()}
                    id=${ifDefined(this.fieldId || undefined)}
                    name=${ifDefined(this.name || undefined)}
                    data-field=${ifDefined(this.dataField || undefined)}
                    min=${ifDefined(this.min || undefined)}
                    max=${ifDefined(this.max || undefined)}
                    step=${ifDefined(this.step || undefined)}
                    .value=${this.value ?? ''}
                    ?readonly=${this.readOnly}
                    ?required=${this.required}
                    ?disabled=${this.disabled}
                    @input=${this._onInput}
                >
                ${this.hint
                    ? html`<small class="form-hint" id=${ifDefined(this.hintId || undefined)}>${this.hint}</small>`
                    : html``}
            </div>
        `;
    }
}

if (!customElements.get('psy-datetime')) {
    customElements.define('psy-datetime', PsyDatetime);
}
