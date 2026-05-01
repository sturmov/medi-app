// ============================================================================
// psy-tag-input - pole z chipami (tagami). Enter / przecinek dodaje kolejny,
// Backspace na pustym polu usuwa ostatni chip.
// API:
//   label, field-id, name, data-field,
//   placeholder, hint, disabled, read-only,
//   .tags         (Array<String>)  — programowe ustawianie,
//   tags-json     (String atrybut) — alternatywa deklaratywna,
//   separators    (String, def. "Enter,comma") — lista separatorów,
//   suggestions   (Array<String>)  — opcjonalne podpowiedzi (pod polem).
// Emituje:
//   `psy-change`  { tags: Array<String> } — na każdą zmianę,
//   `psy-tag-add` { value },
//   `psy-tag-remove` { value, index }.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-label.js';

export class PsyTagInput extends LitElement {
    static properties = {
        fieldId: { type: String, attribute: 'field-id' },
        name: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        label: { type: String },
        labelClass: { type: String, attribute: 'label-class' },
        placeholder: { type: String },
        tags: { type: Array },
        tagsJson: { type: String, attribute: 'tags-json' },
        separators: { type: String },
        suggestions: { type: Array },
        groupClass: { type: String, attribute: 'group-class' },
        hint: { type: String },
        hintId: { type: String, attribute: 'hint-id' },
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
        this.placeholder = 'Wpisz i naciśnij Enter...';
        this.tags = [];
        this.tagsJson = '';
        this.separators = 'Enter,comma';
        this.suggestions = [];
        this.groupClass = '';
        this.hint = '';
        this.hintId = '';
        this.readOnly = false;
        this.disabled = false;
        this._draft = '';
    }

    createRenderRoot() {
        return this;
    }

    updated(changed) {
        if (changed.has('tagsJson') && typeof this.tagsJson === 'string' && this.tagsJson.trim()) {
            try {
                const parsed = JSON.parse(this.tagsJson);
                if (Array.isArray(parsed)) {
                    this.tags = parsed.map(String);
                }
            } catch (_) {
                // ignore invalid JSON
            }
        }
    }

    _groupClasses() {
        const classes = ['form-group', 'psy-form-field', 'psy-form-field--tag'];
        if (this.groupClass) {
            classes.push(...String(this.groupClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _separatorKeys() {
        const list = String(this.separators || 'Enter,comma')
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);
        const keys = new Set();
        for (const s of list) {
            if (s === 'enter') keys.add('Enter');
            else if (s === 'comma' || s === ',') keys.add(',');
            else if (s === 'space' || s === ' ') keys.add(' ');
            else if (s === 'tab') keys.add('Tab');
            else if (s === ';' || s === 'semicolon') keys.add(';');
            else keys.add(s);
        }
        return keys;
    }

    _addTag(raw) {
        const v = String(raw || '').trim();
        if (!v) return;
        if (Array.isArray(this.tags) && this.tags.includes(v)) return;
        const next = Array.isArray(this.tags) ? [...this.tags, v] : [v];
        this.tags = next;
        this.dispatchEvent(new CustomEvent('psy-tag-add', {
            detail: { value: v },
            bubbles: true,
            composed: true
        }));
        this._emitChange();
    }

    _removeTag(index) {
        if (!Array.isArray(this.tags) || index < 0 || index >= this.tags.length) return;
        const value = this.tags[index];
        const next = this.tags.slice(0, index).concat(this.tags.slice(index + 1));
        this.tags = next;
        this.dispatchEvent(new CustomEvent('psy-tag-remove', {
            detail: { value, index },
            bubbles: true,
            composed: true
        }));
        this._emitChange();
    }

    _emitChange() {
        this.dispatchEvent(new CustomEvent('psy-change', {
            detail: { tags: [...(this.tags || [])] },
            bubbles: true,
            composed: true
        }));
    }

    _onInput(event) {
        this._draft = event.target.value;
    }

    _onKeydown(event) {
        const keys = this._separatorKeys();
        const draft = event.target.value;
        if (keys.has(event.key)) {
            if (draft.trim()) {
                event.preventDefault();
                this._addTag(draft);
                event.target.value = '';
                this._draft = '';
            } else if (event.key === 'Enter') {
                event.preventDefault();
            }
            return;
        }
        if (event.key === 'Backspace' && !draft && Array.isArray(this.tags) && this.tags.length > 0) {
            event.preventDefault();
            this._removeTag(this.tags.length - 1);
        }
    }

    _onBlur(event) {
        const draft = event.target.value;
        if (draft && draft.trim()) {
            this._addTag(draft);
            event.target.value = '';
            this._draft = '';
        }
    }

    _onSuggestionClick(value) {
        this._addTag(value);
    }

    render() {
        const tags = Array.isArray(this.tags) ? this.tags : [];
        const suggestions = Array.isArray(this.suggestions)
            ? this.suggestions.filter(s => !tags.includes(s))
            : [];
        return html`
            <div class=${this._groupClasses()}>
                ${this.label
                    ? html`<psy-label for-id=${ifDefined(this.fieldId || undefined)} extra-class=${ifDefined(this.labelClass || undefined)} text=${this.label}></psy-label>`
                    : html``}
                <div class="psy-tag-input__wrap" @click=${(e) => {
                    const input = this.querySelector('input.psy-tag-input__input');
                    if (input && e.target === e.currentTarget) input.focus();
                }}>
                    ${tags.map((tag, index) => html`
                        <span class="psy-tag-input__chip">
                            <span class="psy-tag-input__chip-label">${tag}</span>
                            ${this.readOnly || this.disabled
                                ? html``
                                : html`<button
                                        type="button"
                                        class="psy-tag-input__chip-remove"
                                        aria-label=${'Usuń: ' + tag}
                                        @click=${() => this._removeTag(index)}
                                    >✕</button>`}
                        </span>
                    `)}
                    <input
                        type="text"
                        class="input psy-tag-input__input"
                        id=${ifDefined(this.fieldId || undefined)}
                        name=${ifDefined(this.name || undefined)}
                        data-field=${ifDefined(this.dataField || undefined)}
                        placeholder=${ifDefined(tags.length === 0 ? (this.placeholder || undefined) : undefined)}
                        ?disabled=${this.disabled}
                        ?readonly=${this.readOnly}
                        @input=${this._onInput}
                        @keydown=${this._onKeydown}
                        @blur=${this._onBlur}
                    >
                </div>
                ${suggestions.length
                    ? html`
                        <div class="insert-suggestions psy-tag-input__suggestions">
                            ${suggestions.map(s => html`
                                <button
                                    type="button"
                                    class="insert-suggestions__item"
                                    @click=${() => this._onSuggestionClick(s)}
                                >+ ${s}</button>
                            `)}
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

if (!customElements.get('psy-tag-input')) {
    customElements.define('psy-tag-input', PsyTagInput);
}
