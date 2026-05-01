// ============================================================================
// psy-template-split - prosty szablon "lista po lewej, detale po prawej".
//
// W odróżnieniu od psy-template-list (który ma wbudowaną tabelę), ten szablon
// daje pełną kontrolę nad oboma panelami przez sloty. Idealny do:
//  - Pacjenci → Profil
//  - Załączniki → Podgląd
//  - Wizyty → Edycja
//
// Parametry:
//   - title           : tytuł widoku
//   - left-width      : szerokość lewej kolumny (default "340")
//   - min-left        : default "260"
//   - min-right       : default "320"
//   - collapse-at     : breakpoint stack (default "820")
//   - resizable       : Boolean (default true)
//   - persist-key     : klucz localStorage dla szerokości
//   - compact         : Boolean
//   - extra-class
//
// Sloty:
//   - list            : lewa kolumna (zwykle toolbar + lista/tabela + empty-state)
//   - detail          : prawa kolumna (zwykle psy-template-form lub dowolna treść)
//   - actions         : CTA w view__actions
//   - header-extra    : dodatkowa treść w nagłówku
//   - empty-detail    : widok gdy brak wybranego rekordu (zastępuje slot=detail)
//
// Atrybut `has-selection` (domyślnie true po podaniu .selectedId) decyduje,
// który slot prawej kolumny jest widoczny: detail vs empty-detail.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyTemplateSplit extends LitElement {
    static properties = {
        title: { type: String },
        leftWidth: { type: String, attribute: 'left-width' },
        minLeft: { type: String, attribute: 'min-left' },
        minRight: { type: String, attribute: 'min-right' },
        collapseAt: { type: String, attribute: 'collapse-at' },
        resizable: { type: Boolean },
        persistKey: { type: String, attribute: 'persist-key' },
        hasSelection: { type: Boolean, attribute: 'has-selection', reflect: true },
        compact: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.title = '';
        this.leftWidth = '340';
        this.minLeft = '260';
        this.minRight = '320';
        this.collapseAt = '820';
        this.resizable = true;
        this.persistKey = '';
        this.hasSelection = true;
        this.compact = false;
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['psy-template-split'];
        if (this.compact) classes.push('psy-template-split--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    render() {
        const hasActions = this._hasNamedSlot('actions');
        const hasHeaderExtra = this._hasNamedSlot('header-extra');
        const hasEmptyDetail = this._hasNamedSlot('empty-detail');
        const showEmpty = !this.hasSelection && hasEmptyDetail;

        return html`
            <psy-view
                class=${this._classes()}
                title=${ifDefined(this.title || undefined)}
                ?compact=${this.compact}
            >
                ${hasActions ? html`<slot name="actions" slot="actions"></slot>` : null}

                ${hasHeaderExtra ? html`
                    <div class="psy-template-split__header-extra" style="margin-bottom:8px;">
                        <slot name="header-extra"></slot>
                    </div>
                ` : null}

                <psy-split
                    left-width=${this.leftWidth}
                    min-left=${this.minLeft}
                    min-right=${this.minRight}
                    collapse-at=${this.collapseAt}
                    ?resizable=${this.resizable}
                    persist-key=${ifDefined(this.persistKey || undefined)}
                    ?compact=${this.compact}
                >
                    <div slot="left" class="psy-template-split__list">
                        <slot name="list"></slot>
                    </div>

                    <div slot="right" class="psy-template-split__detail">
                        ${showEmpty
                            ? html`<slot name="empty-detail"></slot>`
                            : html`<slot name="detail"></slot>`}
                    </div>
                </psy-split>
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-template-split')) {
    customElements.define('psy-template-split', PsyTemplateSplit);
}
