// ============================================================================
// mse.js - Mental Status Examination Module (Badanie Stanu Psychicznego)
// ============================================================================

const MSE = {
    currentPatient: null,

    // Select/text fields
    fields: [
        'mseData',
        'pielegnacja', 'kontaktWzrokowy', 'aktywnoscMotoryczna',
        'mowaTempo', 'mowaGlosnosc', 'mowaPlynnosc', 'mowaIntonacja', 'mowaSpojnosc',
        'stylInterakcyjny',
        'funkcjonowanieIntelektualne', 'pamiec', 'zasobWiedzy', 'koncentracja',
        'nastrojSubiektywny', 'nastrojSkala',
        'afektZgodnosc', 'afektReaktywnosc', 'afektZakres',
        'zaburzeniaPercepcyjne', 'halucynacje', 'urojenia', 'omamy', 'dysocjacja',
        'zaburzeniaProcesMyslowego', 'skojarzenia', 'osady', 'wglad', 'samoocena',
        'mysliSamobojczeAktualne', 'mysliSamobojczePrzeszleOpis',
        'planSuicydalny', 'intencjaSuicydalna',
        'dostepDoSrodkowOpis', 'czynnikiOchronneSuicyd',
        'samouszkodzeniaHistoria',
        'ryzykoAgresji', 'ocenaRyzykaSuicyd'
    ],

    // Checkbox fields
    checkboxFields: [
        'orientacjaCzas', 'orientacjaMiejsce', 'orientacjaOsoba', 'orientacjaSytuacja',
        'mysliSamobojczePrzeszle', 'dostepDoSrodkow', 'samouszkodzeniaAktualne'
    ],

    init() {
        this.bindEvents();
    },

    onPatientChanged(patient) {
        if (patient) this.loadPatient(patient);
        else this.clearForm();
    },

    bindEvents() {
        // Auto-save on any field change
        const view = document.getElementById('view-mse');
        if (view) {
            view.addEventListener('input', (e) => {
                if (e.target.matches('input, textarea, select')) {
                    this._onFieldChange(e.target);
                }
            });
            view.addEventListener('change', (e) => {
                if (e.target.matches('input[type="checkbox"], input[type="range"], select')) {
                    this._onFieldChange(e.target);
                }
            });
        }

        // Mood scale display
        const nastrojSkala = document.getElementById('nastrojSkala');
        if (nastrojSkala) {
            nastrojSkala.addEventListener('input', () => {
                const display = document.getElementById('nastrojSkalaValue');
                if (display) display.textContent = nastrojSkala.value;
            });
        }

        // Risk level visual indicator
        const riskSelect = document.getElementById('ocenaRyzykaSuicyd');
        if (riskSelect) {
            riskSelect.addEventListener('change', () => this._updateRiskIndicator());
        }
    },

    _onFieldChange(field) {
        if (!this.currentPatient) return;
        this.collectFormData();
        if (typeof XlsxHandler !== 'undefined' && typeof XlsxHandler.scheduleAutoSave === 'function') {
            XlsxHandler.scheduleAutoSave(this.currentPatient);
        }
    },

    _updateRiskIndicator() {
        const riskSelect = document.getElementById('ocenaRyzykaSuicyd');
        const indicator = document.getElementById('risk-indicator');
        if (!riskSelect || !indicator) return;

        const value = riskSelect.value;
        indicator.className = 'risk-indicator';
        indicator.textContent = '';

        if (value === 'Niskie') {
            indicator.classList.add('risk-low');
            indicator.textContent = '● Niskie ryzyko';
        } else if (value === 'Średnie') {
            indicator.classList.add('risk-medium');
            indicator.textContent = '● Średnie ryzyko';
        } else if (value === 'Wysokie') {
            indicator.classList.add('risk-high');
            indicator.textContent = '⚠ Wysokie ryzyko';
        } else if (value === 'Krytyczne') {
            indicator.classList.add('risk-critical');
            indicator.textContent = '🚨 RYZYKO KRYTYCZNE';
        }
    },

    loadPatient(patient) {
        this.currentPatient = patient;
        if (!patient.mse) {
            patient.mse = this._createEmptyMSE();
        }
        this.fillForm(patient);
    },

    _createEmptyMSE() {
        const m = {};
        this.fields.forEach(f => m[f] = '');
        this.checkboxFields.forEach(f => m[f] = false);
        m.nastrojSkala = '5';
        return m;
    },

    fillForm(patient) {
        if (!patient || !patient.mse) return;
        const m = patient.mse;

        // Regular fields
        this.fields.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'range') {
                el.value = m[id] || '5';
                const display = document.getElementById('nastrojSkalaValue');
                if (display) display.textContent = el.value;
            } else {
                el.value = m[id] || '';
            }
        });

        // Checkbox fields
        this.checkboxFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = !!m[id];
        });

        this._updateRiskIndicator();
    },

    collectFormData() {
        if (!this.currentPatient) return;
        if (!this.currentPatient.mse) {
            this.currentPatient.mse = this._createEmptyMSE();
        }
        const m = this.currentPatient.mse;

        // Regular fields
        this.fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) m[id] = el.value;
        });

        // Checkbox fields
        this.checkboxFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) m[id] = el.checked;
        });
    },

    clearForm() {
        this.currentPatient = null;
        this.fields.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'range') {
                el.value = '5';
                const display = document.getElementById('nastrojSkalaValue');
                if (display) display.textContent = '5';
            } else {
                el.value = '';
            }
        });
        this.checkboxFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });
        const indicator = document.getElementById('risk-indicator');
        if (indicator) {
            indicator.className = 'risk-indicator';
            indicator.textContent = '';
        }
    }
};
