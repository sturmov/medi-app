// ============================================================================
// psy-range - suwak z widocznym, aktualizowanym na żywo bieżącym odczytem.
// API:
//   label, value, field-id, name, data-field,
//   min (def. "0"), max (def. "10"), step (def. "1"),
//   unit       — opcjonalny sufiks wyświetlany obok wartości (np. "pkt"),
//   show-ticks — gdy ustawione, rysuje skrajne etykiety min/max pod suwakiem,
//   hint, disabled, required, read-only.
// Emituje `psy-change` z { value: Number }.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-label.js';

export class PsyRange extends LitElement {
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
        showTicks: { type: Boolean, attribute: 'show-ticks' },
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
        this.min = '0';
        this.max = '10';
        this.step = '1';
        this.unit = '';
        this.showTicks = false;
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
        const classes = ['form-group', 'psy-form-field', 'psy-form-field--range'];
        if (this.groupClass) {
            classes.push(...String(this.groupClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _controlClasses() {
        const classes = ['input', 'psy-range__input'];
        if (this.controlClass) {
            classes.push(...String(this.controlClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _onInput(event) {
        const raw = event.target.value;
        this.value = raw;
        const parsed = Number(raw);
        this.dispatchEvent(new CustomEvent('psy-change', {
            detail: { value: Number.isNaN(parsed) ? null : parsed, raw },
            bubbles: true,
            composed: true
        }));
    }

    _displayValue() {
        const v = this.value;
        if (v === '' || v == null) return '—';
        return this.unit ? `${v} ${this.unit}` : String(v);
    }

    render() {
        return html`
            <div class=${this._groupClasses()}>
                ${this.label
                    ? html`<psy-label for-id=${ifDefined(this.fieldId || undefined)} extra-class=${ifDefined(this.labelClass || undefined)} text=${this.label}></psy-label>`
                    : html``}

                <div class="psy-range__row">
                    <input
                        type="range"
                        class=${this._controlClasses()}
                        id=${ifDefined(this.fieldId || undefined)}
                        name=${ifDefined(this.name || undefined)}
                        data-field=${ifDefined(this.dataField || undefined)}
                        min=${ifDefined(this.min || undefined)}
                        max=${ifDefined(this.max || undefined)}
                        step=${ifDefined(this.step || undefined)}
                        .value=${this.value ?? ''}
                        ?disabled=${this.disabled || this.readOnly}
                        ?required=${this.required}
                        @input=${this._onInput}
                    >
                    <output class="psy-range__value" aria-live="polite">${this._displayValue()}</output>
                </div>

                ${this.showTicks
                    ? html`
                        <div class="psy-range__ticks" aria-hidden="true">
                            <span>${this.min}</span>
                            <span>${this.max}</span>
                        </div>
                    `
                    : html``}

                ${this.hint
                    ? html`<small class="form-hint" id=${ifDefined(this.hintId || undefined)}>${this.hint}</small>`
                    : html``}
            </div>
        `;
    }
}

if (!customElements.get('psy-range')) {
    customElements.define('psy-range', PsyRange);
}
