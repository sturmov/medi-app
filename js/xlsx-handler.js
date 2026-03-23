// =============================================================================
// XlsxHandler - File I/O module for patient data (.xlsx)
// Uses xlsx-js-style (global XLSX object) and File System Access API
// =============================================================================

const XlsxHandler = {
    rootDirectoryHandle: null,
    directoryHandle: null, // active data folder selected by the user
    onStatusChange: null,
    _saveTimeout: null,
    _dbName: 'psychoapp-storage',
    _dbStore: 'kv',
    _dbKey: 'rootDirectoryHandle',

    _notify(message, type = 'info') {
        if (typeof this.onStatusChange === 'function') {
            try { this.onStatusChange(message, type); } catch (_) {}
        }
    },

    isFileSystemAccessSupported() {
        return 'showDirectoryPicker' in window;
    },

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

    async _savePersistedRootHandle(handle) {
        try {
            const db = await this._openDb();
            await new Promise((resolve, reject) => {
                const tx = db.transaction(this._dbStore, 'readwrite');
                tx.objectStore(this._dbStore).put(handle, this._dbKey);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('Błąd zapisu uchwytu'));
            });
            db.close();
        } catch (err) {
            console.warn('Nie udało się zapisać uchwytu folderu:', err);
        }
    },

    async _loadPersistedRootHandle() {
        try {
            const db = await this._openDb();
            const handle = await new Promise((resolve, reject) => {
                const tx = db.transaction(this._dbStore, 'readonly');
                const req = tx.objectStore(this._dbStore).get(this._dbKey);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error || new Error('Błąd odczytu uchwytu'));
            });
            db.close();
            return handle;
        } catch (_) {
            return null;
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

    async _verifyDirectoryExists(handle) {
        if (!handle || typeof handle.values !== 'function') return false;
        try {
            // Force real filesystem access. If folder was removed/moved,
            // this should throw (e.g. NotFoundError).
            const iterator = handle.values();
            await iterator.next();
            return true;
        } catch (_) {
            return false;
        }
    },

    async _resolvePatientsDirectory(handle, allowCreate) {
        if (!handle) return null;

        const lowerName = String(handle.name || '').toLowerCase();
        if (lowerName === 'pacjenci' || lowerName === 'patients') return handle;

        // 1) Prefer existing Polish folder name.
        try {
            return await handle.getDirectoryHandle('pacjenci', { create: false });
        } catch (_) {
            // 2) Legacy fallback for existing data folders.
            try {
                return await handle.getDirectoryHandle('patients', { create: false });
            } catch (_) {
                // 3) Create Polish folder only if requested.
                if (!allowCreate) return null;
                try {
                    return await handle.getDirectoryHandle('pacjenci', { create: true });
                } catch (_) {
                    return null;
                }
            }
        }
    },

    _getPersistedDataFolderName() {
        try {
            const raw = localStorage.getItem('psychoapp-config');
            if (!raw) return '';
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return '';
            return String(parsed.dataFolderName || '').trim();
        } catch (_) {
            return '';
        }
    },

    async _resolvePersistedDataDirectory(handle) {
        if (!handle) return null;

        const legacySubfolder = await this._resolvePatientsDirectory(handle, false);
        if (legacySubfolder) {
            return {
                root: handle,
                data: legacySubfolder
            };
        }

        // New behavior: user can pin any folder name as the data folder directly.
        // To avoid accidental false-positive reconnects for old project roots,
        // accept the persisted handle itself only when it matches the last saved
        // data-folder name from config.
        const expectedDataFolderName = this._getPersistedDataFolderName();
        const persistedName = String(handle.name || '').trim();

        if (expectedDataFolderName && persistedName && expectedDataFolderName.toLowerCase() === persistedName.toLowerCase()) {
            return {
                root: handle,
                data: handle
            };
        }

        return null;
    },

    async init(options) {
        const opts = options || {};
        const interactive = opts.interactive !== false;

        try {
            if (!this.isFileSystemAccessSupported()) {
                this._notify('Przeglądarka nie wspiera File System Access API. Dostępny będzie tylko eksport pliku.', 'warning');
                return false;
            }

            const persistedHandle = await this._loadPersistedRootHandle();
            if (persistedHandle) {
                const ok = await this._verifyReadWritePermission(persistedHandle, interactive);
                if (ok) {
                    const persistedData = await this._resolvePersistedDataDirectory(persistedHandle);
                    const exists = persistedData && persistedData.data
                        ? await this._verifyDirectoryExists(persistedData.data)
                        : false;

                    if (persistedData && persistedData.data && exists) {
                        this.rootDirectoryHandle = persistedData.root;
                        this.directoryHandle = persistedData.data;
                        this._notify('Połączono z zapamiętanym folderem pacjentów: ' + this.directoryHandle.name, 'success');
                        return true;
                    }
                }
            }

            if (!interactive) return false;

            this._notify('Wybierz folder z danymi pacjentów.', 'info');
            const picked = await window.showDirectoryPicker({ mode: 'readwrite' });

            const permissionOk = await this._verifyReadWritePermission(picked, true);
            if (!permissionOk) {
                this._notify('Brak uprawnień do zapisu w wybranym folderze.', 'error');
                return false;
            }

            this.rootDirectoryHandle = picked;
            this.directoryHandle = picked;

            await this._savePersistedRootHandle(picked);

            this._notify('Aktywny folder pacjentów: ' + this.directoryHandle.name, 'success');
            return true;
        } catch (err) {
            if (err && err.name === 'AbortError') {
                this._notify('Anulowano wybór folderu.', 'warning');
            } else {
                this._notify('Błąd inicjalizacji folderu: ' + (err && err.message ? err.message : String(err)), 'error');
            }
            return false;
        }
    },

    getStorageState() {
        return {
            folderPinned: !!this.directoryHandle,
            rootFolderName: this.rootDirectoryHandle && this.rootDirectoryHandle.name ? this.rootDirectoryHandle.name : '',
            dataFolderName: this.directoryHandle && this.directoryHandle.name ? this.directoryHandle.name : ''
        };
    },

    _sanitizeFilePart(value) {
        return String(value || '')
            .trim()
            .replace(/[\\/:*?"<>|]+/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
    },

    _normalizePatientCode(rawCode) {
        return String(rawCode || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/[^A-Z0-9_-]/g, '');
    },

    getFileName(patient) {
        const code = this._normalizePatientCode(patient && patient.dane && (patient.dane.kodPacjenta || patient.dane.id)) || 'P000';
        const nazwisko = this._sanitizeFilePart(patient && patient.dane && patient.dane.nazwisko) || 'bez_nazwiska';
        const imie = this._sanitizeFilePart(patient && patient.dane && patient.dane.imie) || 'bez_imienia';
        return code + '_' + nazwisko + '_' + imie + '.xlsx';
    },

    // =========================================================================
    //  POLISH LABEL MAPS
    // =========================================================================

    _daneLabels: {
        kodPacjenta: 'Kod pacjenta',
        id: 'ID pacjenta',
        imie: 'Imię',
        nazwisko: 'Nazwisko',
        pesel: 'PESEL',
        dataUrodzenia: 'Data urodzenia',
        plec: 'Płeć',
        telefon: 'Telefon',
        email: 'E-mail',
        adres: 'Adres',
        kontaktNaglyImie: 'Kontakt alarmowy - imię i nazwisko',
        kontaktNaglyTelefon: 'Kontakt alarmowy - telefon',
        kontaktNaglyRelacja: 'Kontakt alarmowy - relacja',
        matkaTelefon: 'Matka/opiekunka - telefon',
        matkaEmail: 'Matka/opiekunka - e-mail',
        ojciecTelefon: 'Ojciec/opiekun - telefon',
        ojciecEmail: 'Ojciec/opiekun - e-mail',
        ograniczonePrawa: 'Ograniczone prawa rodzicielskie',
        ograniczonePrawaSzczegoly: 'Ograniczone prawa - szczegóły',
        zgodaRodo: 'Zgoda RODO',
        zgodaRodoData: 'Zgoda RODO - data',
        zgodaLeczenie: 'Zgoda na leczenie',
        zgodaLeczenieData: 'Zgoda na leczenie - data',
        zgodaOpiekuna: 'Zgoda opiekuna',
        zgodaOpiekunaData: 'Zgoda opiekuna - data',
        zrodloSkierowania: 'Źródło skierowania'
    },

    _daneLegacyLabelAliases: {
        'Kod pacjenta': 'kodPacjenta',
        'ID pacjenta': 'id'
    },

    _wywiadLabels: {
        dataWizyty: 'Data wizyty',
        rodzajWizyty: 'Rodzaj wizyty',
        osobyObecne: 'Osoby obecne',
        powodZgloszenia: 'Powód zgłoszenia',
        przemocStatus: 'Doświadczenie przemocy - status',
        przemocKomentarz: 'Doświadczenie przemocy - komentarz',
        przemocFizyczna: 'Przemoc fizyczna',
        przemocPsychiczna: 'Przemoc psychiczna',
        przemocSeksualna: 'Przemoc seksualna',
        przemocZaniedbanie: 'Zaniedbanie',
        przemocEkonomiczna: 'Przemoc ekonomiczna',
        aktualnyProblem: 'Aktualny problem',
        sytuacjaRodzinna: 'Sytuacja rodzinna',
        szkolaPraca: 'Szkoła / praca',
        relacjeRowiesnicze: 'Relacje rówieśnicze',
        stanCywilny: 'Stan cywilny',
        wydarzeniaTraumatyczne: 'Wydarzenia traumatyczne',
        czasWolny: 'Czas wolny',
        apetytStatus: 'Apetyt - status',
        apetyt: 'Apetyt',
        senStatus: 'Sen - status',
        senJakosc: 'Sen - jakość',
        sen: 'Sen',
        senCzasZasypiania: 'Sen - czas zasypiania',
        senBudzenieNocne: 'Sen - budzenie nocne',
        senKoszmary: 'Sen - koszmary',
        senHipersomnia: 'Sen - hipersomnia',
        aktywnoscFizyczna: 'Aktywność fizyczna',
        aktywnoscCzestotliwosc: 'Aktywność - częstotliwość',
        historiaLeczenia: 'Historia leczenia',
        farmakoterapiaOgolna: 'Ogólna farmakoterapia',
        psychotropySubstancje: 'Leki psychotropowe / substancje',
        nikotyna: 'Nikotyna',
        nikotynaFreq: 'Nikotyna - częstotliwość',
        nikotynaIlosc: 'Nikotyna - ilość',
        kofeina: 'Kofeina',
        kofeinaFreq: 'Kofeina - częstotliwość',
        kofeinaIlosc: 'Kofeina - ilość',
        alkohol: 'Alkohol',
        alkoholFreq: 'Alkohol - częstotliwość',
        alkoholIlosc: 'Alkohol - ilość',
        marihuana: 'Marihuana',
        marihuanaFreq: 'Marihuana - częstotliwość',
        marihuanaIlosc: 'Marihuana - ilość',
        halucynogeny: 'Halucynogeny',
        halucynogenyFreq: 'Halucynogeny - częstotliwość',
        halucynogenyIlosc: 'Halucynogeny - ilość',
        opioidy: 'Opioidy',
        opioidyFreq: 'Opioidy - częstotliwość',
        opioidyIlosc: 'Opioidy - ilość',
        lekiBarbiturany: 'Leki (barbiturany)',
        lekiBarbituranyFreq: 'Leki (barbiturany) - częstotliwość',
        lekiBarbituranyIlosc: 'Leki (barbiturany) - ilość',
        srodkiWziewne: 'Środki wziewne',
        srodkiWziewneFreq: 'Środki wziewne - częstotliwość',
        srodkiWziewneIlosc: 'Środki wziewne - ilość',
        dozylne: 'Dożylne',
        dozylneFreq: 'Dożylne - częstotliwość',
        dozylneIlosc: 'Dożylne - ilość',
        inneLeki: 'Inne leki',
        inneLekiFreq: 'Inne leki - częstotliwość',
        inneLekiIlosc: 'Inne leki - ilość',
        wzrost: 'Wzrost (cm)',
        masaCiala: 'Masa ciała (kg)',
        bmi: 'BMI',
        najnizszaMasa: 'Najniższa masa ciała',
        najwyzszaMasa: 'Najwyższa masa ciała',
        hipotezaDiagnostyczna: 'Hipoteza diagnostyczna',
        czynnikiPodtrzymujace: 'Czynniki podtrzymujące',
        czynnikiRyzyka: 'Czynniki ryzyka',
        czynnikiOchronne: 'Czynniki ochronne',
        motywacjaDoLeczenia: 'Motywacja do leczenia',
        postawaRodzicow: 'Postawa rodziców',
        rozpoznanie: 'Rozpoznanie',
        planLeczenia: 'Plan leczenia',
        konsultacjaSpecjalista: 'Konsultacja specjalisty',
        wizytaKontrolna: 'Wizyta kontrolna'
    },

    _wywiadLegacyLabelAliases: {
        'Nikotyna - czestotliwosc': 'nikotynaFreq',
        'Kofeina - czestotliwosc': 'kofeinaFreq',
        'Alkohol - czestotliwosc': 'alkoholFreq',
        'Marihuana - czestotliwosc': 'marihuanaFreq',
        'Halucynogeny - czestotliwosc': 'halucynogenyFreq',
        'Opioidy - czestotliwosc': 'opioidyFreq',
        'Leki - czestotliwosc': 'lekiBarbituranyFreq',
        'Leki - ilosc': 'lekiBarbituranyIlosc',
        'Leki (naduzycie)': 'lekiBarbiturany',
        'Srodki wziewne - czestotliwosc': 'srodkiWziewneFreq',
        'Srodki wziewne - ilosc': 'srodkiWziewneIlosc',
        'Dozylne - czestotliwosc': 'dozylneFreq',
        'Dozylne - ilosc': 'dozylneIlosc',
        'Inne leki - czestotliwosc': 'inneLekiFreq',
        'Inne leki - ilosc': 'inneLekiIlosc',
        'Doswiadczenie przemocy - status': 'przemocStatus',
        'Doswiadczenie przemocy - komentarz': 'przemocKomentarz',
        'Apetyt - status': 'apetytStatus',
        'Sen - status': 'senStatus',
        'Sen - jakosc': 'senJakosc',
        'Farmakoterapia': 'farmakoterapiaOgolna',
        'Ogolna farmakoterapia': 'farmakoterapiaOgolna',
        'Leki psychotropowe i substancje': 'psychotropySubstancje'
    },

    _mseLabels: {
        mseData: 'Data badania',
        pielegnacja: 'Pielęgnacja / wygląd',
        kontaktWzrokowy: 'Kontakt wzrokowy',
        aktywnoscMotoryczna: 'Aktywność motoryczna',
        mowaTempo: 'Mowa - tempo',
        mowaGlosnosc: 'Mowa - głośność',
        mowaPlynnosc: 'Mowa - płynność',
        mowaIntonacja: 'Mowa - intonacja',
        mowaSpojnosc: 'Mowa - spójność',
        stylInterakcyjny: 'Styl interakcyjny',
        orientacjaCzas: 'Orientacja - czas',
        orientacjaMiejsce: 'Orientacja - miejsce',
        orientacjaOsoba: 'Orientacja - osoba',
        orientacjaSytuacja: 'Orientacja - sytuacja',
        funkcjonowanieIntelektualne: 'Funkcjonowanie intelektualne',
        pamiec: 'Pamięć',
        zasobWiedzy: 'Zasób wiedzy',
        koncentracja: 'Koncentracja',
        nastrojSubiektywny: 'Nastrój subiektywny',
        nastrojSkala: 'Nastrój - skala',
        afektZgodnosc: 'Afekt - zgodność',
        afektReaktywnosc: 'Afekt - reaktywność',
        afektZakres: 'Afekt - zakres',
        zaburzeniaPercepcyjne: 'Zaburzenia percepcyjne',
        halucynacje: 'Halucynacje',
        urojenia: 'Urojenia',
        omamy: 'Omamy',
        dysocjacja: 'Dysocjacja',
        zaburzeniaProcesMyslowego: 'Zaburzenia procesu myślowego',
        skojarzenia: 'Skojarzenia',
        osady: 'Osądy',
        wglad: 'Wgląd',
        samoocena: 'Samoocena',
        mysliSamobojczeAktualne: 'Myśli samobójcze - aktualne',
        mysliSamobojczePrzeszle: 'Myśli samobójcze - przeszłe',
        mysliSamobojczePrzeszleOpis: 'Myśli samobójcze - przeszłe opis',
        planSuicydalny: 'Plan suicydalny',
        intencjaSuicydalna: 'Intencja suicydalna',
        dostepDoSrodkow: 'Dostęp do środków',
        dostepDoSrodkowOpis: 'Dostęp do środków - opis',
        czynnikiOchronneSuicyd: 'Czynniki ochronne (suicyd)',
        samouszkodzeniaHistoria: 'Samouszkodzenia - historia',
        samouszkodzeniaAktualne: 'Samouszkodzenia - aktualne',
        ryzykoAgresji: 'Ryzyko agresji',
        ocenaRyzykaSuicyd: 'Ocena ryzyka suicydalnego'
    },

    _mseLegacyLabelAliases: {
        dataBadania: 'mseData',
        'Data badania': 'mseData'
    },

    _sesjaHeaders: {
        dataSesji: 'Data sesji',
        nrSesji: 'Nr sesji',
        typSesji: 'Typ sesji',
        terapeuta: 'Terapeuta',
        modalnosc: 'Modalność',
        czasMin: 'Czas (min)',
        opisKlienta: 'Opis klienta (S)',
        ocenaRyzykaS: 'Ocena ryzyka S',
        obserwacjeTerapeuty: 'Obserwacje terapeuty (O)',
        wynikiTestow: 'Wyniki testów',
        komunikacjaNiewerbalna: 'Komunikacja niewerbalna',
        postepTerapii: 'Postęp terapii (A)',
        aktualizacjaDiagnozy: 'Aktualizacja diagnozy',
        odpowiedzInterwencje: 'Odpowiedź na interwencje',
        interwencjeZastosowane: 'Interwencje zastosowane (P)',
        zadanieDomowe: 'Zadanie domowe',
        planNastepnaSesja: 'Plan następna sesja',
        wizytaKontrolnaData: 'Wizyta kontrolna - data',
        potrzebaKonsultacji: 'Potrzeba konsultacji',
        zmianaFarmakoterapii: 'Zmiana farmakoterapii',
        podsumowanieAI: 'Podsumowanie AI'
    },

    _testHeaders: {
        typ: 'Typ testu',
        data: 'Data',
        odpowiedzi: 'Odpowiedzi',
        wynik: 'Wynik',
        interpretacja: 'Interpretacja'
    },

    _planLabels: {
        celeDlugoterminowe: 'Cele długoterminowe',
        podejscie: 'Podejście terapeutyczne',
        podejscieInne: 'Podejście - inne',
        metody: 'Metody',
        przewidywanyCzas: 'Przewidywany czas',
        czestotliwoscSesji: 'Częstotliwość sesji',
        kryteriaZakonczenia: 'Kryteria zakończenia'
    },

    _planCelHeaders: {
        cel: 'Cel',
        mierzalnosc: 'Mierzalność',
        terminRealizacji: 'Termin realizacji',
        status: 'Status'
    },

    _planEwaluacjaHeaders: {
        dataEwaluacji: 'Data ewaluacji',
        notatka: 'Notatka',
        postep: 'Postęp'
    },

    // =========================================================================
    //  STYLES
    // =========================================================================

    _styles: {
        header: {
            font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: '1F4E78' } },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: {
                top: { style: 'thin', color: { rgb: '7F7F7F' } },
                bottom: { style: 'thin', color: { rgb: '7F7F7F' } },
                left: { style: 'thin', color: { rgb: '7F7F7F' } },
                right: { style: 'thin', color: { rgb: '7F7F7F' } }
            }
        },
        section: {
            font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: '2E75B6' } },
            alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
            border: {
                top: { style: 'thin', color: { rgb: '7F7F7F' } },
                bottom: { style: 'thin', color: { rgb: '7F7F7F' } },
                left: { style: 'thin', color: { rgb: '7F7F7F' } },
                right: { style: 'thin', color: { rgb: '7F7F7F' } }
            }
        },
        label: {
            font: { bold: true, color: { rgb: '1F2937' } },
            fill: { fgColor: { rgb: 'E8EEF7' } },
            alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
            border: {
                top: { style: 'thin', color: { rgb: 'D1D5DB' } },
                bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
                left: { style: 'thin', color: { rgb: 'D1D5DB' } },
                right: { style: 'thin', color: { rgb: 'D1D5DB' } }
            }
        },
        cell: {
            alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
            border: {
                top: { style: 'thin', color: { rgb: 'D1D5DB' } },
                bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
                left: { style: 'thin', color: { rgb: 'D1D5DB' } },
                right: { style: 'thin', color: { rgb: 'D1D5DB' } }
            }
        },
        altCell: {
            fill: { fgColor: { rgb: 'F9FAFB' } },
            alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
            border: {
                top: { style: 'thin', color: { rgb: 'D1D5DB' } },
                bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
                left: { style: 'thin', color: { rgb: 'D1D5DB' } },
                right: { style: 'thin', color: { rgb: 'D1D5DB' } }
            }
        }
    },

    _applyStyle(ws, cellAddress, style) {
        if (!ws[cellAddress]) return;
        ws[cellAddress].s = style;
    },

    _applyKvSheetStyles(ws) {
        if (!ws || !ws['!ref']) return;
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r: r, c: c });
                if (!ws[addr]) continue;
                if (r === 0) this._applyStyle(ws, addr, this._styles.header);
                else if (c === 0) this._applyStyle(ws, addr, this._styles.label);
                else this._applyStyle(ws, addr, r % 2 === 0 ? this._styles.altCell : this._styles.cell);
            }
        }

        ws['!autofilter'] = { ref: 'A1:B' + (range.e.r + 1) };
        ws['!rows'] = ws['!rows'] || [];
        ws['!rows'][0] = { hpt: 22 };
    },

    _applyTableSheetStyles(ws, headerRowIndex = 0) {
        if (!ws || !ws['!ref']) return;
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r: r, c: c });
                if (!ws[addr]) continue;
                if (r === headerRowIndex) this._applyStyle(ws, addr, this._styles.header);
                else this._applyStyle(ws, addr, r % 2 === 0 ? this._styles.altCell : this._styles.cell);
            }
        }

        const headAddrStart = XLSX.utils.encode_cell({ r: headerRowIndex, c: range.s.c });
        const headAddrEnd = XLSX.utils.encode_cell({ r: headerRowIndex, c: range.e.c });
        ws['!autofilter'] = { ref: headAddrStart + ':' + XLSX.utils.encode_cell({ r: range.e.r, c: range.e.c }) };
        ws['!rows'] = ws['!rows'] || [];
        ws['!rows'][headerRowIndex] = { hpt: 22 };
    },

    _applyPlanSheetStyles(ws) {
        if (!ws || !ws['!ref']) return;
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const range = XLSX.utils.decode_range(ws['!ref']);

        for (let r = range.s.r; r <= range.e.r; r++) {
            const firstCellValue = data[r] && data[r][0] != null ? String(data[r][0]) : '';
            const isSection = firstCellValue.indexOf('===') === 0;
            const isHeader = firstCellValue === 'Pole' ||
                firstCellValue === this._planCelHeaders.cel ||
                firstCellValue === this._planEwaluacjaHeaders.dataEwaluacji;

            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r: r, c: c });
                if (!ws[addr]) continue;

                if (isSection) this._applyStyle(ws, addr, this._styles.section);
                else if (isHeader) this._applyStyle(ws, addr, this._styles.header);
                else if (c === 0 && data[r] && data[r].length > 0) this._applyStyle(ws, addr, this._styles.label);
                else this._applyStyle(ws, addr, r % 2 === 0 ? this._styles.altCell : this._styles.cell);
            }
        }
    },

    // =========================================================================
    //  HELPERS - build sheet arrays
    // =========================================================================

    _toCellValue(val) {
        if (val == null) return '';
        if (typeof val === 'boolean') return val ? 'Tak' : 'Nie';
        if (Array.isArray(val)) return val.join(', ');
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
    },

    _kvToAoa(obj, labelMap) {
        const rows = [['Pole', 'Wartość']];
        const keys = Object.keys(labelMap);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            rows.push([labelMap[key], this._toCellValue(obj ? obj[key] : '')]);
        }
        return rows;
    },

    _tableToAoa(arr, headerMap) {
        const keys = Object.keys(headerMap);
        const headerRow = keys.map(k => headerMap[k]);
        const rows = [headerRow];
        if (!Array.isArray(arr)) return rows;

        for (let i = 0; i < arr.length; i++) {
            const item = arr[i] || {};
            rows.push(keys.map(k => this._toCellValue(item[k])));
        }
        return rows;
    },

    _flattenSesjaObjawy(sesja) {
        const extra = {};
        if (sesja && sesja.objawy && typeof sesja.objawy === 'object') {
            const objawy = Object.keys(sesja.objawy);
            for (let i = 0; i < objawy.length; i++) {
                const name = objawy[i];
                const o = sesja.objawy[name] || {};
                extra['objaw_' + name + '_checked'] = o.checked ? 'Tak' : 'Nie';
                extra['objaw_' + name + '_nasilenie'] = o.nasilenie != null ? o.nasilenie : '';
                extra['objaw_' + name + '_uwagi'] = o.uwagi != null ? o.uwagi : '';
            }
        }
        return extra;
    },

    _parseSessionNumber(value) {
        const cleaned = String(value != null ? value : '').replace(/[^0-9]/g, '');
        const parsed = parseInt(cleaned, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    },

    _getSessionTypeForIndex(index) {
        return index === 0 ? 'Sesja pierwsza / wstępna' : 'Sesja kontynuacyjna';
    },

    _sortAndNormalizeSessions(sesje) {
        const source = Array.isArray(sesje) ? sesje : [];

        const wrapped = source.map((session, idx) => ({
            session: (session && typeof session === 'object') ? session : {},
            idx: idx
        }));

        wrapped.sort((a, b) => {
            const nrA = this._parseSessionNumber(a.session.nrSesji);
            const nrB = this._parseSessionNumber(b.session.nrSesji);
            if (nrA != null && nrB != null && nrA !== nrB) return nrA - nrB;
            if (nrA != null && nrB == null) return -1;
            if (nrA == null && nrB != null) return 1;

            const dtA = Date.parse(a.session.dataSesji || '');
            const dtB = Date.parse(b.session.dataSesji || '');
            const hasDtA = Number.isFinite(dtA);
            const hasDtB = Number.isFinite(dtB);
            if (hasDtA && hasDtB && dtA !== dtB) return dtA - dtB;
            if (hasDtA && !hasDtB) return -1;
            if (!hasDtA && hasDtB) return 1;

            return a.idx - b.idx;
        });

        return wrapped.map((item, index) => {
            const s = item.session;
            s.nrSesji = String(index + 1);
            s.typSesji = this._getSessionTypeForIndex(index);
            if (!s.objawy || typeof s.objawy !== 'object' || Array.isArray(s.objawy)) s.objawy = {};
            return s;
        });
    },

    _buildSesjeAoa(sesje) {
        const normalizedSesje = this._sortAndNormalizeSessions(sesje);

        if (!Array.isArray(normalizedSesje) || normalizedSesje.length === 0) {
            return this._tableToAoa([], this._sesjaHeaders);
        }

        const extraKeysMap = {};
        for (let i = 0; i < normalizedSesje.length; i++) {
            const flat = this._flattenSesjaObjawy(normalizedSesje[i]);
            const keys = Object.keys(flat);
            for (let j = 0; j < keys.length; j++) extraKeysMap[keys[j]] = true;
        }

        const extraKeys = Object.keys(extraKeysMap).sort();
        const stdKeys = Object.keys(this._sesjaHeaders);
        const rows = [[...stdKeys.map(k => this._sesjaHeaders[k]), ...extraKeys]];

        for (let i = 0; i < normalizedSesje.length; i++) {
            const s = normalizedSesje[i] || {};
            const flat = this._flattenSesjaObjawy(s);
            const row = [];

            for (let c = 0; c < stdKeys.length; c++) row.push(this._toCellValue(s[stdKeys[c]]));
            for (let c = 0; c < extraKeys.length; c++) row.push(this._toCellValue(flat[extraKeys[c]]));

            rows.push(row);
        }

        return rows;
    },

    _buildPlanAoa(plan) {
        const p = plan || {};
        const rows = [];

        rows.push(['=== PLAN LECZENIA ===', '']);
        rows.push(['Pole', 'Wartość']);

        const labelKeys = Object.keys(this._planLabels);
        for (let i = 0; i < labelKeys.length; i++) {
            const key = labelKeys[i];
            rows.push([this._planLabels[key], this._toCellValue(p[key])]);
        }

        rows.push([]);
        rows.push(['=== CELE KRÓTKOTERMINOWE ===']);
        const celKeys = Object.keys(this._planCelHeaders);
        rows.push(celKeys.map(k => this._planCelHeaders[k]));
        const cele = p.celeKrotkoterminowe || p.celekrotkoterminowe || [];
        if (Array.isArray(cele)) {
            for (let i = 0; i < cele.length; i++) {
                const item = cele[i] || {};
                rows.push(celKeys.map(k => this._toCellValue(item[k])));
            }
        }

        rows.push([]);
        rows.push(['=== EWALUACJE ===']);
        const ewKeys = Object.keys(this._planEwaluacjaHeaders);
        rows.push(ewKeys.map(k => this._planEwaluacjaHeaders[k]));
        const ewaluacje = p.ewaluacje || [];
        if (Array.isArray(ewaluacje)) {
            for (let i = 0; i < ewaluacje.length; i++) {
                const item = ewaluacje[i] || {};
                rows.push(ewKeys.map(k => this._toCellValue(item[k])));
            }
        }

        return rows;
    },

    _buildWorkbook(patient) {
        const wb = XLSX.utils.book_new();

        const wsDane = XLSX.utils.aoa_to_sheet(this._kvToAoa(patient.dane, this._daneLabels));
        wsDane['!cols'] = [{ wch: 34 }, { wch: 58 }];
        this._applyKvSheetStyles(wsDane);
        XLSX.utils.book_append_sheet(wb, wsDane, 'Dane');

        const wsWywiad = XLSX.utils.aoa_to_sheet(this._kvToAoa(patient.wywiad, this._wywiadLabels));
        wsWywiad['!cols'] = [{ wch: 40 }, { wch: 64 }];
        this._applyKvSheetStyles(wsWywiad);
        XLSX.utils.book_append_sheet(wb, wsWywiad, 'Wywiad');

        const wsMse = XLSX.utils.aoa_to_sheet(this._kvToAoa(patient.mse, this._mseLabels));
        wsMse['!cols'] = [{ wch: 40 }, { wch: 58 }];
        this._applyKvSheetStyles(wsMse);
        XLSX.utils.book_append_sheet(wb, wsMse, 'MSE');

        const sesjeAoa = this._buildSesjeAoa(patient.sesje || []);
        const wsSesje = XLSX.utils.aoa_to_sheet(sesjeAoa);
        if (sesjeAoa[0]) wsSesje['!cols'] = Array.from({ length: sesjeAoa[0].length }, () => ({ wch: 22 }));
        this._applyTableSheetStyles(wsSesje, 0);
        XLSX.utils.book_append_sheet(wb, wsSesje, 'Sesje');

        const testyAoa = this._tableToAoa(patient.testy || [], this._testHeaders);
        const wsTesty = XLSX.utils.aoa_to_sheet(testyAoa);
        wsTesty['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 42 }, { wch: 10 }, { wch: 36 }];
        this._applyTableSheetStyles(wsTesty, 0);
        XLSX.utils.book_append_sheet(wb, wsTesty, 'Testy');

        const wsPlan = XLSX.utils.aoa_to_sheet(this._buildPlanAoa(patient.plan));
        wsPlan['!cols'] = [{ wch: 38 }, { wch: 56 }, { wch: 24 }, { wch: 20 }];
        this._applyPlanSheetStyles(wsPlan);
        XLSX.utils.book_append_sheet(wb, wsPlan, 'Plan');

        return wb;
    },

    // =========================================================================
    //  SAVE
    // =========================================================================

    async savePatient(patient) {
        try {
            if (!patient) throw new Error('Brak danych pacjenta do zapisu.');

            this._notify('Zapisywanie pacjenta...', 'info');
            const fileName = this.getFileName(patient);
            const wb = this._buildWorkbook(patient);
            const wbout = XLSX.write(wb, {
                bookType: 'xlsx',
                type: 'array',
                cellStyles: true,
                compression: true
            });

            if (this.directoryHandle) {
                // Rename behavior: if identifying fields changed, remove old file name.
                if (patient._fileName && patient._fileName !== fileName) {
                    try {
                        await this.directoryHandle.removeEntry(patient._fileName);
                    } catch (_) {
                        // Ignore if old file does not exist.
                    }
                }

                const fileHandle = await this.directoryHandle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(new Uint8Array(wbout));
                await writable.close();

                patient._fileName = fileName;
                patient._fileHandle = fileHandle;

                this._notify('Zapisano: ' + fileName, 'success');
                return true;
            }

            // Fallback only when no folder access.
            this._triggerDownload(wbout, fileName);
            return true;
        } catch (err) {
            this._notify('Błąd zapisu pacjenta: ' + (err && err.message ? err.message : String(err)), 'error');
            console.error('XlsxHandler.savePatient error:', err);
            return false;
        }
    },

    _triggerDownload(wbout, fileName) {
        try {
            const blob = new Blob([new Uint8Array(wbout)], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            this._notify('Pobrano plik: ' + fileName, 'success');
        } catch (err) {
            this._notify('Błąd pobierania pliku: ' + err.message, 'error');
        }
    },

    downloadPatient(patient) {
        try {
            if (!patient) throw new Error('Brak danych pacjenta.');
            const wb = this._buildWorkbook(patient);
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true, compression: true });
            this._triggerDownload(wbout, this.getFileName(patient));
        } catch (err) {
            this._notify('Błąd eksportu: ' + err.message, 'error');
            console.error('XlsxHandler.downloadPatient error:', err);
        }
    },

    // =========================================================================
    //  LOAD HELPERS
    // =========================================================================

    _normalizeLoadedValue(val) {
        if (val === 'Tak') return true;
        if (val === 'Nie') return false;
        return val != null ? val : '';
    },

    _aoaToKv(sheet, labelMap, aliases) {
        if (!sheet) return {};
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const reverse = {};
        const keys = Object.keys(labelMap);
        for (let i = 0; i < keys.length; i++) {
            reverse[labelMap[keys[i]]] = keys[i];
            reverse[keys[i]] = keys[i];
        }
        if (aliases && typeof aliases === 'object') {
            const akeys = Object.keys(aliases);
            for (let i = 0; i < akeys.length; i++) reverse[akeys[i]] = aliases[akeys[i]];
        }

        const obj = {};
        for (let r = 1; r < data.length; r++) {
            const row = data[r];
            if (!row || row.length < 2) continue;
            const label = String(row[0] != null ? row[0] : '').trim();
            const key = reverse[label];
            if (!key) continue;
            obj[key] = this._normalizeLoadedValue(row[1]);
        }

        return obj;
    },

    _aoaToTable(sheet, headerMap) {
        if (!sheet) return [];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (data.length < 2) return [];

        const reverse = {};
        const keys = Object.keys(headerMap);
        for (let i = 0; i < keys.length; i++) {
            reverse[headerMap[keys[i]]] = keys[i];
            reverse[keys[i]] = keys[i];
        }

        const headerRow = data[0] || [];
        const columnKeyMap = headerRow.map(h => reverse[String(h != null ? h : '').trim()] || null);
        const result = [];

        for (let r = 1; r < data.length; r++) {
            const row = data[r] || [];
            const item = {};
            let hasData = false;
            for (let c = 0; c < columnKeyMap.length; c++) {
                const key = columnKeyMap[c];
                if (!key) continue;
                const val = this._normalizeLoadedValue(row[c]);
                item[key] = val;
                if (val !== '' && val != null) hasData = true;
            }
            if (hasData) result.push(item);
        }

        return result;
    },

    _parseSesjeSheet(sheet) {
        if (!sheet) return [];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (data.length < 2) return [];

        const reverseStd = {};
        const stdKeys = Object.keys(this._sesjaHeaders);
        for (let i = 0; i < stdKeys.length; i++) {
            reverseStd[this._sesjaHeaders[stdKeys[i]]] = stdKeys[i];
            reverseStd[stdKeys[i]] = stdKeys[i];
        }

        const header = data[0] || [];
        const colMap = [];
        for (let c = 0; c < header.length; c++) {
            const hdr = String(header[c] != null ? header[c] : '').trim();
            if (reverseStd[hdr]) {
                colMap.push({ type: 'std', key: reverseStd[hdr] });
            } else if (hdr.indexOf('objaw_') === 0) {
                const parts = hdr.split('_');
                const field = parts[parts.length - 1];
                const name = parts.slice(1, parts.length - 1).join('_');
                colMap.push({ type: 'objaw', name: name, field: field });
            } else {
                colMap.push({ type: 'unknown' });
            }
        }

        const sesje = [];
        for (let r = 1; r < data.length; r++) {
            const row = data[r] || [];
            const sesja = { objawy: {} };
            let hasData = false;

            for (let c = 0; c < colMap.length; c++) {
                const col = colMap[c];
                const val = this._normalizeLoadedValue(row[c]);
                if (col.type === 'std') {
                    sesja[col.key] = val;
                    if (val !== '' && val != null) hasData = true;
                } else if (col.type === 'objaw') {
                    if (!sesja.objawy[col.name]) sesja.objawy[col.name] = {};
                    sesja.objawy[col.name][col.field] = val;
                    if (val !== '' && val != null) hasData = true;
                }
            }

            if (hasData) sesje.push(sesja);
        }

        return this._sortAndNormalizeSessions(sesje);
    },

    _parseTestySheet(sheet) {
        const tests = this._aoaToTable(sheet, this._testHeaders);
        for (let i = 0; i < tests.length; i++) {
            const t = tests[i];

            if (typeof t.odpowiedzi === 'string' && t.odpowiedzi.trim() !== '') {
                try {
                    const arr = t.odpowiedzi.split(',').map(x => x.trim()).filter(Boolean).map(x => {
                        const n = parseFloat(x);
                        return isNaN(n) ? x : n;
                    });
                    t.odpowiedzi = arr;
                } catch (_) {
                    // leave as string
                }
            }

            if (typeof t.wynik === 'string') {
                const num = parseFloat(t.wynik);
                if (!isNaN(num)) t.wynik = num;
            }
        }
        return tests;
    },

    _parsePlanSheet(sheet) {
        if (!sheet) return {};

        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        const plan = {};

        const reverseMain = {};
        const mainKeys = Object.keys(this._planLabels);
        for (let i = 0; i < mainKeys.length; i++) reverseMain[this._planLabels[mainKeys[i]]] = mainKeys[i];

        let section = 'main';
        let skipCeleHeader = false;
        let skipEwHeader = false;
        const cele = [];
        const ewaluacje = [];

        for (let r = 0; r < data.length; r++) {
            const row = data[r] || [];
            const first = String(row[0] != null ? row[0] : '').trim();
            if (!first && row.length <= 1) continue;

            if (first.indexOf('=== PLAN LECZENIA') >= 0) { section = 'main'; continue; }
            if (first.indexOf('=== CELE KRÓTKOTERMINOWE') >= 0 || first.indexOf('=== CELE KROTKOTERMINOWE') >= 0) {
                section = 'cele';
                skipCeleHeader = true;
                continue;
            }
            if (first.indexOf('=== EWALUACJE') >= 0) {
                section = 'ewaluacje';
                skipEwHeader = true;
                continue;
            }

            if (section === 'main') {
                if (first === 'Pole') continue;
                const key = reverseMain[first];
                if (key) plan[key] = this._normalizeLoadedValue(row[1]);
            } else if (section === 'cele') {
                if (skipCeleHeader) { skipCeleHeader = false; continue; }
                if (!first) continue;
                cele.push({
                    cel: row[0] != null ? row[0] : '',
                    mierzalnosc: row[1] != null ? row[1] : '',
                    terminRealizacji: row[2] != null ? row[2] : '',
                    status: row[3] != null ? row[3] : ''
                });
            } else if (section === 'ewaluacje') {
                if (skipEwHeader) { skipEwHeader = false; continue; }
                if (!first) continue;
                ewaluacje.push({
                    dataEwaluacji: row[0] != null ? row[0] : '',
                    notatka: row[1] != null ? row[1] : '',
                    postep: row[2] != null ? row[2] : ''
                });
            }
        }

        plan.celeKrotkoterminowe = cele;
        plan.ewaluacje = ewaluacje;
        return plan;
    },

    _ensurePatientShape(patient, fallbackId) {
        const p = patient || {};
        p.dane = p.dane || {};
        p.wywiad = p.wywiad || {};
        p.mse = p.mse || {};
        p.sesje = this._sortAndNormalizeSessions(Array.isArray(p.sesje) ? p.sesje : []);
        p.testy = Array.isArray(p.testy) ? p.testy : [];
        p.plan = p.plan || {};

        const generatedCode = fallbackId || ('P' + String(Math.floor(Math.random() * 999) + 1).padStart(3, '0'));
        const normalizedCode = this._normalizePatientCode(p.dane.kodPacjenta || p.dane.id || generatedCode) || generatedCode;
        p.dane.kodPacjenta = normalizedCode;
        p.dane.id = normalizedCode;

        if (!Array.isArray(p.plan.celeKrotkoterminowe)) p.plan.celeKrotkoterminowe = p.plan.celekrotkoterminowe || [];
        if (!Array.isArray(p.plan.ewaluacje)) p.plan.ewaluacje = [];

        return p;
    },

    async loadPatient(fileHandleOrFile) {
        try {
            let fileName = '';
            let arrayBuffer;

            if (fileHandleOrFile && typeof fileHandleOrFile.getFile === 'function') {
                const file = await fileHandleOrFile.getFile();
                fileName = file.name || '';
                arrayBuffer = await file.arrayBuffer();
            } else if (fileHandleOrFile instanceof File) {
                fileName = fileHandleOrFile.name || '';
                arrayBuffer = await fileHandleOrFile.arrayBuffer();
            } else {
                throw new Error('Nieobsługiwany typ źródła pliku.');
            }

            const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
            let patient = {
                dane: {},
                wywiad: {},
                mse: {},
                sesje: [],
                testy: [],
                plan: {}
            };

            if (wb.SheetNames.indexOf('Dane') >= 0) patient.dane = this._aoaToKv(wb.Sheets['Dane'], this._daneLabels, this._daneLegacyLabelAliases);
            if (wb.SheetNames.indexOf('Wywiad') >= 0) patient.wywiad = this._aoaToKv(wb.Sheets['Wywiad'], this._wywiadLabels, this._wywiadLegacyLabelAliases);
            if (wb.SheetNames.indexOf('MSE') >= 0) patient.mse = this._aoaToKv(wb.Sheets['MSE'], this._mseLabels, this._mseLegacyLabelAliases);
            if (wb.SheetNames.indexOf('Sesje') >= 0) patient.sesje = this._parseSesjeSheet(wb.Sheets['Sesje']);
            if (wb.SheetNames.indexOf('Testy') >= 0) patient.testy = this._parseTestySheet(wb.Sheets['Testy']);
            if (wb.SheetNames.indexOf('Plan') >= 0) patient.plan = this._parsePlanSheet(wb.Sheets['Plan']);

            patient = this._ensurePatientShape(patient, null);
            if (fileHandleOrFile && typeof fileHandleOrFile.getFile === 'function') {
                patient._fileHandle = fileHandleOrFile;
                patient._fileName = fileName;
            }

            this._notify('Wczytano pacjenta: ' + (patient.dane.nazwisko || '') + ' ' + (patient.dane.imie || ''), 'success');
            return patient;
        } catch (err) {
            this._notify('Błąd wczytywania pacjenta: ' + (err && err.message ? err.message : String(err)), 'error');
            console.error('XlsxHandler.loadPatient error:', err);
            return null;
        }
    },

    async loadAllPatients() {
        try {
            if (!this.directoryHandle) {
                this._notify('Brak wybranego folderu pacjentów.', 'warning');
                return [];
            }

            this._notify('Wczytywanie pacjentów z folderu...', 'info');
            const patients = [];
            let errors = 0;

            for await (const entry of this.directoryHandle.values()) {
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.xlsx')) {
                    try {
                        const patient = await this.loadPatient(entry);
                        if (patient) patients.push(patient);
                    } catch (err) {
                        errors++;
                        console.warn('Błąd pliku ' + entry.name + ':', err);
                    }
                }
            }

            patients.sort((a, b) => {
                const an = this._normalizePatientCode((a.dane && (a.dane.kodPacjenta || a.dane.id)) || '');
                const bn = this._normalizePatientCode((b.dane && (b.dane.kodPacjenta || b.dane.id)) || '');
                return an.localeCompare(bn, 'pl');
            });

            const msg = 'Wczytano ' + patients.length + ' pacjent' + (patients.length === 1 ? 'a' : 'ów') + (errors > 0 ? (' (błędy: ' + errors + ')') : '');
            this._notify(msg, errors > 0 ? 'warning' : 'success');
            return patients;
        } catch (err) {
            this._notify('Błąd odczytu folderu pacjentów: ' + err.message, 'error');
            console.error('XlsxHandler.loadAllPatients error:', err);
            return [];
        }
    },

    // =========================================================================
    //  AUTO-SAVE WITH DEBOUNCE
    // =========================================================================

    scheduleAutoSave(patient) {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => {
            this.savePatient(patient);
        }, 2000);
    },

    // =========================================================================
    //  DELETE patient file
    // =========================================================================

    async deletePatient(patient) {
        try {
            if (!this.directoryHandle) {
                this._notify('Nie można usunąć: brak folderu pacjentów.', 'warning');
                return false;
            }

            const fileName = patient && patient._fileName ? patient._fileName : this.getFileName(patient);
            await this.directoryHandle.removeEntry(fileName);
            this._notify('Usunięto plik: ' + fileName, 'success');
            return true;
        } catch (err) {
            if (err && err.name === 'NotFoundError') {
                this._notify('Plik nie istnieje.', 'warning');
                return false;
            }
            this._notify('Błąd usuwania pliku: ' + (err && err.message ? err.message : String(err)), 'error');
            console.error('XlsxHandler.deletePatient error:', err);
            return false;
        }
    },

    // =========================================================================
    //  IMPORT fallback (manual file pick)
    // =========================================================================

    async importPatientFromFile() {
        return new Promise((resolve) => {
            try {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.xlsx';
                input.onchange = async (e) => {
                    try {
                        const file = e.target.files[0];
                        if (!file) { resolve(null); return; }
                        const patient = await this.loadPatient(file);
                        resolve(patient);
                    } catch (err) {
                        this._notify('Błąd importu: ' + err.message, 'error');
                        resolve(null);
                    }
                };
                input.click();
            } catch (err) {
                this._notify('Błąd importu: ' + err.message, 'error');
                resolve(null);
            }
        });
    }
};
