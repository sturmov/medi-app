// ============================================================================
// view-test-runner.js — runner testów psychometrycznych (PHQ-9, GAD-7).
//
// Wszystkie pytania na jednej stronie (wybór PO 2026-04-30: jeden scroll, bez
// nawigacji „następne pytanie"). Po wypełnieniu — wynik + interpretacja, zapis
// do `Store` przyciskiem „💾 Zapisz wynik". Brak autozapisu — tu zapisujemy
// świadomie pojedynczym kliknięciem (test nie powinien być zapisany w połowie).
//
// Hash:
//   #/tests/run/:code             – uruchomienie nowego testu
//
// Stan ekranowy:
//   1) wypełnianie pytań (radio per pytanie, opcje punktowane)
//   2) po kliknięciu „Pokaż wynik" — overlay/section z wynikiem + przyciskiem
//      „💾 Zapisz" (zapis do `Store.addTest`) i „🔄 Wypełnij ponownie".
// ============================================================================

import { Store } from './_store.js';
import { getTestDefinition, computeTestResult } from './_tests-catalog.js';
import { el } from './_form-helpers.js';

export function renderTestRunner(opts = {}) {
    const patient = Store.state.currentPatient;

    if (!patient) {
        const r = el('div', { class: 'psy-new-view' });
        r.appendChild(el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, ['Test'])])
        ]));
        r.appendChild(el('div', { class: 'psy-new-view__body' }, [
            el('div', { class: 'psy-new-hint' }, ['Wybierz pacjenta, aby uruchomić test.'])
        ]));
        return r;
    }

    const code = opts.code;
    const def = getTestDefinition(code);

    if (!def) {
        const r = el('div', { class: 'psy-new-view' });
        r.appendChild(el('div', { class: 'psy-new-view__header' }, [
            el('div', {}, [el('h1', { class: 'psy-new-view__title' }, ['Test — nie znaleziono'])])
        ]));
        r.appendChild(el('div', { class: 'psy-new-view__body' }, [
            el('div', { class: 'psy-new-hint' }, [
                'Test o kodzie „' + (code || '?') + '" nie jest zdefiniowany. ',
                el('a', { href: '#/tests', onclick: (e) => { e.preventDefault(); window.location.hash = '#/tests'; } }, ['Wróć do listy testów'])
            ])
        ]));
        return r;
    }

    const root = el('div', {
        class: 'psy-new-view psy-form-view psy-test-runner',
        dataset: { live: 'true' }
    });

    /* --------- Breadcrumb --------- */
    const breadcrumb = el('nav', { class: 'psy-new-breadcrumb' }, [
        el('a', {
            href: '#/tests',
            class: 'psy-new-breadcrumb__link',
            onclick: (e) => { e.preventDefault(); window.location.hash = '#/tests'; }
        }, ['📊 Testy']),
        el('span', { class: 'psy-new-breadcrumb__sep' }, ['›']),
        el('span', { class: 'psy-new-breadcrumb__current' }, [def.code + ' — ' + def.name])
    ]);

    const backBtn = el('button', {
        class: 'btn btn--secondary',
        onclick: () => { window.location.hash = '#/tests'; }
    }, ['← Wróć do listy']);

    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            breadcrumb,
            el('h1', { class: 'psy-new-view__title' }, [def.code + ' — ' + def.name]),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko + ' · ' +
                def.questions.length + ' pytań · ' + def.description
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [backBtn])
    ]));

    /* --------- Instrukcja + formularz pytań --------- */
    const form = el('form', { class: 'psy-form psy-form--test-runner' });
    form.addEventListener('submit', (e) => e.preventDefault());

    if (def.instruction) {
        form.appendChild(el('div', {
            class: 'psy-test-runner__instruction',
            style: {
                padding: '10px 12px',
                background: '#EFF6FF',
                borderLeft: '3px solid #2563EB',
                borderRadius: '6px',
                marginBottom: '14px',
                fontSize: '13px',
                color: '#1E3A8A'
            }
        }, ['💡 ', def.instruction]));
    }

    // Lista pytań
    def.questions.forEach((q, idx) => {
        const qBlock = el('div', { class: 'psy-test-runner__q' });
        qBlock.appendChild(el('div', { class: 'psy-test-runner__q-text' }, [
            el('span', { class: 'psy-test-runner__q-num' }, [(idx + 1) + '. ']),
            q.text
        ]));
        const opts = el('div', { class: 'psy-test-runner__q-options' });
        for (const opt of def.options) {
            const id = 'tr_' + q.id + '_' + opt.value;
            opts.appendChild(el('label', { class: 'psy-test-runner__option', for: id }, [
                el('input', {
                    type: 'radio',
                    id,
                    name: q.id,
                    value: opt.value
                }),
                el('span', {}, [opt.label])
            ]));
        }
        qBlock.appendChild(opts);
        form.appendChild(qBlock);
    });

    root.appendChild(form);

    /* --------- Pasek dolny: pokaż wynik --------- */
    const resultSlot = el('div', { class: 'psy-test-runner__result-slot' });
    const showResultBtn = el('button', {
        class: 'btn btn--primary btn--lg',
        onclick: () => showResult()
    }, ['📊 Pokaż wynik']);

    const footer = el('div', {
        class: 'psy-test-runner__footer',
        style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            marginTop: '18px',
            padding: '12px 14px',
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '8px'
        }
    }, [
        el('span', { class: 'psy-new-hint' }, ['Wypełnij wszystkie pytania, a następnie kliknij „Pokaż wynik".']),
        showResultBtn
    ]);

    root.appendChild(footer);
    root.appendChild(resultSlot);

    /* --------- Logika wyniku --------- */
    function readAnswers() {
        const out = {};
        def.questions.forEach((q) => {
            const checked = form.querySelector(`input[name="${q.id}"]:checked`);
            if (checked) out[q.id] = checked.value;
        });
        return out;
    }

    function showResult() {
        const answers = readAnswers();
        const result = computeTestResult(code, answers);
        if (!result) return;

        resultSlot.innerHTML = '';

        const isComplete = result.answeredCount === result.totalCount;

        // Karta wyniku
        const card = el('div', {
            class: 'psy-test-runner__result',
            style: {
                marginTop: '18px',
                padding: '18px 20px',
                background: '#FFFFFF',
                border: '2px solid #2563EB',
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)'
            }
        });

        card.appendChild(el('h2', {
            style: { margin: '0 0 8px 0', fontSize: '20px', color: '#1E3A8A' }
        }, ['📊 Wynik testu ' + def.code]));

        if (!isComplete) {
            card.appendChild(el('div', {
                style: {
                    padding: '8px 12px',
                    background: '#FEF3C7',
                    borderLeft: '3px solid #F59E0B',
                    borderRadius: '6px',
                    marginBottom: '10px',
                    fontSize: '12.5px',
                    color: '#92400E'
                }
            }, [`⚠ Wypełniono ${result.answeredCount} z ${result.totalCount} pytań. Wynik częściowy — uzupełnij pozostałe lub zapisz tak jak jest (demo).`]));
        }

        // Wynik liczbowy
        card.appendChild(el('div', {
            style: { fontSize: '32px', fontWeight: '700', color: '#1D4ED8', marginBottom: '8px' }
        }, [String(result.score)]));

        // Interpretacja
        card.appendChild(el('div', {
            style: { fontSize: '14px', color: '#334155', marginBottom: '12px' }
        }, [result.interpretation]));

        // Czerwona flaga
        if (result.redFlag) {
            card.appendChild(el('div', {
                style: {
                    padding: '10px 12px',
                    background: '#FEE2E2',
                    borderLeft: '3px solid #DC2626',
                    borderRadius: '6px',
                    marginBottom: '12px',
                    fontSize: '13px',
                    color: '#991B1B',
                    fontWeight: '600'
                }
            }, ['🚨 Czerwona flaga: pacjent zaznaczył myśli rezygnacyjne (pytanie 9 PHQ-9). Wskazana ocena ryzyka samobójstwa i pilna konsultacja.']));
        }

        // Akcje
        const actions = el('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } });
        actions.appendChild(el('button', {
            class: 'btn btn--secondary',
            onclick: () => {
                form.querySelectorAll('input[type="radio"]').forEach((r) => { r.checked = false; });
                resultSlot.innerHTML = '';
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, ['🔄 Wypełnij ponownie']));
        actions.appendChild(el('button', {
            class: 'btn btn--primary',
            onclick: () => saveAndExit(result, answers)
        }, ['💾 Zapisz wynik']));

        card.appendChild(actions);
        resultSlot.appendChild(card);

        // Scroll do wyniku
        setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }

    function saveAndExit(result, answers) {
        Store.addTest({
            patientId: patient.id,
            code: def.code,
            name: def.name,
            score: result.score,
            interpretation: result.interpretation,
            answers,
            redFlag: result.redFlag === true ? true : undefined
        });
        if (window.PsyToast) {
            window.PsyToast.notify({
                variant: 'success',
                title: 'Zapisano wynik',
                message: def.code + ' — wynik: ' + result.score + ' (' + result.interpretation + ')'
            }, 'psy-app-toasts');
        }
        window.location.hash = '#/tests';
    }

    return root;
}
