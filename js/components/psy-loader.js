// ============================================================================
// psy-loader - wskaźnik ładowania (spinner / dots / skeleton).
//
// Atrybuty:
//   - variant   : "spinner|dots|skeleton"       (default "spinner")
//   - size      : "sm|md|lg"                    (default "md")
//   - label     : tekst ARIA (default "Ładowanie…")
//   - centered  : Boolean  - flex center w kontenerze
//   - overlay   : Boolean  - absolute + półprzezroczysty nakład (użycie w `position:relative` rodzicu)
//   - lines     : liczba "szkieletowych" wierszy (dla variant="skeleton", default 3)
//   - extra-class
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const VALID_VARIANT = new Set(['spinner', 'dots', 'skeleton']);
const VALID_SIZE = new Set(['sm', 'md', 'lg']);

export class PsyLoader extends LitElement {
    static properties = {
        variant: { type: String, reflect: true },
        size: { type: String, reflect: true },
        label: { type: String },
        centered: { type: Boolean, reflect: true },
        overlay: { type: Boolean, reflect: true },
        lines: { type: Number },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.variant = 'spinner';
        this.size = 'md';
        this.label = 'Ładowanie…';
        this.centered = false;
        this.overlay = false;
        this.lines = 3;
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const variant = VALID_VARIANT.has(this.variant) ? this.variant : 'spinner';
        const size = VALID_SIZE.has(this.size) ? this.size : 'md';
        const classes = [
            'psy-loader',
            `psy-loader--${variant}`,
            `psy-loader--${size}`
        ];
        if (this.centered) classes.push('psy-loader--centered');
        if (this.overlay) classes.push('psy-loader--overlay');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _renderBody() {
        switch (this.variant) {
            case 'dots':
                return html`
                    <span class="psy-loader__dot"></span>
                    <span class="psy-loader__dot"></span>
                    <span class="psy-loader__dot"></span>
                `;
            case 'skeleton': {
                const n = Math.max(1, Math.min(10, Number(this.lines) || 3));
                const rows = [];
                for (let i = 0; i < n; i += 1) {
                    rows.push(html`<span class="psy-loader__skeleton-row"></span>`);
                }
                return html`<div class="psy-loader__skeleton">${rows}</div>`;
            }
            case 'spinner':
            default:
                return html`<span class="psy-loader__spinner"></span>`;
        }
    }

    render() {
        return html`
            <div
                class=${this._classes()}
                role="status"
                aria-live="polite"
                aria-label=${ifDefined(this.label || undefined)}
            >
                ${this._renderBody()}
                ${this.label && this.variant !== 'skeleton' ? html`
                    <span class="psy-loader__label">${this.label}</span>
                ` : null}
            </div>
        `;
    }
}

if (!customElements.get('psy-loader')) {
    customElements.define('psy-loader', PsyLoader);
}
