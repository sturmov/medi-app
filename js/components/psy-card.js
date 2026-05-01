// ============================================================================
// psy-card - reusable panel/card primitive
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyCard extends LitElement {
    static properties = {
        title: { type: String },
        cardClass: { type: String, attribute: 'card-class' },
        cardId: { type: String, attribute: 'card-id' },
        titleClass: { type: String, attribute: 'title-class' },
        bodyClass: { type: String, attribute: 'body-class' },
        noBodyWrap: { type: Boolean, attribute: 'no-body-wrap' }
    };

    constructor() {
        super();
        this.title = '';
        this.cardClass = '';
        this.cardId = '';
        this.titleClass = '';
        this.bodyClass = '';
        this.noBodyWrap = false;
    }

    createRenderRoot() {
        return this;
    }

    _classes(base, extra) {
        const classes = [base];
        if (extra) {
            classes.push(...String(extra).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    render() {
        return html`
            <div id=${ifDefined(this.cardId || undefined)} class=${this._classes('card', this.cardClass)}>
                ${this.title
                    ? html`<h2 class=${this._classes('card__title', this.titleClass)}>${this.title}</h2>`
                    : html`<slot name="title"></slot>`}

                ${this.noBodyWrap
                    ? html`<slot></slot>`
                    : html`<div class=${this._classes('card__body', this.bodyClass)}><slot></slot></div>`}
            </div>
        `;
    }
}

if (!customElements.get('psy-card')) {
    customElements.define('psy-card', PsyCard);
}
