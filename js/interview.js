// ============================================================================
// interview.js - Clinical Interview Module (Wywiad Kliniczny)
// ============================================================================

const Interview = {
    currentPatient: null,

    // All field IDs in the interview view that map to patient.wywiad
    fields: [
        'dataWizyty', 'rodzajWizyty', 'osobyObecne',
        'powodZgloszenia', 'przemocStatus', 'przemocKomentarz', 'aktualnyProblem',
        'sytuacjaRodzinna', 'szkolaPraca', 'relacjeRowiesnicze', 'stanCywilny',
        'wydarzeniaTraumatyczne', 'czasWolny',
        'apetytStatus', 'apetyt',
        'senStatus', 'senJakosc', 'sen', 'senCzasZasypiania',
        'aktywnoscFizyczna', 'aktywnoscCzestotliwosc',
        'historiaLeczenia', 'farmakoterapiaOgolna', 'psychotropySubstancje',
        'wzrost', 'masaCiala', 'bmi', 'najnizszaMasa', 'najwyzszaMasa',
        'hipotezaDiagnostyczna', 'czynnikiPodtrzymujace', 'czynnikiRyzyka',
        'czynnikiOchronne', 'motywacjaDoLeczenia', 'postawaRodzicow',
        'rozpoznanie', 'planLeczenia', 'konsultacjaSpecjalista', 'wizytaKontrolna'
    ],

    // Legacy fields kept for backward compatibility with previously saved data
    legacyFields: [
        'farmakoterapia'
    ],

    // Checkbox fields
    checkboxFields: [
        'przemocFizyczna', 'przemocPsychiczna', 'przemocSeksualna',
        'przemocZaniedbanie', 'przemocEkonomiczna',
        'senBudzenieNocne', 'senKoszmary', 'senHipersomnia'
    ],

    // Substance fields: each substance has checkbox, Freq (select), Ilosc (text)
    substances: [
        'nikotyna', 'kofeina', 'alkohol', 'marihuana', 'halucynogeny',
        'opioidy', 'lekiBarbiturany', 'srodkiWziewne', 'dozylne', 'inneLeki'
    ],

    init() {
        this.bindEvents();
    },

    onPatientChanged(patient) {
        if (patient) this.loadPatient(patient);
        else this.clearForm();
    },

    bindEvents() {
        // Auto-save on any field change in the interview view
        const view = document.getElementById('view-interview');
        if (view) {
            view.addEventListener('input', (e) => {
                if (e.target.matches('input, textarea, select')) {
                    this._onFieldChange(e.target);
                }
            });
            view.addEventListener('change', (e) => {
                if (e.target.matches('input[type="checkbox"], select')) {
                    this._onFieldChange(e.target);
                }
            });
        }

        // BMI auto-calculation
        const wzrost = document.getElementById('wzrost');
        const masa = document.getElementById('masaCiala');
        if (wzrost) wzrost.addEventListener('input', () => this._calcBMI());
        if (masa) masa.addEventListener('input', () => this._calcBMI());

        this._bindOsobyObecneSuggestions();
        this._bindPrzemocStatus();
    },

    _bindPrzemocStatus() {
        const select = document.getElementById('przemocStatus');
        if (!select) return;

        select.addEventListener('change', () => {
            this._updatePrzemocDetailsVisibility(select.value);
        });

        this._updatePrzemocDetailsVisibility(select.value);
    },

    _updatePrzemocDetailsVisibility(statusValue) {
        const wrap = document.getElementById('przemoc-typy-wrap');
        if (!wrap) return;

        const normalized = String(statusValue || '').trim().toLowerCase();
        const showDetails = normalized === 'tak';

        wrap.style.display = showDetails ? '' : 'none';

        if (!showDetails) {
            const violenceTypes = [
                'przemocFizyczna',
                'przemocPsychiczna',
                'przemocSeksualna',
                'przemocZaniedbanie',
                'przemocEkonomiczna'
            ];

            violenceTypes.forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.checked = false;
                if (this.currentPatient && this.currentPatient.wywiad) {
                    this.currentPatient.wywiad[id] = false;
                }
            });
        }
    },

    _normalizeLegacyWywiadData(w) {
        if (!w || typeof w !== 'object') return;

        // Legacy mapping: single pharmacotherapy field -> split structure
        if (!w.farmakoterapiaOgolna && !w.psychotropySubstancje && w.farmakoterapia) {
            w.farmakoterapiaOgolna = w.farmakoterapia;
        }

        // Normalize violence status values from legacy boolean/string forms
        if (typeof w.przemocStatus === 'boolean') {
            w.przemocStatus = w.przemocStatus ? 'Tak' : 'Nie';
        } else if (typeof w.przemocStatus === 'string') {
            const status = w.przemocStatus.trim().toLowerCase();
            if (status === 'true' || status === 'tak') w.przemocStatus = 'Tak';
            else if (status === 'false' || status === 'nie') w.przemocStatus = 'Nie';
            else if (status === 'nie zgłasza' || status === 'nie zglasza') w.przemocStatus = 'Nie zgłasza';
        }

        // If old data has violence type checkboxes but no explicit status, infer status
        if (!w.przemocStatus) {
            const hasViolenceType = [
                'przemocFizyczna',
                'przemocPsychiczna',
                'przemocSeksualna',
                'przemocZaniedbanie',
                'przemocEkonomiczna'
            ].some((key) => !!w[key]);

            if (hasViolenceType) w.przemocStatus = 'Tak';
        }
    },

    _bindOsobyObecneSuggestions() {
        const container = document.getElementById('osoby-obecne-suggestions');
        const input = document.getElementById('osobyObecne');
        if (!container || !input) return;

        container.addEventListener('click', (e) => {
            const button = e.target.closest('[data-insert-text]');
            if (!button) return;
            const text = button.dataset.insertText || '';
            if (!text) return;
            this._insertIntoOsobyObecne(text);
        });
    },

    _insertIntoOsobyObecne(text) {
        const input = document.getElementById('osobyObecne');
        if (!input) return;

        const value = input.value || '';
        const isFocused = document.activeElement === input;
        const hasCaret = isFocused && typeof input.selectionStart === 'number' && typeof input.selectionEnd === 'number';

        const start = hasCaret ? input.selectionStart : 0;
        const end = hasCaret ? input.selectionEnd : 0;

        const before = value.slice(0, start);
        const after = value.slice(end);

        let insertion = text;
        if (before && !/[\s,;]$/.test(before)) insertion = ' ' + insertion;
        if (after && !/^[\s,;]/.test(after)) insertion += ' ';

        const nextValue = before + insertion + after;
        input.value = nextValue;

        const newCaret = (before + insertion).length;
        if (hasCaret) {
            input.focus();
            input.setSelectionRange(newCaret, newCaret);
        }

        this._onFieldChange(input);
    },

    _todayIsoDate() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return now.getFullYear() + '-' + month + '-' + day;
    },

    ensureTodayVisitDateIfEmpty() {
        const field = document.getElementById('dataWizyty');
        if (!field || field.value) return;

        const today = this._todayIsoDate();
        field.value = today;

        if (this.currentPatient) {
            if (!this.currentPatient.wywiad) {
                this.currentPatient.wywiad = this._createEmptyWywiad();
            }
            this.currentPatient.wywiad.dataWizyty = today;

            if (typeof XlsxHandler !== 'undefined' && typeof XlsxHandler.scheduleAutoSave === 'function') {
                XlsxHandler.scheduleAutoSave(this.currentPatient);
            }
        }
    },

    _onFieldChange(field) {
        if (!this.currentPatient) return;
        this.collectFormData();
        if (typeof XlsxHandler !== 'undefined' && typeof XlsxHandler.scheduleAutoSave === 'function') {
            XlsxHandler.scheduleAutoSave(this.currentPatient);
        }
    },

    _calcBMI() {
        const wzrost = parseFloat(document.getElementById('wzrost')?.value);
        const masa = parseFloat(document.getElementById('masaCiala')?.value);
        const bmiField = document.getElementById('bmi');
        if (bmiField && wzrost > 0 && masa > 0) {
            const heightM = wzrost / 100;
            const bmi = (masa / (heightM * heightM)).toFixed(1);
            bmiField.value = bmi;
            if (this.currentPatient && this.currentPatient.wywiad) {
                this.currentPatient.wywiad.bmi = bmi;
            }
        }
    },

    loadPatient(patient) {
        this.currentPatient = patient;
        if (!patient.wywiad) {
            patient.wywiad = this._createEmptyWywiad();
        }
        this._normalizeLegacyWywiadData(patient.wywiad);
        this.fillForm(patient);
    },

    _createEmptyWywiad() {
        const w = {};
        this.fields.forEach(f => w[f] = '');
        this.legacyFields.forEach(f => w[f] = '');
        this.checkboxFields.forEach(f => w[f] = false);
        this.substances.forEach(s => {
            w[s] = false;
            w[s + 'Freq'] = 'Brak';
            w[s + 'Ilosc'] = '';
        });
        return w;
    },

    fillForm(patient) {
        if (!patient || !patient.wywiad) return;
        const w = patient.wywiad;

        // Regular fields
        this.fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = w[id] || '';
        });

        // Checkbox fields
        this.checkboxFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = !!w[id];
        });

        // Substance fields
        this.substances.forEach(s => {
            const cb = document.getElementById(s);
            if (cb) cb.checked = !!w[s];
            const freq = document.getElementById(s + 'Freq');
            if (freq) freq.value = w[s + 'Freq'] || 'Brak';
            const ilosc = document.getElementById(s + 'Ilosc');
            if (ilosc) ilosc.value = w[s + 'Ilosc'] || '';
        });

        this._updatePrzemocDetailsVisibility(w.przemocStatus || '');

        this.ensureTodayVisitDateIfEmpty();

        this._calcBMI();
    },

    collectFormData() {
        if (!this.currentPatient) return;
        if (!this.currentPatient.wywiad) {
            this.currentPatient.wywiad = this._createEmptyWywiad();
        }
        const w = this.currentPatient.wywiad;

        // Regular fields
        this.fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) w[id] = el.value;
        });

        // Checkbox fields
        this.checkboxFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) w[id] = el.checked;
        });

        if (w.przemocStatus !== 'Tak') {
            [
                'przemocFizyczna',
                'przemocPsychiczna',
                'przemocSeksualna',
                'przemocZaniedbanie',
                'przemocEkonomiczna'
            ].forEach((key) => {
                w[key] = false;
            });
        }

        // Keep legacy field in sync for backwards compatibility.
        w.farmakoterapia = w.farmakoterapiaOgolna || '';

        // Substance fields
        this.substances.forEach(s => {
            const cb = document.getElementById(s);
            if (cb) w[s] = cb.checked;
            const freq = document.getElementById(s + 'Freq');
            if (freq) w[s + 'Freq'] = freq.value;
            const ilosc = document.getElementById(s + 'Ilosc');
            if (ilosc) w[s + 'Ilosc'] = ilosc.value;
        });
    },

    clearForm() {
        this.currentPatient = null;
        this.fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        this.checkboxFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.checked = false;
        });
        this.substances.forEach(s => {
            const cb = document.getElementById(s);
            if (cb) cb.checked = false;
            const freq = document.getElementById(s + 'Freq');
            if (freq) freq.value = 'Brak';
            const ilosc = document.getElementById(s + 'Ilosc');
            if (ilosc) ilosc.value = '';
        });

        this._updatePrzemocDetailsVisibility('');
    }
};
