// ============================================================================
// psy-radio-group - reusable radio options group with column layout
// ============================================================================

import { LitElement, html } from './lit.js';

function normalizeOption(option) {
    if (option == null) return { value: '', label: '' };

    if (typeof option === 'string' || typeof option === 'number') {
        const normalized = String(option);
        return { value: normalized, label: normalized };
    }

    return {
        value: option.value != null ? String(option.value) : '',
        label: option.label != null ? String(option.label) : (option.value != null ? String(option.value) : ''),
        disabled: !!option.disabled
    };
}

export class PsyRadioGroup extends LitElement {
    static properties = {
        label: { type: String },
        name: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        options: { type: Object },
        value: { type: String },
        columns: { type: String },
        compact: { type: Boolean },
        groupClass: { type: String, attribute: 'group-class' },
        itemClass: { type: String, attribute: 'item-class' },
        disabled: { type: Boolean },
        required: { type: Boolean }
    };

    constructor() {
        super();
        this.label = '';
        this.name = '';
        this.dataField = '';
        this.options = [];
        this.value = '';
        this.columns = 'auto';
        this.compact = false;
        this.groupClass = '';
        this.itemClass = '';
        this.disabled = false;
        this.required = false;
    }

    createRenderRoot() {
        return this;
    }

    _normalizedColumns() {
        const raw = String(this.columns || 'auto').trim().toLowerCase();
        if (raw === '1' || raw === '2' || raw === '3' || raw === 'auto') return raw;
        return 'auto';
    }

    _groupClasses() {
        const classes = ['psy-radio-group', 'radio-group', `psy-radio-group--${this._normalizedColumns()}`];
        if (this.compact) classes.push('psy-radio-group--compact');
        if (this.groupClass) {
            classes.push(...String(this.groupClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _itemClasses() {
        const classes = ['psy-radio-group__item'];
        if (this.itemClass) {
            classes.push(...String(this.itemClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _parseOptions() {
        if (Array.isArray(this.options)) {
            return this.options.map(normalizeOption);
        }

        if (typeof this.options === 'string' && this.options.trim()) {
            try {
                const parsed = JSON.parse(this.options);
                if (Array.isArray(parsed)) {
                    return parsed.map(normalizeOption);
                }
            } catch (_) {
                // ignore invalid json
            }
        }

        return [];
    }

    _onChange(event) {
        this.value = event.target.value;
    }

    render() {
        const resolvedOptions = this._parseOptions();
        const groupName = this.name || this.dataField || 'psy-radio-group';

        return html`
            <div class="form-group psy-radio-group__wrap">
                ${this.label ? html`<label>${this.label}</label>` : html``}

                <div class=${this._groupClasses()}>
                    ${resolvedOptions.map((option, index) => {
                        const id = `${groupName}-${index}`;
                        return html`
                            <label class=${this._itemClasses()} for=${id}>
                                <input
                                    id=${id}
                                    type="radio"
                                    name=${groupName}
                                    value=${option.value}
                                    data-field=${this.dataField || ''}
                                    ?checked=${String(this.value || '') === String(option.value || '')}
                                    ?required=${this.required && index === 0}
                                    ?disabled=${this.disabled || option.disabled}
                                    @change=${this._onChange}
                                >
                                <span>${option.label}</span>
                            </label>
                        `;
                    })}
                    <slot></slot>
                </div>
            </div>
        `;
    }
}

if (!customElements.get('psy-radio-group')) {
    customElements.define('psy-radio-group', PsyRadioGroup);
}
