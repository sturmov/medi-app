// ============================================================================
// psy-patient-context - sticky kontekst pacjenta.
// Warianty:
//   - `variant="bar"`  (domyślny, 2026-04-17 feedback PO):
//     wąski sticky pasek z kluczowymi informacjami w jednej linii.
//     Zużywa minimum pionowej przestrzeni (1366x768 – priorytet klientki).
//   - `variant="card"`:
//     większy card-style panel (używany w widoku „Profil pacjenta”,
//     gdzie naturalnie jest więcej miejsca).
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyPatientContext extends LitElement {
    static properties = {
        variant: { type: String, reflect: true },
        title: { type: String },
        patientName: { type: String, attribute: 'patient-name' },
        patientCode: { type: String, attribute: 'patient-code' },
        patientPhone: { type: String, attribute: 'patient-phone' },
        patientPesel: { type: String, attribute: 'patient-pesel' },
        patientAge: { type: String, attribute: 'patient-age' },
        minor: { type: Boolean },
        patientDetails: { type: Object, attribute: false },
        compact: { type: Boolean },
        sticky: { type: Boolean },
        extraClass: { type: String, attribute: 'extra-class' },
        contextId: { type: String, attribute: 'context-id' }
    };

    constructor() {
        super();
        this.variant = 'bar';
        this.title = 'Kontekst pacjenta';
        this.patientName = '';
        this.patientCode = '';
        this.patientPhone = '';
        this.patientPesel = '';
        this.patientAge = '';
        this.minor = false;
        this.patientDetails = [];
        this.compact = false;
        this.sticky = true;
        this.extraClass = '';
        this.contextId = '';
    }

    createRenderRoot() {
        return this;
    }

    _isBar() {
        return String(this.variant || 'bar').toLowerCase() !== 'card';
    }

    _classes() {
        const classes = ['psy-patient-context'];
        if (this._isBar()) {
            classes.push('psy-patient-context--bar');
        } else {
            classes.push('psy-patient-context--card', 'card');
        }
        if (this.sticky) classes.push('psy-patient-context--sticky');
        if (this.compact) classes.push('psy-patient-context--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _resolvedDetails() {
        if (Array.isArray(this.patientDetails)) {
            return this.patientDetails
                .map((item) => {
                    if (!item || typeof item !== 'object') return null;
                    const label = item.label != null ? String(item.label) : '';
                    const value = item.value != null ? String(item.value) : '';
                    if (!label && !value) return null;
                    return {
                        label,
                        value,
                        priority: Number.isFinite(item.priority) ? item.priority : 0
                    };
                })
                .filter(Boolean);
        }

        if (typeof this.patientDetails === 'string' && this.patientDetails.trim()) {
            try {
                const parsed = JSON.parse(this.patientDetails);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map((item) => {
                            if (!item || typeof item !== 'object') return null;
                            const label = item.label != null ? String(item.label) : '';
                            const value = item.value != null ? String(item.value) : '';
                            if (!label && !value) return null;
                            return {
                                label,
                                value,
                                priority: Number.isFinite(item.priority) ? item.priority : 0
                            };
                        })
                        .filter(Boolean);
                }
            } catch (_) {
                // ignore invalid json
            }
        }

        const quickDetails = [
            this.patientCode ? { label: 'Kod', value: this.patientCode, priority: 1 } : null,
            this.patientPhone ? { label: 'Tel', value: this.patientPhone, priority: 2 } : null,
            this.patientPesel ? { label: 'PESEL', value: this.patientPesel, priority: 3 } : null,
            this.patientAge ? { label: 'Wiek', value: this.patientAge, priority: 0 } : null
        ].filter(Boolean);

        return quickDetails;
    }

    _fallbackName() {
        return this.patientName || 'Brak wybranego pacjenta';
    }

    render() {
        const details = this._resolvedDetails();

        if (this._isBar()) {
            return this._renderBar(details);
        }
        return this._renderCard(details);
    }

    // --- wariant BAR --------------------------------------------------------
    _renderBar(details) {
        // W pasku wiek doklejamy bezpośrednio przy imieniu, pozostałe pola
        // wyświetlamy jako oddzielne „kafelki” z priorytetem (do chowania na
        // wąskich ekranach przez CSS).
        const ageItem = details.find((d) => d.label === 'Wiek');
        const meta = details.filter((d) => d !== ageItem);

        return html`
            <div
                id=${ifDefined(this.contextId || undefined)}
                class=${this._classes()}
                role="region"
                aria-label="Kontekst pacjenta"
            >
                <div class="psy-patient-context__bar-inner">
                    ${this.minor ? html`
                        <span
                            class="psy-patient-context__minor"
                            title="Pacjent niepełnoletni"
                            aria-label="Pacjent niepełnoletni"
                        >●</span>
                    ` : null}

                    <span class="psy-patient-context__name-inline">
                        ${this._fallbackName()}${ageItem
                            ? html` <span class="psy-patient-context__age">· ${ageItem.value}</span>`
                            : null}
                    </span>

                    ${meta.length ? html`
                        <ul class="psy-patient-context__meta-bar">
                            ${meta.map((item) => html`
                                <li
                                    class="psy-patient-context__meta-item-bar"
                                    data-priority=${item.priority}
                                >
                                    <span class="psy-patient-context__meta-label">${item.label}</span>
                                    <span class="psy-patient-context__meta-value">${item.value}</span>
                                </li>
                            `)}
                        </ul>
                    ` : null}

                    <div class="psy-patient-context__actions">
                        <slot name="actions"></slot>
                    </div>
                </div>
            </div>
        `;
    }

    // --- wariant CARD -------------------------------------------------------
    _renderCard(details) {
        return html`
            <section
                id=${ifDefined(this.contextId || undefined)}
                class=${this._classes()}
                aria-label="Kontekst pacjenta"
            >
                <div class="psy-patient-context__header">
                    <h2 class="card__title">${this.title}</h2>
                </div>

                <div class="card__body psy-patient-context__body">
                    <div class="psy-patient-context__name">
                        ${this.minor ? html`<span
                            class="psy-patient-context__minor"
                            title="Pacjent niepełnoletni"
                            aria-label="Pacjent niepełnoletni"
                        >●</span> ` : null}
                        ${this._fallbackName()}
                    </div>

                    ${details.length
                        ? html`
                            <dl class="psy-patient-context__meta">
                                ${details.map((item) => html`
                                    <div class="psy-patient-context__meta-item">
                                        <dt>${item.label}</dt>
                                        <dd>${item.value}</dd>
                                    </div>
                                `)}
                            </dl>
                        `
                        : html`<div class="psy-patient-context__empty">Wybierz pacjenta, aby zobaczyć kontekst wizyty.</div>`}

                    <slot></slot>
                </div>
            </section>
        `;
    }
}

if (!customElements.get('psy-patient-context')) {
    customElements.define('psy-patient-context', PsyPatientContext);
}
