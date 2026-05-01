// ============================================================================
// psy-split - dwukolumnowy layout "lista + detale".
//
// Sloty:
//   - `left`  : lista/nawigacja
//   - `right` : szczegóły/treść
//
// Atrybuty:
//   - left-width    : szerokość lewej kolumny w px          (default "320")
//   - min-left      : minimalna szerokość lewej kolumny     (default "220")
//   - min-right     : minimalna szerokość prawej kolumny    (default "320")
//   - collapse-at   : breakpoint (px), poniżej którego kolumny układają się w stos
//                     (default "900"; 0 = nigdy)
//   - resizable     : Boolean - dodaje uchwyt pionowy między kolumnami
//   - persist-key   : klucz localStorage (zapisuje aktualną szerokość)
//   - gap           : "xs|sm|md|lg"                         (default "md")
//   - compact       : Boolean
//   - extra-class   : dodatkowe klasy CSS
//
// Emituje:
//   - `psy-split-resize` {leftWidth} — po zakończeniu drag-a uchwytu
// ============================================================================

import { LitElement, html, ifDefined } from './lit.js';

const VALID_GAP = new Set(['xs', 'sm', 'md', 'lg']);

export class PsySplit extends LitElement {
    static properties = {
        leftWidth: { type: String, attribute: 'left-width' },
        minLeft: { type: String, attribute: 'min-left' },
        minRight: { type: String, attribute: 'min-right' },
        collapseAt: { type: String, attribute: 'collapse-at' },
        resizable: { type: Boolean, reflect: true },
        persistKey: { type: String, attribute: 'persist-key' },
        gap: { type: String },
        compact: { type: Boolean, reflect: true },
        extraClass: { type: String, attribute: 'extra-class' },
        splitId: { type: String, attribute: 'split-id' },
        _currentLeft: { state: true }
    };

    constructor() {
        super();
        this.leftWidth = '320';
        this.minLeft = '220';
        this.minRight = '320';
        this.collapseAt = '900';
        this.resizable = false;
        this.persistKey = '';
        this.gap = 'md';
        this.compact = false;
        this.extraClass = '';
        this.splitId = '';
        this._currentLeft = null;
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Restore persisted width
        if (this.persistKey) {
            try {
                const stored = window.localStorage.getItem(`psy-split:${this.persistKey}`);
                if (stored && /^\d+$/.test(stored)) {
                    this._currentLeft = stored;
                }
            } catch (_) {
                // ignore storage access errors
            }
        }
    }

    _classes() {
        const gap = VALID_GAP.has(this.gap) ? this.gap : 'md';
        const classes = ['psy-split', `psy-split--gap-${gap}`];
        if (this.resizable) classes.push('psy-split--resizable');
        if (this.compact) classes.push('psy-split--compact');
        if (this.extraClass) {
            classes.push(...String(this.extraClass).split(/\s+/).filter(Boolean));
        }
        return classes.join(' ');
    }

    _style() {
        const width = this._currentLeft || this.leftWidth || '320';
        const widthWithUnit = /^\d+$/.test(String(width)) ? `${width}px` : String(width);
        const minLeft = /^\d+$/.test(String(this.minLeft)) ? `${this.minLeft}px` : String(this.minLeft);
        const minRight = /^\d+$/.test(String(this.minRight)) ? `${this.minRight}px` : String(this.minRight);
        const collapse = /^\d+$/.test(String(this.collapseAt)) ? `${this.collapseAt}px` : String(this.collapseAt || '0');

        return [
            `--psy-split-left:${widthWithUnit}`,
            `--psy-split-min-left:${minLeft}`,
            `--psy-split-min-right:${minRight}`,
            `--psy-split-collapse-at:${collapse}`
        ].join(';');
    }

    _onHandleDown(ev) {
        if (!this.resizable) return;
        ev.preventDefault();
        this._dragging = true;
        this._dragStartX = ev.clientX;
        const current = this._currentLeft || this.leftWidth || '320';
        this._dragStartWidth = parseInt(current, 10) || 320;
        document.addEventListener('pointermove', this._onPointerMove);
        document.addEventListener('pointerup', this._onPointerUp, { once: true });
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }

    _onPointerMove(ev) {
        if (!this._dragging) return;
        const dx = ev.clientX - this._dragStartX;
        const minLeft = parseInt(this.minLeft, 10) || 220;
        const minRight = parseInt(this.minRight, 10) || 320;
        const rect = this.getBoundingClientRect();
        const maxLeft = Math.max(minLeft, rect.width - minRight - 10);
        const next = Math.max(minLeft, Math.min(maxLeft, this._dragStartWidth + dx));
        this._currentLeft = String(Math.round(next));
    }

    _onPointerUp() {
        this._dragging = false;
        document.removeEventListener('pointermove', this._onPointerMove);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (this.persistKey && this._currentLeft) {
            try {
                window.localStorage.setItem(`psy-split:${this.persistKey}`, String(this._currentLeft));
            } catch (_) {
                // ignore
            }
        }

        this.dispatchEvent(new CustomEvent('psy-split-resize', {
            detail: { leftWidth: this._currentLeft },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div
                id=${ifDefined(this.splitId || undefined)}
                class=${this._classes()}
                style=${this._style()}
            >
                <div class="psy-split__left">
                    <slot name="left"></slot>
                </div>

                ${this.resizable ? html`
                    <div
                        class="psy-split__handle"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Zmień szerokość panelu"
                        @pointerdown=${this._onHandleDown}
                    ></div>
                ` : null}

                <div class="psy-split__right">
                    <slot name="right"></slot>
                </div>
            </div>
        `;
    }
}

if (!customElements.get('psy-split')) {
    customElements.define('psy-split', PsySplit);
}
