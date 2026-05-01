// ============================================================================
// psy-topbar - górny pasek aplikacji (sloty: left / center / right).
// Brak logiki biznesowej - służy wyłącznie do kompozycji.
// Emituje `psy-toggle-sidebar` po kliknięciu w domyślny przycisk "menu"
// (renderowany gdy atrybut `show-toggle` jest obecny).
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyTopbar extends LitElement {
    static properties = {
        brand: { type: String },
        showToggle: { type: Boolean, attribute: 'show-toggle' },
        extraClass: { type: String, attribute: 'extra-class' },
        topbarId: { type: String, attribute: 'topbar-id' },
        fixed: { type: Boolean }
    };

    constructor() {
        super();
        this.brand = '';
        this.showToggle = false;
        this.extraClass = '';
        this.topbarId = '';
        this.fixed = false;
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['psy-topbar'];
        if (this.fixed) classes.push('psy-topbar--fixed', 'top-bar');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _onToggle() {
        this.dispatchEvent(new CustomEvent('psy-toggle-sidebar', {
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <header
                id=${ifDefined(this.topbarId || undefined)}
                class=${this._classes()}
                role="banner"
            >
                <div class="psy-topbar__left top-bar__left">
                    ${this.showToggle ? html`
                        <button
                            type="button"
                            class="sidebar-toggle psy-topbar__toggle"
                            aria-label="Przełącz nawigację"
                            @click=${this._onToggle}
                        >☰</button>
                    ` : null}
                    ${this.brand
                        ? html`<div class="psy-topbar__brand top-bar__brand">${this.brand}</div>`
                        : null}
                    <slot name="left"></slot>
                </div>

                <div class="psy-topbar__center">
                    <slot name="center"></slot>
                </div>

                <div class="psy-topbar__right top-bar__actions">
                    <slot name="right"></slot>
                </div>
            </header>
        `;
    }
}

if (!customElements.get('psy-topbar')) {
    customElements.define('psy-topbar', PsyTopbar);
}
