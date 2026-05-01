// ============================================================================
// psy-checkbox-group - reusable checkbox list/group with column layout
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-checkbox.js';

function normalizeOption(option) {
    if (option == null) return { value: '', label: '' };

    if (typeof option === 'string' || typeof option === 'number') {
        const normalized = String(option);
        return { value: normalized, label: normalized };
    }

    return {
        value: option.value != null ? String(option.value) : '',
        label: option.label != null ? String(option.label) : (option.value != null ? String(option.value) : ''),
        checked: !!option.checked,
        disabled: !!option.disabled
    };
}

export class PsyCheckboxGroup extends LitElement {
    static properties = {
        label: { type: String },
        name: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        options: { type: Object },
        columns: { type: String },
        compact: { type: Boolean },
        groupClass: { type: String, attribute: 'group-class' },
        itemClass: { type: String, attribute: 'item-class' },
        disabled: { type: Boolean }
    };

    constructor() {
        super();
        this.label = '';
        this.name = '';
        this.dataField = '';
        this.options = [];
        this.columns = 'auto';
        this.compact = false;
        this.groupClass = '';
        this.itemClass = '';
        this.disabled = false;
    }

    createRenderRoot() {
        return this;
    }

    _normalizedColumns() {
        const raw = String(this.columns || 'auto').trim().toLowerCase();
        if (raw === '1' || raw === '2' || raw === '3' || raw === 'auto') {
            return raw;
        }
        return 'auto';
    }

    _groupClasses() {
        const classes = ['psy-checkbox-group', 'checkbox-group', `psy-checkbox-group--${this._normalizedColumns()}`];

        if (this.compact) classes.push('psy-checkbox-group--compact');
        if (this.groupClass) {
            classes.push(...String(this.groupClass).split(/\s+/).filter(Boolean));
        }

        return classes.join(' ');
    }

    _itemWrapperClasses() {
        const classes = ['psy-checkbox-group__item'];
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
                // ignore invalid JSON
            }
        }

        return [];
    }

    render() {
        const resolvedOptions = this._parseOptions();

        return html`
            <div class="form-group psy-checkbox-group__wrap">
                ${this.label ? html`<label>${this.label}</label>` : html``}

                <div class=${this._groupClasses()}>
                    ${resolvedOptions.map((option, index) => {
                        const checkboxId = `${this.name || this.dataField || 'psy-checkbox'}-${index}`;
                        return html`
                            <div class=${this._itemWrapperClasses()}>
                                <psy-checkbox
                                    checkbox-id=${ifDefined(checkboxId || undefined)}
                                    name=${ifDefined(this.name || undefined)}
                                    value=${ifDefined(option.value || undefined)}
                                    data-field=${ifDefined(this.dataField || undefined)}
                                    label=${option.label}
                                    ?checked=${option.checked}
                                    ?disabled=${this.disabled || option.disabled}
                                ></psy-checkbox>
                            </div>
                        `;
                    })}
                    <slot></slot>
                </div>
            </div>
        `;
    }
}

if (!customElements.get('psy-checkbox-group')) {
    customElements.define('psy-checkbox-group', PsyCheckboxGroup);
}
