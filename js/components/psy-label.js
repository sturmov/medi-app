// ============================================================================
// psy-label - reusable label primitive
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyLabel extends LitElement {
    static properties = {
        forId: { type: String, attribute: 'for-id' },
        text: { type: String },
        srOnly: { type: Boolean, attribute: 'sr-only' },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.forId = '';
        this.text = '';
        this.srOnly = false;
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = [];
        if (this.srOnly) classes.push('sr-only');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    render() {
        const classes = this._classes();
        return html`
            <label
                for=${ifDefined(this.forId || undefined)}
                class=${ifDefined(classes || undefined)}
            >
                <slot>${this.text}</slot>
            </label>
        `;
    }
}

if (!customElements.get('psy-label')) {
    customElements.define('psy-label', PsyLabel);
}
