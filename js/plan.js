// ============================================================================
// plan.js - Treatment Plan Module (Plan Terapii)
// ============================================================================

const Plan = {
    currentPatient: null,

    // Simple scalar fields
    scalarFields: [
        'celeDlugoterminowe',
        'podejscie', 'podejscieInne', 'metody',
        'przewidywanyCzas', 'czestotliwoscSesji', 'kryteriaZakonczenia'
    ],

    init() {
        this.bindEvents();
    },

    onPatientChanged(patient) {
        if (patient) this.loadPatient(patient);
        else {
            this.currentPatient = null;
            this.clearForm();
        }
    },

    bindEvents() {
        // Auto-save on scalar field changes in the plan view
        const view = document.getElementById('view-plan');
        if (view) {
            view.addEventListener('input', (e) => {
                if (e.target.matches('input, textarea, select') &&
                    !e.target.closest('.dynamic-list')) {
                    this._onScalarFieldChange();
                }
            });
            view.addEventListener('change', (e) => {
                if (e.target.matches('select') &&
                    !e.target.closest('.dynamic-list')) {
                    this._onScalarFieldChange();
                }
            });
        }

        // Show/hide "Inne" field based on approach selection
        const podejscie = document.getElementById('podejscie');
        if (podejscie) {
            podejscie.addEventListener('change', () => {
                const inneField = document.getElementById('podejscieInne');
                if (inneField) {
                    inneField.parentElement.style.display = podejscie.value === 'Inne' ? '' : 'none';
                }
            });
        }

        // Add goal button
        const btnAddGoal = document.getElementById('btn-add-goal');
        if (btnAddGoal) {
            btnAddGoal.addEventListener('click', () => this._addGoal());
        }

        // Add evaluation button
        const btnAddEval = document.getElementById('btn-add-evaluation');
        if (btnAddEval) {
            btnAddEval.addEventListener('click', () => this._addEvaluation());
        }

        // Event delegation for remove buttons in dynamic lists
        const goalsContainer = document.getElementById('short-term-goals');
        if (goalsContainer) {
            goalsContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-remove-goal')) {
                    const item = e.target.closest('.goal-item');
                    if (item) {
                        const idx = parseInt(item.dataset.index, 10);
                        this._removeGoal(idx);
                    }
                }
            });
        }

        const evalContainer = document.getElementById('evaluation-entries');
        if (evalContainer) {
            evalContainer.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-remove-evaluation')) {
                    const item = e.target.closest('.evaluation-item');
                    if (item) {
                        const idx = parseInt(item.dataset.index, 10);
                        this._removeEvaluation(idx);
                    }
                }
            });
        }
    },

    _onScalarFieldChange() {
        if (!this.currentPatient) return;
        this.collectScalarData();
        this._triggerAutoSave();
    },

    _triggerAutoSave() {
        if (typeof XlsxHandler !== 'undefined' && typeof XlsxHandler.scheduleAutoSave === 'function') {
            XlsxHandler.scheduleAutoSave(this.currentPatient);
        }
    },

    loadPatient(patient) {
        this.currentPatient = patient;
        if (!patient.plan) {
            patient.plan = this._createEmptyPlan();
        }
        this.fillForm(patient);
    },

    _createEmptyPlan() {
        return {
            celeDlugoterminowe: '',
            celeKrotkoterminowe: [],
            podejscie: '', podejscieInne: '', metody: '',
            przewidywanyCzas: '', czestotliwoscSesji: '', kryteriaZakonczenia: '',
            ewaluacje: []
        };
    },

    fillForm(patient) {
        if (!patient || !patient.plan) return;
        const p = patient.plan;

        // Scalar fields
        this.scalarFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = p[id] || '';
        });

        // Show/hide Inne field
        const podejscie = document.getElementById('podejscie');
        const inneField = document.getElementById('podejscieInne');
        if (podejscie && inneField) {
            inneField.parentElement.style.display = podejscie.value === 'Inne' ? '' : 'none';
        }

        // Render dynamic lists
        this._renderGoals(p.celeKrotkoterminowe || []);
        this._renderEvaluations(p.ewaluacje || []);
    },

    collectScalarData() {
        if (!this.currentPatient || !this.currentPatient.plan) return;
        const p = this.currentPatient.plan;

        this.scalarFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) p[id] = el.value;
        });
    },

    // ============================
    // Short-term Goals (SMART)
    // ============================
    _renderGoals(goals) {
        const container = document.getElementById('short-term-goals');
        if (!container) return;
        container.innerHTML = '';

        if (!goals || goals.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding:8px 0;">Brak celów krótkoterminowych. Kliknij "Dodaj cel" poniżej.</p>';
            return;
        }

        goals.forEach((goal, i) => {
            const item = document.createElement('div');
            item.className = 'dynamic-list__item goal-item';
            item.dataset.index = i;

            item.innerHTML = `
                <div class="form-group">
                    <label>Cel</label>
                    <input type="text" class="input goal-cel" data-idx="${i}" value="${this._esc(goal.cel || '')}" placeholder="Opisz cel krótkoterminowy">
                </div>
                <div class="form-group">
                    <label>Mierzalność</label>
                    <input type="text" class="input goal-mierzalnosc" data-idx="${i}" value="${this._esc(goal.mierzalnosc || '')}" placeholder="Jak zmierzysz osiągnięcie celu?">
                </div>
                <div class="form-group">
                    <label>Termin realizacji</label>
                    <input type="date" class="input goal-termin" data-idx="${i}" value="${goal.terminRealizacji || ''}">
                </div>
                <div class="form-group">
                    <label>Status</label>
                    <select class="input goal-status" data-idx="${i}">
                        <option value="Nowy" ${goal.status === 'Nowy' ? 'selected' : ''}>Nowy</option>
                        <option value="W trakcie" ${goal.status === 'W trakcie' ? 'selected' : ''}>W trakcie</option>
                        <option value="Osiągnięty" ${goal.status === 'Osiągnięty' ? 'selected' : ''}>Osiągnięty</option>
                        <option value="Zmodyfikowany" ${goal.status === 'Zmodyfikowany' ? 'selected' : ''}>Zmodyfikowany</option>
                    </select>
                </div>
                <button type="button" class="btn btn--danger btn--sm btn-remove-goal">Usuń</button>
            `;

            // Bind input events for auto-save
            item.querySelectorAll('input, select').forEach(el => {
                el.addEventListener('input', () => this._collectGoalData(i, item));
                el.addEventListener('change', () => this._collectGoalData(i, item));
            });

            container.appendChild(item);
        });
    },

    _collectGoalData(index, itemEl) {
        if (!this.currentPatient || !this.currentPatient.plan) return;
        const goals = this.currentPatient.plan.celeKrotkoterminowe;
        if (!goals || !goals[index]) return;

        goals[index].cel = itemEl.querySelector('.goal-cel')?.value || '';
        goals[index].mierzalnosc = itemEl.querySelector('.goal-mierzalnosc')?.value || '';
        goals[index].terminRealizacji = itemEl.querySelector('.goal-termin')?.value || '';
        goals[index].status = itemEl.querySelector('.goal-status')?.value || 'Nowy';

        this._triggerAutoSave();
    },

    _addGoal() {
        if (!this.currentPatient) {
            if (typeof App !== 'undefined' && App.showNotification) {
                App.showNotification('Proszę najpierw wybrać pacjenta.', 'error');
            }
            return;
        }
        if (!this.currentPatient.plan) this.currentPatient.plan = this._createEmptyPlan();
        if (!this.currentPatient.plan.celeKrotkoterminowe) this.currentPatient.plan.celeKrotkoterminowe = [];

        this.currentPatient.plan.celeKrotkoterminowe.push({
            cel: '', mierzalnosc: '', terminRealizacji: '', status: 'Nowy'
        });
        this._renderGoals(this.currentPatient.plan.celeKrotkoterminowe);
        this._triggerAutoSave();
    },

    _removeGoal(index) {
        if (!this.currentPatient || !this.currentPatient.plan) return;
        const goals = this.currentPatient.plan.celeKrotkoterminowe;
        if (!goals) return;
        goals.splice(index, 1);
        this._renderGoals(goals);
        this._triggerAutoSave();
    },

    // ============================
    // Evaluations
    // ============================
    _renderEvaluations(evaluations) {
        const container = document.getElementById('evaluation-entries');
        if (!container) return;
        container.innerHTML = '';

        if (!evaluations || evaluations.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding:8px 0;">Brak ewaluacji. Kliknij "Dodaj ewaluację" poniżej.</p>';
            return;
        }

        evaluations.forEach((ev, i) => {
            const item = document.createElement('div');
            item.className = 'dynamic-list__item evaluation-item';
            item.dataset.index = i;

            item.innerHTML = `
                <div class="form-group">
                    <label>Data ewaluacji</label>
                    <input type="date" class="input eval-data" data-idx="${i}" value="${ev.dataEwaluacji || ''}">
                </div>
                <div class="form-group">
                    <label>Notatka</label>
                    <textarea class="input eval-notatka" data-idx="${i}" rows="3" placeholder="Notatka z ewaluacji">${this._esc(ev.notatka || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Postęp</label>
                    <select class="input eval-postep" data-idx="${i}">
                        <option value="">-- Wybierz --</option>
                        <option value="Znaczny" ${ev.postep === 'Znaczny' ? 'selected' : ''}>Znaczny</option>
                        <option value="Umiarkowany" ${ev.postep === 'Umiarkowany' ? 'selected' : ''}>Umiarkowany</option>
                        <option value="Minimalny" ${ev.postep === 'Minimalny' ? 'selected' : ''}>Minimalny</option>
                        <option value="Brak" ${ev.postep === 'Brak' ? 'selected' : ''}>Brak</option>
                        <option value="Regresja" ${ev.postep === 'Regresja' ? 'selected' : ''}>Regresja</option>
                    </select>
                </div>
                <button type="button" class="btn btn--danger btn--sm btn-remove-evaluation">Usuń</button>
            `;

            // Bind input events
            item.querySelectorAll('input, textarea, select').forEach(el => {
                el.addEventListener('input', () => this._collectEvalData(i, item));
                el.addEventListener('change', () => this._collectEvalData(i, item));
            });

            container.appendChild(item);
        });
    },

    _collectEvalData(index, itemEl) {
        if (!this.currentPatient || !this.currentPatient.plan) return;
        const evals = this.currentPatient.plan.ewaluacje;
        if (!evals || !evals[index]) return;

        evals[index].dataEwaluacji = itemEl.querySelector('.eval-data')?.value || '';
        evals[index].notatka = itemEl.querySelector('.eval-notatka')?.value || '';
        evals[index].postep = itemEl.querySelector('.eval-postep')?.value || '';

        this._triggerAutoSave();
    },

    _addEvaluation() {
        if (!this.currentPatient) {
            if (typeof App !== 'undefined' && App.showNotification) {
                App.showNotification('Proszę najpierw wybrać pacjenta.', 'error');
            }
            return;
        }
        if (!this.currentPatient.plan) this.currentPatient.plan = this._createEmptyPlan();
        if (!this.currentPatient.plan.ewaluacje) this.currentPatient.plan.ewaluacje = [];

        this.currentPatient.plan.ewaluacje.push({
            dataEwaluacji: new Date().toISOString().slice(0, 10),
            notatka: '',
            postep: ''
        });
        this._renderEvaluations(this.currentPatient.plan.ewaluacje);
        this._triggerAutoSave();
    },

    _removeEvaluation(index) {
        if (!this.currentPatient || !this.currentPatient.plan) return;
        const evals = this.currentPatient.plan.ewaluacje;
        if (!evals) return;
        evals.splice(index, 1);
        this._renderEvaluations(evals);
        this._triggerAutoSave();
    },

    clearForm() {
        this.scalarFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const goalsContainer = document.getElementById('short-term-goals');
        if (goalsContainer) goalsContainer.innerHTML = '';
        const evalContainer = document.getElementById('evaluation-entries');
        if (evalContainer) evalContainer.innerHTML = '';
    },

    // Escape HTML for template literals
    _esc(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
};
