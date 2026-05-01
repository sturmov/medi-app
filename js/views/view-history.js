// ============================================================================
// view-history.js — Historia wizyt (1. pozycja menu).
//
// PR-07: wersja placeholder/demo — wyświetla listę wizyt z fake-data.
// PR-08 rozbuduje o podgląd notatki, filtrowanie, oznaczanie „zapłacono".
// ============================================================================

import { html, LitElement } from '../components/lit.js';
import { Store } from './_store.js';
import { visitTypeById } from './_fake-data.js';

class PsyViewHistory extends LitElement {
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._unsub = Store.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        if (this._unsub) this._unsub();
        super.disconnectedCallback();
    }

    _visitTypeLabel(type) {
        const t = visitTypeById(type);
        return t ? t.label : type;
    }

    render() {
        const patient = Store.state.currentPatient;
        if (!patient) {
            return html`
                <psy-view title="Historia wizyt" compact>
                    <psy-empty-state
                        icon="👤"
                        title="Wybierz pacjenta"
                        description="Aby zobaczyć historię wizyt, wybierz pacjenta z listy."
                    >
                        <psy-button slot="actions" variant="primary" size="sm"
                            @click=${() => (window.location.hash = '#/patients')}>
                            Przejdź do listy pacjentów
                        </psy-button>
                    </psy-empty-state>
                </psy-view>
            `;
        }

        const visits = Store.getVisits(patient.id);

        return html`
            <psy-view title="Historia wizyt" compact>
                <psy-button slot="actions" variant="primary" size="sm"
                    @click=${() => (window.location.hash = '#/visit/new')}>
                    + Nowa wizyta
                </psy-button>

                ${visits.length ? html`
                    <table class="results-table" style="font-size:12.5px;">
                        <thead>
                            <tr>
                                <th style="width:120px;">Data</th>
                                <th>Typ wizyty</th>
                                <th>Podsumowanie</th>
                                <th style="width:120px;">Status</th>
                                <th style="width:90px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${visits.map((v) => html`
                                <tr>
                                    <td><strong>${v.date}</strong>${v.time ? html` · ${v.time}` : ''}</td>
                                    <td>${this._visitTypeLabel(v.type)}</td>
                                    <td style="color:#475569;">${v.summary || ''}</td>
                                    <td>
                                        ${v.paid
                                            ? html`<psy-status-badge variant="success" icon="✓" size="xs" label="Zapłacono"></psy-status-badge>`
                                            : html`<psy-status-badge variant="warning" size="xs" label="Nie zapłacono"></psy-status-badge>`}
                                    </td>
                                    <td>
                                        <button class="btn btn--secondary btn--sm"
                                            @click=${() => window.PsyToast && window.PsyToast.notify({
                                                variant: 'info',
                                                title: 'Podgląd wizyty',
                                                message: 'Szczegółowy podgląd zostanie włączony w PR-09/PR-10.'
                                            }, 'psy-app-toasts')}>
                                            Podgląd
                                        </button>
                                    </td>
                                </tr>
                            `)}
                        </tbody>
                    </table>
                ` : html`
                    <psy-empty-state
                        icon="🗓️"
                        title="Brak wizyt"
                        description=${'Pacjent ' + patient.imie + ' ' + patient.nazwisko + ' nie ma jeszcze wizyt.'}
                    >
                        <psy-button slot="actions" variant="primary" size="sm"
                            @click=${() => (window.location.hash = '#/visit/new')}>
                            + Dodaj pierwszą wizytę
                        </psy-button>
                    </psy-empty-state>
                `}
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-view-history')) {
    customElements.define('psy-view-history', PsyViewHistory);
}
