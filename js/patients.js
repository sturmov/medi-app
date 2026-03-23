// ============================================================================
// patients.js - Patient Management Module (matches HTML structure)
// ============================================================================

const Patients = {
    list: [],
    currentPatient: null,
    currentPatientIndex: -1,
    _currentFilter: '',
    _showingForm: false,

    _ensurePatientCodesIntegrity() {
        this.list.forEach(p => {
            if (!p || !p.dane) return;
            this._applyPatientCode(p, p.dane.kodPacjenta || p.dane.id);
        });
    },

    init() {
        this.bindEvents();
        this.renderList();
    },

    bindEvents() {
        // New Patient button
        const btnNew = document.getElementById('btn-new-patient');
        if (btnNew) {
            btnNew.addEventListener('click', () => {
                if (this._showingForm) {
                    this._showList();
                } else {
                    this.createNew();
                }
            });
        }

        // Search input
        const search = document.getElementById('patient-search');
        if (search) search.addEventListener('input', (e) => this.renderList(e.target.value.trim()));

        // Cancel button — back to list
        const btnCancel = document.getElementById('btn-cancel-patient');
        if (btnCancel) btnCancel.addEventListener('click', () => this._showList());

        // Edit button in read-only patient summary
        const btnEdit = document.getElementById('btn-edit-patient');
        if (btnEdit) btnEdit.addEventListener('click', () => this._enterEditMode());

        // Event delegation for patient list clicks
        const listEl = document.getElementById('patient-list');
        if (listEl) {
            listEl.addEventListener('click', (e) => {
                const card = e.target.closest('[data-patient-index]');
                if (card) {
                    const idx = parseInt(card.dataset.patientIndex, 10);
                    if (!isNaN(idx)) this.selectPatient(idx);
                }
            });
        }

        // Auto-save on patient form field changes
        const form = document.getElementById('patient-form');
        if (form) {
            const handler = (e) => {
                if (!e.target.matches('input, textarea, select')) return;
                if (!this.currentPatient) return;

                if (this.currentPatient._isDraft) {
                    this.currentPatient._isDraft = false;
                }

                this.collectFormData();

                const n = e.target.name || e.target.id || '';
                if (n === 'kodPacjenta') {
                    const normalizedCode = this._applyPatientCode(this.currentPatient, this.currentPatient.dane.kodPacjenta);
                    const codeInput = document.getElementById('kodPacjenta');
                    if (codeInput && codeInput.value !== normalizedCode) codeInput.value = normalizedCode;
                }

                if (typeof XlsxHandler !== 'undefined' && !this.currentPatient._isDraft) {
                    XlsxHandler.scheduleAutoSave(this.currentPatient);
                }

                if (n === 'dataUrodzenia') {
                    this._updateAgeHint(e.target.value);
                }

                // Refresh list/selectors if name fields changed
                if (['kodPacjenta', 'imie', 'nazwisko', 'pesel', 'dataUrodzenia'].includes(n)) {
                    this.renderList(this._currentFilter);
                    if (typeof App !== 'undefined' && typeof App._updateCurrentPatientBanner === 'function') {
                        App._updateCurrentPatientBanner();
                    }
                }
            };
            form.addEventListener('input', handler);
            form.addEventListener('change', handler);
        }

        this._updateTopActionButton();
    },

    onViewEnter() {
        this._showList();
    },

    _updateTopActionButton() {
        const btnNew = document.getElementById('btn-new-patient');
        if (!btnNew) return;

        if (this._showingForm) {
            btnNew.textContent = 'Powrót do listy';
            btnNew.classList.remove('btn--primary');
            btnNew.classList.add('btn--secondary');
        } else {
            btnNew.textContent = 'Nowy Pacjent';
            btnNew.classList.remove('btn--secondary');
            btnNew.classList.add('btn--primary');
        }
    },

    // ---- Show/Hide ----
    _showList() {
        const list = document.getElementById('patient-list');
        const form = document.getElementById('patient-form');
        const summary = document.getElementById('patient-summary');
        const search = document.getElementById('patient-search');
        const header = document.querySelector('#view-patients .view__header');

        if (this.currentPatient && this.currentPatient._isDraft && this.currentPatientIndex >= 0) {
            const draftPatient = this.currentPatient;
            this.list.splice(this.currentPatientIndex, 1);
            this.currentPatient = null;
            this.currentPatientIndex = -1;

            if (typeof App !== 'undefined' && App.currentPatient === draftPatient && typeof App.clearCurrentPatient === 'function') {
                App.clearCurrentPatient();
            }
        }

        if (list) list.style.display = '';
        if (form) form.style.display = 'none';
        if (summary) summary.style.display = 'none';
        if (search) search.parentElement.style.display = '';
        if (header) header.style.display = '';
        this._showingForm = false;
        this._updateTopActionButton();

        this.renderList(this._currentFilter);
    },

    _showForm() {
        const list = document.getElementById('patient-list');
        const form = document.getElementById('patient-form');
        const summary = document.getElementById('patient-summary');
        const search = document.getElementById('patient-search');
        const codeGroup = document.getElementById('kodPacjenta-group');
        const codeInput = document.getElementById('kodPacjenta');

        if (list) list.style.display = 'none';
        if (form) form.style.display = '';
        if (summary) summary.style.display = 'none';
        if (search) search.parentElement.style.display = 'none';
        if (codeGroup) codeGroup.style.display = 'none';
        if (codeInput) codeInput.readOnly = true;

        this._showingForm = true;
        this._updateTopActionButton();
    },

    _showSummary(patient) {
        const list = document.getElementById('patient-list');
        const form = document.getElementById('patient-form');
        const summary = document.getElementById('patient-summary');
        const search = document.getElementById('patient-search');

        if (list) list.style.display = 'none';
        if (form) form.style.display = 'none';
        if (summary) summary.style.display = '';
        if (search) search.parentElement.style.display = 'none';

        this._renderPatientSummary(patient);
        this._showingForm = true;
        this._updateTopActionButton();
    },

    _enterEditMode() {
        if (!this.currentPatient) return;
        this.fillForm(this.currentPatient);
        this._showForm();
    },

    _renderPatientSummary(patient) {
        if (!patient || !patient.dane) return;

        const d = patient.dane;
        const summaryName = document.getElementById('summary-name');
        const summaryPhone = document.getElementById('summary-phone');
        const details = document.getElementById('summary-details');

        if (summaryName) {
            summaryName.textContent = (d.imie || '').trim() || 'Brak imienia';
        }

        if (summaryPhone) {
            summaryPhone.textContent = (d.telefon || '').trim() || 'Brak numeru telefonu';
        }

        if (!details) return;
        details.innerHTML = '';

        const detailItems = [
            { label: 'Nazwisko', value: d.nazwisko },
            { label: 'PESEL', value: d.pesel },
            { label: 'Data urodzenia', value: d.dataUrodzenia },
            { label: 'Płeć', value: d.plec },
            { label: 'Email', value: d.email },
            { label: 'Adres', value: d.adres }
        ];

        detailItems.forEach(item => {
            const row = document.createElement('div');
            row.className = 'patient-summary__detail-row';

            const label = document.createElement('div');
            label.className = 'patient-summary__detail-label';
            label.textContent = item.label;

            const value = document.createElement('div');
            value.className = 'patient-summary__detail-value';
            value.textContent = (item.value || '').toString().trim() || '—';

            row.appendChild(label);
            row.appendChild(value);
            details.appendChild(row);
        });
    },

    // ---- CRUD ----
    createNew() {
        const newCode = this._generatePatientCode();
        const patient = {
            dane: {
                id: newCode,
                kodPacjenta: newCode,
                imie: '', nazwisko: '', pesel: '', dataUrodzenia: '', plec: '',
                telefon: '', email: '', adres: '',
                kontaktNaglyImie: '', kontaktNaglyTelefon: '', kontaktNaglyRelacja: '',
                matkaTelefon: '', matkaEmail: '', ojciecTelefon: '', ojciecEmail: '',
                ograniczonePrawa: false, ograniczonePrawaSzczegoly: '',
                zgodaRodo: false, zgodaRodoData: '', zgodaLeczenie: false, zgodaLeczenieData: '',
                zgodaOpiekuna: false, zgodaOpiekunaData: '', zrodloSkierowania: ''
            },
            wywiad: {},
            mse: {},
            sesje: [],
            testy: [],
            plan: { celeDlugoterminowe: '', celeKrotkoterminowe: [], podejscie: '', podejscieInne: '', metody: '', przewidywanyCzas: '', czestotliwoscSesji: '', kryteriaZakonczenia: '', ewaluacje: [] }
        };
        patient._isDraft = true;
        this.list.push(patient);
        this.selectPatient(this.list.length - 1);
        this.renderList(this._currentFilter);
        return patient;
    },

    _generateId() {
        return this._generatePatientCode();
    },

    _normalizePatientCode(rawCode) {
        return String(rawCode || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/[^A-Z0-9_-]/g, '');
    },

    _generatePatientCode() {
        const maxId = this.list.reduce((max, p) => {
            const code = this._normalizePatientCode((p && p.dane && (p.dane.kodPacjenta || p.dane.id)) || '');
            const num = /^P\d+$/.test(code) ? parseInt(code.slice(1), 10) : 0;
            return Math.max(max, num);
        }, 0);
        return 'P' + String(maxId + 1).padStart(3, '0');
    },

    _isPatientCodeTaken(code, exceptPatient) {
        if (!code) return false;
        return this.list.some(p => {
            if (!p || !p.dane) return false;
            if (exceptPatient && p === exceptPatient) return false;
            const existing = this._normalizePatientCode(p.dane.kodPacjenta || p.dane.id);
            return existing === code;
        });
    },

    _getUniquePatientCode(preferredCode, exceptPatient) {
        let code = this._normalizePatientCode(preferredCode) || this._generatePatientCode();
        if (!this._isPatientCodeTaken(code, exceptPatient)) return code;

        if (/^P\d+$/.test(code)) {
            let num = parseInt(code.slice(1), 10);
            while (this._isPatientCodeTaken('P' + String(num).padStart(3, '0'), exceptPatient)) {
                num++;
            }
            return 'P' + String(num).padStart(3, '0');
        }

        let suffix = 2;
        let candidate = code + '-' + suffix;
        while (this._isPatientCodeTaken(candidate, exceptPatient)) {
            suffix++;
            candidate = code + '-' + suffix;
        }
        return candidate;
    },

    _applyPatientCode(patient, rawCode) {
        if (!patient || !patient.dane) return '';
        const uniqueCode = this._getUniquePatientCode(rawCode || patient.dane.kodPacjenta || patient.dane.id, patient);
        patient.dane.kodPacjenta = uniqueCode;
        patient.dane.id = uniqueCode;
        return uniqueCode;
    },

    selectPatient(index) {
        if (index < 0 || index >= this.list.length) return;
        this.currentPatientIndex = index;
        this.currentPatient = this.list[index];
        this.fillForm(this.currentPatient);
        if (typeof App !== 'undefined' && typeof App.setCurrentPatient === 'function') {
            App.setCurrentPatient(this.currentPatient);
        }

        if (this.currentPatient && this.currentPatient._isDraft) {
            this._showForm();
        } else {
            this._showSummary(this.currentPatient);
        }

        this.renderList(this._currentFilter);
    },

    async deletePatient(index) {
        if (index < 0 || index >= this.list.length) return;
        const name = this.getDisplayName(this.list[index]);

        let confirmed = false;
        if (typeof App !== 'undefined' && typeof App.confirmModal === 'function') {
            confirmed = await App.confirmModal({
                title: 'Usuń pacjenta',
                message: 'Czy na pewno chcesz usunąć pacjenta "' + name + '"? Tej operacji nie można cofnąć.',
                confirmText: 'Usuń pacjenta',
                cancelText: 'Anuluj',
                danger: true
            });
        }

        if (!confirmed) return;

        const deletedPatient = this.list[index];
        this.list.splice(index, 1);

        if (typeof App !== 'undefined' && App.currentPatient === deletedPatient && typeof App.clearCurrentPatient === 'function') {
            App.clearCurrentPatient();
        }

        if (this.currentPatientIndex === index) {
            this.currentPatient = null;
            this.currentPatientIndex = -1;
            this._showList();
        } else if (this.currentPatientIndex > index) {
            this.currentPatientIndex--;
        }
        this.renderList(this._currentFilter);
    },

    // ---- Render List ----
    renderList(filter) {
        this._ensurePatientCodesIntegrity();

        if (typeof filter === 'string') this._currentFilter = filter;
        else filter = this._currentFilter || '';

        const container = document.getElementById('patient-list');
        if (!container) return;
        container.innerHTML = '';

        const lf = filter.toLowerCase();

        this.list.forEach((patient, i) => {
            const d = patient.dane;
            const fullName = this.getDisplayName(patient);
            const code = this.getPatientCode(patient);
            const searchable = (code + ' ' + fullName + ' ' + (d.pesel || '')).toLowerCase();

            if (lf && !searchable.includes(lf)) return;

            const card = document.createElement('div');
            card.className = 'patient-card' + (i === this.currentPatientIndex ? ' active' : '');
            card.dataset.patientIndex = i;

            const nameEl = document.createElement('div');
            nameEl.className = 'patient-name';
            nameEl.textContent = code;

            const metaEl = document.createElement('div');
            metaEl.className = 'patient-id';
            metaEl.textContent = fullName || 'brak imienia i nazwiska';

            card.appendChild(nameEl);
            card.appendChild(metaEl);
            container.appendChild(card);
        });

        if (container.children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'text-muted';
            empty.style.padding = '20px';
            empty.textContent = filter ? 'Brak wyników dla "' + filter + '"' : 'Brak pacjentów. Kliknij "Nowy Pacjent" aby dodać.';
            container.appendChild(empty);
        }
    },

    // ---- Form Fill/Collect ----
    // Dane fields (the patient-form card)
    _daneFields: [
        'kodPacjenta', 'imie', 'nazwisko', 'pesel', 'dataUrodzenia', 'plec',
        'telefon', 'email', 'adres',
        'kontaktNaglyImie', 'kontaktNaglyTelefon', 'kontaktNaglyRelacja',
        'matkaTelefon', 'matkaEmail', 'ojciecTelefon', 'ojciecEmail',
        'ograniczonePrawaSzczegoly',
        'zgodaRodoData', 'zgodaLeczenieData', 'zgodaOpiekunaData',
        'zrodloSkierowania'
    ],
    _daneBoolFields: ['ograniczonePrawa', 'zgodaRodo', 'zgodaLeczenie', 'zgodaOpiekuna'],

    fillForm(patient) {
        if (!patient) return;
        this._applyPatientCode(patient, patient.dane && (patient.dane.kodPacjenta || patient.dane.id));
        const d = patient.dane;

        this._daneFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = d[id] || '';
        });
        this._daneBoolFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = !!d[id];
        });

        this._updateAgeHint(d.dataUrodzenia || '');
    },

    collectFormData() {
        if (!this.currentPatient) return null;
        const d = this.currentPatient.dane;

        this._daneFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) d[id] = el.value;
        });
        this._daneBoolFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) d[id] = el.checked;
        });

        const normalizedCode = this._applyPatientCode(this.currentPatient, d.kodPacjenta);
        const codeInput = document.getElementById('kodPacjenta');
        if (codeInput && codeInput.value !== normalizedCode) codeInput.value = normalizedCode;

        this._updateAgeHint(d.dataUrodzenia || '');

        return this.currentPatient;
    },

    // ---- Patient Selectors (in other views) ----
    updatePatientSelectors() {
        // Legacy no-op (kept for compatibility).
    },

    _syncPatientSelectionAcrossModules(patient) {
        // Legacy no-op (kept for compatibility).
    },

    _getPatientIndexById(patientId) {
        if (!patientId) return -1;
        return this.list.findIndex(p => {
            if (!p || !p.dane) return false;
            return p.dane.id === patientId || p.dane.kodPacjenta === patientId;
        });
    },

    // ---- Helpers ----
    _calcAge(dateStr) {
        if (!dateStr) return '';
        const birth = new Date(dateStr);
        if (isNaN(birth.getTime())) return '';
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return age + ' lat';
    },

    _updateAgeHint(dateStr) {
        const hint = document.getElementById('wiekPacjentaInfo');
        if (!hint) return;

        const ageText = this._calcAge(dateStr);
        hint.textContent = ageText ? ('Wiek: ' + ageText) : 'Wiek: —';
    },

    getDisplayName(patient) {
        const d = patient.dane;
        const parts = [];
        if (d.imie) parts.push(d.imie);
        if (d.nazwisko) parts.push(d.nazwisko);
        return parts.length > 0 ? parts.join(' ') : '';
    },

    getPatientCode(patient) {
        if (!patient || !patient.dane) return '';
        const code = this._normalizePatientCode(patient.dane.kodPacjenta || patient.dane.id);
        return code || this._generatePatientCode();
    }
};
