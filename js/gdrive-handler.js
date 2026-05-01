// =============================================================================
// GDriveHandler - Google Drive + Google Sheets storage provider
// Browser-only OAuth via Google Identity Services (GIS)
// =============================================================================

const GDriveHandler = {
    folderId: '',
    folderName: 'PsychoApp',
    onStatusChange: null,
    _saveTimeout: null,
    _tokenClient: null,
    _tokenRequestPromise: null,
    _accessToken: '',
    _tokenExpiresAt: 0,
    _driveBaseUrl: 'https://www.googleapis.com/drive/v3',
    _sheetsBaseUrl: 'https://sheets.googleapis.com/v4',
    _sheetTitles: ['Dane', 'Wywiad', 'MSE', 'Sesje', 'Testy', 'Plan'],
    _xlsxHelperRef: (typeof XlsxHandler !== 'undefined') ? XlsxHandler : null,

    _notify(message, type = 'info') {
        if (typeof this.onStatusChange === 'function') {
            try { this.onStatusChange(message, type); } catch (_) {}
        }
    },

    _getAppConfig() {
        return typeof AppConfig !== 'undefined' ? AppConfig : null;
    },

    _getConfig() {
        const cfg = this._getAppConfig();
        if (cfg && typeof cfg.getGoogleDriveConfig === 'function') {
            const gcfg = cfg.getGoogleDriveConfig();
            return {
                clientId: String(gcfg.clientId || ''),
                defaultFolderName: String(gcfg.defaultFolderName || 'PsychoApp'),
                scopes: Array.isArray(gcfg.scopes) && gcfg.scopes.length
                    ? gcfg.scopes
                    : [
                        'https://www.googleapis.com/auth/drive.file',
                        'https://www.googleapis.com/auth/spreadsheets'
                    ]
            };
        }

        return {
            clientId: '',
            defaultFolderName: 'PsychoApp',
            scopes: [
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/spreadsheets'
            ]
        };
    },

    _getSavedDriveState() {
        const cfg = this._getAppConfig();
        if (cfg && typeof cfg.getGoogleDriveState === 'function') {
            return cfg.getGoogleDriveState() || { folderId: '', folderName: 'PsychoApp' };
        }
        return { folderId: '', folderName: 'PsychoApp' };
    },

    _persistDriveState() {
        const cfg = this._getAppConfig();
        if (!cfg || typeof cfg.setGoogleDriveState !== 'function') return;
        cfg.setGoogleDriveState({
            folderId: this.folderId || '',
            folderName: this.folderName || 'PsychoApp'
        });
    },

    isSupported() {
        return !!(window.google
            && window.google.accounts
            && window.google.accounts.oauth2
            && typeof window.google.accounts.oauth2.initTokenClient === 'function');
    },

    isFileSystemAccessSupported() {
        // For app compatibility: in Google mode we still want "connect" UI to stay enabled.
        return true;
    },

    async _waitForGIS(timeoutMs) {
        const timeout = typeof timeoutMs === 'number' ? timeoutMs : 12000;
        const start = Date.now();

        while (!this.isSupported()) {
            if (Date.now() - start > timeout) return false;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        return true;
    },

    _isTokenValid() {
        return !!this._accessToken && Date.now() < (this._tokenExpiresAt - 10 * 1000);
    },

    async _ensureTokenClient() {
        const ready = await this._waitForGIS();
        if (!ready) throw new Error('Google Identity Services nie zostało załadowane.');

        if (this._tokenClient) return this._tokenClient;

        const cfg = this._getConfig();
        if (!cfg.clientId) {
            throw new Error('Brak Google OAuth Client ID w konfiguracji aplikacji.');
        }

        this._tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: cfg.clientId,
            scope: cfg.scopes.join(' '),
            callback: () => {}
        });

        return this._tokenClient;
    },

    async _acquireToken(interactive, forceRefresh) {
        const needsRefresh = !!forceRefresh;
        if (!needsRefresh && this._isTokenValid()) {
            return this._accessToken;
        }

        if (this._tokenRequestPromise) {
            return this._tokenRequestPromise;
        }

        this._tokenRequestPromise = (async () => {
            const tokenClient = await this._ensureTokenClient();

            return await new Promise((resolve, reject) => {
                tokenClient.callback = (response) => {
                    if (!response || response.error) {
                        reject(new Error((response && (response.error_description || response.error)) || 'Błąd autoryzacji Google.'));
                        return;
                    }

                    this._accessToken = String(response.access_token || '');
                    const expiresInSec = Number(response.expires_in || 0);
                    this._tokenExpiresAt = Date.now() + Math.max(expiresInSec, 60) * 1000;
                    resolve(this._accessToken);
                };

                try {
                    tokenClient.requestAccessToken({
                        prompt: interactive ? 'consent select_account' : 'none'
                    });
                } catch (err) {
                    reject(err);
                }
            });
        })();

        try {
            return await this._tokenRequestPromise;
        } finally {
            this._tokenRequestPromise = null;
        }
    },

    async _apiRequest(method, url, options) {
        const opts = options || {};
        const interactiveAuth = !!opts.interactiveAuth;
        const retryOnAuthError = opts.retryOnAuthError !== false;
        const expectJson = opts.expectJson !== false;

        const token = await this._acquireToken(interactiveAuth, false);
        if (!token) {
            throw new Error('Brak tokenu dostępu Google.');
        }

        const headers = Object.assign({}, opts.headers || {}, {
            Authorization: 'Bearer ' + token
        });
        if (opts.body != null && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
            method,
            headers,
            body: opts.body != null ? JSON.stringify(opts.body) : undefined
        });

        if (response.status === 401 && retryOnAuthError) {
            this._accessToken = '';
            await this._acquireToken(false, true);
            return this._apiRequest(method, url, Object.assign({}, opts, { retryOnAuthError: false }));
        }

        if (!response.ok) {
            let message = 'Błąd API Google (' + response.status + ')';
            try {
                const errJson = await response.json();
                message = (errJson && errJson.error && errJson.error.message) ? errJson.error.message : message;
            } catch (_) {}
            throw new Error(message);
        }

        if (!expectJson) return null;
        if (response.status === 204) return null;

        const text = await response.text();
        if (!text) return null;

        try {
            return JSON.parse(text);
        } catch (_) {
            return null;
        }
    },

    _escapeDriveQuery(value) {
        return String(value || '').replace(/'/g, "\\'");
    },

    async _getFolderById(folderId) {
        if (!folderId) return null;

        try {
            const file = await this._apiRequest(
                'GET',
                this._driveBaseUrl + '/files/' + encodeURIComponent(folderId) + '?fields=id,name,mimeType,trashed',
                { interactiveAuth: false }
            );

            if (!file) return null;
            if (file.trashed) return null;
            if (file.mimeType !== 'application/vnd.google-apps.folder') return null;

            return { id: String(file.id || ''), name: String(file.name || '') };
        } catch (_) {
            return null;
        }
    },

    async _findFolderByName(folderName) {
        const name = String(folderName || '').trim();
        if (!name) return null;

        const q = [
            "mimeType='application/vnd.google-apps.folder'",
            "name='" + this._escapeDriveQuery(name) + "'",
            'trashed=false'
        ].join(' and ');

        const url = this._driveBaseUrl + '/files?'
            + 'q=' + encodeURIComponent(q)
            + '&fields=' + encodeURIComponent('files(id,name,mimeType),nextPageToken')
            + '&spaces=drive&pageSize=20&orderBy=createdTime desc';

        const data = await this._apiRequest('GET', url, { interactiveAuth: false });
        const files = data && Array.isArray(data.files) ? data.files : [];
        if (!files.length) return null;

        const folder = files[0];
        return {
            id: String(folder.id || ''),
            name: String(folder.name || name)
        };
    },

    async _createFolder(folderName) {
        const name = String(folderName || '').trim() || 'PsychoApp';
        const file = await this._apiRequest(
            'POST',
            this._driveBaseUrl + '/files?fields=id,name',
            {
                interactiveAuth: true,
                body: {
                    name,
                    mimeType: 'application/vnd.google-apps.folder'
                }
            }
        );

        return {
            id: String(file && file.id || ''),
            name: String(file && file.name || name)
        };
    },

    async _ensureAppFolder(interactive) {
        const cfg = this._getConfig();
        const savedState = this._getSavedDriveState();
        const preferredName = String(savedState.folderName || cfg.defaultFolderName || 'PsychoApp');

        if (this.folderId) {
            const byCurrent = await this._getFolderById(this.folderId);
            if (byCurrent) {
                this.folderName = byCurrent.name || preferredName;
                return true;
            }
        }

        if (savedState.folderId) {
            const bySaved = await this._getFolderById(savedState.folderId);
            if (bySaved) {
                this.folderId = bySaved.id;
                this.folderName = bySaved.name || preferredName;
                return true;
            }
        }

        const byName = await this._findFolderByName(preferredName);
        if (byName) {
            this.folderId = byName.id;
            this.folderName = byName.name || preferredName;
            return true;
        }

        if (!interactive) {
            return false;
        }

        const created = await this._createFolder(preferredName);
        this.folderId = created.id;
        this.folderName = created.name || preferredName;
        return !!this.folderId;
    },

    _getHelper() {
        if (this._xlsxHelperRef && this._xlsxHelperRef._daneLabels) return this._xlsxHelperRef;
        if (typeof LocalXlsxHandler !== 'undefined' && LocalXlsxHandler && LocalXlsxHandler._daneLabels) return LocalXlsxHandler;
        if (window && window.LocalXlsxHandler && window.LocalXlsxHandler._daneLabels) return window.LocalXlsxHandler;
        return null;
    },

    _normalizePatientCode(rawCode) {
        const helper = this._getHelper();
        if (helper && typeof helper._normalizePatientCode === 'function') {
            return helper._normalizePatientCode(rawCode);
        }
        return String(rawCode || '').trim().toUpperCase();
    },

    _getSpreadsheetTitle(patient) {
        const helper = this._getHelper();
        if (helper && typeof helper.getFileName === 'function') {
            return helper.getFileName(patient).replace(/\.xlsx$/i, '');
        }

        const code = this._normalizePatientCode(patient && patient.dane && (patient.dane.kodPacjenta || patient.dane.id)) || 'P000';
        const nazwisko = String(patient && patient.dane && patient.dane.nazwisko || 'bez_nazwiska').trim() || 'bez_nazwiska';
        const imie = String(patient && patient.dane && patient.dane.imie || 'bez_imienia').trim() || 'bez_imienia';
        return code + '_' + nazwisko + '_' + imie;
    },

    async _findSpreadsheetByTitle(title) {
        if (!this.folderId || !title) return null;

        const q = [
            "mimeType='application/vnd.google-apps.spreadsheet'",
            "name='" + this._escapeDriveQuery(title) + "'",
            "'" + this._escapeDriveQuery(this.folderId) + "' in parents",
            'trashed=false'
        ].join(' and ');

        const url = this._driveBaseUrl + '/files?'
            + 'q=' + encodeURIComponent(q)
            + '&fields=' + encodeURIComponent('files(id,name),nextPageToken')
            + '&spaces=drive&pageSize=20&orderBy=createdTime desc';

        const data = await this._apiRequest('GET', url, { interactiveAuth: false });
        const files = data && Array.isArray(data.files) ? data.files : [];
        if (!files.length) return null;

        return {
            id: String(files[0].id || ''),
            name: String(files[0].name || title)
        };
    },

    async _createSpreadsheet(title) {
        const file = await this._apiRequest(
            'POST',
            this._driveBaseUrl + '/files?fields=id,name',
            {
                interactiveAuth: true,
                body: {
                    name: title,
                    mimeType: 'application/vnd.google-apps.spreadsheet',
                    parents: [this.folderId]
                }
            }
        );

        return {
            id: String(file && file.id || ''),
            name: String(file && file.name || title)
        };
    },

    async _renameSpreadsheetIfNeeded(spreadsheetId, expectedTitle, currentTitle) {
        if (!spreadsheetId) return;
        const current = String(currentTitle || '').trim();
        const expected = String(expectedTitle || '').trim();
        if (!expected || current === expected) return;

        await this._apiRequest(
            'PATCH',
            this._driveBaseUrl + '/files/' + encodeURIComponent(spreadsheetId) + '?fields=id,name',
            {
                interactiveAuth: false,
                body: { name: expected }
            }
        );
    },

    async _ensureSpreadsheetStructure(spreadsheetId) {
        if (!spreadsheetId) throw new Error('Brak ID arkusza.');

        const metadata = await this._apiRequest(
            'GET',
            this._sheetsBaseUrl + '/spreadsheets/' + encodeURIComponent(spreadsheetId)
                + '?fields=' + encodeURIComponent('sheets.properties(sheetId,title)'),
            { interactiveAuth: false }
        );

        const existingSheets = (metadata && Array.isArray(metadata.sheets)) ? metadata.sheets : [];
        const titleMap = new Map();
        existingSheets.forEach((s) => {
            const p = s && s.properties ? s.properties : {};
            titleMap.set(String(p.title || ''), Number(p.sheetId));
        });

        const requests = [];
        if (!titleMap.has('Dane') && titleMap.has('Sheet1')) {
            requests.push({
                updateSheetProperties: {
                    properties: {
                        sheetId: titleMap.get('Sheet1'),
                        title: 'Dane'
                    },
                    fields: 'title'
                }
            });
            titleMap.delete('Sheet1');
            titleMap.set('Dane', 1);
        }

        this._sheetTitles.forEach((title) => {
            if (!titleMap.has(title)) {
                requests.push({ addSheet: { properties: { title } } });
            }
        });

        if (!requests.length) return;

        await this._apiRequest(
            'POST',
            this._sheetsBaseUrl + '/spreadsheets/' + encodeURIComponent(spreadsheetId) + ':batchUpdate',
            {
                interactiveAuth: false,
                body: { requests }
            }
        );
    },

    async _clearSheet(spreadsheetId, sheetTitle) {
        const range = encodeURIComponent(sheetTitle + '!A1:ZZ10000');
        await this._apiRequest(
            'POST',
            this._sheetsBaseUrl + '/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + range + ':clear',
            {
                interactiveAuth: false,
                body: {}
            }
        );
    },

    _normalizeAoa(aoa) {
        if (!Array.isArray(aoa) || !aoa.length) return [['']];
        return aoa;
    },

    async _writeSheet(spreadsheetId, sheetTitle, aoa) {
        const normalized = this._normalizeAoa(aoa);
        const range = encodeURIComponent(sheetTitle + '!A1');

        await this._apiRequest(
            'PUT',
            this._sheetsBaseUrl + '/spreadsheets/' + encodeURIComponent(spreadsheetId)
                + '/values/' + range + '?valueInputOption=RAW',
            {
                interactiveAuth: false,
                body: {
                    range: sheetTitle + '!A1',
                    majorDimension: 'ROWS',
                    values: normalized
                }
            }
        );
    },

    _buildSheetData(patient) {
        const helper = this._getHelper();
        if (!helper) throw new Error('Brak helpera XLSX do mapowania danych pacjenta.');

        const shaped = (typeof helper._ensurePatientShape === 'function')
            ? helper._ensurePatientShape(patient || {}, null)
            : (patient || {});

        return {
            Dane: helper._kvToAoa(shaped.dane || {}, helper._daneLabels),
            Wywiad: helper._kvToAoa(shaped.wywiad || {}, helper._wywiadLabels),
            MSE: helper._kvToAoa(shaped.mse || {}, helper._mseLabels),
            Sesje: helper._buildSesjeAoa(shaped.sesje || []),
            Testy: helper._tableToAoa(shaped.testy || [], helper._testHeaders),
            Plan: helper._buildPlanAoa(shaped.plan || {})
        };
    },

    _extractSheetTitleFromRange(rangeValue) {
        const raw = String(rangeValue || '');
        const beforeBang = raw.split('!')[0] || '';
        return beforeBang.replace(/^'/, '').replace(/'$/, '');
    },

    _aoaToSheet(aoa) {
        const safe = Array.isArray(aoa) && aoa.length ? aoa : [['']];
        return XLSX.utils.aoa_to_sheet(safe);
    },

    async init(options) {
        const opts = options || {};
        const interactive = opts.interactive !== false;

        try {
            const ready = await this._waitForGIS();
            if (!ready) {
                this._notify('Nie udało się załadować Google Identity Services.', 'error');
                return false;
            }

            await this._acquireToken(interactive, false);
            const folderOk = await this._ensureAppFolder(interactive);
            if (!folderOk) {
                this._notify('Nie znaleziono folderu Google Drive dla aplikacji. Kliknij, aby połączyć ręcznie.', 'warning');
                return false;
            }

            this._persistDriveState();
            this._notify('Połączono z Google Drive: ' + this.folderName, 'success');
            return true;
        } catch (err) {
            const message = err && err.message ? err.message : String(err);
            if (String(message).toLowerCase().indexOf('popup_closed') >= 0) {
                this._notify('Anulowano logowanie do Google.', 'warning');
            } else {
                this._notify('Błąd połączenia z Google Drive: ' + message, 'error');
            }
            return false;
        }
    },

    getStorageState() {
        return {
            storageMode: 'gdrive',
            folderPinned: !!this.folderId,
            rootFolderName: 'Google Drive',
            dataFolderName: this.folderName || 'PsychoApp',
            gdriveFolderId: this.folderId || '',
            gdriveFolderName: this.folderName || 'PsychoApp'
        };
    },

    async savePatient(patient) {
        try {
            if (!patient) throw new Error('Brak danych pacjenta do zapisu.');

            if (!this.folderId) {
                const ready = await this.init({ interactive: false });
                if (!ready) {
                    this._notify('Brak połączenia z Google Drive. Połącz konto, aby zapisać dane.', 'warning');
                    return false;
                }
            }

            await this._acquireToken(false, false);
            this._notify('Zapisywanie pacjenta w Google Drive...', 'info');

            const title = this._getSpreadsheetTitle(patient);
            let spreadsheetId = String(patient._gdriveSpreadsheetId || '').trim();
            let spreadsheetName = String(patient._gdriveFileName || '').trim();

            if (!spreadsheetId) {
                const existing = await this._findSpreadsheetByTitle(title);
                if (existing && existing.id) {
                    spreadsheetId = existing.id;
                    spreadsheetName = existing.name || title;
                }
            }

            if (!spreadsheetId) {
                const created = await this._createSpreadsheet(title);
                spreadsheetId = created.id;
                spreadsheetName = created.name || title;
            }

            await this._renameSpreadsheetIfNeeded(spreadsheetId, title, spreadsheetName);
            await this._ensureSpreadsheetStructure(spreadsheetId);

            const sheets = this._buildSheetData(patient);
            for (let i = 0; i < this._sheetTitles.length; i++) {
                const titleKey = this._sheetTitles[i];
                await this._clearSheet(spreadsheetId, titleKey);
                await this._writeSheet(spreadsheetId, titleKey, sheets[titleKey]);
            }

            patient._gdriveSpreadsheetId = spreadsheetId;
            patient._gdriveFileName = title;
            patient._fileName = title + '.gsheet';

            this._notify('Zapisano w Google Drive: ' + title, 'success');
            return true;
        } catch (err) {
            this._notify('Błąd zapisu Google Drive: ' + (err && err.message ? err.message : String(err)), 'error');
            console.error('GDriveHandler.savePatient error:', err);
            return false;
        }
    },

    async loadPatient(fileRef) {
        try {
            const helper = this._getHelper();
            if (!helper) throw new Error('Brak helpera mapowania danych.');

            const spreadsheetId = typeof fileRef === 'string'
                ? fileRef
                : String(fileRef && fileRef.id || '');

            if (!spreadsheetId) {
                throw new Error('Brak ID arkusza Google do wczytania.');
            }

            const spreadsheetName = typeof fileRef === 'string'
                ? ''
                : String(fileRef && fileRef.name || '');

            const ranges = this._sheetTitles.map((title) => 'ranges=' + encodeURIComponent(title + '!A1:ZZ10000')).join('&');
            const url = this._sheetsBaseUrl + '/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values:batchGet?' + ranges;
            const data = await this._apiRequest('GET', url, { interactiveAuth: false });

            const bySheet = {};
            const rangesData = data && Array.isArray(data.valueRanges) ? data.valueRanges : [];
            rangesData.forEach((item) => {
                const title = this._extractSheetTitleFromRange(item && item.range);
                bySheet[title] = Array.isArray(item && item.values) ? item.values : [];
            });

            let patient = {
                dane: {},
                wywiad: {},
                mse: {},
                sesje: [],
                testy: [],
                plan: {}
            };

            if (Array.isArray(bySheet.Dane) && bySheet.Dane.length) {
                patient.dane = helper._aoaToKv(this._aoaToSheet(bySheet.Dane), helper._daneLabels, helper._daneLegacyLabelAliases);
            }
            if (Array.isArray(bySheet.Wywiad) && bySheet.Wywiad.length) {
                patient.wywiad = helper._aoaToKv(this._aoaToSheet(bySheet.Wywiad), helper._wywiadLabels, helper._wywiadLegacyLabelAliases);
            }
            if (Array.isArray(bySheet.MSE) && bySheet.MSE.length) {
                patient.mse = helper._aoaToKv(this._aoaToSheet(bySheet.MSE), helper._mseLabels, helper._mseLegacyLabelAliases);
            }
            if (Array.isArray(bySheet.Sesje) && bySheet.Sesje.length) {
                patient.sesje = helper._parseSesjeSheet(this._aoaToSheet(bySheet.Sesje));
            }
            if (Array.isArray(bySheet.Testy) && bySheet.Testy.length) {
                patient.testy = helper._parseTestySheet(this._aoaToSheet(bySheet.Testy));
            }
            if (Array.isArray(bySheet.Plan) && bySheet.Plan.length) {
                patient.plan = helper._parsePlanSheet(this._aoaToSheet(bySheet.Plan));
            }

            patient = helper._ensurePatientShape(patient, null);
            patient._gdriveSpreadsheetId = spreadsheetId;
            patient._gdriveFileName = spreadsheetName || this._getSpreadsheetTitle(patient);
            patient._fileName = patient._gdriveFileName + '.gsheet';

            return patient;
        } catch (err) {
            this._notify('Błąd wczytywania pacjenta z Google Drive: ' + (err && err.message ? err.message : String(err)), 'error');
            console.error('GDriveHandler.loadPatient error:', err);
            return null;
        }
    },

    async loadAllPatients() {
        try {
            if (!this.folderId) {
                const ready = await this.init({ interactive: false });
                if (!ready) {
                    this._notify('Brak połączenia z Google Drive.', 'warning');
                    return [];
                }
            }

            this._notify('Wczytywanie pacjentów z Google Drive...', 'info');

            const q = [
                "mimeType='application/vnd.google-apps.spreadsheet'",
                "'" + this._escapeDriveQuery(this.folderId) + "' in parents",
                'trashed=false'
            ].join(' and ');

            const url = this._driveBaseUrl + '/files?'
                + 'q=' + encodeURIComponent(q)
                + '&fields=' + encodeURIComponent('files(id,name,createdTime),nextPageToken')
                + '&spaces=drive&pageSize=200&orderBy=name_natural';

            const list = await this._apiRequest('GET', url, { interactiveAuth: false });
            const files = list && Array.isArray(list.files) ? list.files : [];

            const patients = [];
            let errors = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    const patient = await this.loadPatient(file);
                    if (patient) patients.push(patient);
                } catch (err) {
                    errors++;
                    console.warn('GDrive load file error', file, err);
                }
            }

            const helper = this._getHelper();
            if (helper && typeof helper._normalizePatientCode === 'function') {
                patients.sort((a, b) => {
                    const ac = helper._normalizePatientCode(a && a.dane && (a.dane.kodPacjenta || a.dane.id));
                    const bc = helper._normalizePatientCode(b && b.dane && (b.dane.kodPacjenta || b.dane.id));
                    return ac.localeCompare(bc, 'pl');
                });
            }

            const message = 'Wczytano ' + patients.length + ' pacjent' + (patients.length === 1 ? 'a' : 'ów') + (errors ? (' (błędy: ' + errors + ')') : '');
            this._notify(message, errors ? 'warning' : 'success');
            return patients;
        } catch (err) {
            this._notify('Błąd odczytu Google Drive: ' + (err && err.message ? err.message : String(err)), 'error');
            console.error('GDriveHandler.loadAllPatients error:', err);
            return [];
        }
    },

    scheduleAutoSave(patient) {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => {
            this.savePatient(patient);
        }, 2000);
    },

    async deletePatient(patient) {
        try {
            let spreadsheetId = String(patient && patient._gdriveSpreadsheetId || '').trim();
            if (!spreadsheetId) {
                const title = this._getSpreadsheetTitle(patient);
                const found = await this._findSpreadsheetByTitle(title);
                spreadsheetId = found && found.id ? String(found.id) : '';
            }

            if (!spreadsheetId) {
                this._notify('Nie znaleziono arkusza pacjenta w Google Drive.', 'warning');
                return false;
            }

            await this._apiRequest(
                'DELETE',
                this._driveBaseUrl + '/files/' + encodeURIComponent(spreadsheetId),
                { interactiveAuth: false, expectJson: false }
            );

            this._notify('Usunięto arkusz pacjenta z Google Drive.', 'success');
            return true;
        } catch (err) {
            this._notify('Błąd usuwania pacjenta z Google Drive: ' + (err && err.message ? err.message : String(err)), 'error');
            console.error('GDriveHandler.deletePatient error:', err);
            return false;
        }
    },

    async importPatientFromFile() {
        const helper = this._getHelper();
        if (helper && typeof helper.importPatientFromFile === 'function') {
            return helper.importPatientFromFile();
        }
        return null;
    }
};
