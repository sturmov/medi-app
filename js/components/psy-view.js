// ============================================================================
// psy-view - kontener pojedynczego widoku (strony).
// Sloty: `header`, domyślny (body), `footer`, `actions` (w nagłówku).
// Atrybuty:
//   - view-id        : identyfikator widoku (dla routera / data-view)
//   - title          : tytuł w <h1> (pomijany, gdy jest slot="header")
//   - active         : czy widok jest aktualnie widoczny (class "active")
//   - compact        : czy tryb compact wymuszany lokalnie (class "psy-view--compact")
//   - max-width      : opcjonalne ograniczenie szerokości treści
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyView extends LitElement {
    static properties = {
        viewId: { type: String, attribute: 'view-id' },
        title: { type: String },
        active: { type: Boolean, reflect: true },
        compact: { type: Boolean, reflect: true },
        maxWidth: { type: String, attribute: 'max-width' },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.viewId = '';
        this.title = '';
        this.active = true;
        this.compact = false;
        this.maxWidth = '';
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['view', 'psy-view'];
        if (this.active) classes.push('active');
        if (this.compact) classes.push('psy-view--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    render() {
        const hasHeaderSlot = this._hasNamedSlot('header');
        const hasActionsSlot = this._hasNamedSlot('actions');
        const hasFooterSlot = this._hasNamedSlot('footer');
        const showHeader = hasHeaderSlot || this.title || hasActionsSlot;

        const style = this.maxWidth
            ? `max-width:${/^\d+$/.test(this.maxWidth) ? this.maxWidth + 'px' : this.maxWidth};`
            : '';

        return html`
            <section
                id=${ifDefined(this.viewId || undefined)}
                data-view=${ifDefined(this.viewId || undefined)}
                class=${this._classes()}
                style=${ifDefined(style || undefined)}
            >
                ${showHeader ? html`
                    <div class="psy-view__header view__header">
                        <div class="psy-view__header-main">
                            ${hasHeaderSlot
                                ? html`<slot name="header"></slot>`
                                : html`<h1 class="psy-view__title">${this.title}</h1>`}
                        </div>
                        ${hasActionsSlot ? html`
                            <div class="psy-view__actions">
                                <slot name="actions"></slot>
                            </div>
                        ` : null}
                    </div>
                ` : null}

                <div class="psy-view__body">
                    <slot></slot>
                </div>

                ${hasFooterSlot ? html`
                    <div class="psy-view__footer">
                        <slot name="footer"></slot>
                    </div>
                ` : null}
            </section>
        `;
    }
}

if (!customElements.get('psy-view')) {
    customElements.define('psy-view', PsyView);
}
