// ============================================================================
// view-parameters.js — sekcja „Parametry" pacjenta.
//
// PR-J8 (2026-05-11): nowa pozycja w sidebarze (#9 wg z4.jpg).
// Klientka: „to co już mamy idzie na górę, reszta niżej; sekcja powstaje
// na przyszłość". Na start: wzrost, waga, BMI auto, ciśnienie skurczowe/
// rozkurczowe, tętno. W przyszłości — trend wartości w czasie + powiązanie
// z konkretną wizytą.
//
// Dane: `patient.parameters{height, weight, bmi, systolic, diastolic, pulse}`.
// Autozapis: debounce 400 ms na każdej zmianie (jak w `view-patient-detail.js`).
// LIVE-VIEW: root ma `data-live="true"` — autozapis nie tłucze focus/scroll.
// ============================================================================

import { Store } from './_store.js';

// ---- helpers ----------------------------------------------------------------

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'dataset' && typeof v === 'object') {
            for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
        } else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'style' && typeof v === 'object') {
            for (const [sk, sv] of Object.entries(v)) node.style[sk] = sv;
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

/**
 * Wylicz BMI ze wzrostu (cm) i wagi (kg). Zwraca string z 1 miejscem po
 * przecinku lub '' gdy nie da się policzyć.
 */
function computeBmi(heightCm, weightKg) {
    const h = parseFloat(heightCm);
    const w = parseFloat(weightKg);
    if (!h || !w || h <= 0 || w <= 0) return '';
    const m = h / 100;
    const bmi = w / (m * m);
    if (!isFinite(bmi)) return '';
    return bmi.toFixed(1);
}

/**
 * Interpretacja BMI wg WHO (orientacyjnie, do wyświetlenia obok wartości).
 */
function bmiCategory(bmiStr) {
    const v = parseFloat(bmiStr);
    if (!v) return '';
    if (v < 18.5) return 'niedowaga';
    if (v < 25)   return 'norma';
    if (v < 30)   return 'nadwaga';
    if (v < 35)   return 'otyłość I°';
    if (v < 40)   return 'otyłość II°';
    return 'otyłość III°';
}

// ---- pojedyncze pole („nazwa : input [jedn.]") -----------------------------

function paramField({ label, name, value, unit, type = 'number', readonly = false, hint = '', extra = '' }) {
    const inputAttrs = {
        type,
        name,
        class: 'psy-pdf__input',
        value: value == null ? '' : String(value)
    };
    if (readonly) inputAttrs.readonly = true;
    if (type === 'number') {
        inputAttrs.step = name === 'parameters.bmi' ? '0.1' : '1';
        inputAttrs.min  = '0';
    }

    return el('div', { class: 'psy-params__field' }, [
        el('label', { class: 'psy-params__label' }, [label]),
        el('div', { class: 'psy-params__input-row' }, [
            el('input', inputAttrs),
            unit ? el('span', { class: 'psy-params__unit' }, [unit]) : null,
            extra ? el('span', { class: 'psy-params__extra' }, [extra]) : null
        ]),
        hint ? el('div', { class: 'psy-params__hint' }, [hint]) : null
    ]);
}

// ---- VIEW -------------------------------------------------------------------

export function renderParameters() {
    const patient = Store.state.currentPatient;
    if (!patient) {
        const r = el('div', { class: 'psy-new-view' });
        r.appendChild(el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, ['Parametry'])])
        ]));
        r.appendChild(el('div', { class: 'psy-new-view__body' }, [
            el('div', { class: 'psy-new-hint' }, ['Wybierz pacjenta, aby wyświetlić jego parametry.'])
        ]));
        return r;
    }

    const params = patient.parameters || {};

    const root = el('div', {
        class: 'psy-new-view psy-params-view',
        dataset: { live: 'true' }   // pomiń pasywny re-render
    });

    // ---- nagłówek -----------------------------------------------------------
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['📈 Parametry']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko +
                ' · autozapis aktywny · sekcja w rozwoju'
            ])
        ])
    ]));

    // ---- body ---------------------------------------------------------------
    const body = el('div', { class: 'psy-new-view__body psy-params' });

    // GŁÓWNY ZESTAW (klientka: „to co już mamy idzie na górę")
    body.appendChild(el('h2', { class: 'psy-params__section-title' }, ['Antropometria i parametry życiowe']));

    const heightInput = paramField({
        label: 'Wzrost',
        name: 'parameters.height',
        value: params.height,
        unit: 'cm'
    });
    const weightInput = paramField({
        label: 'Waga',
        name: 'parameters.weight',
        value: params.weight,
        unit: 'kg'
    });

    // BMI — pole read-only wyliczane z wzrost+waga (live)
    const initialBmi = computeBmi(params.height, params.weight) || params.bmi || '';
    const bmiCat = bmiCategory(initialBmi);
    const bmiField = paramField({
        label: 'BMI',
        name: 'parameters.bmi',
        value: initialBmi,
        unit: 'kg/m²',
        readonly: true,
        hint: 'auto (wzrost + waga)',
        extra: bmiCat ? '· ' + bmiCat : ''
    });

    const sysField = paramField({
        label: 'Ciśnienie skurczowe',
        name: 'parameters.systolic',
        value: params.systolic,
        unit: 'mmHg'
    });
    const diaField = paramField({
        label: 'Ciśnienie rozkurczowe',
        name: 'parameters.diastolic',
        value: params.diastolic,
        unit: 'mmHg'
    });
    const pulseField = paramField({
        label: 'Tętno',
        name: 'parameters.pulse',
        value: params.pulse,
        unit: 'bpm'
    });

    const grid = el('div', { class: 'psy-params__grid' }, [
        heightInput, weightInput, bmiField, sysField, diaField, pulseField
    ]);
    body.appendChild(grid);

    // Dolna sekcja: placeholder na przyszłość
    body.appendChild(el('h2', { class: 'psy-params__section-title psy-params__section-title--muted' }, [
        'Dodatkowe parametry'
    ]));
    body.appendChild(el('div', { class: 'psy-new-empty' }, [
        el('div', { class: 'psy-new-empty__icon' }, ['🚧']),
        el('div', { class: 'psy-new-empty__title' }, ['Sekcja w rozwoju']),
        el('div', { class: 'psy-new-empty__description' }, [
            'W kolejnych iteracjach pojawią się: trend wartości w czasie (wykres), '
            + 'pomiary powiązane z konkretną wizytą, dodatkowe parametry (saturacja, '
            + 'temperatura, glikemia) — zgodnie z potrzebami klinicznymi.'
        ])
    ]));

    root.appendChild(body);

    // ---- autozapis ----------------------------------------------------------
    let _timer = null;

    function readForm() {
        const out = {};
        body.querySelectorAll('input[name^="parameters."]').forEach((n) => {
            if (n.readOnly) return;          // BMI auto, nie zapisujemy z formularza
            const key = n.name.replace(/^parameters\./, '');
            out[key] = n.value;
        });
        return out;
    }

    function autosave() {
        const cp = Store.state.currentPatient;
        if (!cp) return;
        const raw = readForm();
        const bmi = computeBmi(raw.height, raw.weight);
        const next = Object.assign({}, params, raw, { bmi });
        Store.updatePatient(cp.id, { parameters: next });

        // Update BMI display + kategoria
        const bmiInput = body.querySelector('input[name="parameters.bmi"]');
        if (bmiInput) bmiInput.value = bmi;
        const extraSpan = bmiInput && bmiInput.parentElement &&
            bmiInput.parentElement.querySelector('.psy-params__extra');
        if (extraSpan) {
            const cat = bmiCategory(bmi);
            extraSpan.textContent = cat ? '· ' + cat : '';
        }
    }

    function scheduleAutosave() {
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(autosave, 400);
    }

    body.addEventListener('input', scheduleAutosave);
    body.addEventListener('change', scheduleAutosave);

    return root;
}
