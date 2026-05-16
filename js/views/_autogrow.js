// ============================================================================
// _autogrow.js — globalny auto-grow dla wszystkich `<textarea>` w apce.
//
// PR-J16c (klientka 2026-05-16): „wszystkie text area w formularzach MUSZĄ
// mieć automatycznie ilość linijek taką jak tekstu — scroll textarea nie
// wchodzi w grę. każdy enter się liczy".
//
// Architektura:
//   1. `installAutogrow()` — wywołane RAZ przy starcie apki (z `app-new.js`).
//   2. Initial sizing wszystkich istniejących textareas po DOM ready.
//   3. Event delegation `input` na `document` — każdy keystroke w textarea
//      ustawia height = scrollHeight (textarea rośnie z tekstem).
//   4. `MutationObserver` na `document.body` — dynamicznie wstawiane
//      textareas (po renderze widoków) dostają initial grow przy mount.
//
// CSS w `app-new.css`:
//   textarea {
//       overflow-y: hidden;   /* bez scrolla wewnętrznego */
//       resize: none;         /* bez manualnego resize handle */
//   }
//
// Minimum-height (~2 linie dla pustego pola, klikalność) zostaje w CSS
// per-komponent (`min-height: 48px` na `.psy-form-toolbar__notes` itd.) —
// auto-grow ustawia tylko wartość >= scrollHeight, nigdy nie schodzi
// poniżej min-height.
// ============================================================================

/**
 * Dopasowuje wysokość textarea do liczby linijek zawartości.
 * Idempotentne — można wołać wielokrotnie.
 */
export function autoGrowTextarea(ta) {
    if (!ta || ta.tagName !== 'TEXTAREA') return;
    // Reset height żeby `scrollHeight` odzwierciedlał aktualną zawartość
    ta.style.height = 'auto';
    // +2px na border (top+bottom 1px) żeby nie pojawił się minimalny scroll
    ta.style.height = (ta.scrollHeight + 2) + 'px';
}

/**
 * Iteruje po wszystkich textareach w danym scope (lub document) i grow-uje je.
 */
export function autoGrowAll(scope) {
    (scope || document).querySelectorAll('textarea').forEach(autoGrowTextarea);
}

let _installed = false;

/**
 * Instaluje globalny auto-grow. Wywołać RAZ przy starcie apki.
 * Idempotentne — kolejne wywołania to no-op.
 */
export function installAutogrow() {
    if (_installed) return;
    _installed = true;

    // 1. Initial sizing — natychmiast dla istniejących textareas.
    //    Plus DOMContentLoaded fallback gdy `app-new.js` ładuje się wcześnie.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => autoGrowAll());
    } else {
        autoGrowAll();
    }

    // 2. Event delegation `input` — każdy keystroke triggeruje grow.
    document.addEventListener('input', (ev) => {
        const t = ev.target;
        if (t && t.tagName === 'TEXTAREA') {
            autoGrowTextarea(t);
        }
    }, true);   // capture: true — łapie też w shadow DOM custom elements

    // 3. MutationObserver — dynamicznie wstawiane textareas (po render
    //    widoków, modale, drawery) dostają initial grow przy mount.
    //    Bez tego — fresh textarea ma min-height ale nie rośnie do swojego
    //    pre-fillu wartości (z `_raw[key]`).
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (!m.addedNodes || !m.addedNodes.length) continue;
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;     // tylko elementy
                if (node.tagName === 'TEXTAREA') {
                    // Defer 1 frame — scrollHeight wymaga layout passu
                    requestAnimationFrame(() => autoGrowTextarea(node));
                } else if (typeof node.querySelectorAll === 'function') {
                    const tas = node.querySelectorAll('textarea');
                    if (tas.length) {
                        requestAnimationFrame(() => tas.forEach(autoGrowTextarea));
                    }
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
