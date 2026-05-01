// ============================================================================
// psy-file-input - pole do uploadu plików z listą wybranych pozycji oraz
// strefą "przeciągnij i upuść".
// API:
//   label, field-id, name, data-field,
//   accept (np. "image/*,.pdf"), multiple, hint,
//   button-text (def. "Wybierz pliki..."),
//   empty-text  (def. "Brak wybranych plików"),
//   disabled, read-only.
// Emituje:
//   `psy-file-selected` { files: Array<File>, first: File|null },
//   `psy-change`        { fileNames: Array<String> }.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-label.js';
import './psy-button.js';

export class PsyFileInput extends LitElement {
    static properties = {
        fieldId: { type: String, attribute: 'field-id' },
        name: { type: String },
        dataField: { type: String, attribute: 'data-field' },
        label: { type: String },
        labelClass: { type: String, attribute: 'label-class' },
        accept: { type: String },
        multiple: { type: Boolean },
        buttonText: { type: String, attribute: 'button-text' },
        emptyText: { type: String, attribute: 'empty-text' },
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
        this.accept = '';
        this.multiple = false;
        this.buttonText = 'Wybierz pliki...';
        this.emptyText = 'Brak wybranych plików';
        this.groupClass = '';
        this.hint = '';
        this.hintId = '';
        this.readOnly = false;
        this.disabled = false;
        this._files = [];
        this._dragOver = false;
    }

    createRenderRoot() {
        return this;
    }

    _groupClasses() {
        const classes = ['form-group', 'psy-form-field', 'psy-form-field--file'];
        if (this.groupClass) {
            classes.push(...String(this.groupClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _dropzoneClasses() {
        const classes = ['psy-file-input__dropzone'];
        if (this._dragOver) classes.push('psy-file-input__dropzone--dragover');
        if (this.disabled || this.readOnly) classes.push('psy-file-input__dropzone--disabled');
        return classes.join(' ');
    }

    _setFiles(fileList) {
        const files = Array.from(fileList || []);
        this._files = files;
        this.requestUpdate();
        this.dispatchEvent(new CustomEvent('psy-file-selected', {
            detail: {
                files,
                first: files[0] || null
            },
            bubbles: true,
            composed: true
        }));
        this.dispatchEvent(new CustomEvent('psy-change', {
            detail: { fileNames: files.map(f => f.name) },
            bubbles: true,
            composed: true
        }));
    }

    _onBrowse() {
        if (this.disabled || this.readOnly) return;
        const input = this.querySelector('input.psy-file-input__native');
        if (input) input.click();
    }

    _onNativeChange(event) {
        this._setFiles(event.target.files);
    }

    _onRemove(index) {
        if (this.disabled || this.readOnly) return;
        const next = this._files.slice(0, index).concat(this._files.slice(index + 1));
        this._setFiles(next);
        // odśwież natywny input (inaczej ponowny wybór tego samego pliku nie wywoła change)
        const input = this.querySelector('input.psy-file-input__native');
        if (input) input.value = '';
    }

    _onDragOver(event) {
        if (this.disabled || this.readOnly) return;
        event.preventDefault();
        if (!this._dragOver) {
            this._dragOver = true;
            this.requestUpdate();
        }
    }

    _onDragLeave() {
        if (this._dragOver) {
            this._dragOver = false;
            this.requestUpdate();
        }
    }

    _onDrop(event) {
        if (this.disabled || this.readOnly) return;
        event.preventDefault();
        this._dragOver = false;
        const dt = event.dataTransfer;
        if (dt && dt.files && dt.files.length) {
            this._setFiles(dt.files);
        }
    }

    _formatSize(bytes) {
        if (!Number.isFinite(bytes)) return '';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    render() {
        const files = this._files;
        return html`
            <div class=${this._groupClasses()}>
                ${this.label
                    ? html`<psy-label for-id=${ifDefined(this.fieldId || undefined)} extra-class=${ifDefined(this.labelClass || undefined)} text=${this.label}></psy-label>`
                    : html``}
                <div
                    class=${this._dropzoneClasses()}
                    @dragover=${this._onDragOver}
                    @dragleave=${this._onDragLeave}
                    @drop=${this._onDrop}
                >
                    <input
                        type="file"
                        class="psy-file-input__native"
                        id=${ifDefined(this.fieldId || undefined)}
                        name=${ifDefined(this.name || undefined)}
                        data-field=${ifDefined(this.dataField || undefined)}
                        accept=${ifDefined(this.accept || undefined)}
                        ?multiple=${this.multiple}
                        ?disabled=${this.disabled || this.readOnly}
                        @change=${this._onNativeChange}
                        style="display:none"
                    >
                    <div class="psy-file-input__cta">
                        <psy-button
                            variant="secondary"
                            size="sm"
                            @click=${this._onBrowse}
                            ?disabled=${this.disabled || this.readOnly}
                        >📎 ${this.buttonText}</psy-button>
                        <span class="psy-file-input__hint-inline">lub przeciągnij tutaj</span>
                    </div>
                    ${files.length === 0
                        ? html`<div class="psy-file-input__empty">${this.emptyText}</div>`
                        : html`
                            <ul class="psy-file-input__list">
                                ${files.map((f, i) => html`
                                    <li class="psy-file-input__item">
                                        <span class="psy-file-input__item-name">${f.name}</span>
                                        <span class="psy-file-input__item-size">${this._formatSize(f.size)}</span>
                                        ${this.readOnly || this.disabled
                                            ? html``
                                            : html`<button
                                                    type="button"
                                                    class="psy-file-input__item-remove"
                                                    aria-label=${'Usuń: ' + f.name}
                                                    @click=${() => this._onRemove(i)}
                                                >✕</button>`}
                                    </li>
                                `)}
                            </ul>
                        `}
                </div>
                ${this.hint
                    ? html`<small class="form-hint" id=${ifDefined(this.hintId || undefined)}>${this.hint}</small>`
                    : html``}
            </div>
        `;
    }
}

if (!customElements.get('psy-file-input')) {
    customElements.define('psy-file-input', PsyFileInput);
}
