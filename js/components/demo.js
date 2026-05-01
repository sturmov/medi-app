// ============================================================================
// Non-breaking demo composition to validate base components in production DOM
// ============================================================================

import { html, LitElement, nothing } from './lit.js';
import './index.js';

class PsyComponentsDemo extends LitElement {
    static properties = {
        hidden: { type: Boolean, reflect: true }
    };

    constructor() {
        super();
        this.hidden = true;
    }

    createRenderRoot() {
        return this;
    }

    render() {
        if (this.hidden) {
            return nothing;
        }

        const selectOptions = [
            { value: 'wywiad', label: 'Wywiad kliniczny' },
            { value: 'mse', label: 'Badanie MSE' },
            { value: 'soap', label: 'Sesja SOAP' }
        ];

        const checkboxOptions = [
            { value: 'sen', label: 'Problemy ze snem' },
            { value: 'lek', label: 'Lęk uogólniony' },
            { value: 'nastroj', label: 'Obniżony nastrój' },
            { value: 'impuls', label: 'Nadmierna impulsywność' }
        ];

        const radioOptions = [
            { value: 'niski', label: 'Niski' },
            { value: 'umiarkowany', label: 'Umiarkowany' },
            { value: 'wysoki', label: 'Wysoki' }
        ];

        const patientMeta = [
            { label: 'Kod', value: 'P001' },
            { label: 'Telefon', value: '+48 500 100 200' },
            { label: 'PESEL', value: '92010112345' },
            { label: 'Wiek', value: '34 lata' }
        ];

        return html`
            <psy-card title="Demo komponentów bazowych (compact + tree)" card-class="mt-3" body-class="pt-2">
                <p class="form-hint" style="margin-top:0;">
                    Ta karta pokazuje nowy, generyczny zestaw komponentów Lit do reużycia na wszystkich widokach.
                </p>

                <psy-patient-context
                    variant="bar"
                    patient-name="Jan Kowalski"
                    .patientDetails=${patientMeta}
                    patient-age="34 lata"
                    ?minor=${false}
                    ?sticky=${false}
                    compact
                >
                    <psy-button slot="actions" variant="secondary" size="sm">Zmień pacjenta</psy-button>
                </psy-patient-context>

                <psy-collapsible label="L1: Dane wizyty" level="1" open>
                    <psy-field-group columns="2" compact>
                        <psy-form-field
                            kind="date"
                            field-id="demo-data-wizyty"
                            label="Data wizyty"
                            data-field="demoDataWizyty"
                        ></psy-form-field>

                        <psy-form-field
                            kind="select"
                            field-id="demo-typ-wizyty"
                            label="Typ wizyty"
                            data-field="demoTypWizyty"
                            .options=${selectOptions}
                            empty-option-label="-- Wybierz --"
                        ></psy-form-field>

                        <psy-form-field
                            kind="number"
                            field-id="demo-czas"
                            label="Czas (min)"
                            data-field="demoCzas"
                            min="15"
                            max="180"
                            step="5"
                            placeholder="50"
                        ></psy-form-field>

                        <psy-form-field
                            kind="range"
                            field-id="demo-nasilenie"
                            label="Nasilenie objawów"
                            data-field="demoNasilenie"
                            min="0"
                            max="10"
                            step="1"
                            value="4"
                        ></psy-form-field>
                    </psy-field-group>

                    <psy-collapsible label="L2: Notatki" level="2" open>
                        <psy-field-group columns="1" compact>
                            <psy-form-field
                                kind="textarea"
                                field-id="demo-opis"
                                label="Opis"
                                rows="3"
                                placeholder="Przykładowy opis"
                                data-field="demoOpis"
                            ></psy-form-field>

                            <psy-form-field
                                kind="checkbox"
                                field-id="demo-zgoda"
                                checkbox-label="Zgoda na przetwarzanie danych"
                                data-field="demoZgoda"
                                ?checked=${true}
                            ></psy-form-field>
                        </psy-field-group>
                    </psy-collapsible>
                </psy-collapsible>

                <psy-card title="Grupy wyboru" body-class="pt-2" card-class="mt-3">
                    <psy-field-group columns="2" compact>
                        <psy-checkbox-group
                            label="Objawy obecne"
                            data-field="demoObjawy"
                            .options=${checkboxOptions}
                            columns="2"
                            compact
                        ></psy-checkbox-group>

                        <psy-radio-group
                            label="Ocena ryzyka"
                            data-field="demoRyzyko"
                            .options=${radioOptions}
                            value="umiarkowany"
                            columns="1"
                        ></psy-radio-group>
                    </psy-field-group>
                </psy-card>

                <psy-form-field
                    kind="input"
                    field-id="demo-nazwa"
                    label="Nazwa pola"
                    placeholder="Wpisz tekst"
                    data-field="demoNazwa"
                ></psy-form-field>

                <psy-card title="Typy pól obok siebie (PR-02: per-kind hues)" body-class="pt-2" card-class="mt-3">
                    <p class="form-hint" style="margin-top:0;">
                        Każdy typ pola ma subtelny kolor tła i 2px akcent po lewej — łatwiej
                        rozpoznać kontrolki wzrokiem bez czytania etykiet. Kolory definiowane
                        w <code>css/tokens.css</code> (<code>--hue-*</code>, <code>--accent-*</code>).
                    </p>

                    <psy-field-group columns="3" compact>
                        <psy-form-field
                            kind="input"
                            field-id="demo-kind-text"
                            label="text"
                            placeholder="tekst"
                        ></psy-form-field>

                        <psy-form-field
                            kind="email"
                            field-id="demo-kind-email"
                            label="email"
                            placeholder="user@domain.pl"
                        ></psy-form-field>

                        <psy-form-field
                            kind="tel"
                            field-id="demo-kind-tel"
                            label="tel"
                            placeholder="+48 500 100 200"
                        ></psy-form-field>

                        <psy-form-field
                            kind="select"
                            field-id="demo-kind-select"
                            label="select"
                            .options=${selectOptions}
                            empty-option-label="-- wybierz --"
                        ></psy-form-field>

                        <psy-form-field
                            kind="number"
                            field-id="demo-kind-number"
                            label="number"
                            min="0"
                            max="100"
                            step="1"
                            placeholder="0"
                        ></psy-form-field>

                        <psy-form-field
                            kind="date"
                            field-id="demo-kind-date"
                            label="date"
                        ></psy-form-field>

                        <psy-form-field
                            kind="time"
                            field-id="demo-kind-time"
                            label="time"
                        ></psy-form-field>

                        <psy-form-field
                            kind="range"
                            field-id="demo-kind-range"
                            label="range"
                            min="0"
                            max="10"
                            step="1"
                            value="5"
                        ></psy-form-field>

                        <psy-form-field
                            kind="search"
                            field-id="demo-kind-search"
                            label="search"
                            placeholder="szukaj..."
                        ></psy-form-field>

                        <psy-form-field
                            kind="password"
                            field-id="demo-kind-password"
                            label="password"
                            placeholder="••••••"
                        ></psy-form-field>

                        <psy-form-field
                            kind="checkbox"
                            field-id="demo-kind-checkbox"
                            checkbox-label="checkbox"
                            ?checked=${true}
                        ></psy-form-field>

                        <psy-form-field
                            kind="textarea"
                            field-id="demo-kind-textarea"
                            label="textarea"
                            rows="2"
                            placeholder="dłuższy tekst"
                        ></psy-form-field>
                    </psy-field-group>

                    <psy-field-group columns="2" compact>
                        <psy-checkbox-group
                            label="checkbox-group"
                            data-field="demoKindCheckboxGroup"
                            .options=${checkboxOptions}
                            columns="2"
                            compact
                        ></psy-checkbox-group>

                        <psy-radio-group
                            label="radio-group"
                            data-field="demoKindRadioGroup"
                            .options=${radioOptions}
                            value="umiarkowany"
                            columns="1"
                        ></psy-radio-group>
                    </psy-field-group>
                </psy-card>

                <psy-card title="Akordeon + auto-collapse (PR-03)" body-class="pt-2" card-class="mt-3">
                    <p class="form-hint" style="margin-top:0;">
                        Grupa <code>&lt;psy-collapsible-group&gt;</code> otwiera tylko jedną sekcję na raz
                        (akordeon). Włączenie przełącznika <em>„auto-collapse przy kliknięciu poza sekcją”</em>
                        w pasku demo na górze powoduje, że kliknięcie poza aktywną sekcją ją zamyka — zgodnie
                        z ustaleniami PO z 2026-04-17.
                    </p>

                    <psy-collapsible-group initial-open="0" level-scope="1">
                        <psy-collapsible label="Sekcja A – Dane osobowe" level="1" group-key="A">
                            <psy-field-group columns="2" compact>
                                <psy-form-field kind="input" field-id="demo-acc-a-imie" label="Imię"></psy-form-field>
                                <psy-form-field kind="input" field-id="demo-acc-a-nazwisko" label="Nazwisko"></psy-form-field>
                                <psy-form-field kind="date" field-id="demo-acc-a-urodz" label="Data urodzenia"></psy-form-field>
                                <psy-form-field kind="tel" field-id="demo-acc-a-tel" label="Telefon"></psy-form-field>
                            </psy-field-group>
                        </psy-collapsible>

                        <psy-collapsible label="Sekcja B – Wywiad" level="1" group-key="B">
                            <psy-field-group columns="1" compact>
                                <psy-form-field
                                    kind="textarea"
                                    field-id="demo-acc-b-opis"
                                    label="Opis dolegliwości"
                                    rows="3"
                                ></psy-form-field>
                                <psy-checkbox-group
                                    label="Objawy obecne"
                                    data-field="demoAccObjawy"
                                    .options=${checkboxOptions}
                                    columns="2"
                                    compact
                                ></psy-checkbox-group>
                            </psy-field-group>
                        </psy-collapsible>

                        <psy-collapsible label="Sekcja C – Plan" level="1" group-key="C">
                            <psy-field-group columns="2" compact>
                                <psy-form-field kind="select" field-id="demo-acc-c-typ" label="Typ planu" .options=${selectOptions}></psy-form-field>
                                <psy-form-field kind="number" field-id="demo-acc-c-sesje" label="Liczba sesji" min="1" max="20" step="1" placeholder="10"></psy-form-field>
                            </psy-field-group>
                            <psy-radio-group
                                label="Priorytet"
                                data-field="demoAccPrio"
                                .options=${radioOptions}
                                value="wysoki"
                                columns="3"
                            ></psy-radio-group>
                        </psy-collapsible>
                    </psy-collapsible-group>
                </psy-card>

                <psy-card title="Nowe pola (PR-04)" body-class="pt-2" card-class="mt-3">
                    <p class="form-hint" style="margin-top:0;">
                        Każde pole to osobny komponent wywoływany przez parametry
                        (zgodnie z ustaleniem PO z 2026-04-17: pełna modularyzacja,
                        żadnego surowego HTML w widokach). Każde używa klasy
                        <code>psy-form-field--{kind}</code>, więc dziedziczy kolory
                        z PR-02 automatycznie.
                    </p>

                    <psy-field-group columns="3" compact>
                        <psy-date
                            field-id="demo-pr04-date"
                            label="psy-date"
                            data-field="demoPr04Date"
                            value="2026-04-17"
                        ></psy-date>

                        <psy-time
                            field-id="demo-pr04-time"
                            label="psy-time"
                            data-field="demoPr04Time"
                            value="14:30"
                        ></psy-time>

                        <psy-datetime
                            field-id="demo-pr04-datetime"
                            label="psy-datetime"
                            data-field="demoPr04Datetime"
                            value="2026-04-17T14:30"
                        ></psy-datetime>

                        <psy-number
                            field-id="demo-pr04-number"
                            label="psy-number (z jednostką)"
                            data-field="demoPr04Number"
                            min="0"
                            max="240"
                            step="5"
                            value="50"
                            unit="min"
                        ></psy-number>

                        <psy-number
                            field-id="demo-pr04-number-dose"
                            label="psy-number (dawka)"
                            data-field="demoPr04Dose"
                            min="0"
                            max="1000"
                            step="5"
                            value="25"
                            unit="mg"
                        ></psy-number>

                        <psy-range
                            field-id="demo-pr04-range"
                            label="psy-range (live)"
                            data-field="demoPr04Range"
                            min="0"
                            max="10"
                            step="1"
                            value="4"
                            unit="pkt"
                            show-ticks
                        ></psy-range>
                    </psy-field-group>

                    <psy-field-group columns="2" compact>
                        <psy-search-input
                            field-id="demo-pr04-search"
                            label="psy-search-input"
                            data-field="demoPr04Search"
                            placeholder="Szukaj pacjenta..."
                            hotkey
                        ></psy-search-input>

                        <psy-tag-input
                            field-id="demo-pr04-tags"
                            label="psy-tag-input (chipy)"
                            data-field="demoPr04Tags"
                            placeholder="dodaj rozpoznanie, Enter..."
                            .tags=${['F32.1', 'F41.1']}
                            .suggestions=${['F33.0', 'F40.1', 'F43.2']}
                            hint="Enter / przecinek dodaje chip. Backspace usuwa ostatni."
                        ></psy-tag-input>
                    </psy-field-group>

                    <psy-field-group columns="2" compact>
                        <psy-file-input
                            field-id="demo-pr04-file"
                            label="psy-file-input (upload)"
                            data-field="demoPr04File"
                            accept="image/*,.pdf,.docx"
                            multiple
                            hint="Obrazy, PDF, DOCX. Można przeciągnąć pliki w strefę."
                        ></psy-file-input>

                        <div class="form-group psy-form-field psy-form-field--text">
                            <psy-label text="Etykieta z psy-help-hint"></psy-label>
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <input class="input" type="text" placeholder="np. rozpoznanie ICD-10" style="flex:1 1 160px;min-width:0;">
                                <psy-help-hint
                                    text="Wpisz kod rozpoznania ICD-10 np. F32.1. Dostępne podpowiedzi AI w widoku wizyty."
                                    label="Pomoc"
                                    placement="top"
                                ></psy-help-hint>
                                <psy-help-hint
                                    variant="ai"
                                    icon="✨"
                                    text="AI może zasugerować diagnozę na podstawie opisu objawów."
                                    placement="top"
                                ></psy-help-hint>
                                <psy-help-hint
                                    variant="warn"
                                    icon="!"
                                    text="Uważaj na kody zaczynające się od F1x — wymagają walidacji z tabelą."
                                    placement="top"
                                ></psy-help-hint>
                            </div>
                        </div>
                    </psy-field-group>
                </psy-card>

                <psy-card title="Layout shell (PR-05a) — makieta ekranu" body-class="pt-2" card-class="mt-3">
                    <p class="form-hint" style="margin-top:0;">
                        Miniatura docelowego layoutu zbudowana wyłącznie z komponentów:
                        <code>psy-app-shell</code> (CSS Grid) komponuje
                        <code>psy-topbar</code>, <code>psy-patient-context variant="bar"</code>,
                        <code>psy-sidebar</code> (z drzewem L1/L2 — sekcja „Dokumenty”) oraz
                        <code>psy-view</code> z <code>psy-toolbar</code> w środku. Zero surowego HTML
                        w widoku — wszystko przez parametry.
                    </p>

                    <div style="position:relative;height:460px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;background:#F9FAFB;">
                        <psy-app-shell extra-class="psy-app-shell--demo" style="min-height:100%;">
                            <psy-topbar
                                slot="topbar"
                                brand="PsychoApp"
                                show-toggle
                            >
                                <span slot="right" class="top-bar__save-indicator">💾 Zapisano · 14:32</span>
                                <psy-button slot="right" variant="secondary" size="sm">☁️ Drive</psy-button>
                                <psy-button slot="right" variant="primary" size="sm">+ Nowa wizyta</psy-button>
                            </psy-topbar>

                            <psy-patient-context
                                slot="patient-bar"
                                variant="bar"
                                patient-name="Jan Kowalski"
                                patient-age="34 lata"
                                .patientDetails=${patientMeta}
                                ?sticky=${false}
                                compact
                            >
                                <psy-button slot="actions" variant="secondary" size="sm">Zmień pacjenta</psy-button>
                            </psy-patient-context>

                            <psy-sidebar
                                slot="sidebar"
                                active-id="patients"
                                .sections=${[
                                    { id: 'patients', label: 'Pacjenci', icon: '📋' },
                                    { id: 'visits', label: 'Wizyty', icon: '🗓️', badge: '3' },
                                    {
                                        id: 'documents',
                                        label: 'Dokumenty',
                                        icon: '📄',
                                        children: [
                                            { id: 'docs-cert', label: 'Zaświadczenie' },
                                            { id: 'docs-ref', label: 'Skierowanie' },
                                            { id: 'docs-app', label: 'Wniosek (wgląd)' }
                                        ]
                                    },
                                    { id: 'attachments', label: 'Załączniki', icon: '📎' },
                                    { id: 'tests', label: 'Testy', icon: '📊' },
                                    { id: 'plan', label: 'Plan terapii', icon: '📑' },
                                    { id: 'settings', label: 'Ustawienia', icon: '⚙️' }
                                ]}
                            ></psy-sidebar>

                            <psy-view view-id="demo-view-patients" title="Lista pacjentów" compact>
                                <psy-button slot="actions" variant="primary" size="sm">+ Nowy pacjent</psy-button>

                                <psy-toolbar compact>
                                    <psy-search-input
                                        slot="search"
                                        field-id="demo-shell-search"
                                        placeholder="Szukaj pacjenta..."
                                    ></psy-search-input>
                                    <psy-select
                                        slot="filters"
                                        field-id="demo-shell-filter"
                                        .options=${[
                                            { value: 'all', label: 'Wszyscy' },
                                            { value: 'active', label: 'Aktywni' },
                                            { value: 'archived', label: 'Archiwalni' }
                                        ]}
                                    ></psy-select>
                                    <psy-button slot="actions" variant="secondary" size="sm">⤓ Eksport</psy-button>
                                </psy-toolbar>

                                <table class="results-table" style="font-size:12.5px;">
                                    <thead>
                                        <tr>
                                            <th>Kod</th>
                                            <th>Imię i nazwisko</th>
                                            <th>Telefon</th>
                                            <th>Ostatnia wizyta</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>P001</td>
                                            <td>Jan Kowalski</td>
                                            <td>+48 500 100 200</td>
                                            <td>2026-04-10</td>
                                        </tr>
                                        <tr>
                                            <td>P002</td>
                                            <td>Anna Nowak</td>
                                            <td>+48 600 200 300</td>
                                            <td>2026-04-15</td>
                                        </tr>
                                        <tr>
                                            <td>P003</td>
                                            <td>Marek Wiśniewski</td>
                                            <td>+48 700 300 400</td>
                                            <td>—</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </psy-view>
                        </psy-app-shell>
                    </div>

                    <p class="form-hint" style="margin-top:8px;">
                        Pasek pacjenta (variant="bar") zastąpił poprzednią kartę — zgodnie z feedbackiem
                        klientki z 2026-04-17. Zużywa ~32 px wysokości zamiast ~120 px karty.
                    </p>
                </psy-card>

                <psy-card title="Helpery layoutu (PR-05b) — grid / stack / split / tabs" body-class="pt-2" card-class="mt-3">
                    <p class="form-hint" style="margin-top:0;">
                        Generyczne „kleje kompozycyjne" (bez logiki biznesowej):
                        <code>psy-grid</code> (CSS Grid), <code>psy-stack</code> (flex),
                        <code>psy-split</code> (lista + detale), <code>psy-tabs</code> +
                        <code>psy-tab-panel</code> (WAI-ARIA + klawiatura strzałkami/Home/End).
                    </p>

                    <h4 style="margin:10px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-grid — kolumny i gap</h4>
                    <psy-grid columns="3" gap="sm">
                        <psy-panel title="KPI: Aktywni">
                            <div style="font-size:22px;font-weight:700;color:#2563EB;">42</div>
                            <div class="form-hint" style="margin:0;">pacjentów</div>
                        </psy-panel>
                        <psy-panel title="KPI: Wizyty">
                            <div style="font-size:22px;font-weight:700;color:#059669;">18</div>
                            <div class="form-hint" style="margin:0;">w tym tygodniu</div>
                        </psy-panel>
                        <psy-panel title="KPI: Autozapis">
                            <div style="font-size:22px;font-weight:700;color:#B45309;">OK</div>
                            <div class="form-hint" style="margin:0;">ostatnio 14:32</div>
                        </psy-panel>
                    </psy-grid>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-grid columns="auto" min="160"</h4>
                    <psy-grid columns="auto" min="160" gap="xs">
                        <psy-panel><strong>PHQ-9</strong><div class="form-hint" style="margin:0;">test: depresja</div></psy-panel>
                        <psy-panel><strong>GAD-7</strong><div class="form-hint" style="margin:0;">test: lęk</div></psy-panel>
                        <psy-panel><strong>MoCA</strong><div class="form-hint" style="margin:0;">test: poznanie</div></psy-panel>
                        <psy-panel><strong>AUDIT</strong><div class="form-hint" style="margin:0;">test: alkohol</div></psy-panel>
                        <psy-panel><strong>DAST-10</strong><div class="form-hint" style="margin:0;">test: substancje</div></psy-panel>
                    </psy-grid>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-stack — row (akcje) i column (lista)</h4>
                    <psy-stack direction="row" gap="sm" wrap>
                        <psy-button variant="primary" size="sm">Zapisz</psy-button>
                        <psy-button variant="secondary" size="sm">Anuluj</psy-button>
                        <psy-button variant="secondary" size="sm">⤓ Eksport</psy-button>
                        <psy-button variant="subtle-danger" size="sm">🗑 Usuń</psy-button>
                    </psy-stack>

                    <psy-stack direction="column" gap="xs" style="margin-top:8px;">
                        <div style="padding:4px 8px;background:#F0FDF4;border-left:3px solid #10B981;border-radius:4px;font-size:12.5px;">
                            ✓ Zapis lokalny • P001_Kowalski.xlsx
                        </div>
                        <div style="padding:4px 8px;background:#FFFBEB;border-left:3px solid #F59E0B;border-radius:4px;font-size:12.5px;">
                            ⚠ Drive: token wygasa za 12 min
                        </div>
                        <div style="padding:4px 8px;background:#EFF6FF;border-left:3px solid #2563EB;border-radius:4px;font-size:12.5px;">
                            ℹ Autozapis włączony • co 30 s
                        </div>
                    </psy-stack>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-split — lista pacjentów + detale (resizable)</h4>
                    <div style="border:1px solid #E5E7EB;border-radius:8px;padding:8px;background:#F9FAFB;">
                        <psy-split left-width="260" min-left="200" min-right="260" collapse-at="720" resizable persist-key="demo-patients-split">
                            <div slot="left">
                                <psy-search-input
                                    field-id="demo-pr05b-search"
                                    placeholder="Szukaj pacjenta..."
                                ></psy-search-input>
                                <ul style="list-style:none;margin:6px 0 0 0;padding:0;font-size:12.5px;">
                                    <li style="padding:4px 6px;border-radius:4px;background:#DBEAFE;color:#1D4ED8;font-weight:600;">Jan Kowalski · P001</li>
                                    <li style="padding:4px 6px;">Anna Nowak · P002</li>
                                    <li style="padding:4px 6px;">Marek Wiśniewski · P003</li>
                                    <li style="padding:4px 6px;">Ewa Lewandowska · P004</li>
                                </ul>
                            </div>
                            <div slot="right">
                                <div style="font-weight:700;font-size:14px;color:#0F172A;margin-bottom:4px;">
                                    Jan Kowalski · 34 lata
                                </div>
                                <psy-field-group columns="2" compact>
                                    <psy-form-field kind="tel" field-id="demo-pr05b-tel" label="Telefon" value="+48 500 100 200"></psy-form-field>
                                    <psy-form-field kind="input" field-id="demo-pr05b-pesel" label="PESEL" value="92010112345"></psy-form-field>
                                    <psy-form-field kind="date" field-id="demo-pr05b-data" label="Data urodzenia"></psy-form-field>
                                    <psy-form-field kind="input" field-id="demo-pr05b-adres" label="Adres" value="ul. Długa 12, Warszawa"></psy-form-field>
                                </psy-field-group>
                            </div>
                        </psy-split>
                    </div>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-tabs — wariant "line" (domyślny)</h4>
                    <psy-tabs active-id="info" compact>
                        <psy-tab-panel tab-id="info" label="Info" icon="ℹ️">
                            <psy-field-group columns="2" compact>
                                <psy-form-field kind="input" field-id="demo-tabs-imie" label="Imię"></psy-form-field>
                                <psy-form-field kind="input" field-id="demo-tabs-nazw" label="Nazwisko"></psy-form-field>
                            </psy-field-group>
                        </psy-tab-panel>
                        <psy-tab-panel tab-id="visits" label="Wizyty" icon="🗓️" badge="3">
                            <table class="results-table" style="font-size:12.5px;">
                                <thead>
                                    <tr><th>Data</th><th>Typ</th><th>Status</th></tr>
                                </thead>
                                <tbody>
                                    <tr><td>2026-04-15</td><td>Kolejna wizyta</td><td>✓ Zakończona</td></tr>
                                    <tr><td>2026-04-01</td><td>Kolejna wizyta</td><td>✓ Zakończona</td></tr>
                                    <tr><td>2026-03-10</td><td>Wywiad kliniczny</td><td>✓ Zakończona</td></tr>
                                </tbody>
                            </table>
                        </psy-tab-panel>
                        <psy-tab-panel tab-id="docs" label="Dokumenty" icon="📄">
                            <p style="margin:6px 0;color:#6B7280;">Brak dokumentów do wyświetlenia.</p>
                        </psy-tab-panel>
                        <psy-tab-panel tab-id="arch" label="Archiwum" icon="📦" disabled>
                            <p>(niedostępne)</p>
                        </psy-tab-panel>
                    </psy-tabs>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-tabs — wariant "pill"</h4>
                    <psy-tabs variant="pill" active-id="daily" compact>
                        <psy-tab-panel tab-id="daily" label="Dziś">
                            <div class="form-hint" style="margin:4px 0;">2 wizyty zaplanowane.</div>
                        </psy-tab-panel>
                        <psy-tab-panel tab-id="week" label="Tydzień">
                            <div class="form-hint" style="margin:4px 0;">9 wizyt w tym tygodniu.</div>
                        </psy-tab-panel>
                        <psy-tab-panel tab-id="month" label="Miesiąc">
                            <div class="form-hint" style="margin:4px 0;">34 wizyty w tym miesiącu.</div>
                        </psy-tab-panel>
                    </psy-tabs>

                    <p class="form-hint" style="margin-top:10px;">
                        Klawiatura w <code>psy-tabs</code>: ← → między zakładkami, Home/End skacze
                        na pierwszą/ostatnią. Zakładka <em>Archiwum</em> powyżej ma atrybut <code>disabled</code>
                        — jest pomijana w ruchu fokusa.
                    </p>
                </psy-card>

                <psy-card title="Overlays (PR-05c) — modal / drawer / toast" body-class="pt-2" card-class="mt-3">
                    <p class="form-hint" style="margin-top:0;">
                        Overlays z focus trap-em (Tab/Shift+Tab pętli w środku), ESC zamyka,
                        klik w backdrop zamyka, scroll lock na <code>body</code>.
                        <strong>Toasty w fazie dev są sticky</strong> (duration=0) — produkcyjne
                        czasy dobierzemy w Fazie 5.
                    </p>

                    <psy-stack direction="row" gap="sm" wrap>
                        <psy-button variant="primary" size="sm"
                            @click=${(e) => e.currentTarget.getRootNode().querySelector('#demo-modal-basic').show()}>
                            Otwórz modal (md)
                        </psy-button>

                        <psy-button variant="secondary" size="sm"
                            @click=${(e) => e.currentTarget.getRootNode().querySelector('#demo-modal-lg').show()}>
                            Otwórz modal (lg)
                        </psy-button>

                        <psy-button variant="secondary" size="sm"
                            @click=${(e) => e.currentTarget.getRootNode().querySelector('#demo-drawer-right').show()}>
                            Drawer (prawa)
                        </psy-button>

                        <psy-button variant="secondary" size="sm"
                            @click=${(e) => e.currentTarget.getRootNode().querySelector('#demo-drawer-left').show()}>
                            Drawer (lewa)
                        </psy-button>
                    </psy-stack>

                    <psy-stack direction="row" gap="sm" wrap style="margin-top:8px;">
                        <psy-button variant="secondary" size="sm"
                            @click=${() => window.PsyToast.notify({ variant:'info', title:'Info', message:'To jest neutralne powiadomienie. Sticky w dev.' }, 'demo-toasts')}>
                            Toast: info
                        </psy-button>
                        <psy-button variant="secondary" size="sm"
                            @click=${() => window.PsyToast.notify({ variant:'success', title:'Zapisano', message:'Dane pacjenta zapisane lokalnie.' }, 'demo-toasts')}>
                            Toast: success
                        </psy-button>
                        <psy-button variant="secondary" size="sm"
                            @click=${() => window.PsyToast.notify({ variant:'warning', title:'Uwaga', message:'Token Google Drive wygaśnie za 5 minut.' }, 'demo-toasts')}>
                            Toast: warning
                        </psy-button>
                        <psy-button variant="danger" size="sm"
                            @click=${() => window.PsyToast.notify({
                                variant:'danger',
                                title:'Błąd zapisu',
                                message:'Nie udało się zapisać pliku. Sprawdź uprawnienia folderu.',
                                actions: [{ label: 'Ponów', variant: 'primary', onClick: (ev, t) => t.dismiss('retry') }]
                            }, 'demo-toasts')}>
                            Toast: danger + akcja
                        </psy-button>
                    </psy-stack>

                    <p class="form-hint" style="margin-top:6px;">
                        Kontener toastów:
                    </p>
                    <psy-toast-container id="demo-toasts" position="top-right"></psy-toast-container>

                    <!-- Modale i drawery jako "ukryte" w DOM -->
                    <psy-modal id="demo-modal-basic" title="Potwierdź operację" size="md">
                        <p>Czy na pewno chcesz usunąć pacjenta <strong>Jan Kowalski</strong>?</p>
                        <p class="form-hint" style="margin:4px 0 0 0;">
                            Operacja jest nieodwracalna. Dane pacjenta zostaną przeniesione do kosza.
                        </p>

                        <psy-stack slot="footer" direction="row" gap="sm" justify="end">
                            <psy-button variant="secondary" size="sm"
                                @click=${(e) => e.currentTarget.closest('psy-modal').close('cancel')}>
                                Anuluj
                            </psy-button>
                            <psy-button variant="danger" size="sm"
                                @click=${(e) => {
                                    const m = e.currentTarget.closest('psy-modal');
                                    m.close('confirm');
                                    window.PsyToast.notify({ variant:'success', title:'Usunięto', message:'Pacjent przeniesiony do kosza.' }, 'demo-toasts');
                                }}>
                                Usuń
                            </psy-button>
                        </psy-stack>
                    </psy-modal>

                    <psy-modal id="demo-modal-lg" title="Szczegóły wizyty — 2026-04-15" size="lg">
                        <psy-field-group columns="2" compact>
                            <psy-form-field kind="date" field-id="demo-ml-date" label="Data wizyty" value="2026-04-15"></psy-form-field>
                            <psy-form-field kind="time" field-id="demo-ml-time" label="Godzina" value="14:30"></psy-form-field>
                            <psy-form-field kind="select" field-id="demo-ml-type" label="Typ wizyty"
                                .options=${selectOptions}
                                value="soap"
                            ></psy-form-field>
                            <psy-form-field kind="number" field-id="demo-ml-dur" label="Czas (min)" value="50"></psy-form-field>
                        </psy-field-group>
                        <psy-form-field kind="textarea" field-id="demo-ml-note" label="Notatka" rows="4"></psy-form-field>

                        <psy-stack slot="footer" direction="row" gap="sm" justify="end">
                            <psy-button variant="secondary" size="sm"
                                @click=${(e) => e.currentTarget.closest('psy-modal').close('cancel')}>
                                Anuluj
                            </psy-button>
                            <psy-button variant="primary" size="sm"
                                @click=${(e) => e.currentTarget.closest('psy-modal').close('save')}>
                                Zapisz zmiany
                            </psy-button>
                        </psy-stack>
                    </psy-modal>

                    <psy-drawer id="demo-drawer-right" title="Nowa wizyta (skrót)" side="right" width="460">
                        <p class="form-hint" style="margin-top:0;">
                            Szybki formularz — tylko kluczowe pola. Pełny wywiad otworzy się po zapisaniu.
                        </p>
                        <psy-field-group columns="1" compact>
                            <psy-form-field kind="select" field-id="demo-dr-pat" label="Pacjent"
                                .options=${[
                                    { value:'P001', label:'Jan Kowalski · P001' },
                                    { value:'P002', label:'Anna Nowak · P002' },
                                    { value:'P003', label:'Marek Wiśniewski · P003' }
                                ]}
                            ></psy-form-field>
                            <psy-form-field kind="datetime" field-id="demo-dr-dt" label="Termin" value="2026-04-20T09:00"></psy-form-field>
                            <psy-form-field kind="select" field-id="demo-dr-type" label="Typ wizyty"
                                .options=${selectOptions}
                            ></psy-form-field>
                            <psy-form-field kind="textarea" field-id="demo-dr-note" label="Notatka wstępna" rows="3"></psy-form-field>
                        </psy-field-group>

                        <psy-stack slot="footer" direction="row" gap="sm" justify="end">
                            <psy-button variant="secondary" size="sm"
                                @click=${(e) => e.currentTarget.closest('psy-drawer').close('cancel')}>
                                Anuluj
                            </psy-button>
                            <psy-button variant="primary" size="sm"
                                @click=${(e) => {
                                    e.currentTarget.closest('psy-drawer').close('save');
                                    window.PsyToast.notify({ variant:'success', title:'Utworzono', message:'Wizyta dodana do kalendarza.' }, 'demo-toasts');
                                }}>
                                Utwórz wizytę
                            </psy-button>
                        </psy-stack>
                    </psy-drawer>

                    <psy-drawer id="demo-drawer-left" title="Filtry" side="left" width="320">
                        <psy-checkbox-group
                            label="Status wizyt"
                            data-field="demoDrStatus"
                            .options=${[
                                { value:'planned', label:'Zaplanowane' },
                                { value:'done', label:'Zakończone' },
                                { value:'cancelled', label:'Odwołane' }
                            ]}
                            columns="1"
                        ></psy-checkbox-group>
                        <psy-field-group columns="1" compact>
                            <psy-form-field kind="date" field-id="demo-dr-from" label="Od daty"></psy-form-field>
                            <psy-form-field kind="date" field-id="demo-dr-to" label="Do daty"></psy-form-field>
                        </psy-field-group>

                        <psy-stack slot="footer" direction="row" gap="sm" justify="end">
                            <psy-button variant="secondary" size="sm"
                                @click=${(e) => e.currentTarget.closest('psy-drawer').close('clear')}>
                                Wyczyść
                            </psy-button>
                            <psy-button variant="primary" size="sm"
                                @click=${(e) => e.currentTarget.closest('psy-drawer').close('apply')}>
                                Zastosuj
                            </psy-button>
                        </psy-stack>
                    </psy-drawer>
                </psy-card>

                <psy-card title="Utility (PR-05d) — badge / empty-state / loader / breadcrumbs" body-class="pt-2" card-class="mt-3">
                    <p class="form-hint" style="margin-top:0;">
                        Mikro-komponenty używane wszędzie: statusy, puste listy, wskaźniki ładowania, ścieżki nawigacyjne.
                    </p>

                    <h4 style="margin:10px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-status-badge</h4>
                    <psy-stack direction="row" gap="sm" wrap>
                        <psy-status-badge variant="info" icon="ℹ" label="Info"></psy-status-badge>
                        <psy-status-badge variant="success" icon="✓" label="Zapisano"></psy-status-badge>
                        <psy-status-badge variant="warning" icon="⚠" label="Uwaga"></psy-status-badge>
                        <psy-status-badge variant="danger" icon="×" label="Błąd"></psy-status-badge>
                        <psy-status-badge variant="neutral" label="Szkic"></psy-status-badge>
                        <psy-status-badge variant="info" icon="☁️" label="Drive · pacjenci"></psy-status-badge>
                    </psy-stack>

                    <h4 style="margin:10px 0 4px 0;font-size:13px;color:#1E3A8A;">rozmiary (xs / sm / md) i tryb „dot"</h4>
                    <psy-stack direction="row" gap="sm" align="center" wrap>
                        <psy-status-badge variant="success" size="xs" label="xs"></psy-status-badge>
                        <psy-status-badge variant="success" size="sm" label="sm"></psy-status-badge>
                        <psy-status-badge variant="success" size="md" label="md"></psy-status-badge>
                        <span style="color:#94A3B8;">·</span>
                        <psy-status-badge variant="info" dot label="online"></psy-status-badge>
                        <psy-status-badge variant="success" dot label="ok"></psy-status-badge>
                        <psy-status-badge variant="warning" dot label="warn"></psy-status-badge>
                        <psy-status-badge variant="danger" dot label="off"></psy-status-badge>
                    </psy-stack>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-empty-state</h4>
                    <psy-grid columns="2" gap="md">
                        <psy-empty-state
                            icon="📭"
                            title="Brak pacjentów"
                            description="Dodaj pierwszego pacjenta, aby rozpocząć pracę."
                        >
                            <psy-button slot="actions" variant="primary" size="sm">+ Nowy pacjent</psy-button>
                        </psy-empty-state>

                        <psy-empty-state
                            variant="danger"
                            icon="⚠"
                            title="Błąd połączenia"
                            description="Nie udało się połączyć z Google Drive. Sprawdź internet lub zaloguj się ponownie."
                        >
                            <psy-button slot="actions" variant="secondary" size="sm">Spróbuj ponownie</psy-button>
                        </psy-empty-state>
                    </psy-grid>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-loader — 3 warianty</h4>
                    <psy-grid columns="3" gap="md">
                        <psy-panel><psy-loader variant="spinner" size="md" label="Ładowanie pacjentów…"></psy-loader></psy-panel>
                        <psy-panel><psy-loader variant="dots" size="md" label="Zapisywanie…"></psy-loader></psy-panel>
                        <psy-panel><psy-loader variant="skeleton" lines="4"></psy-loader></psy-panel>
                    </psy-grid>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-breadcrumbs</h4>
                    <psy-breadcrumbs
                        .items=${[
                            { id:'patients', label:'Pacjenci' },
                            { id:'kowalski', label:'Jan Kowalski' },
                            { id:'visits', label:'Wizyty' },
                            { id:'v1', label:'2026-04-15 · Kolejna wizyta' }
                        ]}
                    ></psy-breadcrumbs>
                </psy-card>

                <psy-card title="Szablony stron (PR-06) — template-list / form / dashboard / split" body-class="pt-2" card-class="mt-3">
                    <p class="form-hint" style="margin-top:0;">
                        Szablony komponują wszystkie poprzednie prymitywy w gotowe układy widoków.
                        Widok biznesowy = <strong>jedna linia JSX + konfig</strong> (dane przez parametry, treść przez sloty).
                    </p>

                    <h4 style="margin:10px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-template-list — lista pacjentów z wyszukiwaniem i filtrem</h4>
                    <div style="border:1px solid #E5E7EB;border-radius:8px;padding:6px;background:#F9FAFB;">
                        <psy-template-list
                            title="Pacjenci"
                            compact
                            searchable
                            search-placeholder="Szukaj pacjenta..."
                            item-id-key="code"
                            selected-id="P001"
                            .filters=${[
                                {
                                    id: 'status',
                                    value: 'all',
                                    options: [
                                        { value: 'all', label: 'Wszyscy' },
                                        { value: 'active', label: 'Aktywni' },
                                        { value: 'archived', label: 'Archiwalni' }
                                    ]
                                }
                            ]}
                            .columns=${[
                                { key: 'code', label: 'Kod', width: '70px' },
                                { key: 'name', label: 'Imię i nazwisko' },
                                { key: 'phone', label: 'Telefon' },
                                { key: 'lastVisit', label: 'Ostatnia wizyta', width: '140px' },
                                {
                                    key: 'status',
                                    label: 'Status',
                                    width: '120px',
                                    render: (item) => html`
                                        <psy-status-badge
                                            variant=${item.status === 'active' ? 'success' : 'neutral'}
                                            size="xs"
                                            label=${item.status === 'active' ? 'Aktywny' : 'Archiwum'}
                                        ></psy-status-badge>`
                                }
                            ]}
                            .items=${[
                                { code: 'P001', name: 'Jan Kowalski',       phone: '+48 500 100 200', lastVisit: '2026-04-15', status: 'active' },
                                { code: 'P002', name: 'Anna Nowak',         phone: '+48 600 200 300', lastVisit: '2026-04-10', status: 'active' },
                                { code: 'P003', name: 'Marek Wiśniewski',   phone: '+48 700 300 400', lastVisit: '—',         status: 'active' },
                                { code: 'P004', name: 'Ewa Lewandowska',    phone: '+48 800 400 500', lastVisit: '2025-12-03', status: 'archived' }
                            ]}
                        >
                            <psy-button slot="actions" variant="primary" size="sm">+ Nowy pacjent</psy-button>
                        </psy-template-list>
                    </div>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-template-form — wywiad z paskiem pacjenta i akordeonem sekcji</h4>
                    <div style="border:1px solid #E5E7EB;border-radius:8px;padding:6px;background:#F9FAFB;">
                        <psy-template-form
                            title="Wywiad kliniczny (pierwsza wizyta)"
                            compact
                            initial-open="dane"
                            .patientContext=${{
                                name: 'Jan Kowalski',
                                age: '34 lata',
                                details: patientMeta,
                                sticky: false
                            }}
                            .sections=${[
                                { id: 'dane',    label: 'Dane osobowe',    level: 1, columns: '2' },
                                { id: 'wywiad',  label: 'Wywiad',          level: 1 },
                                { id: 'plan',    label: 'Plan terapii',    level: 1, columns: '2' }
                            ]}
                            .actions=${[
                                { id: 'cancel', label: 'Anuluj', variant: 'secondary' },
                                { id: 'save',   label: 'Zapisz wywiad', variant: 'primary' }
                            ]}
                            .autosaveStatus=${{ variant: 'success', icon: '💾', label: 'Zapisano · 14:32' }}
                            @psy-form-action=${(ev) => window.PsyToast.notify({
                                variant: ev.detail.id === 'save' ? 'success' : 'info',
                                title: ev.detail.id === 'save' ? 'Zapisano' : 'Anulowano',
                                message: `Akcja: ${ev.detail.id}`
                            }, 'demo-toasts')}
                        >
                            <psy-button slot="patient-bar-actions" variant="secondary" size="sm">Zmień pacjenta</psy-button>

                            <div slot="section-dane">
                                <psy-form-field kind="input" field-id="demo-pr06-imie" label="Imię" value="Jan"></psy-form-field>
                                <psy-form-field kind="input" field-id="demo-pr06-nazw" label="Nazwisko" value="Kowalski"></psy-form-field>
                                <psy-form-field kind="date" field-id="demo-pr06-urodz" label="Data urodzenia" value="1992-01-01"></psy-form-field>
                                <psy-form-field kind="tel" field-id="demo-pr06-tel" label="Telefon" value="+48 500 100 200"></psy-form-field>
                            </div>

                            <div slot="section-wywiad">
                                <psy-form-field
                                    kind="textarea"
                                    field-id="demo-pr06-opis"
                                    label="Opis dolegliwości"
                                    rows="3"
                                ></psy-form-field>
                                <psy-checkbox-group
                                    label="Objawy obecne"
                                    data-field="demoPr06Objawy"
                                    .options=${checkboxOptions}
                                    columns="2"
                                    compact
                                ></psy-checkbox-group>
                                <psy-tag-input
                                    field-id="demo-pr06-diagnoza"
                                    label="Rozpoznania (ICD-10)"
                                    .tags=${['F32.1', 'F41.1']}
                                    .suggestions=${['F33.0', 'F40.1', 'F43.2']}
                                ></psy-tag-input>
                            </div>

                            <div slot="section-plan">
                                <psy-form-field
                                    kind="select"
                                    field-id="demo-pr06-typ-planu"
                                    label="Typ planu"
                                    .options=${selectOptions}
                                ></psy-form-field>
                                <psy-form-field
                                    kind="number"
                                    field-id="demo-pr06-sesje"
                                    label="Liczba sesji"
                                    min="1" max="20" step="1" value="10"
                                ></psy-form-field>
                            </div>
                        </psy-template-form>
                    </div>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-template-dashboard — KPI + sekcje</h4>
                    <div style="border:1px solid #E5E7EB;border-radius:8px;padding:6px;background:#F9FAFB;">
                        <psy-template-dashboard
                            title="Przegląd miesiąca"
                            compact
                            kpi-min="160"
                            .kpis=${[
                                { label: 'Pacjenci aktywni', value: 42,  unit: 'osób',  variant: 'info',    icon: '📋', trend: '+3 vs poprz.', trendDir: 'up' },
                                { label: 'Wizyty',           value: 128, unit: 'w mies.', variant: 'success', icon: '🗓️', trend: '+12%',        trendDir: 'up' },
                                { label: 'Nowi pacjenci',    value: 7,                   variant: 'neutral', icon: '✨', trend: 'stabilnie',   trendDir: 'neutral' },
                                { label: 'Anulowane',        value: 4,                   variant: 'warning', icon: '⚠',  trend: '-2',          trendDir: 'down' }
                            ]}
                            .sections=${[
                                { id: 'top-patients', title: 'Pacjenci z największą liczbą wizyt' },
                                { id: 'recent',       title: 'Ostatnie wizyty' }
                            ]}
                        >
                            <psy-button slot="actions" variant="secondary" size="sm">⤓ Eksport PDF</psy-button>

                            <div slot="section-top-patients">
                                <psy-stack direction="column" gap="xs">
                                    <psy-stack direction="row" gap="sm" align="center">
                                        <psy-status-badge variant="info" label="1" size="xs"></psy-status-badge>
                                        <span style="flex:1;">Jan Kowalski · P001</span>
                                        <strong>8 wizyt</strong>
                                    </psy-stack>
                                    <psy-stack direction="row" gap="sm" align="center">
                                        <psy-status-badge variant="info" label="2" size="xs"></psy-status-badge>
                                        <span style="flex:1;">Anna Nowak · P002</span>
                                        <strong>6 wizyt</strong>
                                    </psy-stack>
                                    <psy-stack direction="row" gap="sm" align="center">
                                        <psy-status-badge variant="info" label="3" size="xs"></psy-status-badge>
                                        <span style="flex:1;">Marek Wiśniewski · P003</span>
                                        <strong>5 wizyt</strong>
                                    </psy-stack>
                                </psy-stack>
                            </div>

                            <div slot="section-recent">
                                <table class="results-table" style="font-size:12.5px;">
                                    <thead>
                                        <tr><th>Data</th><th>Pacjent</th><th>Typ</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr><td>2026-04-18</td><td>Jan Kowalski</td><td>Kolejna wizyta</td></tr>
                                        <tr><td>2026-04-17</td><td>Anna Nowak</td><td>Wywiad kliniczny</td></tr>
                                        <tr><td>2026-04-15</td><td>Marek Wiśniewski</td><td>Kolejna wizyta</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </psy-template-dashboard>
                    </div>

                    <h4 style="margin:12px 0 4px 0;font-size:13px;color:#1E3A8A;">psy-template-split — lista + detal (resizable)</h4>
                    <div style="border:1px solid #E5E7EB;border-radius:8px;padding:6px;background:#F9FAFB;">
                        <psy-template-split
                            title="Załączniki"
                            compact
                            left-width="280"
                            persist-key="demo-tpl-split"
                        >
                            <psy-button slot="actions" variant="primary" size="sm">+ Dodaj plik</psy-button>

                            <div slot="list">
                                <psy-search-input
                                    field-id="demo-pr06-split-search"
                                    placeholder="Szukaj pliku..."
                                ></psy-search-input>
                                <ul style="list-style:none;margin:6px 0 0 0;padding:0;font-size:12.5px;display:flex;flex-direction:column;gap:2px;">
                                    <li style="padding:6px 8px;border-radius:4px;background:#DBEAFE;color:#1D4ED8;font-weight:600;">📄 Zaswiadczenie_Kowalski.pdf</li>
                                    <li style="padding:6px 8px;">🖼️ Skan_skierowania.jpg</li>
                                    <li style="padding:6px 8px;">📝 Notatka_2026-04-15.docx</li>
                                    <li style="padding:6px 8px;">📊 Wyniki_PHQ-9.xlsx</li>
                                </ul>
                            </div>

                            <div slot="detail">
                                <psy-breadcrumbs
                                    .items=${[
                                        { id: 'pat', label: 'Pacjenci' },
                                        { id: 'kowalski', label: 'Jan Kowalski' },
                                        { id: 'att', label: 'Załączniki' },
                                        { id: 'file', label: 'Zaswiadczenie_Kowalski.pdf' }
                                    ]}
                                ></psy-breadcrumbs>

                                <psy-stack direction="row" gap="sm" align="center" wrap style="margin-top:6px;">
                                    <psy-status-badge variant="info" icon="📄" label="PDF · 124 kB"></psy-status-badge>
                                    <psy-status-badge variant="neutral" label="2026-04-15 14:30"></psy-status-badge>
                                    <span style="flex:1;"></span>
                                    <psy-button variant="secondary" size="sm">⤓ Pobierz</psy-button>
                                    <psy-button variant="subtle-danger" size="sm">🗑 Usuń</psy-button>
                                </psy-stack>

                                <div style="margin-top:10px;padding:14px;background:#FFFFFF;border:1px dashed #CBD5E1;border-radius:6px;text-align:center;color:#64748B;font-size:13px;">
                                    Podgląd pliku (placeholder — w Fazie 5 zostanie podpięty PDF.js / mammoth).
                                </div>

                                <div style="margin-top:10px;">
                                    <psy-form-field
                                        kind="textarea"
                                        field-id="demo-pr06-comment"
                                        label="Komentarz do załącznika"
                                        rows="2"
                                        placeholder="Dodaj notatkę..."
                                    ></psy-form-field>
                                </div>
                            </div>
                        </psy-template-split>
                    </div>
                </psy-card>

                <div class="form-actions">
                    <psy-button variant="primary" size="sm">Akcja główna</psy-button>
                    <psy-button variant="secondary" size="sm">Akcja poboczna</psy-button>
                </div>
            </psy-card>
        `;
    }
}

if (!customElements.get('psy-components-demo')) {
    customElements.define('psy-components-demo', PsyComponentsDemo);
}
