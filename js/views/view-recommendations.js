// ============================================================================
// view-recommendations.js — Zalecenia (4. pozycja menu)
// ============================================================================

import { html, LitElement } from '../components/lit.js';
import { Store } from './_store.js';

class PsyViewRecommendations extends LitElement {
    createRenderRoot() { return this; }
    connectedCallback() { super.connectedCallback(); this._unsub = Store.subscribe(() => this.requestUpdate()); }
    disconnectedCallback() { if (this._unsub) this._unsub(); super.disconnectedCallback(); }

    render() {
        const patient = Store.state.currentPatient;
        if (!patient) {
            return html`
                <psy-view title="Zalecenia" compact>
                    <psy-empty-state icon="📋" title="Wybierz pacjenta"
                        description="Aby zobaczyć zalecenia, wybierz pacjenta z listy.">
                        <psy-button slot="actions" variant="primary" size="sm"
                            @click=${() => (window.location.hash = '#/patients')}>Przejdź do listy</psy-button>
                    </psy-empty-state>
                </psy-view>
            `;
        }
        const recs = Store.getRecommendations(patient.id);

        return html`
            <psy-view title="Zalecenia" compact>
                <psy-button slot="actions" variant="primary" size="sm"
                    @click=${() => window.PsyToast && window.PsyToast.notify({
                        variant:'info', title:'+ Nowe zalecenie',
                        message:'Edytor zaleceń zostanie włączony w PR-10.'
                    }, 'psy-app-toasts')}>+ Nowe zalecenie</psy-button>

                ${recs.length ? html`
                    <psy-collapsible-group initial-open=${recs[0].id} level-scope="1">
                        ${recs.map((r) => html`
                            <psy-collapsible label=${r.title} level="1" group-key=${r.id}>
                                <div style="font-size:12.5px;color:#64748B;margin-bottom:6px;">Utworzono: ${r.createdAt}</div>
                                <p style="white-space:pre-wrap;margin:0;">${r.content}</p>
                            </psy-collapsible>
                        `)}
                    </psy-collapsible-group>
                ` : html`
                    <psy-empty-state icon="📋" title="Brak zaleceń"
                        description=${'Pacjent ' + patient.imie + ' ' + patient.nazwisko + ' nie ma jeszcze zaleceń.'}>
                        <psy-button slot="actions" variant="primary" size="sm">+ Pierwsze zalecenie</psy-button>
                    </psy-empty-state>
                `}
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-view-recommendations')) customElements.define('psy-view-recommendations', PsyViewRecommendations);
