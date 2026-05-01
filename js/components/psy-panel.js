// ============================================================================
// psy-panel - semantic alias for card/panel blocks
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyPanel extends LitElement {
    static properties = {
        title: { type: String },
        panelClass: { type: String, attribute: 'panel-class' },
        panelId: { type: String, attribute: 'panel-id' },
        titleClass: { type: String, attribute: 'title-class' },
        bodyClass: { type: String, attribute: 'body-class' }
    };

    constructor() {
        super();
        this.title = '';
        this.panelClass = '';
        this.panelId = '';
        this.titleClass = '';
        this.bodyClass = '';
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
            <section id=${ifDefined(this.panelId || undefined)} class=${this._classes('card', this.panelClass)}>
                ${this.title
                    ? html`<h2 class=${this._classes('card__title', this.titleClass)}>${this.title}</h2>`
                    : html`<slot name="title"></slot>`}
                <div class=${this._classes('card__body', this.bodyClass)}>
                    <slot></slot>
                </div>
            </section>
        `;
    }
}

if (!customElements.get('psy-panel')) {
    customElements.define('psy-panel', PsyPanel);
}
