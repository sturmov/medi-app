// ============================================================================
// psy-grid - helper CSS Grid dla układu kafelków/KPI/kompozycji treści
// niebędącej polami formularza (`psy-field-group` służy do pól).
//
// Atrybuty:
//   - columns   : "1|2|3|4|auto"   (default "auto")
//   - min       : "180"             (minimalna szerokość kolumny w trybie auto)
//   - gap       : "xs|sm|md|lg"     (default "md")
//   - align     : "start|center|stretch"  (align-items)
//   - compact   : Boolean                   (klasa `psy-grid--compact`)
//   - extra-class : dodatkowe klasy CSS
//
// Wszystkie reguły w Light DOM, styl w `css/compat.css`.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const VALID_COLUMNS = new Set(['1', '2', '3', '4', 'auto']);
const VALID_GAP = new Set(['xs', 'sm', 'md', 'lg']);
const VALID_ALIGN = new Set(['start', 'center', 'stretch']);

export class PsyGrid extends LitElement {
    static properties = {
        columns: { type: String },
        min: { type: String },
        gap: { type: String },
        align: { type: String },
        compact: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' },
        gridId: { type: String, attribute: 'grid-id' }
    };

    constructor() {
        super();
        this.columns = 'auto';
        this.min = '220';
        this.gap = 'md';
        this.align = 'stretch';
        this.compact = false;
        this.extraClass = '';
        this.gridId = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const cols = VALID_COLUMNS.has(this.columns) ? this.columns : 'auto';
        const gap = VALID_GAP.has(this.gap) ? this.gap : 'md';
        const align = VALID_ALIGN.has(this.align) ? this.align : 'stretch';

        const classes = [
            'psy-grid',
            `psy-grid--cols-${cols}`,
            `psy-grid--gap-${gap}`,
            `psy-grid--align-${align}`
        ];
        if (this.compact) classes.push('psy-grid--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _style() {
        // `--psy-grid-min` używane tylko w trybie `columns="auto"`.
        const minPx = String(this.min || '').trim();
        if (!minPx) return undefined;
        const withUnit = /^\d+$/.test(minPx) ? `${minPx}px` : minPx;
        return `--psy-grid-min:${withUnit};`;
    }

    render() {
        return html`
            <div
                id=${ifDefined(this.gridId || undefined)}
                class=${this._classes()}
                style=${ifDefined(this._style())}
            >
                <slot></slot>
            </div>
        `;
    }
}

if (!customElements.get('psy-grid')) {
    customElements.define('psy-grid', PsyGrid);
}
