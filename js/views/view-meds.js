// ============================================================================
// view-meds.js — Leki (2. pozycja menu)
// Wg rysunku: LISTA — NAZWA HANDLOWA — SUBSTANCJA → MAX DAWKA
// ============================================================================

import { html, LitElement } from '../components/lit.js';
import { Store } from './_store.js';

class PsyViewMeds extends LitElement {
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._unsub = Store.subscribe(() => this.requestUpdate());
    }
    disconnectedCallback() {
        if (this._unsub) this._unsub();
        super.disconnectedCallback();
    }

    _noPatient() {
        return html`
            <psy-view title="Leki" compact>
                <psy-empty-state icon="💊" title="Wybierz pacjenta"
                    description="Aby zobaczyć listę leków, wybierz pacjenta z listy.">
                    <psy-button slot="actions" variant="primary" size="sm"
                        @click=${() => (window.location.hash = '#/patients')}>Przejdź do listy</psy-button>
                </psy-empty-state>
            </psy-view>
        `;
    }

    render() {
        const patient = Store.state.currentPatient;
        if (!patient) return this._noPatient();

        const meds = Store.getMeds(patient.id);

        return html`
            <psy-view title="Leki" compact>
                <psy-button slot="actions" variant="primary" size="sm"
                    @click=${() => window.PsyToast && window.PsyToast.notify({
                        variant:'info', title:'+ Dodaj lek',
                        message:'Formularz dodawania leków zostanie włączony w PR-09.'
                    }, 'psy-app-toasts')}>
                    + Dodaj lek
                </psy-button>

                ${meds.length ? html`
                    <table class="results-table" style="font-size:12.5px;">
                        <thead>
                            <tr>
                                <th>Nazwa handlowa</th>
                                <th>Substancja</th>
                                <th style="width:160px;">Aktualna dawka</th>
                                <th style="width:160px;">Max dawka</th>
                                <th style="width:120px;">Od kiedy</th>
                                <th>Notatki</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${meds.map((m) => html`
                                <tr>
                                    <td><strong>${m.name}</strong></td>
                                    <td>${m.substance}</td>
                                    <td>${m.dose || '—'}</td>
                                    <td style="color:#B91C1C;">${m.maxDose || '—'}</td>
                                    <td>${m.prescribedAt || '—'}</td>
                                    <td style="color:#475569;">${m.notes || ''}</td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                ` : html`
                    <psy-empty-state icon="💊" title="Brak leków"
                        description=${'Pacjent ' + patient.imie + ' ' + patient.nazwisko + ' nie ma przypisanych leków.'}>
                        <psy-button slot="actions" variant="primary" size="sm">+ Dodaj pierwszy lek</psy-button>
                    </psy-empty-state>
                `}
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-view-meds')) customElements.define('psy-view-meds', PsyViewMeds);
