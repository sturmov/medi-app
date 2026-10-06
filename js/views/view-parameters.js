// ============================================================================
// view-parameters.js — sekcja „Parametry" pacjenta (READ-ONLY OŚ CZASU).
//
// 2026-06-13 (refactor wg klientki):
//   • Klientka: „parametry to akapity wizyty — ekstrakt z treści wizyt
//     wg daty i kolejności". Sekcja boczna „Parametry" pokazuje read-only
//     listę pomiarów (wzrost / waga / BMI auto / komentarz) z każdej wizyty,
//     posortowanych od najnowszej do najstarszej.
//   • Edycja parametrów odbywa się INLINE w sekcji „Parametry somatyczne"
//     formularza wizyty (1-okienny grid compact).
//   • USUNIĘTE: ciśnienie skurczowe/rozkurczowe, tętno — klientka „reszta
//     niepotrzebna, zostaje wzrost/waga/BMI/komentarz".
// ============================================================================

import { Store } from './_store.js';
import { visitTypeById } from './_fake-data.js';

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

/** Interpretacja BMI wg WHO. */
function _bmiCategory(bmiStr) {
    const v = parseFloat(bmiStr);
    if (!v) return '';
    if (v < 18.5) return 'niedowaga';
    if (v < 25)   return 'norma';
    if (v < 30)   return 'nadwaga';
    if (v < 35)   return 'otyłość I°';
    if (v < 40)   return 'otyłość II°';
    return 'otyłość III°';
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

    const timeline = Store.getParametersTimeline(patient.id);

    const root = el('div', { class: 'psy-new-view' });

    // ---- nagłówek -----------------------------------------------------------
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Parametry']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ' + timeline.length +
                ' ' + (timeline.length === 1 ? 'pomiar' : 'pomiarów') +
                ' · oś czasu z wizyt (read-only)'
            ])
        ])
    ]));

    // ---- body ---------------------------------------------------------------
    const body = el('div', { class: 'psy-new-view__body psy-new-view__body--plain' });

    if (!timeline.length) {
        body.appendChild(el('div', { class: 'psy-new-empty' }, [
            el('div', { class: 'psy-new-empty__icon' }, ['📈']),
            el('div', { class: 'psy-new-empty__title' }, ['Brak pomiarów']),
            el('div', { class: 'psy-new-empty__description' }, [
                'Pacjent nie ma jeszcze pomiarów antropometrycznych. ' +
                'Dodaj wzrost/wagę w sekcji „Parametry somatyczne" formularza wizyty.'
            ]),
            el('div', { class: 'psy-new-empty__actions' }, [
                el('button', {
                    class: 'btn btn--primary',
                    onclick: () => { window.location.hash = '#/history'; }
                }, ['🗓️ Przejdź do wizyt'])
            ])
        ]));
    } else {
        const table = el('table', { class: 'psy-new-table' });
        table.appendChild(el('thead', {}, [
            el('tr', {}, [
                el('th', { style: { width: '140px' } }, ['Data wizyty']),
                el('th', { style: { width: '110px' } }, ['Wzrost (cm)']),
                el('th', { style: { width: '110px' } }, ['Waga (kg)']),
                el('th', { style: { width: '140px' } }, ['BMI (auto)']),
                el('th', {}, ['Komentarz']),
                el('th', { style: { width: '160px' } }, ['Typ wizyty'])
            ])
        ]));
        const tbody = el('tbody', {});
        for (const entry of timeline) {
            const v = entry.visit;
            const visitLabel = v.date + (v.time ? ' ' + v.time : '');
            const typeObj = visitTypeById(v.type);
            const typeLabel = typeObj ? typeObj.label : (v.type || '');
            const bmiCat = _bmiCategory(entry.bmi);
            const rowClick = () => { window.location.hash = '#/visit/form/' + v.id; };

            tbody.appendChild(el('tr', {
                title: 'Kliknij, aby otworzyć wizytę',
                style: { cursor: 'pointer' },
                onclick: rowClick
            }, [
                el('td', {}, [visitLabel]),
                el('td', {}, [entry.wzrost || '—']),
                el('td', {}, [entry.masa || '—']),
                el('td', {}, [
                    el('strong', {}, [entry.bmi || '—']),
                    bmiCat ? el('span', {
                        class: 'psy-new-hint',
                        style: { marginLeft: '6px' }
                    }, [' · ' + bmiCat]) : null
                ].filter(Boolean)),
                el('td', { style: { color: '#475569' } }, [entry.komentarz || '']),
                el('td', { style: { color: '#475569' } }, [typeLabel])
            ]));
        }
        table.appendChild(tbody);
        body.appendChild(table);
    }

    root.appendChild(body);
    return root;
}
