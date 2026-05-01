// ============================================================================
// psy-modal - dialog z backdrop, focus trap i scroll lock.
//
// Atrybuty:
//   - open                : Boolean (reflect) - czy modal jest widoczny
//   - title               : nagłówek dialogu (ignorowane, gdy jest slot="header")
//   - size                : "sm|md|lg|xl"                (default "md")
//   - closable            : Boolean (default true)       - przycisk "×" w rogu
//   - dismiss-on-backdrop : Boolean (default true)       - klik w tło zamyka
//   - dismiss-on-esc      : Boolean (default true)       - Escape zamyka
//   - extra-class         : dodatkowe klasy CSS
//   - modal-id            : id zewnętrzne
//
// Sloty:
//   - domyślny (body)
//   - header    (przejmuje miejsce tytułu)
//   - footer    (akcje: zwykle `psy-stack direction="row" justify="end"`)
//
// API:
//   .show()            : otwiera modal
//   .close(reason?)    : zamyka modal z podaną przyczyną ("esc" | "backdrop" | "close-btn" | custom)
//
// Eventy (bubble + composed):
//   - psy-modal-open
//   - psy-modal-close  { reason }
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import { FocusTrap, lockBodyScroll, unlockBodyScroll } from './_focus-trap.js';

const VALID_SIZE = new Set(['sm', 'md', 'lg', 'xl']);

export class PsyModal extends LitElement {
    static properties = {
        open: { type: Boolean, reflect: true },
        title: { type: String },
        size: { type: String, reflect: true },
        closable: { type: Boolean },
        dismissOnBackdrop: { type: Boolean, attribute: 'dismiss-on-backdrop' },
        dismissOnEsc: { type: Boolean, attribute: 'dismiss-on-esc' },
        extraClass: { type: String, attribute: 'extra-class' },
        modalId: { type: String, attribute: 'modal-id' }
    };

    constructor() {
        super();
        this.open = false;
        this.title = '';
        this.size = 'md';
        this.closable = true;
        this.dismissOnBackdrop = true;
        this.dismissOnEsc = true;
        this.extraClass = '';
        this.modalId = '';
        this._trap = null;
        this._onDocKeydown = this._onDocKeydown.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    show() {
        if (this.open) return;
        this.open = true;
    }

    close(reason = 'api') {
        if (!this.open) return;
        this.open = false;
        this.dispatchEvent(new CustomEvent('psy-modal-close', {
            detail: { reason },
            bubbles: true,
            composed: true
        }));
    }

    updated(changed) {
        if (changed.has('open')) {
            if (this.open) {
                this._activate();
            } else {
                this._deactivate();
            }
        }
    }

    disconnectedCallback() {
        this._deactivate();
        super.disconnectedCallback();
    }

    _activate() {
        lockBodyScroll();
        document.addEventListener('keydown', this._onDocKeydown);
        const dialog = this.querySelector('.psy-modal__dialog');
        if (dialog) {
            this._trap = new FocusTrap(dialog);
            this._trap.activate();
        }
        this.dispatchEvent(new CustomEvent('psy-modal-open', {
            bubbles: true,
            composed: true
        }));
    }

    _deactivate() {
        document.removeEventListener('keydown', this._onDocKeydown);
        if (this._trap) {
            this._trap.deactivate();
            this._trap = null;
        }
        unlockBodyScroll();
    }

    _onDocKeydown(ev) {
        if (!this.open) return;
        if (ev.key === 'Escape' && this.dismissOnEsc) {
            ev.stopPropagation();
            this.close('esc');
        }
    }

    _onBackdropClick(ev) {
        if (!this.dismissOnBackdrop) return;
        // Only the backdrop itself, not propagated clicks from dialog
        if (ev.target === ev.currentTarget) {
            this.close('backdrop');
        }
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    _classes() {
        const size = VALID_SIZE.has(this.size) ? this.size : 'md';
        const classes = [
            'psy-modal',
            `psy-modal--${size}`
        ];
        if (this.open) classes.push('psy-modal--open');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    render() {
        const hasHeader = this._hasNamedSlot('header');
        const hasFooter = this._hasNamedSlot('footer');

        return html`
            <div
                id=${ifDefined(this.modalId || undefined)}
                class=${this._classes()}
                role="dialog"
                aria-modal="true"
                aria-hidden=${this.open ? 'false' : 'true'}
                aria-label=${ifDefined(this.title || undefined)}
            >
                <div
                    class="psy-modal__backdrop"
                    @click=${this._onBackdropClick}
                ></div>

                <div class="psy-modal__dialog" tabindex="-1">
                    ${hasHeader || this.title || this.closable ? html`
                        <div class="psy-modal__header">
                            ${hasHeader
                                ? html`<slot name="header"></slot>`
                                : html`<h3 class="psy-modal__title">${this.title}</h3>`}
                            ${this.closable ? html`
                                <button
                                    type="button"
                                    class="psy-modal__close"
                                    aria-label="Zamknij"
                                    @click=${() => this.close('close-btn')}
                                >×</button>
                            ` : null}
                        </div>
                    ` : null}

                    <div class="psy-modal__body">
                        <slot></slot>
                    </div>

                    ${hasFooter ? html`
                        <div class="psy-modal__footer">
                            <slot name="footer"></slot>
                        </div>
                    ` : null}
                </div>
            </div>
        `;
    }
}

if (!customElements.get('psy-modal')) {
    customElements.define('psy-modal', PsyModal);
}
