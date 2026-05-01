// ============================================================================
// psy-stack - flex helper do układów pionowych/poziomych z gap
// (zastępuje .form-actions, paski przycisków, listy statusów, nagłówki).
//
// Atrybuty:
//   - direction : "column|row"                (default "column")
//   - gap       : "xs|sm|md|lg"               (default "md")
//   - align     : "start|center|end|stretch"  (align-items)
//   - justify   : "start|center|end|space-between|space-around"
//   - wrap      : Boolean                     (flex-wrap)
//   - compact   : Boolean                     (`psy-stack--compact`)
//   - extra-class : dodatkowe klasy CSS
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const VALID_DIRECTION = new Set(['column', 'row']);
const VALID_GAP = new Set(['xs', 'sm', 'md', 'lg']);
const VALID_ALIGN = new Set(['start', 'center', 'end', 'stretch']);
const VALID_JUSTIFY = new Set(['start', 'center', 'end', 'space-between', 'space-around']);

export class PsyStack extends LitElement {
    static properties = {
        direction: { type: String },
        gap: { type: String },
        align: { type: String },
        justify: { type: String },
        wrap: { type: Boolean, reflect: true },
        compact: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' },
        stackId: { type: String, attribute: 'stack-id' }
    };

    constructor() {
        super();
        this.direction = 'column';
        this.gap = 'md';
        this.align = 'stretch';
        this.justify = 'start';
        this.wrap = false;
        this.compact = false;
        this.extraClass = '';
        this.stackId = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const dir = VALID_DIRECTION.has(this.direction) ? this.direction : 'column';
        const gap = VALID_GAP.has(this.gap) ? this.gap : 'md';
        const align = VALID_ALIGN.has(this.align) ? this.align : 'stretch';
        const justify = VALID_JUSTIFY.has(this.justify) ? this.justify : 'start';

        const classes = [
            'psy-stack',
            `psy-stack--${dir}`,
            `psy-stack--gap-${gap}`,
            `psy-stack--align-${align}`,
            `psy-stack--justify-${justify}`
        ];
        if (this.wrap) classes.push('psy-stack--wrap');
        if (this.compact) classes.push('psy-stack--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    render() {
        return html`
            <div
                id=${ifDefined(this.stackId || undefined)}
                class=${this._classes()}
            >
                <slot></slot>
            </div>
        `;
    }
}

if (!customElements.get('psy-stack')) {
    customElements.define('psy-stack', PsyStack);
}
