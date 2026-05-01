// ============================================================================
// Wspólny helper focus-trap dla psy-modal i psy-drawer.
//
// Publikuje klasę `FocusTrap`:
//   const trap = new FocusTrap(element);
//   trap.activate();   // zapamiętuje aktywny element, przenosi fokus do środka
//   trap.deactivate(); // przywraca fokus na element wyzwalający
//
// Cykl Tab / Shift+Tab jest zapętlony w obrębie `element`.
// ============================================================================

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
].join(',');

export class FocusTrap {
    constructor(root) {
        this.root = root;
        this._prevActive = null;
        this._onKeydown = this._onKeydown.bind(this);
    }

    _focusable() {
        return Array.from(this.root.querySelectorAll(FOCUSABLE_SELECTOR))
            .filter((el) => {
                if (el.hasAttribute('disabled')) return false;
                if (el.getAttribute('aria-hidden') === 'true') return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 || rect.height > 0;
            });
    }

    activate() {
        this._prevActive = document.activeElement;
        this.root.addEventListener('keydown', this._onKeydown);

        // Focus pierwszy element (lub root) po następnym renderze
        queueMicrotask(() => {
            const list = this._focusable();
            if (list.length) {
                list[0].focus();
            } else if (this.root.tabIndex !== -1) {
                this.root.focus();
            }
        });
    }

    deactivate() {
        this.root.removeEventListener('keydown', this._onKeydown);

        // Przywróć fokus tylko jeśli poprzedni element nadal jest w DOM
        if (this._prevActive && document.contains(this._prevActive)) {
            try {
                this._prevActive.focus();
            } catch (_) {
                // ignore
            }
        }
        this._prevActive = null;
    }

    _onKeydown(ev) {
        if (ev.key !== 'Tab') return;

        const list = this._focusable();
        if (!list.length) {
            ev.preventDefault();
            return;
        }

        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;

        if (ev.shiftKey) {
            if (active === first || !this.root.contains(active)) {
                ev.preventDefault();
                last.focus();
            }
        } else {
            if (active === last || !this.root.contains(active)) {
                ev.preventDefault();
                first.focus();
            }
        }
    }
}

let scrollLockCount = 0;
let scrollLockPrev = '';

export function lockBodyScroll() {
    scrollLockCount += 1;
    if (scrollLockCount === 1) {
        scrollLockPrev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.classList.add('modal-open');
    }
}

export function unlockBodyScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
        document.body.style.overflow = scrollLockPrev;
        document.body.classList.remove('modal-open');
    }
}
