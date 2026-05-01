// ============================================================================
// psy-search-input - pole szukania z ikoną lupki i przyciskiem "wyczyść".
// API:
//   label, value, placeholder (def. "Szukaj..."), field-id, name, data-field,
//   hint, disabled, read-only,
//   hotkey  — Boolean, gdy ustawione globalny skrót "/" wprowadza focus w pole.
// Emituje `psy-change` z { value } oraz `psy-search` na Enter/clear.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-label.js';

export class PsySearchInput extends LitElement {
    static properties = {
        fieldId: { type: String, attribute: 'field-id' },
        name: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        label: { type: String },
        labelClass: { type: String, attribute: 'label-class' },
        value: { type: String },
        placeholder: { type: String },
        controlClass: { type: String, attribute: 'control-class' },
        groupClass: { type: String, attribute: 'group-class' },
        hint: { type: String },
        hintId: { type: String, attribute: 'hint-id' },
        hotkey: { type: Boolean },
        readOnly: { type: Boolean, attribute: 'read-only' },
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
        this.placeholder = 'Szukaj...';
        this.controlClass = '';
        this.groupClass = '';
        this.hint = '';
        this.hintId = '';
        this.hotkey = false;
        this.readOnly = false;
        this.disabled = false;
        this._onHotkey = this._onHotkey.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.hotkey) {
            document.addEventListener('keydown', this._onHotkey);
        }
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onHotkey);
        super.disconnectedCallback();
    }

    _onHotkey(event) {
        if (!this.hotkey) return;
        if (event.key !== '/') return;
        const target = event.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
        }
        event.preventDefault();
        const input = this.querySelector('input.psy-search-input__input');
        if (input) input.focus();
    }

    _groupClasses() {
        const classes = ['form-group', 'psy-form-field', 'psy-form-field--search'];
        if (this.groupClass) {
            classes.push(...String(this.groupClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _controlClasses() {
        const classes = ['input', 'psy-search-input__input'];
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

    _onKeydown(event) {
        if (event.key === 'Enter') {
            this.dispatchEvent(new CustomEvent('psy-search', {
                detail: { value: this.value },
                bubbles: true,
                composed: true
            }));
        } else if (event.key === 'Escape' && this.value) {
            this._clear();
        }
    }

    _clear() {
        this.value = '';
        const input = this.querySelector('input.psy-search-input__input');
        if (input) input.focus();
        this.dispatchEvent(new CustomEvent('psy-change', {
            detail: { value: '' },
            bubbles: true,
            composed: true
        }));
        this.dispatchEvent(new CustomEvent('psy-search', {
            detail: { value: '' },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        const hasValue = this.value != null && this.value !== '';
        return html`
            <div class=${this._groupClasses()}>
                ${this.label
                    ? html`<psy-label for-id=${ifDefined(this.fieldId || undefined)} extra-class=${ifDefined(this.labelClass || undefined)} text=${this.label}></psy-label>`
                    : html``}
                <div class="psy-search-input__wrap">
                    <span class="psy-search-input__icon" aria-hidden="true">🔍</span>
                    <input
                        type="search"
                        class=${this._controlClasses()}
                        id=${ifDefined(this.fieldId || undefined)}
                        name=${ifDefined(this.name || undefined)}
                        data-field=${ifDefined(this.dataField || undefined)}
                        placeholder=${ifDefined(this.placeholder || undefined)}
                        .value=${this.value ?? ''}
                        ?readonly=${this.readOnly}
                        ?disabled=${this.disabled}
                        @input=${this._onInput}
                        @keydown=${this._onKeydown}
                    >
                    ${hasValue
                        ? html`<button
                                type="button"
                                class="psy-search-input__clear"
                                aria-label="Wyczyść wyszukiwanie"
                                @click=${this._clear}
                            >✕</button>`
                        : html``}
                </div>
                ${this.hint
                    ? html`<small class="form-hint" id=${ifDefined(this.hintId || undefined)}>${this.hint}</small>`
                    : this.hotkey
                        ? html`<small class="form-hint">Skrót: <kbd>/</kbd> ustawia focus na polu.</small>`
                        : html``}
            </div>
        `;
    }
}

if (!customElements.get('psy-search-input')) {
    customElements.define('psy-search-input', PsySearchInput);
}
