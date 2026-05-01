// ============================================================================
// psy-collapsible - reusable collapsible tree section (L1/L2/L3)
// ----------------------------------------------------------------------------
// PR-03:
//   • auto-collapse – gdy włączone i użytkownik kliknie POZA elementem,
//     sekcja się zamyka. Używamy `pointerdown` w fazie capturing, żeby
//     zdążyć przed defaultową akcją <details> i nie reagować na globalny
//     blur/focusout (zgodnie z .clinerules sec.10).
//   • eventy `psy-collapsible-open` / `psy-collapsible-close` do koordynacji
//     z `psy-collapsible-group` (akordeon). Bubbles + composed, żeby
//     rodzic-grupa mógł nasłuchiwać niezależnie od zagnieżdżeń.
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyCollapsible extends LitElement {
    static properties = {
        label: { type: String },
        level: { type: String },
        open: { type: Boolean, reflect: true },
        collapsibleId: { type: String, attribute: 'collapsible-id' },
        summaryClass: { type: String, attribute: 'summary-class' },
        bodyClass: { type: String, attribute: 'body-class' },
        extraClass: { type: String, attribute: 'extra-class' },
        pill: { type: String },
        icon: { type: String },
        compact: { type: Boolean },
        autoCollapse: { type: Boolean, attribute: 'auto-collapse', reflect: true },
        groupKey: { type: String, attribute: 'group-key' }
    };

    constructor() {
        super();
        this.label = '';
        this.level = '1';
        this.open = false;
        this.collapsibleId = '';
        this.summaryClass = '';
        this.bodyClass = '';
        this.extraClass = '';
        this.pill = '';
        this.icon = '';
        this.compact = false;
        this.autoCollapse = false;
        this.groupKey = '';

        // Bind raz – żeby `addEventListener` i `removeEventListener` pracowały na tej samej referencji.
        this._onDocumentPointerDown = this._onDocumentPointerDown.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Nasłuchujemy zawsze – dopiero w handlerze sprawdzamy `this.autoCollapse`,
        // dzięki czemu zmiana atrybutu w locie (np. z demo-toolbar) działa natychmiast.
        document.addEventListener('pointerdown', this._onDocumentPointerDown, true);
    }

    disconnectedCallback() {
        document.removeEventListener('pointerdown', this._onDocumentPointerDown, true);
        super.disconnectedCallback();
    }

    _onDocumentPointerDown(event) {
        if (!this.autoCollapse) return;
        if (!this.open) return;

        const target = event.target;
        // Kliknięcie wewnątrz sekcji (summary lub body) – nic nie robimy.
        // `composedPath()` zabezpiecza przypadek shadow-DOM w zagnieżdżonych komponentach.
        const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
        if (path && path.includes(this)) return;
        if (target && this.contains(target)) return;

        // Zamknij sekcję + wyślij event (przydaje się w <psy-collapsible-group>).
        this.open = false;
        this.dispatchEvent(new CustomEvent('psy-collapsible-close', {
            bubbles: true,
            composed: true,
            detail: { reason: 'outside-click', key: this.groupKey || this.collapsibleId || null }
        }));
    }

    _normalizedLevel() {
        const raw = String(this.level || '1').trim();
        if (raw === '2' || raw === '3') return raw;
        return '1';
    }

    _containerClasses() {
        const level = this._normalizedLevel();
        const classes = ['psy-collapsible', `psy-collapsible--l${level}`];

        if (this.open) classes.push('is-open');
        if (this.compact) classes.push('psy-collapsible--compact');
        if (this.autoCollapse) classes.push('psy-collapsible--auto-collapse');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }

        return classes.join(' ');
    }

    _summaryClasses() {
        const classes = ['psy-collapsible__summary'];
        if (this.summaryClass) {
            classes.push(...String(this.summaryClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _bodyClasses() {
        const classes = ['psy-collapsible__body'];
        if (this.bodyClass) {
            classes.push(...String(this.bodyClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _onToggle(event) {
        const isOpen = !!event.target.open;
        const changed = this.open !== isOpen;
        this.open = isOpen;
        if (!changed) return;

        this.dispatchEvent(new CustomEvent(
            isOpen ? 'psy-collapsible-open' : 'psy-collapsible-close',
            {
                bubbles: true,
                composed: true,
                detail: { reason: 'toggle', key: this.groupKey || this.collapsibleId || null }
            }
        ));
    }

    render() {
        const level = this._normalizedLevel();
        const defaultPill = this.pill || `L${level}`;

        return html`
            <details
                id=${ifDefined(this.collapsibleId || undefined)}
                class=${this._containerClasses()}
                ?open=${this.open}
                @toggle=${this._onToggle}
            >
                <summary class=${this._summaryClasses()}>
                    <span class="tree-pill ${level === '1' ? '' : 'tree-pill--sub'}">${defaultPill}</span>
                    ${this.icon ? html`<span class="psy-collapsible__icon">${this.icon}</span>` : html``}
                    <span class="psy-collapsible__label">${this.label}<slot name="label"></slot></span>
                    <span class="psy-collapsible__chevron" aria-hidden="true">▾</span>
                </summary>

                <div class=${this._bodyClasses()}>
                    <slot></slot>
                </div>
            </details>
        `;
    }
}

if (!customElements.get('psy-collapsible')) {
    customElements.define('psy-collapsible', PsyCollapsible);
}
