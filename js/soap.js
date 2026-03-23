// ============================================================================
// soap.js - SOAP Session Notes Module (Notatki z Sesji)
// ============================================================================

const SOAP = {
    currentPatient: null,
    currentSessionIndex: -1,
    _isEditingSession: false,
    _showingForm: false,

    // Session metadata fields
    sessionFields: [
        'dataSesji', 'nrSesji', 'typSesji', 'terapeuta', 'modalnosc', 'czasMin'
    ],

    // SOAP text fields
    soapFields: [
        'opisKlienta', 'ocenaRyzykaS',
        'obserwacjeTerapeuty', 'wynikiTestow', 'komunikacjaNiewerbalna',
        'postepTerapii', 'aktualizacjaDiagnozy', 'odpowiedzInterwencje',
        'interwencjeZastosowane', 'zadanieDomowe', 'planNastepnaSesja',
        'wizytaKontrolnaData', 'potrzebaKonsultacji', 'zmianaFarmakoterapii',
        'podsumowanieAI'
    ],

    // Symptom checklist items
    symptoms: [
        'nastrojObnizony', 'lekUogolniony', 'atakiPaniki', 'bezsennosc',
        'drazliwosc', 'problemyKoncentracja', 'mysliSuicydalne', 'samouszkodzenia',
        'zaburzeniaOdzywiania', 'uzywki', 'problemyRelacyjne', 'traumaFlashbacki',
        'somatyzacja'
    ],

    init() {
        this.bindEvents();
    },

    onPatientChanged(patient) {
        if (patient) {
            this.loadPatient(patient);
        } else {
            this.currentPatient = null;
            this.currentSessionIndex = -1;
            this._clearSessionForm();
            this._showList();
            this._renderSessionsList();
        }
    },

    bindEvents() {
        // New session button
        const btnNew = document.getElementById('btn-new-session');
        if (btnNew) {
            btnNew.addEventListener('click', () => this.createNewSession());
        }

        const btnClose = document.getElementById('btn-close-session');
        if (btnClose) {
            btnClose.addEventListener('click', () => this._closeSessionForm());
        }

        const btnEdit = document.getElementById('btn-edit-session');
        if (btnEdit) {
            btnEdit.addEventListener('click', () => {
                if (this.currentSessionIndex < 0) return;
                this._setEditingMode(true);
            });
        }

        const btnDelete = document.getElementById('btn-delete-session');
        if (btnDelete) {
            btnDelete.addEventListener('click', async () => {
                await this._requestDeleteCurrentSession();
            });
        }

        const czasMinSelect = document.getElementById('czasMin');
        if (czasMinSelect) {
            czasMinSelect.addEventListener('change', () => {
                this._syncDurationCustomUi();
                this._onFieldChange();
            });
        }

        // Auto-save on any field change in the session form
        const form = document.getElementById('session-form');
        if (form) {
            form.addEventListener('input', (e) => {
                if (e.target.matches('input, textarea, select')) {
                    this._onFieldChange();
                }
            });
            form.addEventListener('change', (e) => {
                if (e.target.matches('input[type="checkbox"], select')) {
                    this._onFieldChange();
                }
            });
        }
    },

    _parseSessionNumber(value) {
        const cleaned = String(value != null ? value : '').replace(/[^0-9]/g, '');
        const parsed = parseInt(cleaned, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    },

    _formatPolishDate(value) {
        if (!value) return '';
        const dt = new Date(value);
        if (!Number.isFinite(dt.getTime())) return String(value);
        return dt.toLocaleDateString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    _truncateText(value, maxLen) {
        const txt = String(value || '').replace(/\s+/g, ' ').trim();
        if (!txt) return '';
        if (txt.length <= maxLen) return txt;
        return txt.slice(0, maxLen).trimEnd() + '…';
    },

    _getOneSentenceSummary(session) {
        const source = String((session && (session.podsumowanieAI || session.opisKlienta)) || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!source) return 'Brak podsumowania.';

        const sentenceMatch = source.match(/^(.+?[.!?])(?:\s|$)/);
        const sentence = sentenceMatch && sentenceMatch[1] ? sentenceMatch[1] : source;
        return this._truncateText(sentence, 140);
    },

    _getDurationLabel(rawValue) {
        const raw = String(rawValue || '').trim();
        if (!raw) return '';
        const minutes = parseInt(raw, 10);
        if (!Number.isFinite(minutes) || minutes <= 0) return raw;
        if (minutes === 60) return '1 h';
        if (minutes === 120) return '2 h';
        return minutes + ' min';
    },

    _getSessionTypeForIndex(index) {
        return index === 0 ? 'Sesja pierwsza / wstępna' : 'Sesja kontynuacyjna';
    },

    _toTimestamp(value) {
        const t = Date.parse(value || '');
        return Number.isFinite(t) ? t : null;
    },

    _toCheckedBool(rawValue) {
        return rawValue === true || rawValue === 'Tak' || rawValue === 'true' || rawValue === 1;
    },

    _ensureSessionShape(session) {
        const s = (session && typeof session === 'object') ? session : {};

        this.sessionFields.forEach(f => {
            if (s[f] == null) s[f] = '';
        });
        this.soapFields.forEach(f => {
            if (s[f] == null) s[f] = '';
        });

        if (!s.objawy || typeof s.objawy !== 'object' || Array.isArray(s.objawy)) s.objawy = {};

        this.symptoms.forEach(sym => {
            const existing = s.objawy[sym] || {};
            s.objawy[sym] = {
                checked: this._toCheckedBool(existing.checked),
                nasilenie: String(existing.nasilenie != null ? existing.nasilenie : '0'),
                uwagi: existing.uwagi != null ? String(existing.uwagi) : ''
            };
        });

        return s;
    },

    _normalizeSessionsSequence(preferredSessionRef) {
        if (!this.currentPatient) return -1;
        if (!Array.isArray(this.currentPatient.sesje)) this.currentPatient.sesje = [];

        const wrapped = this.currentPatient.sesje.map((session, idx) => ({
            session: this._ensureSessionShape(session),
            idx: idx
        }));

        wrapped.sort((a, b) => {
            const nrA = this._parseSessionNumber(a.session.nrSesji);
            const nrB = this._parseSessionNumber(b.session.nrSesji);
            if (nrA != null && nrB != null && nrA !== nrB) return nrA - nrB;
            if (nrA != null && nrB == null) return -1;
            if (nrA == null && nrB != null) return 1;

            const dtA = this._toTimestamp(a.session.dataSesji);
            const dtB = this._toTimestamp(b.session.dataSesji);
            if (dtA != null && dtB != null && dtA !== dtB) return dtA - dtB;
            if (dtA != null && dtB == null) return -1;
            if (dtA == null && dtB != null) return 1;

            return a.idx - b.idx;
        });

        this.currentPatient.sesje = wrapped.map(w => w.session);
        this.currentPatient.sesje.forEach((session, i) => {
            session.nrSesji = String(i + 1);
            session.typSesji = this._getSessionTypeForIndex(i);
            if (!session.dataSesji) session.dataSesji = new Date().toISOString().slice(0, 10);
        });

        if (!preferredSessionRef) return -1;
        return this.currentPatient.sesje.indexOf(preferredSessionRef);
    },

    _onFieldChange() {
        if (!this.currentPatient || this.currentSessionIndex < 0) return;

        // In read-only mode only AI summary may be edited.
        if (!this._isEditingSession) {
            const active = document.activeElement;
            if (!active || active.id !== 'podsumowanieAI') return;
        }

        this.collectSessionData();
        if (typeof XlsxHandler !== 'undefined' && typeof XlsxHandler.scheduleAutoSave === 'function') {
            XlsxHandler.scheduleAutoSave(this.currentPatient);
        }
    },

    loadPatient(patient) {
        this.currentPatient = patient;
        if (!patient.sesje) patient.sesje = [];
        this._normalizeSessionsSequence();
        this.currentSessionIndex = -1;
        this._clearSessionForm();
        this._showList();
        this._renderSessionsList();
    },

    createNewSession() {
        if (!this.currentPatient) {
            if (typeof App !== 'undefined' && App.showNotification) {
                App.showNotification('Proszę najpierw wybrać pacjenta.', 'error');
            }
            return;
        }

        if (!this.currentPatient.sesje) this.currentPatient.sesje = [];
        this._normalizeSessionsSequence();

        const session = this._createEmptySession();
        if (!session.dataSesji) session.dataSesji = new Date().toISOString().slice(0, 10);

        this.currentPatient.sesje.push(session);
        const idx = this._normalizeSessionsSequence(session);
        this.openSession(idx >= 0 ? idx : (this.currentPatient.sesje.length - 1), { editing: true });
        this._renderSessionsList();

        if (typeof XlsxHandler !== 'undefined' && typeof XlsxHandler.scheduleAutoSave === 'function') {
            XlsxHandler.scheduleAutoSave(this.currentPatient);
        }
    },

    _createEmptySession() {
        return this._ensureSessionShape({});
    },

    openSession(index, options) {
        if (!this.currentPatient || !this.currentPatient.sesje) return;
        this._normalizeSessionsSequence();
        if (index < 0 || index >= this.currentPatient.sesje.length) return;

        this.currentSessionIndex = index;
        this._fillSessionForm(this.currentPatient.sesje[index]);
        this._syncDurationCustomUi();
        const opts = options || {};
        this._showForm(!!opts.editing);
        this._renderSessionsList();
    },

    selectSession(index) {
        this.openSession(index, { editing: false });
    },

    _showForm(editing) {
        const list = document.getElementById('sessions-list');
        const btnNew = document.getElementById('btn-new-session');
        const form = document.getElementById('session-form');
        if (list) list.style.display = 'none';
        if (btnNew) btnNew.style.display = 'none';
        if (form) form.style.display = '';

        this._showingForm = true;
        this._setEditingMode(!!editing);
    },

    _showList() {
        const list = document.getElementById('sessions-list');
        const btnNew = document.getElementById('btn-new-session');
        const form = document.getElementById('session-form');

        if (list) list.style.display = '';
        if (btnNew) btnNew.style.display = '';
        if (form) form.style.display = 'none';

        this._showingForm = false;
    },

    _isSafetyAssessmentCompleted() {
        if (!this.currentPatient || this.currentSessionIndex < 0) return true;

        const field = document.getElementById('ocenaRyzykaS');
        if (field) {
            return String(field.value || '').trim() !== '';
        }

        const session = this.currentPatient.sesje && this.currentPatient.sesje[this.currentSessionIndex];
        return session ? String(session.ocenaRyzykaS || '').trim() !== '' : true;
    },

    canLeaveView() {
        if (!this._showingForm || !this._isEditingSession) return true;

        if (this._isSafetyAssessmentCompleted()) return true;

        if (typeof App !== 'undefined' && typeof App.showNotification === 'function') {
            App.showNotification('Uzupełnij pole „Ocena ryzyka S” przed wyjściem z edycji sesji.', 'error');
        }

        const field = document.getElementById('ocenaRyzykaS');
        if (field && typeof field.focus === 'function') field.focus();
        return false;
    },

    _closeSessionForm() {
        if (!this.canLeaveView()) {
            return;
        }

        this._showList();
        this.currentSessionIndex = -1;
        this._isEditingSession = false;
        this._clearSessionForm();
        this._setEditingMode(false);
        this._renderSessionsList();
    },

    _setEditingMode(isEditing) {
        const form = document.getElementById('session-form');
        const editBtn = document.getElementById('btn-edit-session');
        const deleteBtn = document.getElementById('btn-delete-session');
        if (!form) return;

        this._isEditingSession = !!isEditing;
        form.classList.toggle('session-form--readonly', !this._isEditingSession);

        const controls = form.querySelectorAll('input, textarea, select');
        controls.forEach((el) => {
            const id = el.id || '';

            // Always editable summary field.
            if (id === 'podsumowanieAI') {
                el.disabled = false;
                if ('readOnly' in el) el.readOnly = false;
                return;
            }

            // Always readonly auto-fields.
            if (id === 'nrSesji' || id === 'typSesji') {
                el.disabled = false;
                if ('readOnly' in el) el.readOnly = true;
                return;
            }

            if (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'radio') {
                el.disabled = !this._isEditingSession;
                return;
            }

            if ('readOnly' in el) el.readOnly = !this._isEditingSession;
            el.disabled = false;
        });

        this._syncDurationCustomUi();

        if (editBtn) {
            editBtn.textContent = this._isEditingSession ? 'Edycja aktywna' : 'Edytuj sesję';
            editBtn.disabled = this._isEditingSession || this.currentSessionIndex < 0;
        }
        if (deleteBtn) {
            deleteBtn.disabled = !this._isEditingSession || this.currentSessionIndex < 0;
        }
    },

    _syncDurationCustomUi() {
        const select = document.getElementById('czasMin');
        const wrap = document.getElementById('czasMin-custom-wrap');
        const custom = document.getElementById('czasMinCustom');
        if (!select || !wrap || !custom) return;

        const showCustom = select.value === 'custom';
        wrap.style.display = showCustom ? '' : 'none';

        if (!showCustom) {
            custom.value = '';
            custom.disabled = true;
        } else {
            custom.disabled = !this._isEditingSession;
        }
    },

    _renderSessionsList() {
        const container = document.getElementById('sessions-list');
        if (!container) return;
        container.innerHTML = '';

        let selectedSessionRef = null;
        if (this.currentPatient && Array.isArray(this.currentPatient.sesje) && this.currentSessionIndex >= 0) {
            selectedSessionRef = this.currentPatient.sesje[this.currentSessionIndex] || null;
        }
        const reindexed = this._normalizeSessionsSequence(selectedSessionRef);
        if (selectedSessionRef) this.currentSessionIndex = reindexed;

        if (!this.currentPatient || !this.currentPatient.sesje || this.currentPatient.sesje.length === 0) {
            if (!this.currentPatient) {
                container.innerHTML = '<p class="text-muted" style="padding:12px;">Wybierz pacjenta w zakładce "Pacjenci".</p>';
            } else {
                container.innerHTML = '<p class="text-muted" style="padding:12px;">Brak sesji. Kliknij "Nowa Sesja" aby dodać.</p>';
            }
            return;
        }

        const displayRows = this.currentPatient.sesje
            .map((session, i) => ({ session: session, idx: i }))
            .sort((a, b) => b.idx - a.idx); // newest on top

        displayRows.forEach((entry) => {
            const session = entry.session;
            const i = entry.idx;

            const item = document.createElement('div');
            item.className = 'session-item' + (i === this.currentSessionIndex ? ' active' : '');
            if (i === 0) item.className += ' session-item--first';
            item.dataset.sessionIndex = i;

            const titleRow = document.createElement('div');
            titleRow.className = 'session-item__title-row';

            const title = document.createElement('div');
            title.className = 'session-item__title';
            title.textContent = 'Sesja #' + (session.nrSesji || (i + 1));

            const dateEl = document.createElement('div');
            dateEl.className = 'session-item__date text-muted text-sm';
            dateEl.textContent = this._formatPolishDate(session.dataSesji);

            titleRow.appendChild(title);
            if (i === 0) {
                const badge = document.createElement('span');
                badge.className = 'session-item__badge';
                badge.textContent = 'PIERWSZA';
                titleRow.appendChild(badge);
            }

            const meta = document.createElement('div');
            meta.className = 'session-item__meta text-muted text-sm';
            const parts = [];
            if (session.typSesji) parts.push(session.typSesji);
            if (session.modalnosc) parts.push(session.modalnosc);
            if (session.czasMin) parts.push(this._getDurationLabel(session.czasMin));
            meta.textContent = parts.join(' • ');

            const summaryLine = document.createElement('div');
            summaryLine.className = 'session-item__summary-line';
            summaryLine.textContent = this._getOneSentenceSummary(session);

            const footer = document.createElement('div');
            footer.className = 'session-item__footer';
            footer.appendChild(dateEl);
            footer.appendChild(meta);

            item.appendChild(titleRow);
            item.appendChild(summaryLine);
            item.appendChild(footer);

            item.addEventListener('click', () => {
                this.openSession(i, { editing: false });
            });

            container.appendChild(item);
        });
    },

    _getDurationValueFromForm() {
        const select = document.getElementById('czasMin');
        const custom = document.getElementById('czasMinCustom');
        if (!select) return '';

        if (select.value === 'custom') {
            const customVal = String(custom && custom.value != null ? custom.value : '').trim();
            const n = parseInt(customVal, 10);
            return Number.isFinite(n) && n > 0 ? String(n) : '';
        }

        return String(select.value || '').trim();
    },

    async _requestDeleteCurrentSession() {
        if (!this.currentPatient || this.currentSessionIndex < 0) return;
        if (!this._isEditingSession) return;

        const session = this.currentPatient.sesje[this.currentSessionIndex] || {};
        const nr = session.nrSesji || String(this.currentSessionIndex + 1);
        const data = this._formatPolishDate(session.dataSesji);

        let confirmed = false;
        if (typeof App !== 'undefined' && typeof App.confirmModal === 'function') {
            confirmed = await App.confirmModal({
                title: 'Usuń sesję',
                message: 'Czy na pewno chcesz usunąć sesję #' + nr + (data ? (' z dnia ' + data) : '') + '? Tej operacji nie można cofnąć.',
                confirmText: 'Usuń sesję',
                cancelText: 'Anuluj',
                danger: true
            });
        }

        if (!confirmed) return;
        this._deleteSession(this.currentSessionIndex);
    },

    _deleteSession(index) {
        if (!this.currentPatient || !this.currentPatient.sesje) return;

        this.currentPatient.sesje.splice(index, 1);

        // After deletion always return to the sessions list view.
        this._normalizeSessionsSequence();
        this.currentSessionIndex = -1;
        this._clearSessionForm();
        this._closeSessionForm();

        this._renderSessionsList();

        if (typeof XlsxHandler !== 'undefined' && typeof XlsxHandler.scheduleAutoSave === 'function') {
            XlsxHandler.scheduleAutoSave(this.currentPatient);
        }
    },

    _fillSessionForm(session) {
        if (!session) return;

        // Session meta fields
        this.sessionFields.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id !== 'czasMin') el.value = session[id] || '';
        });

        const durationSelect = document.getElementById('czasMin');
        const durationCustom = document.getElementById('czasMinCustom');
        if (durationSelect && durationCustom) {
            const durationValue = String(session.czasMin || '').trim();
            const standard = ['15', '30', '45', '60', '120'];
            if (!durationValue) {
                durationSelect.value = '';
                durationCustom.value = '';
            } else if (standard.includes(durationValue)) {
                durationSelect.value = durationValue;
                durationCustom.value = '';
            } else {
                durationSelect.value = 'custom';
                durationCustom.value = durationValue;
            }
        }

        // SOAP text fields
        this.soapFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = session[id] || '';
        });

        // Symptoms checklist
        const objawy = session.objawy || {};
        this.symptoms.forEach(sym => {
            const data = objawy[sym] || { checked: false, nasilenie: '0', uwagi: '' };
            const cb = document.getElementById('sym_' + sym);
            if (cb) cb.checked = !!data.checked;
            const sev = document.getElementById('sym_' + sym + '_sev');
            if (sev) sev.value = data.nasilenie || '0';
            const note = document.getElementById('sym_' + sym + '_note');
            if (note) note.value = data.uwagi || '';
        });
    },

    collectSessionData() {
        if (!this.currentPatient || this.currentSessionIndex < 0) return;
        const session = this.currentPatient.sesje[this.currentSessionIndex];
        if (!session) return;

        // Session meta fields
        this.sessionFields.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (id === 'czasMin') {
                session.czasMin = this._getDurationValueFromForm();
            } else {
                session[id] = el.value;
            }
        });

        // SOAP text fields
        this.soapFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) session[id] = el.value;
        });

        // Symptoms checklist
        if (!session.objawy) session.objawy = {};
        this.symptoms.forEach(sym => {
            if (!session.objawy[sym]) session.objawy[sym] = {};
            const cb = document.getElementById('sym_' + sym);
            if (cb) session.objawy[sym].checked = cb.checked;
            const sev = document.getElementById('sym_' + sym + '_sev');
            if (sev) session.objawy[sym].nasilenie = sev.value;
            const note = document.getElementById('sym_' + sym + '_note');
            if (note) session.objawy[sym].uwagi = note.value;
        });

        const normalizedIndex = this._normalizeSessionsSequence(session);
        if (normalizedIndex >= 0) this.currentSessionIndex = normalizedIndex;

        const normalized = this.currentPatient.sesje[this.currentSessionIndex];
        if (normalized) {
            const nrInput = document.getElementById('nrSesji');
            if (nrInput) nrInput.value = normalized.nrSesji || '';
            const typInput = document.getElementById('typSesji');
            if (typInput) typInput.value = normalized.typSesji || '';
        }

        this._syncDurationCustomUi();

        // Update session list display
        this._renderSessionsList();
    },

    _clearSessionForm() {
        this.sessionFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const durationSelect = document.getElementById('czasMin');
        const durationCustom = document.getElementById('czasMinCustom');
        if (durationSelect) durationSelect.value = '';
        if (durationCustom) durationCustom.value = '';
        this._syncDurationCustomUi();

        this.soapFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        this.symptoms.forEach(sym => {
            const cb = document.getElementById('sym_' + sym);
            if (cb) cb.checked = false;
            const sev = document.getElementById('sym_' + sym + '_sev');
            if (sev) sev.value = '0';
            const note = document.getElementById('sym_' + sym + '_note');
            if (note) note.value = '';
        });
    }
};
