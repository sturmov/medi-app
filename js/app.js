// ============================================================================
// app.js - Main Application Controller (matches HTML structure)
// ============================================================================

const App = {
    currentView: 'view-patients',
    currentPatient: null,
    _saveStatus: 'idle',
    _lastSaveAt: null,
    _saveIndicatorMessageTimeout: null,
    _modalState: null,
    _patientBannerState: null,
    _folderGateState: null,

    async init() {
        try {
            // Setup navigation
            this._setupNavigation();

            // Setup responsive sidebar
            this._setupResponsiveSidebar();

            // Setup save indicator interactions
            this._setupSaveIndicator();

            // Setup global current patient banner
            this._setupCurrentPatientBanner();

            // Setup folder gate (app lock until folder is connected)
            this._setupFolderGate();

            // Setup global modal window
            this._setupModal();

            // Setup test tabs
            this._setupTestTabs();

            // Setup storage controls
            this._bindStorageControls();

            // Initialize all modules
            const modules = [
                { name: 'Patients', ref: typeof Patients !== 'undefined' ? Patients : null },
                { name: 'Interview', ref: typeof Interview !== 'undefined' ? Interview : null },
                { name: 'MSE', ref: typeof MSE !== 'undefined' ? MSE : null },
                { name: 'SOAP', ref: typeof SOAP !== 'undefined' ? SOAP : null },
                { name: 'AISummary', ref: typeof AISummary !== 'undefined' ? AISummary : null },
                { name: 'Tests', ref: typeof Tests !== 'undefined' ? Tests : null },
                { name: 'Plan', ref: typeof Plan !== 'undefined' ? Plan : null }
            ];
            modules.forEach(m => {
                if (m.ref && typeof m.ref.init === 'function') {
                    try { m.ref.init(); } catch (e) { console.error('Init ' + m.name + ':', e); }
                }
            });

            // Update save indicator
            this.updateSaveIndicator('idle');

            // Lock app while checking folder connection
            this._setFolderGateVisible(true, 'Sprawdzanie połączenia z folderem pacjentów...');

            // Storage + startup loading
            const ready = await this._initStorageAndLoadPatients();

            if (ready) {
                this.clearCurrentPatient({ persist: false });
                this.showView('view-patients', { persist: false });
                this._setFolderGateVisible(false);
            } else {
                this.clearCurrentPatient({ persist: false });
                this.showView('view-patients', { persist: false });
                this._setFolderGateVisible(true, this._getFolderGateDefaultMessage());
            }

            console.log('PsychoApp initialized.');
        } catch (error) {
            console.error('App init error:', error);
            this.updateSaveIndicator('error');
        }
    },

    // ---- Navigation ----
    _setupNavigation() {
        document.querySelectorAll('.sidebar__item[data-view]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();

                if (item.classList.contains('disabled')) {
                    return;
                }

                this.showView(item.dataset.view);

                if (window.innerWidth <= 1024) {
                    this._setSidebarOpen(false);
                }
            });
        });
    },

    _setupResponsiveSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggle = document.getElementById('sidebar-toggle');
        const overlay = document.getElementById('sidebar-overlay');

        this.sidebar = sidebar;
        this.sidebarToggle = toggle;
        this.sidebarOverlay = overlay;

        if (!sidebar || !toggle || !overlay) return;

        toggle.addEventListener('click', () => {
            const isOpen = window.innerWidth <= 768
                ? sidebar.classList.contains('open')
                : document.body.classList.contains('tablet-sidebar-expanded');
            this._setSidebarOpen(!isOpen);
        });

        overlay.addEventListener('click', () => {
            this._setSidebarOpen(false);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this._setSidebarOpen(false);
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024) {
                this._setSidebarOpen(false);
                document.body.classList.remove('tablet-sidebar-expanded');
            } else if (window.innerWidth > 768) {
                this.sidebar.classList.remove('open');
                this.sidebarOverlay.classList.remove('open');
                this.sidebarOverlay.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('sidebar-open');
            }
        });
    },

    _setSidebarOpen(open) {
        if (!this.sidebar || !this.sidebarToggle || !this.sidebarOverlay) return;

        const width = window.innerWidth;

        if (width <= 768) {
            // Mobile / small tablet: off-canvas sidebar
            this.sidebar.classList.toggle('open', open);
            this.sidebarOverlay.classList.toggle('open', open);
            this.sidebarToggle.setAttribute('aria-expanded', String(open));
            this.sidebarOverlay.setAttribute('aria-hidden', String(!open));
            document.body.classList.toggle('sidebar-open', open);
            document.body.classList.remove('tablet-sidebar-expanded');
            return;
        }

        if (width <= 1024) {
            // Tablet portrait/landscape: collapsed icon menu, expandable on demand
            document.body.classList.toggle('tablet-sidebar-expanded', open);
            this.sidebar.classList.remove('open');
            this.sidebarOverlay.classList.remove('open');
            this.sidebarToggle.setAttribute('aria-expanded', String(open));
            this.sidebarOverlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('sidebar-open');
            return;
        }

        // Desktop: keep expanded fixed sidebar
        this.sidebar.classList.remove('open');
        this.sidebarOverlay.classList.remove('open');
        this.sidebarToggle.setAttribute('aria-expanded', 'false');
        this.sidebarOverlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('sidebar-open');
        document.body.classList.remove('tablet-sidebar-expanded');
    },

    showView(viewId, options) {
        const opts = options || {};
        let resolvedViewId = document.getElementById(viewId) ? viewId : 'view-patients';

        if (!opts.force && this.currentView === 'view-soap' && resolvedViewId !== 'view-soap' && typeof SOAP !== 'undefined' && typeof SOAP.canLeaveView === 'function') {
            const canLeaveSoap = SOAP.canLeaveView();
            if (!canLeaveSoap) {
                return;
            }
        }

        if (resolvedViewId !== 'view-patients' && !this.currentPatient) {
            resolvedViewId = 'view-patients';
        }

        this.currentView = resolvedViewId;

        // Hide all views
        document.querySelectorAll('.view').forEach(v => {
            v.style.display = 'none';
            v.classList.remove('active');
        });

        // Show target view
        const target = document.getElementById(resolvedViewId);
        if (target) {
            target.style.display = '';
            target.classList.add('active');
        }

        // Update sidebar active state
        document.querySelectorAll('.sidebar__item[data-view]').forEach(item => {
            item.classList.toggle('active', item.dataset.view === resolvedViewId);
        });

        if (resolvedViewId === 'view-patients' && typeof Patients !== 'undefined' && typeof Patients.onViewEnter === 'function') {
            Patients.onViewEnter();
        }

        if (resolvedViewId === 'view-interview' && typeof Interview !== 'undefined' && typeof Interview.ensureTodayVisitDateIfEmpty === 'function') {
            Interview.ensureTodayVisitDateIfEmpty();
        }

        this._loadCurrentPatientIntoView(resolvedViewId);
    },

    _loadCurrentPatientIntoView(viewId) {
        const patient = this.currentPatient || null;

        if (viewId === 'view-interview' && typeof Interview !== 'undefined') {
            if (patient && typeof Interview.loadPatient === 'function') Interview.loadPatient(patient);
            else if (!patient && typeof Interview.clearForm === 'function') Interview.clearForm();
            return;
        }

        if (viewId === 'view-mse' && typeof MSE !== 'undefined') {
            if (patient && typeof MSE.loadPatient === 'function') MSE.loadPatient(patient);
            else if (!patient && typeof MSE.clearForm === 'function') MSE.clearForm();
            return;
        }

        if (viewId === 'view-soap' && typeof SOAP !== 'undefined') {
            if (patient && typeof SOAP.loadPatient === 'function') SOAP.loadPatient(patient);
            else if (!patient && typeof SOAP.onPatientChanged === 'function') SOAP.onPatientChanged(null);
            return;
        }

        if (viewId === 'view-tests' && typeof Tests !== 'undefined') {
            if (typeof Tests.onPatientChanged === 'function') Tests.onPatientChanged(patient);
            return;
        }

        if (viewId === 'view-plan' && typeof Plan !== 'undefined') {
            if (patient && typeof Plan.loadPatient === 'function') Plan.loadPatient(patient);
            else if (!patient && typeof Plan.clearForm === 'function') Plan.clearForm();
        }
    },

    // ---- Test Tabs ----
    _setupTestTabs() {
        document.querySelectorAll('.tab[data-tab]').forEach(tab => {
            tab.addEventListener('click', () => {
                // Toggle active tab
                document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Toggle active section
                document.querySelectorAll('.test-section').forEach(s => {
                    s.style.display = 'none';
                    s.classList.remove('active');
                });
                const section = document.getElementById(tab.dataset.tab);
                if (section) {
                    section.style.display = '';
                    section.classList.add('active');
                }
            });
        });
    },

    _bindStorageControls() {
        const btnConnect = document.getElementById('btn-connect-folder');
        const btnConnectGate = document.getElementById('btn-connect-folder-gate');

        const handler = async () => {
            await this._connectFolderAndReload();
        };

        if (btnConnect) btnConnect.addEventListener('click', handler);
        if (btnConnectGate) btnConnectGate.addEventListener('click', handler);
    },

    // ---- Storage ----
    async _initStorageAndLoadPatients() {
        if (typeof XlsxHandler === 'undefined') return false;

        XlsxHandler.onStatusChange = (message, type) => {
            const normalizedType = type === 'warning' ? 'info' : (type || 'info');

            const lower = String(message || '').toLowerCase();
            if (lower.indexOf('zapisywanie') >= 0) {
                this.updateSaveIndicator('saving');
            } else if (normalizedType === 'error') {
                this.updateSaveIndicator('error');
            } else if (lower.indexOf('zapisano') >= 0) {
                this.updateSaveIndicator('saved', { recordTimestamp: true });
            } else if (lower.indexOf('wczytano') >= 0) {
                this.updateSaveIndicator('saved');
            }
        };

        const ready = await XlsxHandler.init({ interactive: false });
        if (!ready) {
            this._persistFolderState(false);
            this.updateSaveIndicator('idle');
            return false;
        }

        await this._loadPatientsIntoState();
        this._persistFolderState(true);
        return true;
    },

    async _connectFolderAndReload() {
        if (typeof XlsxHandler === 'undefined') return false;

        const ready = await XlsxHandler.init({ interactive: true });
        if (!ready) {
            if (!this._isStorageReady()) {
                this._persistFolderState(false);
                this._setFolderGateVisible(true, this._getFolderGateDefaultMessage());
            }
            return false;
        }

        await this._loadPatientsIntoState();
        this._persistFolderState(true);

        this.clearCurrentPatient({ persist: false });
        this.showView('view-patients', { persist: false });

        this._setFolderGateVisible(false);
        return true;
    },

    async _loadPatientsIntoState() {
        if (typeof XlsxHandler === 'undefined' || typeof Patients === 'undefined') return;
        const loadedPatients = await XlsxHandler.loadAllPatients();
        Patients.list = Array.isArray(loadedPatients) ? loadedPatients : [];
        Patients.currentPatient = null;
        Patients.currentPatientIndex = -1;
        Patients.renderList();
        this.clearCurrentPatient({ persist: false });
    },

    _isStorageReady() {
        return typeof XlsxHandler !== 'undefined' && !!XlsxHandler.directoryHandle;
    },

    _persistFolderState(ready) {
        if (typeof AppConfig === 'undefined' || typeof AppConfig.setFolderState !== 'function') return;

        if (!ready || typeof XlsxHandler === 'undefined' || typeof XlsxHandler.getStorageState !== 'function') {
            AppConfig.setFolderState({
                folderPinned: false
            });
            this._updateConnectedFolderLabel();
            return;
        }

        AppConfig.setFolderState(XlsxHandler.getStorageState());
        this._updateConnectedFolderLabel();
    },

    _updateConnectedFolderLabel() {
        const btnConnect = document.getElementById('btn-connect-folder');
        if (!btnConnect) return;

        let connectedName = '';
        if (this._isStorageReady() && typeof XlsxHandler !== 'undefined' && typeof XlsxHandler.getStorageState === 'function') {
            const state = XlsxHandler.getStorageState() || {};
            connectedName = String(state.dataFolderName || state.rootFolderName || '').trim();
        }

        if (!connectedName && typeof AppConfig !== 'undefined' && typeof AppConfig.getFolderSummary === 'function') {
            connectedName = String(AppConfig.getFolderSummary() || '').trim();
        }

        if (connectedName) {
            btnConnect.textContent = '📁 Folder: ' + connectedName;
            btnConnect.title = 'Podłączony folder: ' + connectedName;
            return;
        }

        btnConnect.textContent = '📁 Połącz folder pacjentów';
        btnConnect.title = 'Połącz folder pacjentów';
    },

    _setupFolderGate() {
        const container = document.getElementById('folder-gate');
        const status = document.getElementById('folder-gate-status');

        this._folderGateState = {
            container,
            status,
            visible: false
        };
    },

    _setFolderGateVisible(visible, message) {
        const state = this._folderGateState;
        if (!state || !state.container) return;

        state.visible = !!visible;
        state.container.style.display = state.visible ? '' : 'none';

        if (state.status && typeof message === 'string' && message.trim()) {
            state.status.textContent = message;
        }

        document.body.classList.toggle('app-locked', state.visible);

        if (state.visible) {
            this._setSidebarOpen(false);
        }
    },

    _getFolderGateDefaultMessage() {
        if (typeof AppConfig !== 'undefined' && typeof AppConfig.getFolderSummary === 'function') {
            const summary = AppConfig.getFolderSummary();
            if (summary) {
                return 'Brak dostępu do poprzedniego folderu: ' + summary + '. Połącz folder pacjentów, aby kontynuować.';
            }
        }
        return 'Brak przypiętego folderu z danymi. Połącz folder pacjentów, aby kontynuować.';
    },

    _setupCurrentPatientBanner() {
        const container = document.getElementById('patient-banner');
        const name = document.getElementById('patient-banner-name');
        const minorDot = document.getElementById('patient-banner-minor');

        this._patientBannerState = {
            container,
            name,
            minorDot
        };

        this._updateCurrentPatientBanner();
        this._updateSidebarItemsState();
    },

    _getPatientBannerLabel(patient) {
        if (!patient || !patient.dane) return '';
        const code = (typeof Patients !== 'undefined' && typeof Patients.getPatientCode === 'function')
            ? Patients.getPatientCode(patient)
            : (patient.dane.kodPacjenta || patient.dane.id || '');
        const name = (typeof Patients !== 'undefined' && typeof Patients.getDisplayName === 'function')
            ? Patients.getDisplayName(patient)
            : [patient.dane.imie || '', patient.dane.nazwisko || ''].join(' ').trim();
        return code + (name ? (' — ' + name) : '');
    },

    _getPatientAgeYears(patient) {
        const value = patient && patient.dane ? patient.dane.dataUrodzenia : '';
        if (!value) return null;

        const birth = new Date(value);
        if (!Number.isFinite(birth.getTime())) return null;

        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDelta = today.getMonth() - birth.getMonth();
        if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
            age -= 1;
        }

        return Number.isFinite(age) ? age : null;
    },

    _updateCurrentPatientBanner() {
        const state = this._patientBannerState;
        if (!state || !state.container || !state.name) return;

        if (!this.currentPatient) {
            state.container.style.display = 'none';
            state.name.textContent = '';
            if (state.minorDot) state.minorDot.style.display = 'none';
            document.body.classList.remove('has-patient-banner');
            return;
        }

        state.name.textContent = this._getPatientBannerLabel(this.currentPatient);

        const age = this._getPatientAgeYears(this.currentPatient);
        const isMinor = age != null && age < 18;
        if (state.minorDot) {
            state.minorDot.style.display = isMinor ? '' : 'none';
            const label = isMinor
                ? ('Pacjent niepełnoletni (' + age + ' lat)')
                : 'Pacjent pełnoletni';
            state.minorDot.title = label;
            state.minorDot.setAttribute('aria-label', label);
        }

        state.container.style.display = '';
        document.body.classList.add('has-patient-banner');
    },

    _updateSidebarItemsState() {
        const hasPatient = !!this.currentPatient;

        document.querySelectorAll('.sidebar__item[data-view]').forEach(item => {
            const view = item.dataset.view;
            const shouldDisable = view !== 'view-patients' && !hasPatient;
            item.classList.toggle('disabled', shouldDisable);
            item.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
        });
    },

    _syncPatientsModuleCurrentPatient() {
        if (typeof Patients === 'undefined') return;

        if (!this.currentPatient) {
            Patients.currentPatient = null;
            Patients.currentPatientIndex = -1;
            if (typeof Patients.renderList === 'function') Patients.renderList(Patients._currentFilter || '');
            return;
        }

        const idx = Patients.list.findIndex(p => p === this.currentPatient || (p && p.dane && this.currentPatient.dane && p.dane.id === this.currentPatient.dane.id));
        Patients.currentPatient = this.currentPatient;
        Patients.currentPatientIndex = idx;
        if (typeof Patients.renderList === 'function') Patients.renderList(Patients._currentFilter || '');
    },

    _notifyModulesPatientChanged() {
        const patient = this.currentPatient || null;

        if (typeof Interview !== 'undefined') {
            if (typeof Interview.onPatientChanged === 'function') Interview.onPatientChanged(patient);
            else if (patient && typeof Interview.loadPatient === 'function') Interview.loadPatient(patient);
            else if (!patient && typeof Interview.clearForm === 'function') Interview.clearForm();
        }

        if (typeof MSE !== 'undefined') {
            if (typeof MSE.onPatientChanged === 'function') MSE.onPatientChanged(patient);
            else if (patient && typeof MSE.loadPatient === 'function') MSE.loadPatient(patient);
            else if (!patient && typeof MSE.clearForm === 'function') MSE.clearForm();
        }

        if (typeof SOAP !== 'undefined') {
            if (typeof SOAP.onPatientChanged === 'function') SOAP.onPatientChanged(patient);
            else if (patient && typeof SOAP.loadPatient === 'function') SOAP.loadPatient(patient);
        }

        if (typeof Tests !== 'undefined') {
            if (typeof Tests.onPatientChanged === 'function') Tests.onPatientChanged(patient);
        }

        if (typeof Plan !== 'undefined') {
            if (typeof Plan.onPatientChanged === 'function') Plan.onPatientChanged(patient);
            else if (patient && typeof Plan.loadPatient === 'function') Plan.loadPatient(patient);
            else if (!patient && typeof Plan.clearForm === 'function') Plan.clearForm();
        }
    },

    setCurrentPatient(patient, options) {
        const opts = options || {};
        this.currentPatient = patient || null;
        this._syncPatientsModuleCurrentPatient();
        this._updateCurrentPatientBanner();
        this._updateSidebarItemsState();
        this._notifyModulesPatientChanged();

        if (!this.currentPatient && this.currentView !== 'view-patients') {
            this.showView('view-patients', { persist: opts.persist });
        }

        if (this.currentView === 'view-interview' && this.currentPatient && typeof Interview !== 'undefined' && typeof Interview.ensureTodayVisitDateIfEmpty === 'function') {
            Interview.ensureTodayVisitDateIfEmpty();
        }
    },

    clearCurrentPatient(options) {
        this.setCurrentPatient(null, options);
    },

    // ---- Save Indicator ----
    _setupSaveIndicator() {
        const el = document.getElementById('save-indicator');
        if (!el) return;

        el.setAttribute('title', 'Kliknij, aby zobaczyć czas ostatniego zapisu');
        el.style.cursor = 'pointer';

        el.addEventListener('click', () => {
            this._showLastSaveTime();
        });
    },

    // ---- Reusable Modal ----
    _setupModal() {
        const modal = document.getElementById('app-modal');
        const backdrop = document.getElementById('app-modal-backdrop');
        const btnCancel = document.getElementById('app-modal-cancel');
        const btnConfirm = document.getElementById('app-modal-confirm');
        const titleEl = document.getElementById('app-modal-title');
        const bodyEl = document.getElementById('app-modal-body');

        this._modalState = {
            modal,
            backdrop,
            btnCancel,
            btnConfirm,
            titleEl,
            bodyEl,
            resolver: null
        };

        if (!modal || !backdrop || !btnCancel || !btnConfirm || !titleEl || !bodyEl) return;

        const closeAsCancel = () => this._closeModal(false);
        backdrop.addEventListener('click', closeAsCancel);
        btnCancel.addEventListener('click', closeAsCancel);
        btnConfirm.addEventListener('click', () => this._closeModal(true));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('open')) {
                e.preventDefault();
                this._closeModal(false);
            }
        });
    },

    _openModal(options) {
        const s = this._modalState;
        if (!s || !s.modal) return Promise.resolve(false);

        const opts = options || {};
        s.titleEl.textContent = opts.title || 'Potwierdzenie';
        s.bodyEl.textContent = opts.message || '';
        s.btnCancel.textContent = opts.cancelText || 'Anuluj';
        s.btnConfirm.textContent = opts.confirmText || 'Potwierdź';

        s.btnConfirm.classList.remove('btn--danger', 'btn--primary');
        s.btnConfirm.classList.add(opts.danger ? 'btn--danger' : 'btn--primary');

        s.modal.classList.add('open');
        s.modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');

        setTimeout(() => {
            try { s.btnConfirm.focus(); } catch (_) {}
        }, 0);

        return new Promise((resolve) => {
            s.resolver = resolve;
        });
    },

    _closeModal(result) {
        const s = this._modalState;
        if (!s || !s.modal || !s.modal.classList.contains('open')) return;

        s.modal.classList.remove('open');
        s.modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');

        const resolver = s.resolver;
        s.resolver = null;
        if (resolver) resolver(!!result);
    },

    async confirmModal(options) {
        return this._openModal(options);
    },

    updateSaveIndicator(status, options) {
        const opts = options || {};
        const el = document.getElementById('save-indicator');
        if (!el) return;

        this._saveStatus = status;
        if (status === 'saved' && opts.recordTimestamp) {
            this._lastSaveAt = new Date();
        }

        el.className = 'top-bar__save-indicator';
        switch (status) {
            case 'saved':
                el.textContent = '💾 Zapisano';
                el.style.color = '#059669';
                break;
            case 'saving':
                el.textContent = '💾 Zapisywanie...';
                el.style.color = '#D97706';
                break;
            case 'error':
                el.textContent = '💾 Błąd zapisu';
                el.style.color = '#DC2626';
                break;
            default:
                el.textContent = '💾 Autozapis';
                el.style.color = '#059669';
        }
    },

    _showLastSaveTime() {
        const el = document.getElementById('save-indicator');
        if (!el) return;

        if (!this._lastSaveAt) {
            this._showTemporarySaveIndicatorMessage('💾 Brak zapisu w tej sesji');
            return;
        }

        const formatted = this._lastSaveAt.toLocaleTimeString('pl-PL', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        this._showTemporarySaveIndicatorMessage('💾 Ostatni zapis: ' + formatted);
    },

    _showTemporarySaveIndicatorMessage(message, durationMs) {
        const el = document.getElementById('save-indicator');
        if (!el) return;

        if (this._saveIndicatorMessageTimeout) {
            clearTimeout(this._saveIndicatorMessageTimeout);
            this._saveIndicatorMessageTimeout = null;
        }

        el.textContent = message;
        el.style.color = '#1F2937';

        this._saveIndicatorMessageTimeout = setTimeout(() => {
            this._saveIndicatorMessageTimeout = null;
            this.updateSaveIndicator(this._saveStatus || 'idle');
        }, typeof durationMs === 'number' ? durationMs : 2500);
    },

    // Compatibility no-op (prevents breakage in other modules)
    showNotification(message, type) {
        if (type === 'error') {
            console.error(message);
        } else {
            console.log(message);
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => App.init());
