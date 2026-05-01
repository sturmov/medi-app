// ============================================================================
// psy-template-form - szablon widoku formularzowego z drzewem L1/L2/L3.
//
// Parametry:
//   - title             : tytuł widoku
//   - .patientContext   : obiekt {name, age, minor?, details:[{label,value,priority?}]}
//                         (opcjonalnie; jeśli podano - renderuje psy-patient-context variant="bar")
//   - .sections         : [{id, label, level?, open?, groupKey?, columns?}]
//                         level: 1|2|3 (default 1); columns: "1|2|3|auto" dla psy-field-group
//   - accordion         : Boolean - tylko jedna sekcja L1 otwarta naraz (default true)
//   - initial-open      : id sekcji otwartej początkowo (dla accordion)
//   - .actions          : [{id, label, variant?, disabled?}] - przyciski footera
//   - autosave-status   : {variant, icon, label} lub string (wyświetlany jako psy-status-badge)
//   - compact           : Boolean
//   - extra-class
//
// Sloty:
//   - section-{id}      : zawartość sekcji {id} (wstawiana w psy-collapsible)
//   - header-extra      : dodatkowa treść w nagłówku (np. breadcrumbs)
//   - footer-extra      : dodatkowa treść w footerze przed akcjami
//   - patient-bar-actions : akcje w pasku pacjenta (slot przekazany dalej)
//
// Eventy:
//   - psy-form-action   { id, action } - kliknięcie przycisku z .actions
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyTemplateForm extends LitElement {
    static properties = {
        title: { type: String },
        patientContext: { type: Object, attribute: false },
        sections: { type: Array, attribute: false },
        accordion: { type: Boolean },
        initialOpen: { type: String, attribute: 'initial-open' },
        actions: { type: Array, attribute: false },
        autosaveStatus: { type: Object, attribute: false },
        compact: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.title = '';
        this.patientContext = null;
        this.sections = [];
        this.accordion = true;
        this.initialOpen = '';
        this.actions = [];
        this.autosaveStatus = null;
        this.compact = false;
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const classes = ['psy-template-form'];
        if (this.compact) classes.push('psy-template-form--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    _onActionClick(action) {
        this.dispatchEvent(new CustomEvent('psy-form-action', {
            detail: { id: action.id, action },
            bubbles: true,
            composed: true
        }));
    }

    _renderAutosave() {
        if (!this.autosaveStatus) return null;
        if (typeof this.autosaveStatus === 'string') {
            return html`
                <psy-status-badge variant="success" icon="💾" label=${this.autosaveStatus}></psy-status-badge>
            `;
        }
        const s = this.autosaveStatus;
        return html`
            <psy-status-badge
                variant=${ifDefined(s.variant || 'success')}
                icon=${ifDefined(s.icon || '💾')}
                label=${ifDefined(s.label || 'Zapisano')}
            ></psy-status-badge>
        `;
    }

    _renderPatientBar() {
        const ctx = this.patientContext;
        if (!ctx) return null;
        return html`
            <psy-patient-context
                variant="bar"
                patient-name=${ifDefined(ctx.name || ctx.patientName || undefined)}
                patient-age=${ifDefined(ctx.age || ctx.patientAge || undefined)}
                .patientDetails=${ctx.details || ctx.patientDetails || []}
                ?minor=${!!ctx.minor}
                ?sticky=${ctx.sticky !== false}
                ?compact=${this.compact || ctx.compact}
            >
                <slot name="patient-bar-actions" slot="actions"></slot>
            </psy-patient-context>
        `;
    }

    _renderSections() {
        const sections = Array.isArray(this.sections) ? this.sections : [];
        if (!sections.length) {
            return html`<slot></slot>`;
        }

        const content = sections.map((s) => {
            const level = Number(s.level) || 1;
            const isOpen = this.accordion
                ? (this.initialOpen && s.id === this.initialOpen)
                : (s.open !== false);

            return html`
                <psy-collapsible
                    label=${ifDefined(s.label || undefined)}
                    level=${level}
                    group-key=${ifDefined(s.groupKey || s.id || undefined)}
                    ?open=${isOpen}
                    ?compact=${this.compact}
                >
                    ${s.columns
                        ? html`<psy-field-group columns=${s.columns} ?compact=${this.compact}>
                                <slot name=${`section-${s.id}`}></slot>
                            </psy-field-group>`
                        : html`<slot name=${`section-${s.id}`}></slot>`
                    }
                </psy-collapsible>
            `;
        });

        if (this.accordion) {
            return html`
                <psy-collapsible-group
                    initial-open=${ifDefined(this.initialOpen || undefined)}
                    level-scope="1"
                >
                    ${content}
                </psy-collapsible-group>
            `;
        }

        return content;
    }

    _renderFooter() {
        const actions = Array.isArray(this.actions) ? this.actions : [];
        const hasFooterExtra = this._hasNamedSlot('footer-extra');
        const hasAutosave = !!this.autosaveStatus;

        if (!actions.length && !hasFooterExtra && !hasAutosave) return null;

        return html`
            <div class="psy-template-form__footer" slot="footer">
                <div class="psy-template-form__footer-left">
                    ${hasAutosave ? this._renderAutosave() : null}
                    <slot name="footer-extra"></slot>
                </div>
                <psy-stack direction="row" gap="sm" justify="end" wrap>
                    ${actions.map((a) => html`
                        <psy-button
                            variant=${ifDefined(a.variant || 'secondary')}
                            size="sm"
                            ?disabled=${!!a.disabled}
                            @click=${() => this._onActionClick(a)}
                        >${a.label}</psy-button>
                    `)}
                </psy-stack>
            </div>
        `;
    }

    render() {
        const hasHeaderExtra = this._hasNamedSlot('header-extra');

        return html`
            <div class=${this._classes()}>
                ${this._renderPatientBar()}

                <psy-view
                    title=${ifDefined(this.title || undefined)}
                    ?compact=${this.compact}
                >
                    ${hasHeaderExtra ? html`
                        <div slot="header" class="psy-view__header-main">
                            <h1 class="psy-view__title">${this.title}</h1>
                            <div class="psy-template-form__header-extra">
                                <slot name="header-extra"></slot>
                            </div>
                        </div>
                    ` : null}

                    ${this._renderSections()}

                    ${this._renderFooter()}
                </psy-view>
            </div>
        `;
    }
}

if (!customElements.get('psy-template-form')) {
    customElements.define('psy-template-form', PsyTemplateForm);
}
