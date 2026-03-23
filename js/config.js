// ============================================================================
// config.js - Lightweight app state persistence (localStorage)
// ============================================================================

const AppConfig = {
    _key: 'psychoapp-config',

    _defaults() {
        return {
            folderPinned: false,
            rootFolderName: '',
            dataFolderName: ''
        };
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
                dataFolderName: String(merged.dataFolderName || '')
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
            dataFolderName: String(candidate.dataFolderName || '')
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
        this._patch({
            folderPinned: !!patch.folderPinned,
            rootFolderName: patch.rootFolderName != null ? String(patch.rootFolderName) : this.load().rootFolderName,
            dataFolderName: patch.dataFolderName != null ? String(patch.dataFolderName) : this.load().dataFolderName
        });
    },

    getFolderSummary() {
        const cfg = this.load();
        const root = String(cfg.rootFolderName || '').trim();
        const data = String(cfg.dataFolderName || '').trim();

        if (root && data && root !== data) return root + ' / ' + data;
        if (data) return data;
        if (root) return root;
        return '';
    }
};
