// ============================================================================
// psy-sidebar - boczna nawigacja zasilana tablicą sekcji.
//
// Przykład użycia:
//   <psy-sidebar
//     .sections=${[
//       { id: 'patients',   label: 'Pacjenci',   icon: '📋' },
//       { id: 'visits',     label: 'Wizyty',     icon: '🗓️', badge: '3' },
//       { id: 'documents',  label: 'Dokumenty',  icon: '📄', children: [
//           { id: 'docs-cert', label: 'Zaświadczenie' },
//           { id: 'docs-ref',  label: 'Skierowanie' }
//       ]}
//     ]}
//     active-id="patients"
//   ></psy-sidebar>
//
// Emituje `psy-nav { id }` z psy-sidebar-item (relayowane przez bąbelkowanie).
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';
import './psy-sidebar-item.js';

export class PsySidebar extends LitElement {
    static properties = {
        sections: { type: Object, attribute: false },
        activeId: { type: String, attribute: 'active-id', reflect: true },
        collapsed: { type: Boolean, reflect: true },
        open: { type: Boolean, reflect: true },
        sidebarId: { type: String, attribute: 'sidebar-id' },
        extraClass: { type: String, attribute: 'extra-class' },
        fixed: { type: Boolean }
    };

    constructor() {
        super();
        this.sections = [];
        this.activeId = '';
        this.collapsed = false;
        this.open = false;
        this.sidebarId = '';
        this.extraClass = '';
        this.fixed = false;
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['psy-sidebar'];
        if (this.fixed) classes.push('psy-sidebar--fixed', 'sidebar');
        if (this.collapsed) classes.push('psy-sidebar--collapsed');
        if (this.open) classes.push('open');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _normalizeSections() {
        if (Array.isArray(this.sections)) return this.sections;
        if (typeof this.sections === 'string' && this.sections.trim()) {
            try {
                const parsed = JSON.parse(this.sections);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
        }
        return [];
    }

    _isActive(id) {
        return !!this.activeId && this.activeId === id;
    }

    _hasActiveDescendant(section) {
        if (!section || !Array.isArray(section.children)) return false;
        return section.children.some((c) => this._isActive(c.id) || this._hasActiveDescendant(c));
    }

    _renderItem(section, level) {
        const hasChildren = Array.isArray(section.children) && section.children.length > 0;

        if (!hasChildren) {
            return html`
                <psy-sidebar-item
                    item-id=${ifDefined(section.id || undefined)}
                    label=${ifDefined(section.label || undefined)}
                    icon=${ifDefined(section.icon || undefined)}
                    badge=${ifDefined(section.badge || undefined)}
                    level=${level || 1}
                    ?active=${this._isActive(section.id)}
                    ?disabled=${!!section.disabled}
                ></psy-sidebar-item>
            `;
        }

        const open = section.open === true
            || this._hasActiveDescendant(section);

        return html`
            <li class="psy-sidebar__group" data-group-id=${ifDefined(section.id || undefined)}>
                <details class="psy-sidebar__details" ?open=${open}>
                    <summary class="psy-sidebar__group-summary sidebar__item psy-sidebar__item psy-sidebar__item--group">
                        ${section.icon
                            ? html`<span class="sidebar__icon psy-sidebar__icon" aria-hidden="true">${section.icon}</span>`
                            : null}
                        <span class="sidebar__label psy-sidebar__label">${section.label}</span>
                        ${section.badge
                            ? html`<span class="psy-sidebar__badge">${section.badge}</span>`
                            : null}
                        <span class="psy-sidebar__chevron" aria-hidden="true">▾</span>
                    </summary>
                    <ul class="psy-sidebar__nav psy-sidebar__nav--sub" role="menu">
                        ${section.children.map((child) => this._renderItem(child, (level || 1) + 1))}
                    </ul>
                </details>
            </li>
        `;
    }

    render() {
        const items = this._normalizeSections();

        return html`
            <nav
                id=${ifDefined(this.sidebarId || undefined)}
                class=${this._classes()}
                aria-label="Nawigacja główna"
            >
                <ul class="sidebar__nav psy-sidebar__nav" role="menu">
                    ${items.map((section) => this._renderItem(section, 1))}
                </ul>
                <slot name="footer"></slot>
            </nav>
        `;
    }
}

if (!customElements.get('psy-sidebar')) {
    customElements.define('psy-sidebar', PsySidebar);
}
