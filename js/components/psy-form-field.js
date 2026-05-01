// ============================================================================
// psy-form-field - composed field (label + control + hint)
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-label.js';
import './psy-input.js';
import './psy-select.js';
import './psy-textarea.js';
import './psy-checkbox.js';

export class PsyFormField extends LitElement {
    static properties = {
        kind: { type: String }, // input | select | textarea | checkbox | date | number | range
        fieldId: { type: String, attribute: 'field-id' },
        name: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        label: { type: String },
        checkboxLabel: { type: String, attribute: 'checkbox-label' },
        labelClass: { type: String, attribute: 'label-class' },
        type: { type: String },
        value: { type: String },
        checked: { type: Boolean },
        placeholder: { type: String },
        rows: { type: String },
        cols: { type: String },
        min: { type: String },
        max: { type: String },
        step: { type: String },
        minLength: { type: String, attribute: 'min-length' },
        maxLength: { type: String, attribute: 'max-length' },
        pattern: { type: String },
        autocomplete: { type: String },
        inputMode: { type: String, attribute: 'input-mode' },
        options: { type: Object },
        emptyOptionLabel: { type: String, attribute: 'empty-option-label' },
        multiple: { type: Boolean },
        size: { type: String },
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
        this.kind = 'input';
        this.fieldId = '';
        this.name = '';
        this.dataField = '';
        this.label = '';
        this.checkboxLabel = '';
        this.labelClass = '';
        this.type = 'text';
        this.value = '';
        this.checked = false;
        this.placeholder = '';
        this.rows = '';
        this.cols = '';
        this.min = '';
        this.max = '';
        this.step = '';
        this.minLength = '';
        this.maxLength = '';
        this.pattern = '';
        this.autocomplete = '';
        this.inputMode = '';
        this.options = [];
        this.emptyOptionLabel = '';
        this.multiple = false;
        this.size = '';
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
        const classes = ['form-group', 'psy-form-field', `psy-form-field--${this.kind || 'input'}`];

        if (this.groupClass) {
            classes.push(...String(this.groupClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _resolvedInputType() {
        const kind = String(this.kind || 'input').toLowerCase();
        const inputKinds = new Set([
            'input',
            'text',
            'email',
            'tel',
            'number',
            'date',
            'time',
            'password',
            'search',
            'url',
            'range'
        ]);

        if (inputKinds.has(kind) && kind !== 'input') {
            return kind;
        }

        return this.type || 'text';
    }

    _shouldRenderLabel() {
        return !!this.label && this.kind !== 'checkbox';
    }

    _resolvedSelectOptions() {
        if (Array.isArray(this.options) && this.options.length) {
            return this.options;
        }

        if (typeof this.options === 'string' && this.options.trim()) {
            try {
                const parsed = JSON.parse(this.options);
                if (Array.isArray(parsed) && parsed.length) {
                    return parsed;
                }
            } catch (_) {
                // ignore invalid JSON and fallback to slotted options
            }
        }

        return Array.from(this.querySelectorAll('option[slot="options"]')).map((option) => ({
            value: option.value != null ? String(option.value) : '',
            label: option.textContent != null ? String(option.textContent).trim() : '',
            disabled: !!option.disabled,
            selected: !!option.selected
        }));
    }

    _renderControl() {
        if (this.kind === 'textarea') {
            return html`
                <psy-textarea
                    textarea-id=${ifDefined(this.fieldId || undefined)}
                    name=${ifDefined(this.name || undefined)}
                    data-field=${ifDefined(this.dataField || undefined)}
                    input-class=${ifDefined(this.controlClass || undefined)}
                    placeholder=${ifDefined(this.placeholder || undefined)}
                    rows=${ifDefined(this.rows || undefined)}
                    cols=${ifDefined(this.cols || undefined)}
                    min-length=${ifDefined(this.minLength || undefined)}
                    max-length=${ifDefined(this.maxLength || undefined)}
                    autocomplete=${ifDefined(this.autocomplete || undefined)}
                    .value=${this.value ?? ''}
                    ?readonly=${this.readOnly}
                    ?required=${this.required}
                    ?disabled=${this.disabled}
                ></psy-textarea>
            `;
        }

        if (this.kind === 'select') {
            return html`
                <psy-select
                    select-id=${ifDefined(this.fieldId || undefined)}
                    name=${ifDefined(this.name || undefined)}
                    data-field=${ifDefined(this.dataField || undefined)}
                    input-class=${ifDefined(this.controlClass || undefined)}
                    .options=${this._resolvedSelectOptions()}
                    empty-option-label=${ifDefined(this.emptyOptionLabel || undefined)}
                    size=${ifDefined(this.size || undefined)}
                    .value=${this.value ?? ''}
                    ?multiple=${this.multiple}
                    ?required=${this.required}
                    ?disabled=${this.disabled}
                ></psy-select>
            `;
        }

        if (this.kind === 'checkbox') {
            return html`
                <psy-checkbox
                    checkbox-id=${ifDefined(this.fieldId || undefined)}
                    name=${ifDefined(this.name || undefined)}
                    data-field=${ifDefined(this.dataField || undefined)}
                    input-class=${ifDefined(this.controlClass || undefined)}
                    label=${ifDefined(this.checkboxLabel || this.label || undefined)}
                    ?checked=${this.checked}
                    ?disabled=${this.disabled}
                ></psy-checkbox>
            `;
        }

        return html`
            <psy-input
                input-id=${ifDefined(this.fieldId || undefined)}
                name=${ifDefined(this.name || undefined)}
                data-field=${ifDefined(this.dataField || undefined)}
                input-class=${ifDefined(this.controlClass || undefined)}
                type=${this._resolvedInputType()}
                placeholder=${ifDefined(this.placeholder || undefined)}
                min=${ifDefined(this.min || undefined)}
                max=${ifDefined(this.max || undefined)}
                step=${ifDefined(this.step || undefined)}
                min-length=${ifDefined(this.minLength || undefined)}
                max-length=${ifDefined(this.maxLength || undefined)}
                pattern=${ifDefined(this.pattern || undefined)}
                autocomplete=${ifDefined(this.autocomplete || undefined)}
                input-mode=${ifDefined(this.inputMode || undefined)}
                .value=${this.value ?? ''}
                ?readonly=${this.readOnly}
                ?required=${this.required}
                ?disabled=${this.disabled}
            ></psy-input>
        `;
    }

    render() {
        return html`
            <div class=${this._groupClasses()}>
                ${this._shouldRenderLabel()
                    ? html`<psy-label for-id=${ifDefined(this.fieldId || undefined)} extra-class=${ifDefined(this.labelClass || undefined)} text=${this.label}></psy-label>`
                    : html``}

                ${this._renderControl()}

                ${this.hint
                    ? html`<small class="form-hint" id=${ifDefined(this.hintId || undefined)}>${this.hint}</small>`
                    : html``}
            </div>
        `;
    }
}

if (!customElements.get('psy-form-field')) {
    customElements.define('psy-form-field', PsyFormField);
}
