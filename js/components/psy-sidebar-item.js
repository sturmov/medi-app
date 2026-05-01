// ============================================================================
// psy-sidebar-item - pojedynczy element nawigacji w sidebarze.
// Emituje `psy-nav { id }` po kliknięciu (o ile nie disabled).
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsySidebarItem extends LitElement {
    static properties = {
        itemId: { type: String, attribute: 'item-id' },
        label: { type: String },
        icon: { type: String },
        badge: { type: String },
        active: { type: Boolean, reflect: true },
        disabled: { type: Boolean, reflect: true },
        level: { type: Number },
        collapsed: { type: Boolean, reflect: true }
    };

    constructor() {
        super();
        this.itemId = '';
        this.label = '';
        this.icon = '';
        this.badge = '';
        this.active = false;
        this.disabled = false;
        this.level = 1;
        this.collapsed = false;
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['sidebar__item', 'psy-sidebar__item'];
        if (this.active) classes.push('active');
        if (this.disabled) classes.push('disabled');
        if (this.level && this.level > 1) classes.push(`psy-sidebar__item--l${this.level}`);
        return classes.join(' ');
    }

    _onClick(e) {
        if (this.disabled) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        this.dispatchEvent(new CustomEvent('psy-nav', {
            detail: { id: this.itemId, label: this.label },
            bubbles: true,
            composed: true
        }));
    }

    _onKeydown(e) {
        if (this.disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._onClick(e);
        }
    }

    render() {
        return html`
            <li
                class=${this._classes()}
                data-item-id=${ifDefined(this.itemId || undefined)}
                data-view=${ifDefined(this.itemId || undefined)}
                role="menuitem"
                tabindex=${this.disabled ? '-1' : '0'}
                aria-current=${this.active ? 'page' : 'false'}
                aria-disabled=${this.disabled ? 'true' : 'false'}
                @click=${this._onClick}
                @keydown=${this._onKeydown}
            >
                ${this.icon
                    ? html`<span class="sidebar__icon psy-sidebar__icon" aria-hidden="true">${this.icon}</span>`
                    : null}
                <span class="sidebar__label psy-sidebar__label">${this.label}</span>
                ${this.badge
                    ? html`<span class="psy-sidebar__badge">${this.badge}</span>`
                    : null}
            </li>
        `;
    }
}

if (!customElements.get('psy-sidebar-item')) {
    customElements.define('psy-sidebar-item', PsySidebarItem);
}
