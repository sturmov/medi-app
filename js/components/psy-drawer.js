// ============================================================================
// psy-drawer - panel wysuwany z boku (slide-in / slide-out).
//
// Użycie docelowe: "Nowa wizyta (skrót)" i inne szybkie formy kontekstowe.
//
// Atrybuty:
//   - open                : Boolean (reflect) - czy drawer jest otwarty
//   - side                : "right|left"                (default "right")
//   - width               : np. "480" lub "480px"        (default "480")
//   - title               : nagłówek (ignorowane, gdy slot="header")
//   - closable            : Boolean (default true)       - przycisk "×"
//   - dismiss-on-backdrop : Boolean (default true)
//   - dismiss-on-esc      : Boolean (default true)
//   - extra-class         : dodatkowe klasy CSS
//   - drawer-id           : id zewnętrzne
//
// Sloty:
//   - domyślny (body)
//   - header
//   - footer
//
// API:
//   .show()
//   .close(reason?)
//
// Eventy:
//   - psy-drawer-open
//   - psy-drawer-close { reason }
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import { FocusTrap, lockBodyScroll, unlockBodyScroll } from './_focus-trap.js';

const VALID_SIDE = new Set(['left', 'right']);

export class PsyDrawer extends LitElement {
    static properties = {
        open: { type: Boolean, reflect: true },
        side: { type: String, reflect: true },
        width: { type: String },
        title: { type: String },
        closable: { type: Boolean },
        dismissOnBackdrop: { type: Boolean, attribute: 'dismiss-on-backdrop' },
        dismissOnEsc: { type: Boolean, attribute: 'dismiss-on-esc' },
        extraClass: { type: String, attribute: 'extra-class' },
        drawerId: { type: String, attribute: 'drawer-id' }
    };

    constructor() {
        super();
        this.open = false;
        this.side = 'right';
        this.width = '480';
        this.title = '';
        this.closable = true;
        this.dismissOnBackdrop = true;
        this.dismissOnEsc = true;
        this.extraClass = '';
        this.drawerId = '';
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
        this.dispatchEvent(new CustomEvent('psy-drawer-close', {
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
        const panel = this.querySelector('.psy-drawer__panel');
        if (panel) {
            this._trap = new FocusTrap(panel);
            this._trap.activate();
        }
        this.dispatchEvent(new CustomEvent('psy-drawer-open', {
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
        if (ev.target === ev.currentTarget) {
            this.close('backdrop');
        }
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    _classes() {
        const side = VALID_SIDE.has(this.side) ? this.side : 'right';
        const classes = [
            'psy-drawer',
            `psy-drawer--${side}`
        ];
        if (this.open) classes.push('psy-drawer--open');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _style() {
        const w = String(this.width || '480').trim();
        const widthPx = /^\d+$/.test(w) ? `${w}px` : w;
        return `--psy-drawer-width:${widthPx};`;
    }

    render() {
        const hasHeader = this._hasNamedSlot('header');
        const hasFooter = this._hasNamedSlot('footer');

        return html`
            <div
                id=${ifDefined(this.drawerId || undefined)}
                class=${this._classes()}
                style=${this._style()}
                role="dialog"
                aria-modal="true"
                aria-hidden=${this.open ? 'false' : 'true'}
                aria-label=${ifDefined(this.title || undefined)}
            >
                <div
                    class="psy-drawer__backdrop"
                    @click=${this._onBackdropClick}
                ></div>

                <aside class="psy-drawer__panel" tabindex="-1">
                    ${hasHeader || this.title || this.closable ? html`
                        <div class="psy-drawer__header">
                            ${hasHeader
                                ? html`<slot name="header"></slot>`
                                : html`<h3 class="psy-drawer__title">${this.title}</h3>`}
                            ${this.closable ? html`
                                <button
                                    type="button"
                                    class="psy-drawer__close"
                                    aria-label="Zamknij"
                                    @click=${() => this.close('close-btn')}
                                >×</button>
                            ` : null}
                        </div>
                    ` : null}

                    <div class="psy-drawer__body">
                        <slot></slot>
                    </div>

                    ${hasFooter ? html`
                        <div class="psy-drawer__footer">
                            <slot name="footer"></slot>
                        </div>
                    ` : null}
                </aside>
            </div>
        `;
    }
}

if (!customElements.get('psy-drawer')) {
    customElements.define('psy-drawer', PsyDrawer);
}
