// ============================================================================
// psy-template-list - szablon widoku listowego (lista + opcjonalne detale).
//
// Parametry:
//   - title             : tytuł widoku
//   - .items            : tablica rekordów (dowolny kształt)
//   - .columns          : [{key, label, render?, width?, align?}]
//                         `render(item)` zwraca string lub Node
//   - searchable        : Boolean - czy pokazać psy-search-input w toolbarze
//   - search-placeholder
//   - search-value      : kontrolowany string wyszukiwania
//   - .filters          : [{id, label, options:[{value,label}], value}]
//   - selected-id       : id aktualnie wybranego rekordu (highlight)
//   - item-id-key       : pole z items używane jako id (default "id")
//   - loader            : Boolean - czy pokazać spinner nad tabelą
//   - .empty-state      : {icon, title, description, variant?}
//   - has-detail        : Boolean - dwukolumnowy układ z detalem po prawej
//   - detail-width      : szerokość lewej kolumny listy (default "360")
//   - compact           : Boolean
//   - extra-class
//
// Sloty:
//   - detail            : treść panelu detali (przy has-detail)
//   - toolbar-extra     : dodatkowe elementy toolbaru
//   - actions           : CTA w view__actions
//   - row-actions       : przyciski per-wiersz (dla każdego rekordu klonowane)
//                         (parametr render jest preferowany)
//
// Eventy:
//   - psy-item-select     { id, item }
//   - psy-filter-change   { id, value }
//   - psy-search-change   { value }
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyTemplateList extends LitElement {
    static properties = {
        title: { type: String },
        items: { type: Array, attribute: false },
        columns: { type: Array, attribute: false },
        searchable: { type: Boolean },
        searchPlaceholder: { type: String, attribute: 'search-placeholder' },
        searchValue: { type: String, attribute: 'search-value' },
        filters: { type: Array, attribute: false },
        selectedId: { type: String, attribute: 'selected-id' },
        itemIdKey: { type: String, attribute: 'item-id-key' },
        loader: { type: Boolean },
        emptyState: { type: Object, attribute: false },
        hasDetail: { type: Boolean, attribute: 'has-detail' },
        detailWidth: { type: String, attribute: 'detail-width' },
        compact: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.title = '';
        this.items = [];
        this.columns = [];
        this.searchable = false;
        this.searchPlaceholder = 'Szukaj...';
        this.searchValue = '';
        this.filters = [];
        this.selectedId = '';
        this.itemIdKey = 'id';
        this.loader = false;
        this.emptyState = null;
        this.hasDetail = false;
        this.detailWidth = '360';
        this.compact = false;
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['psy-template-list'];
        if (this.compact) classes.push('psy-template-list--compact');
        if (this.hasDetail) classes.push('psy-template-list--with-detail');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    _getId(item) {
        if (!item || typeof item !== 'object') return '';
        return item[this.itemIdKey] != null ? String(item[this.itemIdKey]) : '';
    }

    _onRowClick(item) {
        const id = this._getId(item);
        this.dispatchEvent(new CustomEvent('psy-item-select', {
            detail: { id, item },
            bubbles: true,
            composed: true
        }));
    }

    _onSearchInput(ev) {
        const value = ev.target.value || '';
        this.searchValue = value;
        this.dispatchEvent(new CustomEvent('psy-search-change', {
            detail: { value },
            bubbles: true,
            composed: true
        }));
    }

    _onFilterChange(filterId, ev) {
        const value = ev.target.value;
        this.dispatchEvent(new CustomEvent('psy-filter-change', {
            detail: { id: filterId, value },
            bubbles: true,
            composed: true
        }));
    }

    _renderCell(item, column) {
        if (typeof column.render === 'function') {
            return column.render(item);
        }
        const value = item && column.key ? item[column.key] : '';
        return value != null ? String(value) : '';
    }

    _renderTable() {
        const cols = Array.isArray(this.columns) ? this.columns : [];
        const rows = Array.isArray(this.items) ? this.items : [];

        if (this.loader) {
            return html`<psy-loader variant="spinner" size="md" label="Ładowanie…" centered></psy-loader>`;
        }

        if (!rows.length) {
            if (this.emptyState) {
                const e = this.emptyState;
                return html`
                    <psy-empty-state
                        icon=${ifDefined(e.icon || undefined)}
                        title=${ifDefined(e.title || undefined)}
                        description=${ifDefined(e.description || undefined)}
                        variant=${ifDefined(e.variant || undefined)}
                    ></psy-empty-state>
                `;
            }
            return html`
                <psy-empty-state
                    icon="📭"
                    title="Brak wyników"
                    description="Lista jest pusta lub nie pasuje do bieżącego filtra."
                ></psy-empty-state>
            `;
        }

        return html`
            <table class="psy-template-list__table results-table">
                ${cols.length ? html`
                    <thead>
                        <tr>
                            ${cols.map((c) => html`
                                <th
                                    style=${ifDefined(c.width ? `width:${c.width};` : undefined)}
                                    class=${ifDefined(c.align ? `psy-text-${c.align}` : undefined)}
                                >${c.label || ''}</th>
                            `)}
                        </tr>
                    </thead>
                ` : null}
                <tbody>
                    ${rows.map((item) => {
                        const id = this._getId(item);
                        const isSelected = id && id === this.selectedId;
                        return html`
                            <tr
                                class=${`psy-template-list__row ${isSelected ? 'psy-template-list__row--selected' : ''}`}
                                @click=${() => this._onRowClick(item)}
                                tabindex="0"
                                @keydown=${(ev) => {
                                    if (ev.key === 'Enter' || ev.key === ' ') {
                                        ev.preventDefault();
                                        this._onRowClick(item);
                                    }
                                }}
                            >
                                ${cols.map((c) => html`
                                    <td class=${ifDefined(c.align ? `psy-text-${c.align}` : undefined)}>
                                        ${this._renderCell(item, c)}
                                    </td>
                                `)}
                            </tr>
                        `;
                    })}
                </tbody>
            </table>
        `;
    }

    _renderToolbar() {
        const hasSearch = this.searchable;
        const hasFilters = Array.isArray(this.filters) && this.filters.length > 0;
        const hasToolbarExtra = this._hasNamedSlot('toolbar-extra');

        if (!hasSearch && !hasFilters && !hasToolbarExtra) return null;

        return html`
            <psy-toolbar ?compact=${this.compact}>
                ${hasSearch ? html`
                    <psy-search-input
                        slot="search"
                        field-id=${`psy-tpl-list-search-${this.title || 'list'}`}
                        placeholder=${this.searchPlaceholder}
                        value=${ifDefined(this.searchValue || undefined)}
                        @input=${this._onSearchInput.bind(this)}
                    ></psy-search-input>
                ` : null}

                ${hasFilters ? this.filters.map((f) => html`
                    <select
                        slot="filters"
                        class="input input--sm"
                        @change=${(ev) => this._onFilterChange(f.id, ev)}
                    >
                        ${(f.options || []).map((opt) => html`
                            <option
                                value=${opt.value}
                                ?selected=${opt.value === f.value}
                            >${opt.label}</option>
                        `)}
                    </select>
                `) : null}

                <slot name="toolbar-extra" slot="filters"></slot>
            </psy-toolbar>
        `;
    }

    _renderBody() {
        const toolbar = this._renderToolbar();
        const table = this._renderTable();

        if (!this.hasDetail) {
            return html`
                ${toolbar}
                ${table}
            `;
        }

        return html`
            <psy-split
                left-width=${this.detailWidth}
                min-left="260"
                min-right="320"
                collapse-at="800"
                resizable
                persist-key=${`tpl-list-${this.title || 'default'}`}
            >
                <div slot="left" class="psy-template-list__pane">
                    ${toolbar}
                    ${table}
                </div>
                <div slot="right" class="psy-template-list__detail">
                    <slot name="detail"></slot>
                </div>
            </psy-split>
        `;
    }

    render() {
        const hasActions = this._hasNamedSlot('actions');

        return html`
            <psy-view
                class=${this._classes()}
                title=${ifDefined(this.title || undefined)}
                ?compact=${this.compact}
            >
                ${hasActions ? html`<slot name="actions" slot="actions"></slot>` : null}
                ${this._renderBody()}
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-template-list')) {
    customElements.define('psy-template-list', PsyTemplateList);
}
