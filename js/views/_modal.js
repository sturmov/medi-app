// ============================================================================
// _modal.js — własny helper modalny (backdrop + dialog + ESC + click-outside).
//
// Dlaczego nie `psy-modal` (Lit w Light DOM)? Sloty w Light DOM są zawodne
// przy dynamicznie wstawianej treści — wybieramy prostą, deterministyczną
// implementację na czystym DOM.
//
// API:
//   openModal({
//     title        : string,
//     body         : HTMLElement,                  // zawartość
//     actions      : [{label, variant, onClick, closeOnClick}],  // przyciski w stopce
//     size         : 'sm' | 'md' | 'lg' | 'xl',   // domyślnie 'md'
//     onClose      : () => void,                  // po zamknięciu
//     closeOnBackdrop : true,                     // domyślnie true
//     closeOnEsc   : true                         // domyślnie true
//   }) => { close(), el }
//
//   openConfirm({
//     title        : string,
//     message      : string,
//     confirmLabel : 'Potwierdź',
//     cancelLabel  : 'Anuluj',
//     variant      : 'primary' | 'danger'  // kolor przycisku confirm
//   }) => Promise<boolean>
//
// Modale są montowane w `document.body` (poza `#psy-new-main`), żeby
// re-render widoku ich nie zabił. Stack: kilka modali obsługiwane (ESC
// zamyka ten na wierzchu).
// ============================================================================

const ACTIVE_MODALS = [];

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') {
            for (const [sk, sv] of Object.entries(v)) node.style[sk] = sv;
        } else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
            node.setAttribute(k, v);
        }
    }
    if (!Array.isArray(children)) children = [children];
    for (const c of children) {
        if (c == null || c === false) continue;
        if (typeof c === 'string' || typeof c === 'number') {
            node.appendChild(document.createTextNode(String(c)));
        } else {
            node.appendChild(c);
        }
    }
    return node;
}

function _onGlobalKeyDown(ev) {
    if (ev.key !== 'Escape') return;
    if (!ACTIVE_MODALS.length) return;
    const top = ACTIVE_MODALS[ACTIVE_MODALS.length - 1];
    if (top.closeOnEsc === false) return;
    ev.preventDefault();
    top.close();
}

if (typeof window !== 'undefined' && !window.__psyModalKeyBound) {
    window.addEventListener('keydown', _onGlobalKeyDown);
    window.__psyModalKeyBound = true;
}

function _focusTrap(root, ev) {
    if (ev.key !== 'Tab') return;
    const focusable = root.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
    }
}

export function openModal(opts = {}) {
    const {
        title = '',
        body = null,
        actions = [],
        size = 'md',
        onClose = null,
        closeOnBackdrop = true,
        closeOnEsc = true
    } = opts;

    const backdrop = el('div', { class: 'psy-modal-backdrop' });
    const dialog   = el('div', {
        class: 'psy-modal psy-modal--' + size,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title || 'Okno dialogowe'
    });

    const header = el('div', { class: 'psy-modal__header' }, [
        el('h2', { class: 'psy-modal__title' }, [title]),
        el('button', {
            type: 'button',
            class: 'psy-modal__close',
            'aria-label': 'Zamknij',
            onclick: () => handle.close()
        }, ['×'])
    ]);

    const bodyWrap = el('div', { class: 'psy-modal__body' });
    if (body instanceof Node) bodyWrap.appendChild(body);
    else if (typeof body === 'string') bodyWrap.innerHTML = body;

    dialog.appendChild(header);
    dialog.appendChild(bodyWrap);

    if (actions && actions.length) {
        const footer = el('div', { class: 'psy-modal__footer' });
        for (const a of actions) {
            const btn = el('button', {
                type: 'button',
                class: 'btn btn--' + (a.variant || 'secondary'),
                onclick: async (ev) => {
                    try {
                        const res = a.onClick ? await a.onClick(ev, handle) : undefined;
                        if (a.closeOnClick !== false && res !== false) handle.close();
                    } catch (e) {
                        console.error('[modal action]', e);
                    }
                }
            }, [a.label]);
            footer.appendChild(btn);
        }
        dialog.appendChild(footer);
    }

    backdrop.appendChild(dialog);

    // Click outside
    backdrop.addEventListener('click', (ev) => {
        if (ev.target === backdrop && closeOnBackdrop) handle.close();
    });
    // Focus trap
    backdrop.addEventListener('keydown', (ev) => _focusTrap(dialog, ev));

    // Mount
    document.body.appendChild(backdrop);
    // Lock body scroll
    document.body.classList.add('psy-modal-open');

    // Initial focus — first focusable in body, else close button
    window.setTimeout(() => {
        const focusable = dialog.querySelector(
            'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not(.psy-modal__close):not([disabled])'
        );
        (focusable || header.querySelector('.psy-modal__close')).focus();
    }, 30);

    const handle = {
        el: backdrop,
        dialog,
        body: bodyWrap,
        closeOnEsc,
        close() {
            if (!backdrop.parentNode) return;
            backdrop.remove();
            const idx = ACTIVE_MODALS.indexOf(handle);
            if (idx >= 0) ACTIVE_MODALS.splice(idx, 1);
            const allClosed = ACTIVE_MODALS.length === 0;
            if (allClosed) {
                document.body.classList.remove('psy-modal-open');
            }
            if (typeof onClose === 'function') {
                try { onClose(); } catch (e) { console.error('[modal onClose]', e); }
            }
            // Poinformuj app, że modal został zamknięty — pozwoli to na re-render
            // widoku, który podczas otwartego modala jest pomijany (żeby nie zabić
            // formularza). Emitujemy tylko gdy wszystkie modale są już zamknięte.
            if (allClosed) {
                try {
                    window.dispatchEvent(new CustomEvent('psy-modal-closed'));
                } catch (_) { /* ignore */ }
            }
        }
    };


    ACTIVE_MODALS.push(handle);
    return handle;
}

export function openConfirm(opts = {}) {
    const {
        title = 'Potwierdź',
        message = 'Czy na pewno?',
        confirmLabel = 'Potwierdź',
        cancelLabel = 'Anuluj',
        variant = 'primary'
    } = opts;

    return new Promise((resolve) => {
        let decided = false;
        const body = el('div', { class: 'psy-modal-confirm__message' }, [message]);

        const handle = openModal({
            title,
            body,
            size: 'sm',
            actions: [
                {
                    label: cancelLabel,
                    variant: 'secondary',
                    onClick: () => { decided = true; resolve(false); }
                },
                {
                    label: confirmLabel,
                    variant: variant,
                    onClick: () => { decided = true; resolve(true); }
                }
            ],
            onClose: () => { if (!decided) resolve(false); }
        });
        handle._decidedProxy = true;
    });
}
