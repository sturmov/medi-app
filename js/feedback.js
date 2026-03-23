// ============================================================================
// feedback.js - Review/Comment mode for UI-level product feedback
// ============================================================================

const Feedback = {
    enabled: false,
    selectedTargetKey: 'app:global',
    targets: new Map(),
    commentsByKey: {},
    meta: {
        createdAt: '',
        lastModifiedAt: ''
    },

    fileHandle: null,
    _saveEditorTimeout: null,
    _saveFileTimeout: null,
    _scanTimeout: null,
    _observer: null,
    _isInjectingAnchors: false,
    _activeHighlightedElement: null,

    _storageKey: 'psychoapp-feedback-v1',
    _dbName: 'psychoapp-feedback-storage',
    _dbStore: 'kv',
    _dbKey: 'feedbackFileHandle',

    _els: null,

    init() {
        this._cacheElements();
        if (!this._els || !this._els.toggleBtn) return;

        this._loadLocalState();
        this._bindUiEvents();
        this._setMode(false, { silentStatus: true });
        this._renderCommentList();
        this._syncEditorFromSelected({ force: true });
        this._updateAnchorIndicators();
        this._startMutationObserver();

        this._restorePersistedFileHandle();
    },

    onViewChanged() {
        if (!this.enabled) return;
        this._scheduleTargetScan();
    },

    // ---------------------------------------------------------------------
    // UI setup
    // ---------------------------------------------------------------------

    _cacheElements() {
        this._els = {
            toggleBtn: document.getElementById('btn-toggle-feedback'),
            panel: document.getElementById('feedback-panel'),
            closeBtn: document.getElementById('feedback-close'),
            status: document.getElementById('feedback-status'),
            targetSummary: document.getElementById('feedback-target-summary'),
            prioritySelect: document.getElementById('feedback-priority'),
            textArea: document.getElementById('feedback-text'),
            clearCurrentBtn: document.getElementById('feedback-clear-current'),
            list: document.getElementById('feedback-list'),
            count: document.getElementById('feedback-count'),
            connectFileBtn: document.getElementById('feedback-connect-file'),
            appCommentBtn: document.getElementById('feedback-app-comment')
        };
    },

    _bindUiEvents() {
        const el = this._els;

        el.toggleBtn.addEventListener('click', () => {
            this.toggleMode();
        });

        if (el.closeBtn) {
            el.closeBtn.addEventListener('click', () => {
                this._setMode(false);
            });
        }

        if (el.appCommentBtn) {
            el.appCommentBtn.addEventListener('click', () => {
                if (!this.enabled) this._setMode(true);
                this.selectTarget('app:global', { focusEditor: true });
            });
        }

        if (el.prioritySelect) {
            el.prioritySelect.addEventListener('change', () => {
                this._saveSelectedCommentFromEditor(true);
            });
        }

        if (el.textArea) {
            el.textArea.addEventListener('input', () => {
                this._queueEditorSave();
            });
        }

        if (el.clearCurrentBtn) {
            el.clearCurrentBtn.addEventListener('click', () => {
                if (el.textArea) el.textArea.value = '';
                this._saveSelectedCommentFromEditor(true);
            });
        }

        if (el.connectFileBtn) {
            el.connectFileBtn.addEventListener('click', async () => {
                await this.connectJsonFile();
            });
        }
    },

    toggleMode() {
        this._setMode(!this.enabled);
    },

    _setMode(nextEnabled, options) {
        const opts = options || {};
        this.enabled = !!nextEnabled;

        document.body.classList.toggle('feedback-mode', this.enabled);

        if (this._els.panel) {
            this._els.panel.classList.toggle('open', this.enabled);
            this._els.panel.setAttribute('aria-hidden', String(!this.enabled));
        }

        if (this._els.toggleBtn) {
            this._els.toggleBtn.classList.toggle('is-active', this.enabled);
            this._els.toggleBtn.textContent = this.enabled ? '💬 Tryb recenzji: ON' : '💬 Tryb recenzji';
            this._els.toggleBtn.title = this.enabled ? 'Wyłącz tryb recenzji' : 'Włącz tryb recenzji';
        }

        if (this.enabled) {
            this._scheduleTargetScan();
            this._setStatus(this.fileHandle
                ? 'Tryb recenzji aktywny. Autozapis lokalny + plik JSON.'
                : 'Tryb recenzji aktywny. Autozapis lokalny aktywny.');

            if (!this.selectedTargetKey) this.selectedTargetKey = 'app:global';
            this._syncEditorFromSelected({ force: true });
            this._updateActiveTargetHighlight();
        } else {
            if (!opts.silentStatus) this._setStatus('Tryb recenzji wyłączony.');
            this._clearButtonSelection();
            this._clearActiveTargetHighlight();
        }
    },

    _setStatus(message, type) {
        const el = this._els && this._els.status;
        if (!el) return;

        el.textContent = message || '';
        el.classList.remove('is-error', 'is-success');
        if (type === 'error') el.classList.add('is-error');
        if (type === 'success') el.classList.add('is-success');
    },

    // ---------------------------------------------------------------------
    // Target discovery + anchor injection
    // ---------------------------------------------------------------------

    _startMutationObserver() {
        if (typeof MutationObserver === 'undefined') return;

        const root = document.getElementById('main-content');
        if (!root) return;

        this._observer = new MutationObserver((mutations) => {
            if (!this.enabled || this._isInjectingAnchors) return;

            let shouldRescan = false;
            for (let i = 0; i < mutations.length; i++) {
                const m = mutations[i];

                if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
                    const targetEl = m.target && m.target.nodeType === Node.ELEMENT_NODE ? m.target : null;
                    if (targetEl && targetEl.classList && targetEl.classList.contains('feedback-anchor-btn')) {
                        continue;
                    }

                    const changedNodes = Array.from(m.addedNodes).concat(Array.from(m.removedNodes));
                    if (changedNodes.length && changedNodes.every((n) =>
                        n && n.nodeType === Node.ELEMENT_NODE
                        && n.classList
                        && n.classList.contains('feedback-anchor-btn'))
                    ) {
                        continue;
                    }

                    shouldRescan = true;
                    break;
                }
                if (m.type === 'attributes') {
                    const targetEl = m.target;
                    if (targetEl && targetEl.classList && targetEl.classList.contains('feedback-anchor-btn')) {
                        continue;
                    }

                    shouldRescan = true;
                    break;
                }
            }

            if (shouldRescan) this._scheduleTargetScan();
        });

        this._observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    },

    _scheduleTargetScan() {
        clearTimeout(this._scanTimeout);
        this._scanTimeout = setTimeout(() => {
            this._scanTargets();
        }, 120);
    },

    _scanTargets() {
        this._isInjectingAnchors = true;
        try {
            this._removeInjectedButtons();
            this.targets.clear();

            this._upsertTarget('app', 'global', {
                targetLabel: 'Cała aplikacja',
                viewContext: 'global',
                sectionContext: ''
            });

            this._scanNavigationTargets();
            this._scanViewTargets();
            this._scanSectionTargets();
            this._scanFieldTargets();

            if (!this.targets.has(this.selectedTargetKey) && this.selectedTargetKey !== 'app:global') {
                this.selectedTargetKey = 'app:global';
            }

            this._syncEditorFromSelected();
            this._renderCommentList();
            this._updateAnchorIndicators();
            this._updateActiveTargetHighlight();
        } finally {
            this._isInjectingAnchors = false;
        }
    },

    _removeInjectedButtons() {
        document.querySelectorAll('.feedback-anchor-btn').forEach((btn) => btn.remove());
    },

    _scanNavigationTargets() {
        document.querySelectorAll('.sidebar__item[data-view]').forEach((item) => {
            const viewId = String(item.dataset.view || '').trim();
            if (!viewId) return;

            const label = this._extractText(item.querySelector('.sidebar__label')) || viewId;
            const target = this._upsertTarget('nav', viewId, {
                targetLabel: label,
                viewContext: viewId,
                sectionContext: '',
                anchorElement: item
            });

            this._injectAnchorButton(item, target.key, 'Komentarz do menu: ' + label);
        });
    },

    _scanViewTargets() {
        document.querySelectorAll('#main-content .view').forEach((view) => {
            const viewId = String(view.id || '').trim();
            if (!viewId) return;

            const header = view.querySelector('.view__header h1') || view.querySelector('h1');
            if (!header) return;

            const label = this._extractText(header) || viewId;
            const target = this._upsertTarget('view', viewId, {
                targetLabel: label,
                viewContext: viewId,
                sectionContext: '',
                anchorElement: header
            });

            this._injectAnchorButton(header, target.key, 'Komentarz do widoku: ' + label);
        });
    },

    _scanSectionTargets() {
        document.querySelectorAll('#main-content .view').forEach((view) => {
            const viewId = String(view.id || '').trim();
            if (!viewId) return;

            const titleCounts = {};
            view.querySelectorAll('.card .card__title').forEach((titleEl) => {
                const titleText = this._extractText(titleEl) || 'Sekcja';
                const slug = this._slugify(titleText);
                titleCounts[slug] = (titleCounts[slug] || 0) + 1;
                const sectionId = viewId + '/' + slug + '-' + titleCounts[slug];

                const target = this._upsertTarget('section', sectionId, {
                    targetLabel: titleText,
                    viewContext: viewId,
                    sectionContext: titleText,
                    anchorElement: titleEl
                });

                this._injectAnchorButton(titleEl, target.key, 'Komentarz do sekcji: ' + titleText);
            });
        });
    },

    _scanFieldTargets() {
        document.querySelectorAll('#main-content label[for]').forEach((labelEl) => {
            const fieldId = String(labelEl.getAttribute('for') || '').trim();
            if (!fieldId) return;

            const input = document.getElementById(fieldId);
            if (!input) return;

            const view = labelEl.closest('.view');
            const viewId = view && view.id ? view.id : '';

            const sectionTitleEl = labelEl.closest('.card')?.querySelector('.card__title');
            const sectionLabel = this._extractText(sectionTitleEl);

            const target = this._upsertTarget('field', fieldId, {
                targetLabel: this._extractText(labelEl) || fieldId,
                viewContext: viewId,
                sectionContext: sectionLabel || '',
                anchorElement: labelEl
            });

            this._injectAnchorButton(labelEl, target.key, 'Komentarz do pola: ' + target.targetLabel);
        });
    },

    _injectAnchorButton(anchorElement, targetKey, ariaLabel) {
        if (!anchorElement || !targetKey) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'feedback-anchor-btn';
        btn.dataset.targetKey = targetKey;
        btn.title = ariaLabel || 'Dodaj komentarz';
        btn.setAttribute('aria-label', ariaLabel || 'Dodaj komentarz');
        btn.textContent = '💬';

        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!this.enabled) this._setMode(true);
            this.selectTarget(targetKey, { focusEditor: true });
        });

        anchorElement.appendChild(btn);
    },

    _upsertTarget(targetType, targetId, data) {
        const key = this._makeKey(targetType, targetId);
        const target = Object.assign({
            key,
            targetType,
            targetId,
            targetLabel: targetId,
            viewContext: '',
            sectionContext: '',
            anchorElement: null
        }, data || {});

        this.targets.set(key, target);
        return target;
    },

    _makeKey(targetType, targetId) {
        return String(targetType || '') + ':' + String(targetId || '');
    },

    // ---------------------------------------------------------------------
    // Selecting targets and editing comments
    // ---------------------------------------------------------------------

    selectTarget(key, options) {
        const opts = options || {};
        if (!key) return;

        if (key !== 'app:global' && !this.targets.has(key)) return;

        this.selectedTargetKey = key;
        this._updateAnchorIndicators();
        this._syncEditorFromSelected({ force: true });
        this._updateActiveTargetHighlight();

        if (opts.focusEditor && this._els && this._els.textArea) {
            this._els.textArea.focus();
            this._els.textArea.setSelectionRange(this._els.textArea.value.length, this._els.textArea.value.length);
        }
    },

    _syncEditorFromSelected(options) {
        const opts = options || {};
        if (!this._els) return;

        const isEditingInTextarea = !!(this._els.textArea && this._els.textArea === document.activeElement);
        const preserveEditorText = isEditingInTextarea && !opts.force;

        const target = this._getSelectedTarget();
        const comment = this.commentsByKey[this.selectedTargetKey] || null;

        if (!target) {
            if (this._els.targetSummary) {
                this._els.targetSummary.classList.remove('is-selected');
                this._els.targetSummary.textContent = 'Wybierz element (ikona 💬), aby dodać komentarz.';
            }
            if (this._els.prioritySelect && !preserveEditorText) this._els.prioritySelect.value = 'suggestion';
            if (this._els.textArea && !preserveEditorText) this._els.textArea.value = '';
            if (this._els.clearCurrentBtn) this._els.clearCurrentBtn.disabled = true;
            return;
        }

        const context = [];
        if (target.viewContext && target.viewContext !== 'global') context.push('widok: ' + target.viewContext);
        if (target.sectionContext) context.push('sekcja: ' + target.sectionContext);

        this._renderTargetSummary(target, context);
        if (this._els.prioritySelect && !preserveEditorText) this._els.prioritySelect.value = (comment && comment.priority) ? comment.priority : 'suggestion';
        if (this._els.textArea && !preserveEditorText) this._els.textArea.value = comment ? String(comment.text || '') : '';
        if (this._els.clearCurrentBtn) this._els.clearCurrentBtn.disabled = !comment;
    },

    _renderTargetSummary(target, context) {
        if (!this._els || !this._els.targetSummary) return;

        const summaryEl = this._els.targetSummary;
        summaryEl.classList.add('is-selected');
        summaryEl.innerHTML = '';

        const caption = document.createElement('div');
        caption.className = 'feedback-target-summary__caption';
        caption.textContent = 'Co komentujesz';

        const main = document.createElement('div');
        main.className = 'feedback-target-summary__name';
        main.textContent = '[' + this._targetTypeLabel(target.targetType) + '] ' + (target.targetLabel || target.targetId);

        summaryEl.appendChild(caption);
        summaryEl.appendChild(main);

        if (Array.isArray(context) && context.length) {
            const details = document.createElement('div');
            details.className = 'feedback-target-summary__context';
            details.textContent = context.join(' · ');
            summaryEl.appendChild(details);
        }
    },

    _queueEditorSave() {
        clearTimeout(this._saveEditorTimeout);
        this._saveEditorTimeout = setTimeout(() => {
            this._saveSelectedCommentFromEditor();
        }, 250);
    },

    _saveSelectedCommentFromEditor(forceImmediate) {
        if (!this.selectedTargetKey) return;

        const target = this._getSelectedTarget();
        if (!target) return;

        const textRaw = this._els && this._els.textArea ? this._els.textArea.value : '';
        const text = String(textRaw || '').trim();
        const priority = this._els && this._els.prioritySelect ? this._els.prioritySelect.value : 'suggestion';

        const existing = this.commentsByKey[this.selectedTargetKey] || null;

        if (!text) {
            if (existing) {
                delete this.commentsByKey[this.selectedTargetKey];
                this.meta.lastModifiedAt = new Date().toISOString();
                this._persistLocalState();
                this._queueFileSave(forceImmediate);
                this._renderCommentList();
                this._updateAnchorIndicators();
                this._syncEditorFromSelected({ force: true });
                this._updateActiveTargetHighlight();
            }
            return;
        }

        const nowIso = new Date().toISOString();
        const comment = {
            key: this.selectedTargetKey,
            id: this.selectedTargetKey,
            targetType: target.targetType,
            targetId: target.targetId,
            targetLabel: target.targetLabel,
            viewContext: target.viewContext || '',
            sectionContext: target.sectionContext || '',
            text,
            priority: priority || 'suggestion',
            createdAt: existing && existing.createdAt ? existing.createdAt : nowIso,
            updatedAt: nowIso
        };

        this.commentsByKey[this.selectedTargetKey] = comment;
        this.meta.lastModifiedAt = nowIso;

        this._persistLocalState();
        this._queueFileSave(forceImmediate);
        this._renderCommentList();
        this._updateAnchorIndicators();
    },

    _getSelectedTarget() {
        if (this.selectedTargetKey === 'app:global') {
            return this.targets.get('app:global') || {
                key: 'app:global',
                targetType: 'app',
                targetId: 'global',
                targetLabel: 'Cała aplikacja',
                viewContext: 'global',
                sectionContext: ''
            };
        }
        return this.targets.get(this.selectedTargetKey) || null;
    },

    // ---------------------------------------------------------------------
    // Comment list
    // ---------------------------------------------------------------------

    _renderCommentList() {
        if (!this._els || !this._els.list) return;

        const comments = this._sortedComments();
        if (this._els.count) this._els.count.textContent = String(comments.length);

        this._els.list.innerHTML = '';

        if (!comments.length) {
            const empty = document.createElement('div');
            empty.className = 'feedback-empty';
            empty.textContent = 'Brak komentarzy. Kliknij ikonę 💬 przy elemencie, aby dodać pierwszą uwagę.';
            this._els.list.appendChild(empty);
            return;
        }

        comments.forEach((comment) => {
            const item = document.createElement('div');
            item.className = 'feedback-item';
            if (comment.key === this.selectedTargetKey) item.classList.add('is-active');

            const header = document.createElement('div');
            header.className = 'feedback-item__header';

            const title = document.createElement('button');
            title.type = 'button';
            title.className = 'feedback-item__title';
            title.textContent = '[' + this._targetTypeLabel(comment.targetType) + '] ' + (comment.targetLabel || comment.targetId);
            title.addEventListener('click', () => {
                if (comment.viewContext && comment.viewContext !== 'global' && typeof App !== 'undefined' && typeof App.showView === 'function') {
                    App.showView(comment.viewContext);
                }
                this.selectTarget(comment.key, { focusEditor: false });
                this._focusTarget(comment.key);
            });

            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'feedback-item__delete';
            del.textContent = 'Usuń';
            del.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                delete this.commentsByKey[comment.key];
                this.meta.lastModifiedAt = new Date().toISOString();
                this._persistLocalState();
                this._queueFileSave(true);
                this._renderCommentList();
                this._updateAnchorIndicators();
                this._syncEditorFromSelected();
            });

            header.appendChild(title);
            header.appendChild(del);

            const meta = document.createElement('div');
            meta.className = 'feedback-item__meta';
            const priorityLabel = this._priorityLabel(comment.priority);
            const updated = comment.updatedAt ? new Date(comment.updatedAt).toLocaleString('pl-PL') : '';
            meta.textContent = priorityLabel + (updated ? (' · ' + updated) : '');

            const body = document.createElement('div');
            body.className = 'feedback-item__text';
            body.textContent = comment.text || '';

            item.appendChild(header);
            item.appendChild(meta);
            item.appendChild(body);

            this._els.list.appendChild(item);
        });
    },

    _sortedComments() {
        return Object.values(this.commentsByKey).sort((a, b) => {
            const ta = Date.parse(a && a.updatedAt ? a.updatedAt : '') || 0;
            const tb = Date.parse(b && b.updatedAt ? b.updatedAt : '') || 0;
            return tb - ta;
        });
    },

    // ---------------------------------------------------------------------
    // Anchor states and navigation helpers
    // ---------------------------------------------------------------------

    _updateAnchorIndicators() {
        const prevInjecting = this._isInjectingAnchors;
        this._isInjectingAnchors = true;
        try {
            document.querySelectorAll('.feedback-anchor-btn').forEach((btn) => {
                const key = btn.dataset.targetKey;
                const hasComment = !!this.commentsByKey[key];
                const isActive = key === this.selectedTargetKey;

                btn.classList.toggle('has-comment', hasComment);
                btn.classList.toggle('is-active', isActive);
                btn.textContent = hasComment ? '💬✓' : '💬';
            });

            if (this._els && this._els.appCommentBtn) {
                const appHasComment = !!this.commentsByKey['app:global'];
                const appIsActive = this.selectedTargetKey === 'app:global';
                this._els.appCommentBtn.classList.toggle('has-comment', appHasComment);
                this._els.appCommentBtn.classList.toggle('is-active', appIsActive);
                this._els.appCommentBtn.textContent = appHasComment ? '💬✓ APP' : '💬 APP';
            }
        } finally {
            this._isInjectingAnchors = prevInjecting;
        }
    },

    _clearButtonSelection() {
        document.querySelectorAll('.feedback-anchor-btn.is-active').forEach((btn) => btn.classList.remove('is-active'));
        if (this._els && this._els.appCommentBtn) this._els.appCommentBtn.classList.remove('is-active');
    },

    _clearActiveTargetHighlight() {
        if (this._activeHighlightedElement) {
            this._activeHighlightedElement.classList.remove('feedback-active-target');
            this._activeHighlightedElement = null;
        }

        document.querySelectorAll('.feedback-active-target').forEach((el) => {
            el.classList.remove('feedback-active-target');
        });
    },

    _resolveTargetElement(target) {
        if (!target) return null;

        if (target.targetType === 'field') {
            return document.querySelector('label[for="' + CSS.escape(target.targetId) + '"]')
                || document.getElementById(target.targetId)
                || target.anchorElement
                || null;
        }
        if (target.targetType === 'nav') {
            return document.querySelector('.sidebar__item[data-view="' + CSS.escape(target.targetId) + '"]')
                || target.anchorElement
                || null;
        }
        if (target.targetType === 'view') {
            return document.querySelector('#' + CSS.escape(target.targetId) + ' .view__header h1')
                || target.anchorElement
                || null;
        }
        if (target.targetType === 'section') {
            return target.anchorElement || null;
        }

        return target.anchorElement || null;
    },

    _updateActiveTargetHighlight() {
        this._clearActiveTargetHighlight();
        if (!this.enabled) return;
        if (this.selectedTargetKey === 'app:global') return;

        const target = this._getSelectedTarget();
        if (!target) return;

        const el = this._resolveTargetElement(target);
        if (!el) return;

        el.classList.add('feedback-active-target');
        this._activeHighlightedElement = el;
    },

    _focusTarget(key) {
        if (!key) return;

        const target = this.targets.get(key);
        if (!target) return;

        const scrollTo = () => {
            const el = this._resolveTargetElement(target);

            if (!el) return;
            try {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('feedback-target-highlight');
                setTimeout(() => el.classList.remove('feedback-target-highlight'), 1400);
            } catch (_) {
                // no-op
            }
        };

        if (target.viewContext && target.viewContext !== 'global' && typeof App !== 'undefined' && typeof App.showView === 'function') {
            App.showView(target.viewContext);
            setTimeout(scrollTo, 80);
            return;
        }

        scrollTo();
    },

    // ---------------------------------------------------------------------
    // Local persistence
    // ---------------------------------------------------------------------

    _loadLocalState() {
        try {
            const raw = localStorage.getItem(this._storageKey);
            if (!raw) {
                this.meta.createdAt = new Date().toISOString();
                return;
            }

            const parsed = JSON.parse(raw);
            this._mergePayload(parsed, { replaceAll: true });
        } catch (_) {
            this.meta.createdAt = new Date().toISOString();
        }
    },

    _persistLocalState() {
        try {
            localStorage.setItem(this._storageKey, JSON.stringify(this._serializeState()));
        } catch (_) {
            // no-op
        }
    },

    _serializeState() {
        if (!this.meta.createdAt) this.meta.createdAt = new Date().toISOString();
        return {
            version: 1,
            meta: {
                createdAt: this.meta.createdAt,
                lastModifiedAt: this.meta.lastModifiedAt || ''
            },
            comments: this._sortedComments().map((c) => ({
                key: c.key,
                id: c.id,
                targetType: c.targetType,
                targetId: c.targetId,
                targetLabel: c.targetLabel,
                viewContext: c.viewContext,
                sectionContext: c.sectionContext,
                text: c.text,
                priority: c.priority,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            }))
        };
    },

    _mergePayload(payload, options) {
        const opts = options || {};
        if (!payload || typeof payload !== 'object') return false;

        const incomingMeta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
        if (opts.replaceAll) {
            this.commentsByKey = {};
        }

        if (!this.meta.createdAt) {
            this.meta.createdAt = incomingMeta.createdAt || new Date().toISOString();
        }
        if (incomingMeta.lastModifiedAt) {
            this.meta.lastModifiedAt = String(incomingMeta.lastModifiedAt);
        }

        const incomingComments = Array.isArray(payload.comments) ? payload.comments : [];
        incomingComments.forEach((rawComment) => {
            if (!rawComment || typeof rawComment !== 'object') return;

            const key = rawComment.key || this._makeKey(rawComment.targetType, rawComment.targetId);
            if (!key || key === ':') return;

            const existing = this.commentsByKey[key];
            const incomingTime = Date.parse(rawComment.updatedAt || rawComment.createdAt || '') || 0;
            const existingTime = existing ? (Date.parse(existing.updatedAt || existing.createdAt || '') || 0) : 0;

            if (!existing || incomingTime >= existingTime || opts.replaceAll) {
                this.commentsByKey[key] = {
                    key,
                    id: rawComment.id || key,
                    targetType: String(rawComment.targetType || '').trim() || key.split(':')[0] || 'field',
                    targetId: String(rawComment.targetId || '').trim() || key.split(':').slice(1).join(':') || '',
                    targetLabel: String(rawComment.targetLabel || rawComment.targetId || '').trim(),
                    viewContext: String(rawComment.viewContext || '').trim(),
                    sectionContext: String(rawComment.sectionContext || '').trim(),
                    text: String(rawComment.text || '').trim(),
                    priority: this._normalizePriority(rawComment.priority),
                    createdAt: rawComment.createdAt || new Date().toISOString(),
                    updatedAt: rawComment.updatedAt || rawComment.createdAt || new Date().toISOString()
                };
            }
        });

        if (!this.meta.createdAt) this.meta.createdAt = new Date().toISOString();
        return true;
    },

    // ---------------------------------------------------------------------
    // JSON file linkage + auto-save
    // ---------------------------------------------------------------------

    async connectJsonFile() {
        if (!('showSaveFilePicker' in window)) {
            this._setStatus('Ta przeglądarka nie wspiera bezpośredniego zapisu do pliku JSON.', 'error');
            return;
        }

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'feedback.json',
                types: [{
                    description: 'JSON',
                    accept: { 'application/json': ['.json'] }
                }]
            });

            const ok = await this._verifyReadWritePermission(handle, true);
            if (!ok) {
                this._setStatus('Brak uprawnień do zapisu wybranego pliku.', 'error');
                return;
            }

            this.fileHandle = handle;
            await this._savePersistedFileHandle(handle);

            // If file already has content, merge it in; then save back latest state.
            try {
                const file = await handle.getFile();
                const txt = await file.text();
                if (txt && txt.trim()) {
                    const parsed = JSON.parse(txt);
                    this._mergePayload(parsed, { replaceAll: false });
                    this._persistLocalState();
                }
            } catch (_) {
                // Ignore parse/read errors from pre-existing file.
            }

            await this._saveToLinkedFile();
            this._renderCommentList();
            this._updateAnchorIndicators();
            this._syncEditorFromSelected();
            this._updateActiveTargetHighlight();

            this._setStatus('Połączono plik JSON. Autozapis pliku aktywny.', 'success');
        } catch (err) {
            if (err && err.name === 'AbortError') {
                this._setStatus('Anulowano wybór pliku JSON.');
                return;
            }
            this._setStatus('Błąd podłączania pliku JSON: ' + (err && err.message ? err.message : String(err)), 'error');
        }
    },

    async importJsonFile() {
        try {
            const file = await this._pickJsonFile();
            if (!file) return;

            const text = await file.text();
            if (!text || !text.trim()) {
                this._setStatus('Wybrany plik JSON jest pusty.', 'error');
                return;
            }

            const parsed = JSON.parse(text);
            const merged = this._mergePayload(parsed, { replaceAll: false });

            if (!merged) {
                this._setStatus('Nie udało się wczytać danych z pliku JSON.', 'error');
                return;
            }

            this.meta.lastModifiedAt = new Date().toISOString();
            this._persistLocalState();
            this._queueFileSave(true);
            this._renderCommentList();
            this._updateAnchorIndicators();
            this._syncEditorFromSelected();
            this._updateActiveTargetHighlight();

            this._setStatus('Zaimportowano komentarze z pliku JSON.', 'success');
        } catch (err) {
            this._setStatus('Błąd importu JSON: ' + (err && err.message ? err.message : String(err)), 'error');
        }
    },

    exportJson() {
        try {
            const payload = this._serializeState();
            const json = JSON.stringify(payload, null, 2);

            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            a.href = url;
            a.download = 'feedback-' + stamp + '.json';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);

            this._setStatus('Pobrano plik JSON z komentarzami.', 'success');
        } catch (err) {
            this._setStatus('Błąd eksportu JSON: ' + (err && err.message ? err.message : String(err)), 'error');
        }
    },

    _queueFileSave(forceImmediate) {
        if (!this.fileHandle) return;

        clearTimeout(this._saveFileTimeout);
        const delay = forceImmediate ? 0 : 500;

        this._saveFileTimeout = setTimeout(async () => {
            await this._saveToLinkedFile();
        }, delay);
    },

    async _saveToLinkedFile() {
        if (!this.fileHandle) return false;

        try {
            const ok = await this._verifyReadWritePermission(this.fileHandle, false);
            if (!ok) {
                this._setStatus('Brak uprawnień do zapisu podłączonego pliku JSON.', 'error');
                return false;
            }

            const writable = await this.fileHandle.createWritable();
            await writable.write(JSON.stringify(this._serializeState(), null, 2));
            await writable.close();

            this._setStatus('Komentarze zapisane do pliku JSON.', 'success');
            return true;
        } catch (err) {
            this._setStatus('Błąd autozapisu JSON: ' + (err && err.message ? err.message : String(err)), 'error');
            return false;
        }
    },

    async _pickJsonFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.onchange = () => {
                const file = input.files && input.files[0] ? input.files[0] : null;
                resolve(file || null);
            };
            input.click();
        });
    },

    // ---------------------------------------------------------------------
    // Prompt generation
    // ---------------------------------------------------------------------

    async copyPromptToClipboard() {
        const prompt = this._buildPromptText();
        if (!prompt.trim()) {
            this._setStatus('Brak komentarzy do skopiowania.', 'error');
            return;
        }

        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(prompt);
            } else {
                this._copyFallback(prompt);
            }
            this._setStatus('Skopiowano gotowy prompt do schowka.', 'success');
        } catch (_) {
            this._copyFallback(prompt);
            this._setStatus('Skopiowano prompt (fallback).', 'success');
        }
    },

    _buildPromptText() {
        const comments = this._sortedComments();
        if (!comments.length) return '';

        const lines = [];
        lines.push('Na podstawie poniższego feedbacku do aplikacji.');
        lines.push('Proszę zaproponować i wdrożyć ulepszenia aplikacji według poniższych uwag:');
        lines.push('');

        const grouped = new Map();
        comments.forEach((c) => {
            const groupKey = c.viewContext && c.viewContext !== 'global' ? c.viewContext : 'global';
            if (!grouped.has(groupKey)) grouped.set(groupKey, []);
            grouped.get(groupKey).push(c);
        });

        grouped.forEach((groupComments, groupKey) => {
            const title = groupKey === 'global' ? 'CAŁA APLIKACJA' : ('WIDOK: ' + groupKey);
            lines.push(title);

            groupComments.forEach((c) => {
                const typeLabel = this._targetTypeLabel(c.targetType).toUpperCase();
                const pri = this._priorityLabel(c.priority);
                const targetLabel = c.targetLabel || c.targetId;
                const section = c.sectionContext ? (' [sekcja: ' + c.sectionContext + ']') : '';
                lines.push('- [' + typeLabel + '] ' + targetLabel + section + ' · ' + pri);
                lines.push('  "' + String(c.text || '').replace(/"/g, '\\"') + '"');
            });

            lines.push('');
        });

        lines.push('W odpowiedzi uwzględnij priorytety i zaproponuj konkretne zmiany w kodzie.');
        return lines.join('\n');
    },

    _copyFallback(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_) {}
        document.body.removeChild(ta);
    },

    // ---------------------------------------------------------------------
    // IndexedDB for persisting JSON file handle
    // ---------------------------------------------------------------------

    async _openDb() {
        return new Promise((resolve, reject) => {
            try {
                const req = indexedDB.open(this._dbName, 1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(this._dbStore)) db.createObjectStore(this._dbStore);
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('Błąd IndexedDB'));
            } catch (err) {
                reject(err);
            }
        });
    },

    async _savePersistedFileHandle(handle) {
        try {
            const db = await this._openDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(this._dbStore, 'readwrite');
                tx.objectStore(this._dbStore).put(handle, this._dbKey);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('Błąd zapisu uchwytu pliku'));
            });
            db.close();
        } catch (_) {
            // no-op
        }
    },

    async _loadPersistedFileHandle() {
        try {
            const db = await this._openDb();
            const handle = await new Promise((resolve, reject) => {
                const tx = db.transaction(this._dbStore, 'readonly');
                const req = tx.objectStore(this._dbStore).get(this._dbKey);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error || new Error('Błąd odczytu uchwytu pliku'));
            });
            db.close();
            return handle;
        } catch (_) {
            return null;
        }
    },

    async _restorePersistedFileHandle() {
        try {
            const handle = await this._loadPersistedFileHandle();
            if (!handle) return;

            const ok = await this._verifyReadWritePermission(handle, false);
            if (!ok) return;

            // Test read access (file may have been removed).
            await handle.getFile();
            this.fileHandle = handle;

            if (!this.enabled) {
                this._setStatus('Wykryto zapisany plik feedback JSON. Po włączeniu trybu recenzji autozapis pliku będzie aktywny.');
            } else {
                this._setStatus('Połączono z poprzednim plikiem feedback JSON.', 'success');
            }
        } catch (_) {
            // Ignore stale handles silently.
        }
    },

    async _verifyReadWritePermission(handle, interactive) {
        if (!handle) return false;
        try {
            const query = await handle.queryPermission({ mode: 'readwrite' });
            if (query === 'granted') return true;
            if (!interactive) return false;
            const req = await handle.requestPermission({ mode: 'readwrite' });
            return req === 'granted';
        } catch (_) {
            return false;
        }
    },

    // ---------------------------------------------------------------------
    // small helpers
    // ---------------------------------------------------------------------

    _extractText(node) {
        if (!node) return '';
        return String(node.textContent || '')
            .replace(/\s*💬✓?\s*/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    _slugify(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'sekcja';
    },

    _targetTypeLabel(type) {
        switch (type) {
            case 'app': return 'Aplikacja';
            case 'nav': return 'Menu';
            case 'view': return 'Widok';
            case 'section': return 'Sekcja';
            case 'field': return 'Pole';
            default: return 'Element';
        }
    },

    _normalizePriority(priority) {
        const p = String(priority || '').trim();
        if (p === 'bug' || p === 'important' || p === 'suggestion') return p;
        return 'suggestion';
    },

    _priorityLabel(priority) {
        const p = this._normalizePriority(priority);
        if (p === 'bug') return '🐛 Błąd';
        if (p === 'important') return '⚠️ Ważne';
        return '💡 Sugestia';
    }
};
