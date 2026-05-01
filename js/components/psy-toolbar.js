// ============================================================================
// psy-toolbar - pasek akcji nad listami/tabelami/formularzami.
// Sloty:
//   - `search`  (lewa strona, np. <psy-search-input>)
//   - `filters` (środek, filtry dropdown / chipy)
//   - domyślny / `actions` (prawa strona, CTA)
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyToolbar extends LitElement {
    static properties = {
        extraClass: { type: String, attribute: 'extra-class' },
        toolbarId: { type: String, attribute: 'toolbar-id' },
        compact: { type: Boolean, reflect: true },
        wrap: { type: Boolean, reflect: true }
    };

    constructor() {
        super();
        this.extraClass = '';
        this.toolbarId = '';
        this.compact = false;
        this.wrap = true;
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['psy-toolbar'];
        if (this.compact) classes.push('psy-toolbar--compact');
        if (this.wrap) classes.push('psy-toolbar--wrap');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    render() {
        const hasSearch = this._hasNamedSlot('search');
        const hasFilters = this._hasNamedSlot('filters');
        const hasActions = this._hasNamedSlot('actions');

        return html`
            <div
                id=${ifDefined(this.toolbarId || undefined)}
                class=${this._classes()}
                role="toolbar"
            >
                ${hasSearch ? html`
                    <div class="psy-toolbar__search">
                        <slot name="search"></slot>
                    </div>
                ` : null}

                ${hasFilters ? html`
                    <div class="psy-toolbar__filters">
                        <slot name="filters"></slot>
                    </div>
                ` : null}

                <div class="psy-toolbar__actions">
                    ${hasActions ? html`<slot name="actions"></slot>` : null}
                    <slot></slot>
                </div>
            </div>
        `;
    }
}

if (!customElements.get('psy-toolbar')) {
    customElements.define('psy-toolbar', PsyToolbar);
}
