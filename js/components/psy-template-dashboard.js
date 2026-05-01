// ============================================================================
// psy-template-dashboard - szablon widoku "dashboard" (KPI + sekcje).
//
// Parametry:
//   - title        : tytuł widoku
//   - .kpis        : [{label, value, unit?, variant?, icon?, trend?, trendDir?}]
//                    variant: "info|success|warning|danger|neutral"
//                    trendDir: "up|down|neutral"
//   - .sections    : [{id, title, columns?}] — nagłówki sekcji treści; treść przez slot="section-{id}"
//   - kpi-min      : minimalna szerokość KPI w auto-grid                (default "180")
//   - loader       : Boolean - pokaż spinner w miejscu KPI (ładowanie)
//   - compact
//   - extra-class
//
// Sloty:
//   - actions         : akcje CTA w view__actions
//   - section-{id}    : treść sekcji {id}
//   - header-extra    : dodatkowa treść w nagłówku (np. breadcrumbs/filter)
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const TREND_ICON = { up: '▲', down: '▼', neutral: '·' };

export class PsyTemplateDashboard extends LitElement {
    static properties = {
        title: { type: String },
        kpis: { type: Array, attribute: false },
        sections: { type: Array, attribute: false },
        kpiMin: { type: String, attribute: 'kpi-min' },
        loader: { type: Boolean },
        compact: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.title = '';
        this.kpis = [];
        this.sections = [];
        this.kpiMin = '180';
        this.loader = false;
        this.compact = false;
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['psy-template-dashboard'];
        if (this.compact) classes.push('psy-template-dashboard--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    _renderKpi(kpi) {
        const variant = kpi.variant || 'info';
        return html`
            <div class=${`psy-template-dashboard__kpi psy-template-dashboard__kpi--${variant}`}>
                <div class="psy-template-dashboard__kpi-head">
                    ${kpi.icon ? html`<span class="psy-template-dashboard__kpi-icon" aria-hidden="true">${kpi.icon}</span>` : null}
                    <span class="psy-template-dashboard__kpi-label">${kpi.label || ''}</span>
                </div>
                <div class="psy-template-dashboard__kpi-value">
                    ${kpi.value != null ? String(kpi.value) : '—'}
                    ${kpi.unit ? html`<span class="psy-template-dashboard__kpi-unit">${kpi.unit}</span>` : null}
                </div>
                ${(kpi.trend || kpi.trendDir) ? html`
                    <div class=${`psy-template-dashboard__kpi-trend psy-template-dashboard__kpi-trend--${kpi.trendDir || 'neutral'}`}>
                        <span class="psy-template-dashboard__kpi-trend-icon">${TREND_ICON[kpi.trendDir || 'neutral']}</span>
                        <span class="psy-template-dashboard__kpi-trend-label">${kpi.trend || ''}</span>
                    </div>
                ` : null}
            </div>
        `;
    }

    _renderKpis() {
        if (this.loader) {
            return html`<psy-loader variant="skeleton" lines="3"></psy-loader>`;
        }
        const kpis = Array.isArray(this.kpis) ? this.kpis : [];
        if (!kpis.length) return null;
        return html`
            <psy-grid columns="auto" min=${this.kpiMin} gap="md">
                ${kpis.map((k) => this._renderKpi(k))}
            </psy-grid>
        `;
    }

    _renderSections() {
        const sections = Array.isArray(this.sections) ? this.sections : [];
        if (!sections.length) return html`<slot></slot>`;

        return sections.map((s) => html`
            <psy-panel title=${ifDefined(s.title || undefined)} card-class="mt-3">
                ${s.columns
                    ? html`<psy-field-group columns=${s.columns} ?compact=${this.compact}>
                            <slot name=${`section-${s.id}`}></slot>
                        </psy-field-group>`
                    : html`<slot name=${`section-${s.id}`}></slot>`}
            </psy-panel>
        `);
    }

    render() {
        const hasActions = this._hasNamedSlot('actions');
        const hasHeaderExtra = this._hasNamedSlot('header-extra');

        return html`
            <psy-view
                class=${this._classes()}
                title=${ifDefined(this.title || undefined)}
                ?compact=${this.compact}
            >
                ${hasActions ? html`<slot name="actions" slot="actions"></slot>` : null}

                ${hasHeaderExtra ? html`
                    <div class="psy-template-dashboard__header-extra" style="margin-bottom:8px;">
                        <slot name="header-extra"></slot>
                    </div>
                ` : null}

                ${this._renderKpis()}
                ${this._renderSections()}
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-template-dashboard')) {
    customElements.define('psy-template-dashboard', PsyTemplateDashboard);
}
