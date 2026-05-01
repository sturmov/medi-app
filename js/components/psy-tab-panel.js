// ============================================================================
// psy-tab-panel - dziecko `psy-tabs`. Przechowuje metadane zakładki
// (label/icon/badge/disabled) oraz jej treść.
//
// `psy-tabs` odczytuje atrybuty dzieci i renderuje listę zakładek osobno.
// Panel w stanie nieaktywnym dostaje atrybut `hidden` i odpowiednie aria-*.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyTabPanel extends LitElement {
    static properties = {
        tabId: { type: String, attribute: 'tab-id', reflect: true },
        label: { type: String, reflect: true },
        icon: { type: String, reflect: true },
        badge: { type: String, reflect: true },
        disabled: { type: Boolean, reflect: true },
        active: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.tabId = '';
        this.label = '';
        this.icon = '';
        this.badge = '';
        this.disabled = false;
        this.active = false;
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    updated(changed) {
        if (changed.has('active')) {
            if (this.active) {
                this.removeAttribute('hidden');
                this.setAttribute('aria-hidden', 'false');
            } else {
                this.setAttribute('hidden', '');
                this.setAttribute('aria-hidden', 'true');
            }
        }
    }

    _classes() {
        const classes = ['psy-tab-panel'];
        if (this.active) classes.push('psy-tab-panel--active');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    render() {
        return html`
            <div
                class=${this._classes()}
                role="tabpanel"
                data-tab-id=${ifDefined(this.tabId || undefined)}
                tabindex="0"
            >
                <slot></slot>
            </div>
        `;
    }
}

if (!customElements.get('psy-tab-panel')) {
    customElements.define('psy-tab-panel', PsyTabPanel);
}
