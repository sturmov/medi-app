// ============================================================================
// psy-tabs - kontroler zakładek. Odczytuje dzieci `psy-tab-panel` i renderuje:
//   - listę przycisków-zakładek (role=tablist + tab-y)
//   - kontener paneli (samo `<slot>` dla dzieci)
//
// Atrybuty:
//   - active-id : id aktualnie aktywnej zakładki (reflect)
//   - variant   : "line|pill"   (default "line")
//   - size      : "sm|md"       (default "sm")
//   - compact   : Boolean
//   - extra-class : dodatkowe klasy CSS
//   - tabs-id     : id zewnętrzne
//
// Klawiatura (WAI-ARIA Tabs Pattern):
//   - ArrowLeft/ArrowRight : poprzednia/następna (roving tabindex)
//   - Home/End             : pierwsza/ostatnia
//   - Enter/Space          : aktywacja (dla `activateOnFocus=false`)
//   - domyślnie aktywacja następuje natychmiast przy zmianie fokusa
//
// Emituje:
//   - `psy-tab-change` {id, previousId}
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const VALID_VARIANT = new Set(['line', 'pill']);
const VALID_SIZE = new Set(['sm', 'md']);

export class PsyTabs extends LitElement {
    static properties = {
        activeId: { type: String, attribute: 'active-id', reflect: true },
        variant: { type: String, reflect: true },
        size: { type: String, reflect: true },
        compact: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' },
        tabsId: { type: String, attribute: 'tabs-id' },
        _panels: { state: true }
    };

    constructor() {
        super();
        this.activeId = '';
        this.variant = 'line';
        this.size = 'sm';
        this.compact = false;
        this.extraClass = '';
        this.tabsId = '';
        this._panels = [];
        this._onSlotChange = this._onSlotChange.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Delay scan until children are in the DOM
        queueMicrotask(() => this._rescanPanels());
        // Observe later additions/removals
        this._observer = new MutationObserver(() => this._rescanPanels());
        this._observer.observe(this, { childList: true, subtree: false });
    }

    disconnectedCallback() {
        if (this._observer) this._observer.disconnect();
        super.disconnectedCallback();
    }

    _onSlotChange() {
        this._rescanPanels();
    }

    _rescanPanels() {
        const children = Array.from(this.children).filter(
            (el) => el.tagName && el.tagName.toLowerCase() === 'psy-tab-panel'
        );

        const panels = children.map((el, idx) => ({
            el,
            id: el.getAttribute('tab-id') || `tab-${idx}`,
            label: el.getAttribute('label') || `Zakładka ${idx + 1}`,
            icon: el.getAttribute('icon') || '',
            badge: el.getAttribute('badge') || '',
            disabled: el.hasAttribute('disabled')
        }));

        this._panels = panels;

        // Auto-select first non-disabled if no active
        if (!this.activeId && panels.length) {
            const firstEnabled = panels.find((p) => !p.disabled) || panels[0];
            this.activeId = firstEnabled.id;
        }

        this._syncActivePanels();
    }

    _syncActivePanels() {
        for (const p of this._panels) {
            p.el.active = p.id === this.activeId;
        }
    }

    updated(changed) {
        if (changed.has('activeId')) {
            this._syncActivePanels();
        }
    }

    _classes() {
        const variant = VALID_VARIANT.has(this.variant) ? this.variant : 'line';
        const size = VALID_SIZE.has(this.size) ? this.size : 'sm';
        const classes = [
            'psy-tabs',
            `psy-tabs--${variant}`,
            `psy-tabs--${size}`
        ];
        if (this.compact) classes.push('psy-tabs--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _activate(id) {
        if (!id || id === this.activeId) return;
        const panel = this._panels.find((p) => p.id === id);
        if (!panel || panel.disabled) return;

        const previousId = this.activeId;
        this.activeId = id;
        this._syncActivePanels();

        this.dispatchEvent(new CustomEvent('psy-tab-change', {
            detail: { id, previousId },
            bubbles: true,
            composed: true
        }));
    }

    _onTabClick(id) {
        this._activate(id);
    }

    _onTabKeydown(ev, currentIndex) {
        const enabled = this._panels
            .map((p, idx) => ({ p, idx }))
            .filter(({ p }) => !p.disabled);
        if (!enabled.length) return;

        const currentEnabledIdx = enabled.findIndex(({ idx }) => idx === currentIndex);
        let nextEnabledIdx = currentEnabledIdx;

        switch (ev.key) {
            case 'ArrowRight':
                ev.preventDefault();
                nextEnabledIdx = (currentEnabledIdx + 1) % enabled.length;
                break;
            case 'ArrowLeft':
                ev.preventDefault();
                nextEnabledIdx = (currentEnabledIdx - 1 + enabled.length) % enabled.length;
                break;
            case 'Home':
                ev.preventDefault();
                nextEnabledIdx = 0;
                break;
            case 'End':
                ev.preventDefault();
                nextEnabledIdx = enabled.length - 1;
                break;
            case 'Enter':
            case ' ':
                ev.preventDefault();
                if (currentEnabledIdx >= 0) {
                    this._activate(enabled[currentEnabledIdx].p.id);
                }
                return;
            default:
                return;
        }

        if (nextEnabledIdx === currentEnabledIdx) return;

        const { p } = enabled[nextEnabledIdx];
        this._activate(p.id);

        // Move focus to the newly active tab button
        queueMicrotask(() => {
            const btn = this.querySelector(`.psy-tabs__tab[data-tab-id="${CSS.escape(p.id)}"]`);
            if (btn) btn.focus();
        });
    }

    render() {
        return html`
            <div
                id=${ifDefined(this.tabsId || undefined)}
                class=${this._classes()}
            >
                <div class="psy-tabs__tablist" role="tablist">
                    ${this._panels.map((p, idx) => {
                        const isActive = p.id === this.activeId;
                        const tabClasses = [
                            'psy-tabs__tab',
                            isActive ? 'psy-tabs__tab--active' : '',
                            p.disabled ? 'psy-tabs__tab--disabled' : ''
                        ].filter(Boolean).join(' ');

                        return html`
                            <button
                                type="button"
                                class=${tabClasses}
                                role="tab"
                                data-tab-id=${p.id}
                                aria-selected=${isActive ? 'true' : 'false'}
                                tabindex=${isActive ? '0' : '-1'}
                                ?disabled=${p.disabled}
                                @click=${() => this._onTabClick(p.id)}
                                @keydown=${(ev) => this._onTabKeydown(ev, idx)}
                            >
                                ${p.icon
                                    ? html`<span class="psy-tabs__tab-icon" aria-hidden="true">${p.icon}</span>`
                                    : null}
                                <span class="psy-tabs__tab-label">${p.label}</span>
                                ${p.badge
                                    ? html`<span class="psy-tabs__tab-badge">${p.badge}</span>`
                                    : null}
                            </button>
                        `;
                    })}
                </div>

                <div class="psy-tabs__panels">
                    <slot @slotchange=${this._onSlotChange}></slot>
                </div>
            </div>
        `;
    }
}

if (!customElements.get('psy-tabs')) {
    customElements.define('psy-tabs', PsyTabs);
}
