// ============================================================================
// _form-helpers.js — drobne helpery do budowy formularzy w modalach.
//
// Każdy modal buduje formularz imperatywnie (bez frameworka), więc potrzebujemy:
//   - el(tag, props, children)          — tworzenie DOM node
//   - field(...)                        — label + input/select/textarea + error slot
//   - group(...)                        — grupuje pola w rząd (horizontal flex)
//   - showFieldError / clearFieldErrors — pokaż komunikaty walidacji pod polami
//   - escapeHtml, todayISO, ageFromDate — drobne utilsy
// ============================================================================

export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') {
            for (const [sk, sv] of Object.entries(v)) node.style[sk] = sv;
        } else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'dataset' && typeof v === 'object') {
            for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
        } else if (k === 'value') {
            // Safer than setAttribute for inputs/textareas — honors live value
            if (node.tagName === 'TEXTAREA') node.textContent = v == null ? '' : v;
            else node.value = v == null ? '' : v;
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

export function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function ageFromDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
    if (age < 0 || age > 130) return '';
    return age + ' lat';
}

/**
 * Buduje pole formularza: label + input/select/textarea + slot na błąd.
 * @param {Object} opts
 *   - name       : string     nazwa pola (dataset.field na wrapperze)
 *   - label      : string     widoczna etykieta
 *   - type       : 'text' | 'email' | 'tel' | 'date' | 'number' | 'select' | 'textarea' | 'checkbox' | 'custom'
 *   - value      : string     wartość początkowa
 *   - required   : boolean    dodaje gwiazdkę do etykiety
 *   - placeholder: string
 *   - options    : Array<{value,label}>   dla select
 *   - rows       : number     dla textarea
 *   - help       : string     hint pod polem
 *   - onInput    : function   callback przy zmianie
 *   - custom     : HTMLElement bezpośrednio dla type='custom'
 *   - cols       : number     szerokość w gridzie (1..12), domyślnie 12
 *   - inputAttrs : Object     dodatkowe atrybuty dla elementu input
 */
export function field(opts) {
    const {
        name, label, type = 'text',
        value = '', required = false,
        placeholder = '', options = [],
        rows = 3, help = '',
        onInput = null, onChange = null,
        custom = null,
        cols = 12,
        inputAttrs = {}
    } = opts;

    const labelNode = label ? el('label', {
        class: 'psy-field__label',
        for: `psyf-${name}`
    }, [
        label,
        required ? el('span', { class: 'psy-field__required', 'aria-hidden': 'true' }, [' *']) : null
    ]) : null;

    let controlNode;

    if (type === 'custom' && custom instanceof Node) {
        controlNode = custom;
    } else if (type === 'select') {
        const opts = options.map((o) => el('option', {
            value: o.value,
            selected: String(o.value) === String(value)
        }, [o.label]));
        controlNode = el('select', {
            id: `psyf-${name}`,
            class: 'psy-field__input',
            name,
            ...(onChange ? { onchange: onChange } : {}),
            ...(onInput ? { oninput: onInput } : {}),
            ...inputAttrs
        }, opts);
    } else if (type === 'textarea') {
        controlNode = el('textarea', {
            id: `psyf-${name}`,
            class: 'psy-field__input psy-field__input--textarea',
            name,
            placeholder,
            rows,
            ...(onInput ? { oninput: onInput } : {}),
            ...(onChange ? { onchange: onChange } : {}),
            ...inputAttrs
        });
        controlNode.value = value || '';
    } else if (type === 'checkbox') {
        controlNode = el('label', { class: 'psy-field__checkbox-wrap' }, [
            el('input', {
                id: `psyf-${name}`,
                type: 'checkbox',
                name,
                checked: !!value,
                ...(onChange ? { onchange: onChange } : {}),
                ...inputAttrs
            }),
            el('span', {}, [label])
        ]);
        // Dla checkboxa zwracamy wrapper bez osobnego labela (label jest w środku)
        const wrap = el('div', {
            class: 'psy-field psy-field--checkbox psy-field--cols-' + cols,
            dataset: { field: name }
        }, [ controlNode ]);
        if (help) wrap.appendChild(el('div', { class: 'psy-field__help' }, [help]));
        wrap.appendChild(el('div', { class: 'psy-field__error', hidden: true }));
        return wrap;
    } else {
        controlNode = el('input', {
            id: `psyf-${name}`,
            class: 'psy-field__input',
            type,
            name,
            value,
            placeholder,
            ...(onInput ? { oninput: onInput } : {}),
            ...(onChange ? { onchange: onChange } : {}),
            ...inputAttrs
        });
    }

    const wrap = el('div', {
        class: 'psy-field psy-field--cols-' + cols,
        dataset: { field: name }
    });
    if (labelNode) wrap.appendChild(labelNode);
    wrap.appendChild(controlNode);
    if (help) wrap.appendChild(el('div', { class: 'psy-field__help' }, [help]));
    wrap.appendChild(el('div', { class: 'psy-field__error', hidden: true }));
    return wrap;
}

/**
 * Zwraca kontener rzędu/grida pól.
 */
export function row(children) {
    return el('div', { class: 'psy-form-row' }, children);
}

export function section(title, children) {
    const sec = el('div', { class: 'psy-form-section' });
    if (title) sec.appendChild(el('h4', { class: 'psy-form-section__title' }, [title]));
    const body = el('div', { class: 'psy-form-row' });
    for (const c of (children || [])) body.appendChild(c);
    sec.appendChild(body);
    return sec;
}

/**
 * Ustawia/pokazuje błąd pod polem o danej nazwie.
 * Odczytuje `data-field` na wrapperze.
 */
export function showFieldError(root, name, message) {
    const wrap = root.querySelector(`.psy-field[data-field="${name}"]`);
    if (!wrap) return;
    wrap.classList.add('psy-field--error');
    const input = wrap.querySelector('input, select, textarea');
    if (input) input.setAttribute('aria-invalid', 'true');
    const err = wrap.querySelector('.psy-field__error');
    if (err) {
        err.textContent = message;
        err.hidden = false;
    }
}

export function clearFieldErrors(root) {
    root.querySelectorAll('.psy-field--error').forEach((w) => w.classList.remove('psy-field--error'));
    root.querySelectorAll('.psy-field__error').forEach((e) => {
        e.hidden = true;
        e.textContent = '';
    });
    root.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
}

/**
 * Zbiera wartości z formularza (iterując po `[data-field]` wrapperach).
 * Zwraca { name: value }.
 */
export function readForm(root) {
    const out = {};
    root.querySelectorAll('.psy-field[data-field]').forEach((wrap) => {
        const name = wrap.dataset.field;
        const input = wrap.querySelector('input, select, textarea');
        if (!input) return;
        if (input.type === 'checkbox') out[name] = !!input.checked;
        else if (input.type === 'number') out[name] = input.value === '' ? '' : Number(input.value);
        else out[name] = input.value;
    });
    return out;
}

// ============================================================================
// F5.4 (2026-05-11): walidatory pól (PESEL, telefon, e-mail).
// Wszystkie zwracają boolean — `true` gdy OK, `false` gdy błąd. Pole puste
// jest traktowane jako OK (walidatory są ostrzegawcze, nie blokujące — autozapis
// zawsze działa, tylko inline-error pokazuje że format jest zły).
// ============================================================================

/**
 * Waliduje numer PESEL (11 cyfr + suma kontrolna).
 * Algorytm: waga {1,3,7,9,1,3,7,9,1,3} × digit_i, suma mod 10,
 * suma kontrolna = (10 − mod) % 10 i porównanie z 11-tą cyfrą.
 *
 * @param {string} s
 * @returns {boolean}
 */
export function validatePesel(s) {
    if (!s) return true;   // puste = OK (pole opcjonalne, nie blokuje)
    const digits = String(s).replace(/\D/g, '');
    if (digits.length !== 11) return false;
    const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
        sum += parseInt(digits[i], 10) * weights[i];
    }
    const checksum = (10 - (sum % 10)) % 10;
    return checksum === parseInt(digits[10], 10);
}

/**
 * Parsuje PESEL → `{ dataUrodzenia: 'YYYY-MM-DD', plec: 'M'|'K' }` lub `null`
 * gdy nieprawidłowy. Obsługuje kodowanie wieku w miesiącu (3-4 cyfra):
 *
 *   - 1800-1899: mm + 80
 *   - 1900-1999: mm
 *   - 2000-2099: mm + 20
 *   - 2100-2199: mm + 40
 *   - 2200-2299: mm + 60
 *
 * Płeć: 10-ta cyfra nieparzysta = M, parzysta = K.
 *
 * @param {string} s
 * @returns {{dataUrodzenia: string, plec: 'M'|'K'} | null}
 */
export function parsePesel(s) {
    if (!validatePesel(s) || !s) return null;
    const digits = String(s).replace(/\D/g, '');
    if (digits.length !== 11) return null;
    const yy = parseInt(digits.substr(0, 2), 10);
    const mmRaw = parseInt(digits.substr(2, 2), 10);
    const dd = parseInt(digits.substr(4, 2), 10);

    let century;
    let mm;
    if (mmRaw >= 81 && mmRaw <= 92)      { century = 1800; mm = mmRaw - 80; }
    else if (mmRaw >= 1 && mmRaw <= 12)  { century = 1900; mm = mmRaw; }
    else if (mmRaw >= 21 && mmRaw <= 32) { century = 2000; mm = mmRaw - 20; }
    else if (mmRaw >= 41 && mmRaw <= 52) { century = 2100; mm = mmRaw - 40; }
    else if (mmRaw >= 61 && mmRaw <= 72) { century = 2200; mm = mmRaw - 60; }
    else return null;

    const year = century + yy;
    const sexDigit = parseInt(digits[9], 10);
    const plec = sexDigit % 2 === 0 ? 'K' : 'M';
    const dataUrodzenia = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    return { dataUrodzenia, plec };
}

/**
 * Waliduje numer telefonu — luźno (akceptuje +48 prefix, spacje, myślniki,
 * nawiasy). Wymaga 9 cyfr po opcjonalnym prefixie +48.
 *
 * @param {string} s
 * @returns {boolean}
 */
export function validatePhone(s) {
    if (!s) return true;   // puste = OK
    const stripped = String(s).replace(/[\s\-()]/g, '');
    return /^(\+48)?\d{9}$/.test(stripped);
}

/**
 * Waliduje e-mail. Regex zgodny z RFC 5322 (uproszczony).
 *
 * @param {string} s
 * @returns {boolean}
 */
export function validateEmail(s) {
    if (!s) return true;   // puste = OK
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~\-]+@[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/.test(String(s).trim());
}
