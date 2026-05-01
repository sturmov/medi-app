// ============================================================================
// psy-checkbox - reusable checkbox primitive
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyCheckbox extends LitElement {
    static properties = {
        checkboxId: { type: String, attribute: 'checkbox-id' },
        name: { type: String },
        value: { type: String },
        checked: { type: Boolean },
        label: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        disabled: { type: Boolean },
        wrapperClass: { type: String, attribute: 'wrapper-class' },
        inputClass: { type: String, attribute: 'input-class' }
    };

    constructor() {
        super();
        this.checkboxId = '';
        this.name = '';
        this.value = '';
        this.checked = false;
        this.label = '';
        this.dataField = '';
        this.disabled = false;
        this.wrapperClass = '';
        this.inputClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _onChange(event) {
        this.checked = event.target.checked;
    }

    _wrapperClasses() {
        const classes = ['form-group--checkbox'];
        if (this.wrapperClass) {
            classes.push(...String(this.wrapperClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    render() {
        return html`
            <div class=${this._wrapperClasses()}>
                <input
                    type="checkbox"
                    id=${ifDefined(this.checkboxId || undefined)}
                    name=${ifDefined(this.name || undefined)}
                    value=${ifDefined(this.value || undefined)}
                    data-field=${ifDefined(this.dataField || undefined)}
                    class=${ifDefined(this.inputClass || undefined)}
                    ?checked=${this.checked}
                    ?disabled=${this.disabled}
                    @change=${this._onChange}
                >
                <label for=${ifDefined(this.checkboxId || undefined)}>
                    <slot>${this.label}</slot>
                </label>
            </div>
        `;
    }
}

if (!customElements.get('psy-checkbox')) {
    customElements.define('psy-checkbox', PsyCheckbox);
}
