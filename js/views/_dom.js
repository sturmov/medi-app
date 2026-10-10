// ============================================================================
// _dom.js — wspólny helper do budowania DOM (vanilla, bez frameworka).
// ============================================================================

/**
 * el('div', { class: 'x', onclick: fn, dataset: {a: 1}, style: {...} }, [dzieci])
 * - wartości `null`/`undefined` są pomijane,
 * - boolean → atrybut bez wartości (true) lub brak atrybutu (false),
 * - dzieci: Node | string | number | null | false.
 */
export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'dataset' && typeof v === 'object') {
            for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
        } else if (k === 'style' && typeof v === 'object') {
            for (const [sk, sv] of Object.entries(v)) node.style[sk] = sv;
        } else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'checked') {
            node.checked = !!v;
        } else if (typeof v === 'boolean') {
            if (v) node.setAttribute(k, '');
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

/** Toast przez globalny kontener (no-op, gdy komponent jeszcze nie załadowany). */
export function toast(variant, title, message) {
    if (window.PsyToast) {
        // Komponent zna warianty info / success / warning / danger; „error" to u nas to samo co „danger".
        window.PsyToast.notify({ variant: variant === 'error' ? 'danger' : variant, title, message }, 'psy-app-toasts');
    }
}
