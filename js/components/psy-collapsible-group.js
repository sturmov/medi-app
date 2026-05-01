// ============================================================================
// psy-collapsible-group – akordeon dla <psy-collapsible>
// ----------------------------------------------------------------------------
// Rola:
//   • Zbiera wszystkie <psy-collapsible> wewnątrz siebie (także zagnieżdżone
//     w prostym slotcie Light DOM, na tym samym poziomie).
//   • Tryb "akordeon": po otwarciu jednej sekcji (event psy-collapsible-open),
//     zamyka pozostałe rodzeństwo tej samej grupy.
//   • `initial-open` (opcjonalnie) – indeks od 0, który element ma być
//     otwarty po pierwszym renderze.
//   • `auto-collapse` – jeśli ustawione na grupie, propaguje atrybut do
//     dzieci (pointerdown-outside zamyka).
//   • `level-scope` – gdy ustawione (np. "1"), akordeon działa tylko dla
//     dzieci o tym `level` (pomocne gdy grupa zawiera zagnieżdżone L2/L3).
//
// Kontrakt: wszystkie zmiany stanu przebiegają przez `.open` na dzieciach;
// grupa NIE zmienia pozostałych właściwości (label, level itd.).
// Light DOM → zachowujemy istniejące style z css/compat.css.
// ============================================================================

import { LitElement, html } from './lit.js';

export class PsyCollapsibleGroup extends LitElement {
    static properties = {
        initialOpen: { type: String, attribute: 'initial-open' },
        autoCollapse: { type: Boolean, attribute: 'auto-collapse', reflect: true },
        levelScope: { type: String, attribute: 'level-scope' },
        allowNone: { type: Boolean, attribute: 'allow-none' }
    };

    constructor() {
        super();
        this.initialOpen = '';
        this.autoCollapse = false;
        this.levelScope = '';
        this.allowNone = true;

        this._onChildOpen = this._onChildOpen.bind(this);
        this._applied = false;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Nasłuchujemy eventów z dzieci (bubbles + composed).
        this.addEventListener('psy-collapsible-open', this._onChildOpen);
        // Czekamy na upgrade dzieci (customElements może być jeszcze nie zdefiniowany).
        queueMicrotask(() => this._applyInitialState());
    }

    disconnectedCallback() {
        this.removeEventListener('psy-collapsible-open', this._onChildOpen);
        super.disconnectedCallback();
    }

    updated(changed) {
        if (changed.has('autoCollapse')) {
            this._propagateAutoCollapse();
        }
        if (changed.has('initialOpen') && this._applied) {
            // Zmiana w locie – re-aplikujemy początkowy stan.
            this._applied = false;
            this._applyInitialState();
        }
    }

    /** Zwraca bezpośrednie <psy-collapsible> w zasięgu grupy (filtr opt: level-scope) */
    _collectChildren() {
        const all = Array.from(this.querySelectorAll('psy-collapsible'));
        if (!this.levelScope) return all;
        const scope = String(this.levelScope).trim();
        return all.filter((el) => String(el.level || '1') === scope);
    }

    _propagateAutoCollapse() {
        const kids = this._collectChildren();
        for (const kid of kids) {
            if (this.autoCollapse) {
                kid.setAttribute('auto-collapse', '');
                kid.autoCollapse = true;
            } else {
                kid.removeAttribute('auto-collapse');
                kid.autoCollapse = false;
            }
        }
    }

    _applyInitialState() {
        if (this._applied) return;
        const kids = this._collectChildren();
        if (!kids.length) {
            // Dzieci mogą jeszcze nie zostać sparsowane – spróbuj ponownie przy następnym microtask-u.
            // Ale tylko kilka razy, żeby nie zapętlać.
            if (!this._retryCount) this._retryCount = 0;
            if (this._retryCount < 5) {
                this._retryCount += 1;
                queueMicrotask(() => this._applyInitialState());
            }
            return;
        }

        this._propagateAutoCollapse();

        if (this.initialOpen === '' || this.initialOpen == null) {
            this._applied = true;
            return;
        }

        const idx = Number.parseInt(this.initialOpen, 10);
        if (!Number.isFinite(idx) || idx < 0 || idx >= kids.length) {
            this._applied = true;
            return;
        }

        kids.forEach((kid, i) => { kid.open = (i === idx); });
        this._applied = true;
    }

    _onChildOpen(event) {
        const source = event.target;
        if (!source || source.tagName !== 'PSY-COLLAPSIBLE') return;

        // Jeżeli mamy zakres poziomu – reaguj tylko na ten poziom.
        if (this.levelScope && String(source.level || '1') !== String(this.levelScope).trim()) {
            return;
        }

        const kids = this._collectChildren();
        for (const kid of kids) {
            if (kid !== source && kid.open) {
                kid.open = false;
            }
        }
    }

    render() {
        return html`<slot></slot>`;
    }
}

if (!customElements.get('psy-collapsible-group')) {
    customElements.define('psy-collapsible-group', PsyCollapsibleGroup);
}
