// ============================================================================
// psy-view-header - reusable view title/actions row
// ============================================================================

import { LitElement, html } from './lit.js';

export class PsyViewHeader extends LitElement {
    static properties = {
        title: { type: String },
        level: { type: String },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.title = '';
        this.level = '1';
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['view__header'];
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _renderHeading() {
        if (this.level === '2') return html`<h2>${this.title}</h2>`;
        if (this.level === '3') return html`<h3>${this.title}</h3>`;
        return html`<h1>${this.title}</h1>`;
    }

    render() {
        return html`
            <div class=${this._classes()}>
                ${this._renderHeading()}
                <slot name="actions"></slot>
            </div>
        `;
    }
}

if (!customElements.get('psy-view-header')) {
    customElements.define('psy-view-header', PsyViewHeader);
}
