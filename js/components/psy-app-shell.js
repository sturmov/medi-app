// ============================================================================
// psy-app-shell - root layout aplikacji (CSS Grid).
//
// Sloty:
//   - `topbar`       -> górny pasek (psy-topbar lub własny element)
//   - `patient-bar`  -> kontekst pacjenta (psy-patient-context variant="bar")
//   - `sidebar`      -> nawigacja boczna (psy-sidebar)
//   - domyślny       -> treść widoków (psy-view / psy-template-*)
//   - `drawer`       -> overlay z boku (psy-drawer) — pozycjonowany absolute
//   - `toast`        -> overlay powiadomień (psy-toast)
//
// Atrybuty:
//   - sidebar-collapsed  : ikonowy tryb sidebara
//   - sidebar-open       : tryb mobile (sidebar wysunięty)
//   - fullscreen         : shell wypełnia viewport (100vh)
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

export class PsyAppShell extends LitElement {
    static properties = {
        sidebarCollapsed: { type: Boolean, attribute: 'sidebar-collapsed', reflect: true },
        sidebarOpen: { type: Boolean, attribute: 'sidebar-open', reflect: true },
        fullscreen: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' },
        shellId: { type: String, attribute: 'shell-id' }
    };

    constructor() {
        super();
        this.sidebarCollapsed = false;
        this.sidebarOpen = false;
        this.fullscreen = false;
        this.extraClass = '';
        this.shellId = '';
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        this.addEventListener('psy-toggle-sidebar', this._onToggleSidebar);
    }

    disconnectedCallback() {
        this.removeEventListener('psy-toggle-sidebar', this._onToggleSidebar);
        super.disconnectedCallback();
    }

    _onToggleSidebar = () => {
        this.sidebarOpen = !this.sidebarOpen;
    };

    _classes() {
        const classes = ['psy-app-shell'];
        if (this.fullscreen) classes.push('psy-app-shell--fullscreen');
        if (this.sidebarCollapsed) classes.push('psy-app-shell--sidebar-collapsed');
        if (this.sidebarOpen) classes.push('psy-app-shell--sidebar-open');
        if (this._hasNamedSlot('patient-bar')) classes.push('psy-app-shell--has-patient-bar');
        if (this._hasNamedSlot('sidebar')) classes.push('psy-app-shell--has-sidebar');
        if (this._hasNamedSlot('topbar')) classes.push('psy-app-shell--has-topbar');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _hasNamedSlot(name) {
        return !!this.querySelector(`[slot="${name}"]`);
    }

    render() {
        const hasTopbar = this._hasNamedSlot('topbar');
        const hasPatientBar = this._hasNamedSlot('patient-bar');
        const hasSidebar = this._hasNamedSlot('sidebar');
        const hasDrawer = this._hasNamedSlot('drawer');
        const hasToast = this._hasNamedSlot('toast');

        return html`
            <div
                id=${ifDefined(this.shellId || undefined)}
                class=${this._classes()}
            >
                ${hasTopbar ? html`
                    <div class="psy-app-shell__topbar">
                        <slot name="topbar"></slot>
                    </div>
                ` : null}

                ${hasPatientBar ? html`
                    <div class="psy-app-shell__patient-bar">
                        <slot name="patient-bar"></slot>
                    </div>
                ` : null}

                ${hasSidebar ? html`
                    <aside class="psy-app-shell__sidebar">
                        <slot name="sidebar"></slot>
                    </aside>
                ` : null}

                <main class="psy-app-shell__main">
                    <slot></slot>
                </main>

                ${hasDrawer ? html`
                    <div class="psy-app-shell__drawer">
                        <slot name="drawer"></slot>
                    </div>
                ` : null}

                ${hasToast ? html`
                    <div class="psy-app-shell__toast">
                        <slot name="toast"></slot>
                    </div>
                ` : null}
            </div>
        `;
    }
}

if (!customElements.get('psy-app-shell')) {
    customElements.define('psy-app-shell', PsyAppShell);
}
