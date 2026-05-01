// =============================================================================
// storage-provider.js - abstraction over local XLSX storage and Google Drive
// =============================================================================

(function () {
    const globalRef = typeof window !== 'undefined' ? window : globalThis;

    const LocalHandler = globalRef.LocalXlsxHandler || globalRef.XlsxHandler || null;
    if (!globalRef.LocalXlsxHandler && LocalHandler) {
        globalRef.LocalXlsxHandler = LocalHandler;
    }

    const DriveHandler = globalRef.GDriveHandler || null;

    const StorageProvider = {
        mode: '',
        onStatusChange: null,

        _normalizeMode(mode) {
            return String(mode || '').toLowerCase() === 'gdrive' ? 'gdrive' : 'local';
        },

        _notify(message, type = 'info') {
            if (typeof this.onStatusChange === 'function') {
                try { this.onStatusChange(message, type); } catch (_) {}
            }
        },

        _getConfiguredMode() {
            if (typeof AppConfig !== 'undefined' && typeof AppConfig.getStorageMode === 'function') {
                return this._normalizeMode(AppConfig.getStorageMode());
            }
            return 'local';
        },

        _setConfiguredMode(mode) {
            const normalized = this._normalizeMode(mode);
            if (typeof AppConfig !== 'undefined' && typeof AppConfig.setStorageMode === 'function') {
                AppConfig.setStorageMode(normalized);
            }
            this.mode = normalized;
        },

        getActiveMode() {
            if (this.mode) return this._normalizeMode(this.mode);
            return this._getConfiguredMode();
        },

        isGoogleDriveSupported() {
            return !!(DriveHandler && typeof DriveHandler.init === 'function');
        },

        isLocalSupported() {
            return !!(LocalHandler
                && typeof LocalHandler.isFileSystemAccessSupported === 'function'
                && LocalHandler.isFileSystemAccessSupported());
        },

        isFileSystemAccessSupported() {
            const mode = this.getActiveMode();
            if (mode === 'gdrive') return this.isGoogleDriveSupported();
            return this.isLocalSupported();
        },

        _getHandler(mode) {
            const normalized = this._normalizeMode(mode || this.getActiveMode());
            if (normalized === 'gdrive') return DriveHandler;
            return LocalHandler;
        },

        _bindStatusForwarding(handler) {
            if (!handler) return;
            handler.onStatusChange = (message, type) => {
                this._notify(message, type);
            };
        },

        async switchMode(mode, options) {
            const normalized = this._normalizeMode(mode);
            const opts = options || {};
            const interactive = opts.interactive !== false;
            const previousMode = this.getActiveMode();

            const handler = this._getHandler(normalized);
            if (!handler || typeof handler.init !== 'function') {
                this._notify('Wybrany tryb przechowywania nie jest dostępny.', 'error');
                return false;
            }

            this._bindStatusForwarding(handler);
            const ready = await handler.init({ interactive });

            if (ready) {
                this._setConfiguredMode(normalized);
            } else {
                this.mode = previousMode;
            }

            return ready;
        },

        async init(options) {
            const opts = options || {};
            const requestedMode = opts.mode != null ? opts.mode : this._getConfiguredMode();
            return await this.switchMode(requestedMode, opts);
        },

        getStorageState() {
            const mode = this.getActiveMode();
            const handler = this._getHandler(mode);

            if (handler && typeof handler.getStorageState === 'function') {
                const state = handler.getStorageState() || {};
                return Object.assign({}, state, {
                    storageMode: mode
                });
            }

            return {
                storageMode: mode,
                folderPinned: false,
                rootFolderName: mode === 'gdrive' ? 'Google Drive' : '',
                dataFolderName: ''
            };
        },

        async loadAllPatients() {
            const handler = this._getHandler();
            if (!handler || typeof handler.loadAllPatients !== 'function') return [];
            this._bindStatusForwarding(handler);
            return await handler.loadAllPatients();
        },

        async loadPatient(fileRef) {
            const handler = this._getHandler();
            if (!handler || typeof handler.loadPatient !== 'function') return null;
            this._bindStatusForwarding(handler);
            return await handler.loadPatient(fileRef);
        },

        async savePatient(patient) {
            const handler = this._getHandler();
            if (!handler || typeof handler.savePatient !== 'function') return false;
            this._bindStatusForwarding(handler);
            return await handler.savePatient(patient);
        },

        scheduleAutoSave(patient) {
            const handler = this._getHandler();
            if (handler && typeof handler.scheduleAutoSave === 'function') {
                this._bindStatusForwarding(handler);
                handler.scheduleAutoSave(patient);
                return;
            }

            // Generic fallback
            clearTimeout(this._saveTimeout);
            this._saveTimeout = setTimeout(() => {
                this.savePatient(patient);
            }, 2000);
        },

        async deletePatient(patient) {
            const handler = this._getHandler();
            if (!handler || typeof handler.deletePatient !== 'function') return false;
            this._bindStatusForwarding(handler);
            return await handler.deletePatient(patient);
        },

        async importPatientFromFile() {
            const handler = LocalHandler;
            if (!handler || typeof handler.importPatientFromFile !== 'function') return null;
            this._bindStatusForwarding(handler);
            return await handler.importPatientFromFile();
        }
    };

    Object.defineProperty(StorageProvider, 'directoryHandle', {
        get() {
            const mode = this.getActiveMode();
            const handler = this._getHandler(mode);
            if (!handler) return null;

            if (mode === 'gdrive') {
                return handler.folderId || null;
            }

            return handler.directoryHandle || null;
        }
    });

    globalRef.StorageProvider = StorageProvider;

    // Backward-compatibility bridge: existing modules still reference XlsxHandler.
    globalRef.XlsxHandler = StorageProvider;
})();
