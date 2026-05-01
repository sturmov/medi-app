// ============================================================================
// config.js - Lightweight app state persistence (localStorage)
// ============================================================================

const AppConfig = {
    _key: 'psychoapp-config',

    _defaults() {
        return {
            folderPinned: false,
            rootFolderName: '',
            dataFolderName: '',
            storageMode: 'local',
            gdriveFolderId: '',
            gdriveFolderName: 'PsychoApp',
            googleClientId: '1063412397649-vkie8h726ckit3hcdbhk8ce8bfc8dor5.apps.googleusercontent.com'
        };
    },

    _normalizeStorageMode(mode) {
        return String(mode || '').toLowerCase() === 'gdrive' ? 'gdrive' : 'local';
    },

    load() {
        const defaults = this._defaults();

        try {
            const raw = localStorage.getItem(this._key);
            if (!raw) return defaults;

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;

            const merged = Object.assign({}, defaults, parsed);
            return {
                folderPinned: !!merged.folderPinned,
                rootFolderName: String(merged.rootFolderName || ''),
                dataFolderName: String(merged.dataFolderName || ''),
                storageMode: this._normalizeStorageMode(merged.storageMode),
                gdriveFolderId: String(merged.gdriveFolderId || ''),
                gdriveFolderName: String(merged.gdriveFolderName || 'PsychoApp'),
                googleClientId: String(merged.googleClientId || defaults.googleClientId)
            };
        } catch (_) {
            return defaults;
        }
    },

    save(nextState) {
        const candidate = Object.assign({}, this._defaults(), nextState || {});
        const data = {
            folderPinned: !!candidate.folderPinned,
            rootFolderName: String(candidate.rootFolderName || ''),
            dataFolderName: String(candidate.dataFolderName || ''),
            storageMode: this._normalizeStorageMode(candidate.storageMode),
            gdriveFolderId: String(candidate.gdriveFolderId || ''),
            gdriveFolderName: String(candidate.gdriveFolderName || 'PsychoApp'),
            googleClientId: String(candidate.googleClientId || this._defaults().googleClientId)
        };
        try {
            localStorage.setItem(this._key, JSON.stringify(data));
        } catch (_) {}
        return data;
    },

    _patch(patch) {
        const current = this.load();
        return this.save(Object.assign({}, current, patch || {}));
    },

    isFolderPinned() {
        return !!this.load().folderPinned;
    },

    setFolderState(state) {
        const patch = state && typeof state === 'object' ? state : {};
        const current = this.load();
        this._patch({
            folderPinned: !!patch.folderPinned,
            rootFolderName: patch.rootFolderName != null ? String(patch.rootFolderName) : current.rootFolderName,
            dataFolderName: patch.dataFolderName != null ? String(patch.dataFolderName) : current.dataFolderName,
            storageMode: patch.storageMode != null ? this._normalizeStorageMode(patch.storageMode) : current.storageMode
        });
    },

    getStorageMode() {
        return this._normalizeStorageMode(this.load().storageMode);
    },

    setStorageMode(mode) {
        this._patch({ storageMode: this._normalizeStorageMode(mode) });
    },

    getGoogleDriveConfig() {
        const cfg = this.load();
        return {
            clientId: String(cfg.googleClientId || ''),
            defaultFolderName: String(cfg.gdriveFolderName || 'PsychoApp'),
            scopes: [
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/spreadsheets'
            ]
        };
    },

    getGoogleDriveState() {
        const cfg = this.load();
        return {
            folderId: String(cfg.gdriveFolderId || ''),
            folderName: String(cfg.gdriveFolderName || 'PsychoApp')
        };
    },

    setGoogleDriveState(state) {
        const current = this.load();
        const next = state && typeof state === 'object' ? state : {};
        this._patch({
            gdriveFolderId: next.folderId != null ? String(next.folderId) : current.gdriveFolderId,
            gdriveFolderName: next.folderName != null ? String(next.folderName) : current.gdriveFolderName
        });
    },

    getFolderSummary() {
        const cfg = this.load();

        if (this._normalizeStorageMode(cfg.storageMode) === 'gdrive') {
            const gdName = String(cfg.gdriveFolderName || '').trim();
            return gdName ? ('Google Drive / ' + gdName) : 'Google Drive';
        }

        const root = String(cfg.rootFolderName || '').trim();
        const data = String(cfg.dataFolderName || '').trim();

        if (root && data && root !== data) return root + ' / ' + data;
        if (data) return data;
        if (root) return root;
        return '';
    }
};
