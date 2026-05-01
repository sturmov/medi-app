// ============================================================================
// psy-select - reusable select primitive
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

function normalizeOption(option) {
    if (option == null) {
        return { value: '', label: '' };
    }

    if (typeof option === 'string' || typeof option === 'number') {
        const normalized = String(option);
        return { value: normalized, label: normalized };
    }

    return {
        value: option.value != null ? String(option.value) : '',
        label: option.label != null ? String(option.label) : (option.value != null ? String(option.value) : ''),
        disabled: !!option.disabled,
        selected: !!option.selected
    };
}

export class PsySelect extends LitElement {
    static properties = {
        selectId: { type: String, attribute: 'select-id' },
        name: { type: String },
        value: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        inputClass: { type: String, attribute: 'input-class' },
        ariaLabel: { type: String, attribute: 'aria-label' },
        disabled: { type: Boolean },
        required: { type: Boolean },
        multiple: { type: Boolean },
        size: { type: String },
        options: { type: Object },
        emptyOptionLabel: { type: String, attribute: 'empty-option-label' }
    };

    constructor() {
        super();
        this.selectId = '';
        this.name = '';
        this.value = '';
        this.dataField = '';
        this.inputClass = '';
        this.ariaLabel = '';
        this.disabled = false;
        this.required = false;
        this.multiple = false;
        this.size = '';
        this.options = [];
        this.emptyOptionLabel = '';

        this._initialOptions = [];
        this._didCaptureInitialOptions = false;
    }

    connectedCallback() {
        super.connectedCallback();
        this._captureInitialOptions();
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

    _captureInitialOptions() {
        if (this._didCaptureInitialOptions) return;

        const initialOptions = Array.from(this.children || [])
            .filter((node) => node && node.nodeType === Node.ELEMENT_NODE && node.tagName === 'OPTION')
            .map((node) => ({
                value: node.value != null ? String(node.value) : '',
                label: node.textContent != null ? String(node.textContent).trim() : '',
                disabled: !!node.disabled,
                selected: !!node.selected
            }));

        this._initialOptions = initialOptions;
        this._didCaptureInitialOptions = true;
    }

    _parseOptions() {
        if (!this.options || (Array.isArray(this.options) && this.options.length === 0)) return [];

        if (Array.isArray(this.options)) {
            return this.options.map(normalizeOption);
        }

        try {
            const parsed = JSON.parse(String(this.options));
            if (Array.isArray(parsed)) {
                return parsed.map(normalizeOption);
            }
        } catch (_) {
            // ignore parse failures and fallback to initial options
        }

        return [];
    }

    _resolvedOptions() {
        const parsed = this._parseOptions();
        if (parsed.length) return parsed;
        return this._initialOptions;
    }

    _onChange(event) {
        if (this.multiple) {
            this.value = Array.from(event.target.selectedOptions || [])
                .map((option) => option.value)
                .join(',');
            return;
        }

        this.value = event.target.value;
    }

    render() {
        const resolvedOptions = this._resolvedOptions();

        return html`
            <select
                id=${ifDefined(this.selectId || undefined)}
                name=${ifDefined(this.name || undefined)}
                class=${this._classes()}
                data-field=${ifDefined(this.dataField || undefined)}
                aria-label=${ifDefined(this.ariaLabel || undefined)}
                size=${ifDefined(this.size || undefined)}
                .value=${this.value ?? ''}
                ?disabled=${this.disabled}
                ?required=${this.required}
                ?multiple=${this.multiple}
                @change=${this._onChange}
            >
                ${(!this.multiple && this.emptyOptionLabel)
                    ? html`<option value="">${this.emptyOptionLabel}</option>`
                    : html``}
                ${resolvedOptions.map((option) => html`
                    <option
                        value=${option.value}
                        ?disabled=${option.disabled}
                        ?selected=${option.selected}
                    >${option.label}</option>
                `)}
            </select>
        `;
    }
}

if (!customElements.get('psy-select')) {
    customElements.define('psy-select', PsySelect);
}
