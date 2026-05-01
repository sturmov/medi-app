// ============================================================================
// view-patients.js — ekran startowy: lista pacjentów + wybór.
//
// Po wybraniu pacjenta router przekierowuje domyślnie do #/history.
// Dodatkowo obsługuje przycisk „+ Nowy pacjent" (otwiera psy-modal z formularzem
// danych osobowych w PR-08; w tym PR tylko stub).
// ============================================================================

import { html, LitElement } from '../components/lit.js';
import { Store } from './_store.js';

class PsyViewPatients extends LitElement {
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._unsub = Store.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        if (this._unsub) this._unsub();
        super.disconnectedCallback();
    }

    _onPickPatient(patient) {
        Store.selectPatient(patient);
        // Domyślnie po wyborze pokazujemy historię wizyt (najczęściej używany ekran).
        window.location.hash = '#/history';
    }

    _onNewPatient() {
        if (window.PsyToast) {
            window.PsyToast.notify({
                variant: 'info',
                title: 'Nowy pacjent',
                message: 'Formularz dodawania nowego pacjenta zostanie włączony w PR-08.'
            }, 'psy-app-toasts');
        }
    }

    _age(patient) {
        if (patient.wiek) return patient.wiek;
        if (patient.dataUrodzenia) {
            const d = new Date(patient.dataUrodzenia);
            if (!isNaN(d.getTime())) {
                const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
                return age + ' lat';
            }
        }
        return '—';
    }

    render() {
        const patients = Store.state.patients;
        const current = Store.state.currentPatient;

        return html`
            <psy-template-list
                title="Pacjenci"
                compact
                searchable
                search-placeholder="Szukaj pacjenta (imię, nazwisko, PESEL)..."
                item-id-key="id"
                selected-id=${current ? current.id : ''}
                .columns=${[
                    { key: 'id', label: 'Kod', width: '70px' },
                    {
                        key: 'name',
                        label: 'Pacjent',
                        render: (p) => html`<strong>${p.imie || ''} ${p.nazwisko || ''}</strong>${p.minor ? html` <span style="color:#EC4899;" title="Pacjent niepełnoletni">●</span>` : ''}`
                    },
                    { key: 'wiek', label: 'Wiek', width: '90px', render: (p) => this._age(p) },
                    { key: 'telefon', label: 'Telefon', width: '160px' },
                    {
                        key: 'lastVisit',
                        label: 'Ostatnia wizyta',
                        width: '140px',
                        render: (p) => {
                            const visits = Store.getVisits(p.id);
                            return visits.length ? visits[0].date : '—';
                        }
                    },
                    {
                        key: 'action',
                        label: '',
                        width: '90px',
                        render: (p) => html`<button class="btn btn--primary btn--sm" @click=${(e) => { e.stopPropagation(); this._onPickPatient(p); }}>Wybierz</button>`
                    }
                ]}
                .items=${patients}
                .emptyState=${{
                    icon: '📋',
                    title: 'Brak pacjentów',
                    description: 'Dodaj pierwszego pacjenta, aby rozpocząć pracę.'
                }}
                @psy-item-select=${(ev) => this._onPickPatient(ev.detail.item)}
            >
                <psy-button slot="actions" variant="primary" size="sm"
                    @click=${() => this._onNewPatient()}>
                    + Nowy pacjent
                </psy-button>
            </psy-template-list>
        `;
    }
}

if (!customElements.get('psy-view-patients')) {
    customElements.define('psy-view-patients', PsyViewPatients);
}
