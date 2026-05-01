// ============================================================================
// psy-toast - pojedyncze nieblokujące powiadomienie.
//
// W fazie dev `duration=0` (sticky) jest domyślnym trybem — produkcyjne
// wartości zostaną dobrane w Fazie 5 (hardening).
//
// Atrybuty:
//   - variant   : "info|success|warning|danger"   (default "info")
//   - title     : opcjonalny nagłówek pogrubiony
//   - duration  : ms, 0 = sticky                   (default 0 w dev)
//   - closable  : Boolean                          (default true)
//   - icon      : opcjonalna ikona (emoji/tekst) nadpisująca ikonę wariantu
//   - toast-id  : id zewnętrzne
//   - extra-class
//
// Sloty:
//   - domyślny (treść; gdy brak, użyty zostanie atrybut `message` / tekst wewn.)
//   - actions  (przyciski po prawej, np. "Cofnij")
//
// Emituje:
//   - psy-toast-dismiss { reason: "timeout" | "close-btn" | "api" }
//
// API:
//   .dismiss(reason?)
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const VARIANT_ICON = {
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
    danger: '×'
};

const VALID_VARIANT = new Set(['info', 'success', 'warning', 'danger']);

export class PsyToast extends LitElement {
    static properties = {
        variant: { type: String, reflect: true },
        title: { type: String },
        duration: { type: Number },
        closable: { type: Boolean },
        icon: { type: String },
        extraClass: { type: String, attribute: 'extra-class' },
        toastId: { type: String, attribute: 'toast-id' }
    };

    constructor() {
        super();
        this.variant = 'info';
        this.title = '';
        this.duration = 0; // dev: sticky
        this.closable = true;
        this.icon = '';
        this.extraClass = '';
        this.toastId = '';
        this._timer = null;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this._scheduleAutoDismiss();
    }

    disconnectedCallback() {
        this._clearTimer();
        super.disconnectedCallback();
    }

    updated(changed) {
        if (changed.has('duration')) {
            this._scheduleAutoDismiss();
        }
    }

    _scheduleAutoDismiss() {
        this._clearTimer();
        const d = Number(this.duration);
        if (Number.isFinite(d) && d > 0) {
            this._timer = window.setTimeout(() => this.dismiss('timeout'), d);
        }
    }

    _clearTimer() {
        if (this._timer) {
            window.clearTimeout(this._timer);
            this._timer = null;
        }
    }

    dismiss(reason = 'api') {
        this._clearTimer();
        this.dispatchEvent(new CustomEvent('psy-toast-dismiss', {
            detail: { reason },
            bubbles: true,
            composed: true
        }));
        // Rodzic (psy-toast-container) usunie nas z DOM po tym evencie.
        // Jeśli toast działa samodzielnie (poza containerem), usuń się sam:
        if (!(this.parentElement && this.parentElement.tagName.toLowerCase() === 'psy-toast-container')) {
            this.remove();
        }
    }

    _classes() {
        const variant = VALID_VARIANT.has(this.variant) ? this.variant : 'info';
        const classes = [
            'psy-toast',
            `psy-toast--${variant}`
        ];
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _roleFor() {
        return this.variant === 'warning' || this.variant === 'danger' ? 'alert' : 'status';
    }

    _iconFor() {
        if (this.icon) return this.icon;
        return VARIANT_ICON[this.variant] || VARIANT_ICON.info;
    }

    render() {
        return html`
            <div
                id=${ifDefined(this.toastId || undefined)}
                class=${this._classes()}
                role=${this._roleFor()}
                aria-live=${this.variant === 'warning' || this.variant === 'danger' ? 'assertive' : 'polite'}
            >
                <span class="psy-toast__icon" aria-hidden="true">${this._iconFor()}</span>

                <div class="psy-toast__content">
                    ${this.title
                        ? html`<div class="psy-toast__title">${this.title}</div>`
                        : null}
                    <div class="psy-toast__message">
                        <slot></slot>
                    </div>
                </div>

                <div class="psy-toast__actions">
                    <slot name="actions"></slot>
                </div>

                ${this.closable ? html`
                    <button
                        type="button"
                        class="psy-toast__close"
                        aria-label="Zamknij powiadomienie"
                        @click=${() => this.dismiss('close-btn')}
                    >×</button>
                ` : null}
            </div>
        `;
    }
}

if (!customElements.get('psy-toast')) {
    customElements.define('psy-toast', PsyToast);
}
