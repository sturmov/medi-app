// ============================================================================
// psy-field-group - reusable form layout wrapper (1/2/3 columns or auto)
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyFieldGroup extends LitElement {
    static properties = {
        columns: { type: String },
        gap: { type: String },
        minColumnWidth: { type: String, attribute: 'min-column-width' },
        compact: { type: Boolean },
        extraClass: { type: String, attribute: 'extra-class' },
        groupId: { type: String, attribute: 'group-id' }
    };

    constructor() {
        super();
        this.columns = 'auto';
        this.gap = '';
        this.minColumnWidth = '';
        this.compact = false;
        this.extraClass = '';
        this.groupId = '';
    }

    createRenderRoot() {
        return this;
    }

    _normalizedColumns() {
        const raw = String(this.columns || 'auto').trim().toLowerCase();
        if (raw === '1' || raw === '2' || raw === '3' || raw === 'auto') {
            return raw;
        }
        return 'auto';
    }

    _classes() {
        const columns = this._normalizedColumns();
        const classes = ['psy-field-group', `psy-field-group--${columns}`];

        if (this.compact) classes.push('psy-field-group--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }

        return classes.join(' ');
    }

    _style() {
        const styles = [];

        if (this.gap) {
            styles.push(`--psy-field-group-gap:${this.gap}`);
        }

        if (this.minColumnWidth) {
            styles.push(`--psy-field-group-min:${this.minColumnWidth}`);
        }

        return styles.length ? styles.join(';') : undefined;
    }

    render() {
        return html`
            <div
                id=${ifDefined(this.groupId || undefined)}
                class=${this._classes()}
                style=${ifDefined(this._style())}
            >
                <slot></slot>
            </div>
        `;
    }
}

if (!customElements.get('psy-field-group')) {
    customElements.define('psy-field-group', PsyFieldGroup);
}
