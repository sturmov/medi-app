// ============================================================================
// view-settings.js — Ustawienia / Integracje (dostęp z topbar ⚙️)
//
// Sekcje:
//   - Integracje      : Storage (local / Drive) + root „pacjenci" + Kalendarz
//   - Baza leków      : słownik psychotropów (z _fake-data.js → FAKE_MED_DICT)
//   - UI              : compact, auto-collapse
//   - Backlog         : lista pomysłów z Dokumentacja.xlsx „Lista pomysłów"
// ============================================================================

import { html, LitElement } from '../components/lit.js';
import { FAKE_MED_DICT } from './_fake-data.js';

const BACKLOG = [
    'Płatności odchaczyć? + link online',
    'Integracja z Kalendarzem Google',
    'Faktury — zliczanie pacjentów z klinik',
    'Materiały na sesje — biblioteka',
    'Diagnoza — formularz, zliczanie, pytania',
    'Podgląd załączników w profilu + na wizycie',
    'Baza leków — nazwa handlowa + substancja + max dose',
    'Profile zawodowe: psycholog diagnosta / szkolny / psychoterapeuta',
    'Edukacja: Psychological assessment — książka',
    'Farmakoterapia dla psychologów — moduł edukacyjny',
    'Testy przesiewowe — wypełnianie + zliczanie wg trudności',
    'Testy płatne — wyniki'
];

class PsyViewSettings extends LitElement {
    createRenderRoot() { return this; }

    _toggleCompact() {
        document.documentElement.classList.toggle('theme--compact');
        this.requestUpdate();
    }

    render() {
        const compactOn = document.documentElement.classList.contains('theme--compact');

        return html`
            <psy-view title="Ustawienia" compact>
                <psy-tabs active-id="integrations" compact>
                    <psy-tab-panel tab-id="integrations" label="Integracje" icon="🔌">
                        <psy-stack direction="column" gap="md">
                            <psy-panel title="Storage — źródło danych">
                                <psy-stack direction="row" gap="sm" align="center" wrap>
                                    <psy-status-badge variant="neutral" icon="📁" label="Folder lokalny: (nie podpięty)"></psy-status-badge>
                                    <psy-button variant="secondary" size="sm">Połącz folder</psy-button>
                                </psy-stack>
                                <psy-stack direction="row" gap="sm" align="center" wrap style="margin-top:6px;">
                                    <psy-status-badge variant="neutral" icon="☁️" label="Google Drive: (niepodpięty)"></psy-status-badge>
                                    <psy-button variant="secondary" size="sm">Połącz Drive</psy-button>
                                </psy-stack>
                                <psy-form-field kind="input" field-id="psy-settings-root"
                                    label="Nazwa folderu głównego w Drive"
                                    value="pacjenci"
                                    hint="Domyślnie 'pacjenci'. Tutaj zostaną utworzone foldery per pacjent."
                                ></psy-form-field>
                            </psy-panel>

                            <psy-panel title="Kalendarz Google">
                                <p class="form-hint" style="margin-top:0;">
                                    Synchronizacja wizyt z kalendarzem Google zostanie dodana w Fazie 5.
                                </p>
                                <psy-button variant="secondary" size="sm" disabled>Połącz Kalendarz (Faza 5)</psy-button>
                            </psy-panel>
                        </psy-stack>
                    </psy-tab-panel>

                    <psy-tab-panel tab-id="meds" label="Baza leków" icon="💊" badge=${String(FAKE_MED_DICT.length)}>
                        <p class="form-hint" style="margin-top:0;">
                            Słownik leków psychotropowych. Dane wykorzystywane przy dodawaniu leków do
                            pacjenta (podpowiedzi nazwy handlowej, substancji, max dawki).
                        </p>
                        <table class="results-table" style="font-size:12.5px;">
                            <thead>
                                <tr>
                                    <th>Nazwa handlowa</th>
                                    <th>Substancja</th>
                                    <th style="width:160px;">Max dawka</th>
                                    <th style="width:180px;">Grupa</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${FAKE_MED_DICT.map((m) => html`
                                    <tr>
                                        <td><strong>${m.name}</strong></td>
                                        <td>${m.substance}</td>
                                        <td style="color:#B91C1C;">${m.maxDose}</td>
                                        <td>
                                            <psy-status-badge variant="info" size="xs" label=${m.group}></psy-status-badge>
                                        </td>
                                    </tr>
                                `)}
                            </tbody>
                        </table>
                    </psy-tab-panel>

                    <psy-tab-panel tab-id="ui" label="UI" icon="🎨">
                        <psy-stack direction="column" gap="sm">
                            <psy-panel title="Kompaktowy układ">
                                <psy-stack direction="row" gap="sm" align="center">
                                    <span>Tryb kompaktowy:
                                        <psy-status-badge
                                            variant=${compactOn ? 'success' : 'neutral'}
                                            size="xs"
                                            label=${compactOn ? 'włączony' : 'wyłączony'}
                                        ></psy-status-badge>
                                    </span>
                                    <psy-button variant="secondary" size="sm"
                                        @click=${() => this._toggleCompact()}>
                                        ${compactOn ? 'Wyłącz' : 'Włącz'}
                                    </psy-button>
                                </psy-stack>
                                <p class="form-hint" style="margin:6px 0 0 0;">
                                    Kompakt zwiększa gęstość informacji na ekranie (mniejsze odstępy, mniejsza czcionka).
                                </p>
                            </psy-panel>
                        </psy-stack>
                    </psy-tab-panel>

                    <psy-tab-panel tab-id="backlog" label="Backlog pomysłów" icon="💡" badge=${String(BACKLOG.length)}>
                        <p class="form-hint" style="margin-top:0;">
                            Lista pomysłów od Magdy (z arkusza <code>Dokumentacja.xlsx</code>, zakładka „Lista pomysłów").
                            Będziemy je realizować etapami w Fazie 5.
                        </p>
                        <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;">
                            ${BACKLOG.map((item) => html`<li>${item}</li>`)}
                        </ul>
                    </psy-tab-panel>
                </psy-tabs>
            </psy-view>
        `;
    }
}

if (!customElements.get('psy-view-settings')) customElements.define('psy-view-settings', PsyViewSettings);
