// ============================================================================
// view-tests.js — Testy (5. pozycja menu)
// Lista wyników testów pacjenta + uruchamianie nowych testów z katalogu
// ============================================================================

import { html, LitElement } from '../components/lit.js';
import { Store } from './_store.js';
import { TEST_CATALOG } from './_fake-data.js';

class PsyViewTests extends LitElement {
    createRenderRoot() { return this; }
    connectedCallback() { super.connectedCallback(); this._unsub = Store.subscribe(() => this.requestUpdate()); }
    disconnectedCallback() { if (this._unsub) this._unsub(); super.disconnectedCallback(); }

    render() {
        const patient = Store.state.currentPatient;
        if (!patient) {
            return html`
                <psy-view title="Testy" compact>
                    <psy-empty-state icon="📊" title="Wybierz pacjenta"
                        description="Aby zobaczyć testy, wybierz pacjenta z listy.">
                        <psy-button slot="actions" variant="primary" size="sm"
                            @click=${() => (window.location.hash = '#/patients')}>Przejdź do listy</psy-button>
                    </psy-empty-state>
                </psy-view>
            `;
        }
        const results = Store.getTests(patient.id);

        return html`
            <psy-view title="Testy" compact>
                <psy-tabs active-id="results" compact>
                    <psy-tab-panel tab-id="results" label="Wyniki" icon="📈">
                        ${results.length ? html`
                            <table class="results-table" style="font-size:12.5px;">
                                <thead>
                                    <tr>
                                        <th style="width:100px;">Kod</th>
                                        <th>Nazwa</th>
                                        <th style="width:120px;">Data</th>
                                        <th style="width:80px;">Wynik</th>
                                        <th>Interpretacja</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${results.map((t) => html`
                                        <tr>
                                            <td><strong>${t.code}</strong></td>
                                            <td>${t.name}</td>
                                            <td>${t.date}</td>
                                            <td style="text-align:right;font-weight:700;">${t.score}</td>
                                            <td style="color:#475569;">${t.interpretation}</td>
                                        </tr>
                                    `)}
                                </tbody>
                            </table>
                        ` : html`
                            <psy-empty-state icon="📊" title="Brak wyników"
                                description="Pacjent nie wypełnił jeszcze żadnego testu.">
                            </psy-empty-state>
                        `}
                    </psy-tab-panel>
                    <psy-tab-panel tab-id="catalog" label="Uruchom test" icon="▶️" badge=${String(TEST_CATALOG.length)}>
                        <psy-grid columns="auto" min="200" gap="sm">
                            ${TEST_CATALOG.map((t) => html`
                                <psy-panel title=${t.name}>
                                    <div class="form-hint" style="margin:0 0 6px 0;">${t.description} · ${t.questions} pytań</div>
                                    <psy-button variant="primary" size="sm"
                                        @click=${() => window.PsyToast && window.PsyToast.notify({
                                            variant:'info', title:'Test ' + t.code,
                                            message:'Uruchamianie testów zostanie włączone w PR-10.'
                                        }, 'psy-app-toasts')}>
                                        ▶ Uruchom
                                    </psy-button>
                                </psy-panel>
                            `)}
                        </psy-grid>
                    </psy-tab-panel>
                </psy-tabs>
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-view-tests')) customElements.define('psy-view-tests', PsyViewTests);
