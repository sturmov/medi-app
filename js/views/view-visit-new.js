// ============================================================================
// view-visit-new.js — Nowa wizyta (6. pozycja menu — BIG CTA)
//
// Stan 1: wybór typu wizyty (4 karty) — modal / ekran
// Stan 2: formularz wizyty (placeholder w PR-07 — pełny w PR-11/PR-12)
// ============================================================================

import { html, LitElement } from '../components/lit.js';
import { Store } from './_store.js';
import { VISIT_TYPES, visitTypeById } from './_fake-data.js';

class PsyViewVisitNew extends LitElement {
    static properties = {
        _selectedType: { state: true }
    };

    constructor() {
        super();
        this._selectedType = null;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._unsub = Store.subscribe(() => this.requestUpdate());
        // Parse subroute from hash (e.g. #/visit/new/interview)
        this._readSubroute();
        window.addEventListener('hashchange', this._onHashChange);
    }

    disconnectedCallback() {
        if (this._unsub) this._unsub();
        window.removeEventListener('hashchange', this._onHashChange);
        super.disconnectedCallback();
    }

    _onHashChange = () => {
        this._readSubroute();
    };

    _readSubroute() {
        const hash = window.location.hash || '';
        const m = hash.match(/^#\/visit\/new\/([a-z-]+)/);
        this._selectedType = m ? m[1] : null;
    }

    _selectType(typeId) {
        window.location.hash = '#/visit/new/' + typeId;
    }

    _back() {
        window.location.hash = '#/visit/new';
    }

    render() {
        const patient = Store.state.currentPatient;
        if (!patient) {
            return html`
                <psy-view title="Nowa wizyta" compact>
                    <psy-empty-state icon="👤" title="Wybierz pacjenta"
                        description="Aby rozpocząć nową wizytę, wybierz pacjenta z listy.">
                        <psy-button slot="actions" variant="primary" size="sm"
                            @click=${() => (window.location.hash = '#/patients')}>Przejdź do listy</psy-button>
                    </psy-empty-state>
                </psy-view>
            `;
        }

        if (!this._selectedType) {
            return this._renderTypePicker(patient);
        }

        return this._renderFormPlaceholder(patient);
    }

    _renderTypePicker(patient) {
        return html`
            <psy-view title="+ Nowa wizyta" compact>
                <p class="form-hint" style="margin-top:0;">
                    Wybierz typ wizyty dla pacjenta <strong>${patient.imie} ${patient.nazwisko}</strong>.
                </p>

                <psy-grid columns="2" gap="md">
                    ${VISIT_TYPES.map((t) => html`
                        <div class="psy-visit-type-card" @click=${() => this._selectType(t.id)}
                            tabindex="0"
                            @keydown=${(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this._selectType(t.id); } }}>
                            <div class="psy-visit-type-card__icon">${t.icon}</div>
                            <div class="psy-visit-type-card__body">
                                <div class="psy-visit-type-card__title">${t.label}</div>
                                <div class="psy-visit-type-card__desc">${t.description}</div>
                                <div class="psy-visit-type-card__hint">
                                    <psy-status-badge variant="info" size="xs" label=${t.recommendedFor}></psy-status-badge>
                                </div>
                            </div>
                        </div>
                    `)}
                </psy-grid>
            </psy-view>
        `;
    }

    _renderFormPlaceholder(patient) {
        const type = visitTypeById(this._selectedType);
        if (!type) {
            // Unknown type — reset
            this._back();
            return html``;
        }

        return html`
            <psy-view title=${type.label} compact>
                <psy-breadcrumbs slot="header" .items=${[
                    { id: 'patients', label: 'Pacjenci', href: '#/patients' },
                    { id: 'patient', label: patient.imie + ' ' + patient.nazwisko },
                    { id: 'new', label: 'Nowa wizyta', href: '#/visit/new' },
                    { id: 'type', label: type.label }
                ]}
                @psy-breadcrumb-click=${(ev) => {
                    const id = ev.detail.id;
                    if (id === 'patients') window.location.hash = '#/patients';
                    else if (id === 'new') this._back();
                }}></psy-breadcrumbs>

                <psy-button slot="actions" variant="secondary" size="sm" @click=${() => this._back()}>
                    ← Zmień typ
                </psy-button>

                <psy-empty-state
                    icon=${type.icon}
                    title=${'Formularz: ' + type.label}
                    description="Pełny formularz zostanie włączony w kolejnych sub-PR (PR-11 dla wywiadu, PR-12 dla kolejnej wizyty i diagnozy rozszerzonej)."
                    variant="muted"
                >
                    <psy-stack slot="actions" direction="row" gap="sm">
                        <psy-button variant="secondary" size="sm" @click=${() => this._back()}>← Anuluj</psy-button>
                        <psy-button variant="primary" size="sm"
                            @click=${() => window.PsyToast && window.PsyToast.notify({
                                variant:'info', title:'W budowie',
                                message:'Formularz „' + type.label + '" jest przygotowywany (PR-11/PR-12).'
                            }, 'psy-app-toasts')}>
                            Symuluj zapis
                        </psy-button>
                    </psy-stack>
                </psy-empty-state>
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-view-visit-new')) customElements.define('psy-view-visit-new', PsyViewVisitNew);
