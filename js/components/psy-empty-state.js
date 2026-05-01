// ============================================================================
// psy-empty-state - placeholder "brak danych" z opcjonalnymi akcjami.
//
// Atrybuty:
//   - icon         : string (emoji/tekst) jako wizualny znak       (np. "📭")
//   - title        : nagłówek (np. "Brak pacjentów")
//   - description  : opis pod tytułem (dłuższe zdanie)
//   - size         : "sm|md"                        (default "md")
//   - variant      : "default|muted|danger"         (default "default")
//   - extra-class
//
// Sloty:
//   - domyślny  : zastępuje description, gdy potrzebna bogatsza treść
//   - actions   : przyciski CTA (np. "Dodaj pacjenta")
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const VALID_SIZE = new Set(['sm', 'md']);
const VALID_VARIANT = new Set(['default', 'muted', 'danger']);

export class PsyEmptyState extends LitElement {
    static properties = {
        icon: { type: String },
        title: { type: String },
        description: { type: String },
        size: { type: String, reflect: true },
        variant: { type: String, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' }
    };

    constructor() {
        super();
        this.icon = '';
        this.title = '';
        this.description = '';
        this.size = 'md';
        this.variant = 'default';
        this.extraClass = '';
    }

    createRenderRoot() {
        return this;
    }

    _classes() {
        const size = VALID_SIZE.has(this.size) ? this.size : 'md';
        const variant = VALID_VARIANT.has(this.variant) ? this.variant : 'default';
        const classes = [
            'psy-empty-state',
            `psy-empty-state--${size}`,
            `psy-empty-state--${variant}`
        ];
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    _hasDefaultSlot() {
        return Array.from(this.childNodes).some((n) => {
            if (n.nodeType === Node.ELEMENT_NODE) {
                return !n.hasAttribute('slot');
            }
            if (n.nodeType === Node.TEXT_NODE) {
                return n.textContent.trim().length > 0;
            }
            return false;
        });
    }

    render() {
        return html`
            <div class=${this._classes()} role="status">
                ${this.icon ? html`
                    <div class="psy-empty-state__icon" aria-hidden="true">${this.icon}</div>
                ` : null}

                ${this.title ? html`
                    <div class="psy-empty-state__title">${this.title}</div>
                ` : null}

                <div class="psy-empty-state__description">
                    ${this.description ? html`<span>${this.description}</span>` : null}
                    <slot></slot>
                </div>

                ${this._hasNamedSlot('actions') ? html`
                    <div class="psy-empty-state__actions">
                        <slot name="actions"></slot>
                    </div>
                ` : null}
            </div>
        `;
    }
}

if (!customElements.get('psy-empty-state')) {
    customElements.define('psy-empty-state', PsyEmptyState);
}
