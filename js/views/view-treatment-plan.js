// ============================================================================
// view-treatment-plan.js — sekcja „Plan leczenia" pacjenta.
//
// PR-J7 (2026-05-11): nowa pozycja w sidebarze (#6 wg z4.jpg).
// Klientka (rozmowa 2026-05-11): „Zalecenia są do domu/samodzielnego działania
// pacjenta. Plan leczenia jest wspólnie z doktorem — to inna sekcja."
//
// Model danych: `patient.treatmentPlan { goals: [...] }`, gdzie każdy cel ma:
//   {
//     id: 'G1', title: '', description: '',
//     priority: 'low' | 'medium' | 'high',
//     tasks: [ { id, text, done, dueDate } ]
//   }
//
// CRUD:
//   • + Dodaj cel        — pusty cel na początku listy
//   • 🗑 Usuń cel        — z `openConfirm`
//   • + Zadanie          — dorzuca pustą pozycję do `tasks[]`
//   • ☐ → ✓ zadania      — toggle `done`
//   • 🗑 Zadanie         — bez confirm (mała operacja)
//
// Autozapis: debounce 400 ms na wszystkich polach (title/description/tasks).
// LIVE-VIEW: root ma `data-live="true"` — autozapis nie tłucze focus/scroll.
// ============================================================================

import { Store } from './_store.js';
import { openConfirm } from './_modal.js';

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

function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function toast(variant, title, message) {
    if (window.PsyToast) {
        window.PsyToast.notify({ variant, title, message }, 'psy-app-toasts');
    }
}

// ---- model helpers ----------------------------------------------------------

function getPlan(patient) {
    return (patient && patient.treatmentPlan) || { goals: [] };
}

function savePlan(patient, plan) {
    Store.updatePatient(patient.id, { treatmentPlan: plan });
}

const PRIORITY_LABEL = {
    low:    'Niski',
    medium: 'Średni',
    high:   'Wysoki'
};
const PRIORITY_OPTIONS = ['low', 'medium', 'high'];

// ---- pojedynczy cel (karta) ------------------------------------------------

function renderGoal(goal, idx, patient, refresh) {
    const tasks = Array.isArray(goal.tasks) ? goal.tasks : [];

    // Header karty: numer + select priorytetu + 🗑
    const header = el('div', { class: 'psy-tp__goal-header' }, [
        el('span', { class: 'psy-tp__goal-num' }, ['Cel ' + (idx + 1)]),
        el('select', {
            class: 'psy-pdf__input psy-tp__goal-priority psy-tp__priority--' + (goal.priority || 'medium'),
            'aria-label': 'Priorytet celu',
            onchange: (e) => {
                const plan = getPlan(patient);
                const g = plan.goals.find((x) => x.id === goal.id);
                if (g) g.priority = e.target.value;
                savePlan(patient, plan);
            }
        }, PRIORITY_OPTIONS.map((p) =>
            el('option', { value: p, selected: (goal.priority || 'medium') === p }, [
                'Priorytet: ' + PRIORITY_LABEL[p]
            ])
        )),
        el('button', {
            class: 'btn btn--danger btn--sm psy-tp__goal-delete',
            title: 'Usuń cel',
            onclick: async () => {
                const ok = await openConfirm({
                    title: 'Usunąć cel?',
                    message: 'Cel „' + (goal.title || '(bez tytułu)') + '" zostanie usunięty wraz z zadaniami.',
                    confirmLabel: 'Usuń cel',
                    variant: 'danger'
                });
                if (!ok) return;
                const plan = getPlan(patient);
                plan.goals = plan.goals.filter((g) => g.id !== goal.id);
                savePlan(patient, plan);
                toast('success', 'Usunięto cel', '');
                refresh();
            }
        }, ['🗑'])
    ]);

    // Pole tytułu (input)
    const titleInput = el('input', {
        type: 'text',
        class: 'psy-pdf__input psy-tp__goal-title-input',
        placeholder: 'Tytuł celu (np. „Redukcja objawów depresyjnych do PHQ-9 < 5")',
        value: goal.title || '',
        oninput: (e) => {
            goal.title = e.target.value;
            // autozapis przez globalny scheduler — tu tylko aktualizujemy pamięć
        }
    });

    // Pole opisu (textarea)
    const descInput = el('textarea', {
        class: 'psy-pdf__input psy-pdf__input--textarea',
        rows: 2,
        placeholder: 'Opis celu (kontekst, kryterium powodzenia, ramy czasowe…)',
        oninput: (e) => { goal.description = e.target.value; }
    });
    descInput.value = goal.description || '';

    // Lista zadań
    const tasksWrap = el('div', { class: 'psy-tp__tasks' });
    tasks.forEach((task, ti) => {
        const taskRow = el('div', { class: 'psy-tp__task' + (task.done ? ' psy-tp__task--done' : '') }, [
            el('input', {
                type: 'checkbox',
                class: 'psy-tp__task-check',
                checked: !!task.done,
                onchange: (e) => {
                    const plan = getPlan(patient);
                    const g = plan.goals.find((x) => x.id === goal.id);
                    const t = g && g.tasks && g.tasks.find((x) => x.id === task.id);
                    if (t) t.done = !!e.target.checked;
                    savePlan(patient, plan);
                    refresh();
                }
            }),
            el('input', {
                type: 'text',
                class: 'psy-pdf__input psy-tp__task-text',
                placeholder: 'Zadanie (np. „terapia CBT — sesja 6×/mc")',
                value: task.text || '',
                oninput: (e) => { task.text = e.target.value; }
            }),
            el('input', {
                type: 'date',
                class: 'psy-pdf__input psy-tp__task-date',
                value: task.dueDate || '',
                title: 'Termin (opcjonalnie)',
                oninput: (e) => { task.dueDate = e.target.value; }
            }),
            el('button', {
                class: 'btn btn--secondary btn--sm psy-tp__task-delete',
                title: 'Usuń zadanie',
                onclick: () => {
                    const plan = getPlan(patient);
                    const g = plan.goals.find((x) => x.id === goal.id);
                    if (g) g.tasks = (g.tasks || []).filter((t) => t.id !== task.id);
                    savePlan(patient, plan);
                    refresh();
                }
            }, ['🗑'])
        ]);
        tasksWrap.appendChild(taskRow);
    });

    // Przycisk „+ Zadanie"
    const addTaskBtn = el('button', {
        class: 'btn btn--secondary btn--sm psy-tp__add-task',
        onclick: () => {
            const plan = getPlan(patient);
            const g = plan.goals.find((x) => x.id === goal.id);
            if (!g) return;
            if (!Array.isArray(g.tasks)) g.tasks = [];
            g.tasks.push({ id: uid('T-'), text: '', done: false, dueDate: '' });
            savePlan(patient, plan);
            refresh();
        }
    }, ['+ Zadanie']);

    return el('article', { class: 'psy-tp__goal' }, [
        header,
        el('div', { class: 'psy-tp__goal-body' }, [
            el('label', { class: 'psy-tp__field-label' }, ['Tytuł']),
            titleInput,
            el('label', { class: 'psy-tp__field-label' }, ['Opis']),
            descInput,
            el('label', { class: 'psy-tp__field-label' }, [
                'Zadania (' + tasks.length + ')'
            ]),
            tasksWrap,
            addTaskBtn
        ])
    ]);
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
            el('div', { class: 'psy-new-hint' }, ['Wybierz pacjenta, aby zarządzać planem leczenia.'])
        ]));
        return r;
    }

    const plan = getPlan(patient);

    const root = el('div', {
        class: 'psy-new-view psy-tp-view',
        dataset: { live: 'true' }
    });

    function refresh() {
        if (window.AppController) window.AppController._renderView(true);
    }

    // ---- nagłówek -----------------------------------------------------------
    root.appendChild(el('div', { class: 'psy-new-view__header' }, [
        el('div', {}, [
            el('h1', { class: 'psy-new-view__title' }, ['🎯 Plan leczenia']),
            el('div', { class: 'psy-new-view__subtitle' }, [
                patient.imie + ' ' + patient.nazwisko +
                ' · ' + (plan.goals.length === 0 ? 'brak celów' : plan.goals.length + ' celów') +
                ' · drzewo celów L1 + zadania per cel'
            ])
        ]),
        el('div', { class: 'psy-new-view__actions' }, [
            el('button', {
                class: 'btn btn--primary',
                onclick: () => {
                    const planNow = getPlan(patient);
                    planNow.goals = Array.isArray(planNow.goals) ? planNow.goals : [];
                    planNow.goals.unshift({
                        id: uid('G-'),
                        title: '',
                        description: '',
                        priority: 'medium',
                        tasks: []
                    });
                    savePlan(patient, planNow);
                    refresh();
                }
            }, ['+ Dodaj cel'])
        ])
    ]));

    // ---- body ---------------------------------------------------------------
    const body = el('div', { class: 'psy-new-view__body psy-new-view__body--plain psy-tp' });

    if (!plan.goals || plan.goals.length === 0) {
        body.appendChild(el('div', { class: 'psy-new-empty' }, [
            el('div', { class: 'psy-new-empty__icon' }, ['🎯']),
            el('div', { class: 'psy-new-empty__title' }, ['Brak celów leczenia']),
            el('div', { class: 'psy-new-empty__description' }, [
                'Plan leczenia tworzysz wspólnie z pacjentem na wizycie. Każdy cel '
                + 'może mieć priorytet i własną listę zadań do realizacji w trakcie '
                + 'terapii.'
            ])
        ]));
    } else {
        plan.goals.forEach((goal, idx) => {
            body.appendChild(renderGoal(goal, idx, patient, refresh));
        });
    }

    root.appendChild(body);

    // ---- autozapis tekstowy (title/description/task.text/task.dueDate) ------
    // Cel: po debounce 400 ms zapisujemy aktualny `plan` z pamięci.
    let _timer = null;
    function scheduleSave() {
        if (_timer) clearTimeout(_timer);
        _timer = setTimeout(() => {
            // `plan` jest referencją wewnątrz scope; już go aktualizowaliśmy
            // przez `oninput` (mutacja goal.* / task.*). Persist:
            savePlan(patient, plan);
        }, 400);
    }
    body.addEventListener('input', scheduleSave);

    return root;
}
