// ============================================================================
// view-diagnoses.js — Diagnozy (3. pozycja menu)
// ICD-10 / ICD-11, per pacjent, z datami
// ============================================================================

import { html, LitElement } from '../components/lit.js';
import { Store } from './_store.js';

class PsyViewDiagnoses extends LitElement {
    createRenderRoot() { return this; }
    connectedCallback() { super.connectedCallback(); this._unsub = Store.subscribe(() => this.requestUpdate()); }
    disconnectedCallback() { if (this._unsub) this._unsub(); super.disconnectedCallback(); }

    render() {
        const patient = Store.state.currentPatient;
        if (!patient) {
            return html`
                <psy-view title="Diagnozy" compact>
                    <psy-empty-state icon="🏥" title="Wybierz pacjenta"
                        description="Aby zobaczyć diagnozy, wybierz pacjenta z listy.">
                        <psy-button slot="actions" variant="primary" size="sm"
                            @click=${() => (window.location.hash = '#/patients')}>Przejdź do listy</psy-button>
                    </psy-empty-state>
                </psy-view>
            `;
        }
        const diagnoses = Store.getDiagnoses(patient.id);

        return html`
            <psy-view title="Diagnozy" compact>
                <psy-button slot="actions" variant="primary" size="sm"
                    @click=${() => window.PsyToast && window.PsyToast.notify({
                        variant:'info', title:'+ Dodaj diagnozę',
                        message:'Formularz diagnoz zostanie włączony w PR-09.'
                    }, 'psy-app-toasts')}>+ Dodaj diagnozę</psy-button>

                ${diagnoses.length ? html`
                    <psy-stack direction="column" gap="sm">
                        ${diagnoses.map((d) => html`
                            <div style="padding:10px 12px;background:#FFFFFF;border:1px solid #E5E7EB;border-left:3px solid #2563EB;border-radius:6px;">
                                <psy-stack direction="row" gap="sm" align="center" wrap>
                                    <strong style="font-family:monospace;font-size:14px;color:#1D4ED8;">${d.code}</strong>
                                    <span>${d.description}</span>
                                    <span style="flex:1;"></span>
                                    <psy-status-badge variant=${d.status === 'aktualne' ? 'success' : 'neutral'} size="xs" label=${d.status}></psy-status-badge>
                                    <span style="color:#64748B;font-size:12px;">od ${d.assignedAt}</span>
                                </psy-stack>
                                <div style="font-size:12px;color:#64748B;margin-top:2px;">${d.author}</div>
                            </div>
                        `)}
                    </psy-stack>
                ` : html`
                    <psy-empty-state icon="🏥" title="Brak diagnoz"
                        description=${'Pacjent ' + patient.imie + ' ' + patient.nazwisko + ' nie ma przypisanych diagnoz.'}>
                        <psy-button slot="actions" variant="primary" size="sm">+ Pierwsza diagnoza</psy-button>
                    </psy-empty-state>
                `}
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-view-diagnoses')) customElements.define('psy-view-diagnoses', PsyViewDiagnoses);
