// ============================================================================
// psy-breadcrumbs - ścieżka nawigacyjna.
//
// Parametry:
//   - .items       : [{ id?, label, href?, disabled? }]
//   - separator    : znak separatora (default "›")
//   - extra-class
//
// Ostatni element jest traktowany jako aktywny (aria-current="page") i nie jest
// klikalny. Kliknięcie pozostałych emituje `psy-breadcrumb-click {id, index, item}`.
// Jeśli item ma `href` — zachowanie natywne (link), event nadal się emituje.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyBreadcrumbs extends LitElement {
    static properties = {
        items: { type: Array, attribute: false },
        separator: { type: String },
        extraClass: { type: String, attribute: 'extra-class' },
        breadcrumbsId: { type: String, attribute: 'breadcrumbs-id' }
    };

    constructor() {
        super();
        this.items = [];
        this.separator = '›';
        this.extraClass = '';
        this.breadcrumbsId = '';
    }

    createRenderRoot() {
        return this;
    }

    _normalized() {
        let arr = this.items;
        if (typeof arr === 'string' && arr.trim()) {
            try { arr = JSON.parse(arr); } catch (_) { arr = []; }
        }
        if (!Array.isArray(arr)) return [];
        return arr
            .map((it, idx) => {
                if (!it || typeof it !== 'object') return null;
                const label = it.label != null ? String(it.label) : '';
                if (!label) return null;
                return {
                    id: it.id != null ? String(it.id) : String(idx),
                    label,
                    href: it.href || '',
                    disabled: !!it.disabled
                };
            })
            .filter(Boolean);
    }

    _classes() {
        const classes = ['psy-breadcrumbs'];
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _onItemClick(ev, item, index, isLast) {
        if (item.disabled || isLast) {
            ev.preventDefault();
            return;
        }
        this.dispatchEvent(new CustomEvent('psy-breadcrumb-click', {
            detail: { id: item.id, index, item },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        const items = this._normalized();
        if (!items.length) return html``;

        return html`
            <nav
                id=${ifDefined(this.breadcrumbsId || undefined)}
                class=${this._classes()}
                aria-label="Ścieżka nawigacyjna"
            >
                <ol class="psy-breadcrumbs__list">
                    ${items.map((item, idx) => {
                        const isLast = idx === items.length - 1;
                        const itemClasses = [
                            'psy-breadcrumbs__item',
                            isLast ? 'psy-breadcrumbs__item--current' : '',
                            item.disabled ? 'psy-breadcrumbs__item--disabled' : ''
                        ].filter(Boolean).join(' ');

                        const link = isLast
                            ? html`<span class="psy-breadcrumbs__link" aria-current="page">${item.label}</span>`
                            : (item.href
                                ? html`<a
                                        class="psy-breadcrumbs__link"
                                        href=${item.href}
                                        @click=${(ev) => this._onItemClick(ev, item, idx, isLast)}
                                    >${item.label}</a>`
                                : html`<button
                                        type="button"
                                        class="psy-breadcrumbs__link"
                                        ?disabled=${item.disabled}
                                        @click=${(ev) => this._onItemClick(ev, item, idx, isLast)}
                                    >${item.label}</button>`);

                        return html`
                            <li class=${itemClasses}>
                                ${link}
                                ${!isLast ? html`
                                    <span class="psy-breadcrumbs__separator" aria-hidden="true">${this.separator}</span>
                                ` : null}
                            </li>
                        `;
                    })}
                </ol>
            </nav>
        `;
    }
}

if (!customElements.get('psy-breadcrumbs')) {
    customElements.define('psy-breadcrumbs', PsyBreadcrumbs);
}
