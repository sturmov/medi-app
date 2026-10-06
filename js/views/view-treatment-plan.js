// ============================================================================
// view-treatment-plan.js — „Plan leczenia" (READ-ONLY OŚ CZASU).
//
// 2026-06-13 (refactor wg klientki):
//   • Klientka: „plan leczenia to akapity wizyty — ekstrakt z treści wizyt
//     wg daty i kolejności". Sekcja boczna „Plan leczenia" pokazuje read-only
//     listę ustaleń + ewaluacji + terminów wizyty kontrolnej z każdej wizyty,
//     posortowanych od najnowszej do najstarszej.
//   • Plan leczenia powstaje w sekcji „Podjęte oddziaływania" formularza
//     wizyty (pole `ustalenia` + `ewaluacja` + `kontrolna`).
//   • Stary model `patient.treatmentPlan.goals[]` (drzewo celów L1 + zadań)
//     zostaje jako LEGACY w danych, ale UI go nie pokazuje. Migracja
//     do nowego modelu „akapity wizyty" — bez CRUD-a.
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

// ---- VIEW -------------------------------------------------------------------

export function renderTreatmentPlan() {
    const patient = Store.state.currentPatient;
    if (!patient) {
        const r = el('div', { class: 'psy-new-view' });
        r.appendChild(el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, ['Plan leczenia'])])
        ]));
        r.appendChild(el('div', { class: 'psy-new-view__body' }, [
            el('div', { class: 'psy-new-hint' }, ['Wybierz pacjenta, aby wyświetlić plan leczenia.'])
        ]));
        return r;
    }

    const timeline = Store.getTreatmentPlanTimeline(patient.id);

    const root = el('div', { class: 'psy-new-view' });

    // ---- nagłówek -----------------------------------------------------------
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['Plan leczenia']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ' + timeline.length +
                ' ' + (timeline.length === 1 ? 'wpis' : 'wpisów') +
                ' · oś czasu z wizyt (read-only)'
            ])
        ])
    ]));

    // ---- body ---------------------------------------------------------------
    const body = el('div', { class: 'psy-new-view__body psy-new-view__body--plain' });

    if (!timeline.length) {
        body.appendChild(el('div', { class: 'psy-new-empty' }, [
            el('div', { class: 'psy-new-empty__icon' }, ['🎯']),
            el('div', { class: 'psy-new-empty__title' }, ['Brak ustaleń planu leczenia']),
            el('div', { class: 'psy-new-empty__description' }, [
                'Pacjent nie ma jeszcze ustaleń planu leczenia. ' +
                'Dodaj ustalenia w sekcji „Podjęte oddziaływania" formularza wizyty.'
            ]),
            el('div', { class: 'psy-new-empty__actions' }, [
                el('button', {
                    class: 'btn btn--primary',
                    onclick: () => { window.location.hash = '#/history'; }
                }, ['🗓️ Przejdź do wizyt'])
            ])
        ]));
    } else {
        const stack = el('div', { class: 'psy-new-stack' });
        for (const entry of timeline) {
            const v = entry.visit;
            const visitLabel = v.date + (v.time ? ' ' + v.time : '');
            const typeObj = visitTypeById(v.type);
            const typeLabel = typeObj ? typeObj.label : (v.type || '');
            const rowClick = () => { window.location.hash = '#/visit/form/' + v.id; };

            const card = el('article', {
                title: 'Kliknij, aby otworzyć wizytę',
                style: {
                    padding: '12px 14px',
                    background: '#FFFFFF',
                    border: '1px solid #E5E7EB',
                    borderLeft: '4px solid #10B981',
                    borderRadius: '8px',
                    cursor: 'pointer'
                },
                onclick: rowClick
            }, [
                // Header: data wizyty + typ
                el('div', {
                    style: {
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'baseline',
                        marginBottom: '8px',
                        fontSize: '12.5px'
                    }
                }, [
                    el('strong', { style: { color: '#047857' } }, [visitLabel]),
                    el('span', { class: 'psy-new-hint' }, ['· ' + typeLabel])
                ]),

                // Ustalenia (główne pole)
                entry.ustalenia
                    ? el('div', { style: { marginBottom: '6px' } }, [
                        el('div', {
                            style: {
                                fontSize: '11px',
                                color: '#64748B',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                marginBottom: '2px'
                            }
                        }, ['Ustalenia']),
                        el('div', { style: { whiteSpace: 'pre-wrap', fontSize: '13px' } }, [entry.ustalenia])
                    ])
                    : null,

                // Ewaluacja (jeśli jest)
                entry.ewaluacja
                    ? el('div', { style: { marginTop: '6px', marginBottom: '6px' } }, [
                        el('div', {
                            style: {
                                fontSize: '11px',
                                color: '#64748B',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                marginBottom: '2px'
                            }
                        }, ['Ewaluacja']),
                        el('div', { style: { whiteSpace: 'pre-wrap', fontSize: '13px' } }, [entry.ewaluacja])
                    ])
                    : null,

                // Wizyta kontrolna (jeśli jest)
                entry.kontrolna
                    ? el('div', {
                        style: {
                            marginTop: '6px',
                            fontSize: '12.5px',
                            color: '#075985'
                        }
                    }, [
                        el('strong', {}, ['Wizyta kontrolna: ']),
                        entry.kontrolna
                    ])
                    : null,

                // Notatki do ustaleń
                entry.notes
                    ? el('div', {
                        style: {
                            marginTop: '6px',
                            fontSize: '11.5px',
                            color: '#64748B',
                            fontStyle: 'italic'
                        }
                    }, ['↳ ' + entry.notes])
                    : null
            ].filter(Boolean));
            stack.appendChild(card);
        }
        body.appendChild(stack);
    }

    root.appendChild(body);
    return root;
}
