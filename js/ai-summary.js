// ============================================================================
// ai-summary.js - GPT session summary for SOAP module
// Demo mode: tries to read API key from local file path provided by user
// ============================================================================

const AISummary = {
    apiKeyStorageKey: 'psychoapp_openai_api_key',
    keyFileUrl: 'file:///C:/Users/Michael/Projects/security/key2.txt',

    init() {
        const btn = document.getElementById('btn-generate-summary-ai');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            await this.generateForCurrentSession();
        });
    },

    _setStatus(text, type) {
        const el = document.getElementById('ai-summary-status');
        if (!el) return;

        el.textContent = text || '';
        el.style.color = '#6B7280';
        if (type === 'success') el.style.color = '#059669';
        if (type === 'error') el.style.color = '#DC2626';
        if (type === 'info') el.style.color = '#2563EB';
    },

    _escapeXml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    },

    _escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    _normalizeToDigits(value) {
        return String(value || '').replace(/\D+/g, '');
    },

    _buildDateVariants(rawDate) {
        const variants = [];
        const base = String(rawDate || '').trim();
        if (!base) return variants;

        variants.push(base);

        const m = base.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return variants;

        const yyyy = m[1];
        const mm = m[2];
        const dd = m[3];
        variants.push(dd + '.' + mm + '.' + yyyy);
        variants.push(dd + '/' + mm + '/' + yyyy);
        variants.push(dd + '-' + mm + '-' + yyyy);
        return variants;
    },

    _collectPatientRedactionVariants(patient) {
        const dane = (patient && patient.dane) || {};
        const rawValues = [];

        Object.keys(dane).forEach((key) => {
            const value = dane[key];
            if (value == null || typeof value === 'boolean') return;
            const normalized = String(value).trim();
            if (!normalized) return;
            rawValues.push(normalized);
        });

        const firstName = String(dane.imie || '').trim();
        const lastName = String(dane.nazwisko || '').trim();
        if (firstName && lastName) {
            rawValues.push(firstName + ' ' + lastName);
            rawValues.push(lastName + ' ' + firstName);
        }

        this._buildDateVariants(dane.dataUrodzenia).forEach((variant) => rawValues.push(variant));

        const unique = Array.from(new Set(rawValues)).filter(Boolean);
        unique.sort((a, b) => b.length - a.length);
        return unique;
    },

    _redactPersonalData(value, patient) {
        let text = String(value || '');
        if (!text) return text;

        const variants = this._collectPatientRedactionVariants(patient);
        variants.forEach((variant) => {
            const pattern = new RegExp(this._escapeRegExp(variant), 'gi');
            text = text.replace(pattern, '[REDACTED]');

            const digits = this._normalizeToDigits(variant);
            if (digits.length >= 7) {
                const loosePattern = new RegExp(
                    digits.split('').map((d) => this._escapeRegExp(d)).join('[\\s().-]*'),
                    'g'
                );
                text = text.replace(loosePattern, '[REDACTED]');
            }
        });

        text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED]');
        text = text.replace(/\b\d{11}\b/g, '[REDACTED]');

        return text;
    },

    _buildSessionXml(patient, session) {
        const objawy = (session && session.objawy) || {};
        const symptomEntries = [];

        Object.keys(objawy).forEach((key) => {
            const o = objawy[key] || {};
            if (!o.checked && !o.uwagi && String(o.nasilenie || '0') === '0') return;

            symptomEntries.push(
                '    <objaw nazwa="' + this._escapeXml(key) + '">\n' +
                '      <zaznaczony>' + (o.checked ? 'tak' : 'nie') + '</zaznaczony>\n' +
                '      <nasilenie>' + this._escapeXml(o.nasilenie || '0') + '</nasilenie>\n' +
                '      <uwagi>' + this._escapeXml(this._redactPersonalData(o.uwagi || '', patient)) + '</uwagi>\n' +
                '    </objaw>'
            );
        });

        const opisKlienta = this._redactPersonalData(session.opisKlienta || '', patient);
        const obserwacjeTerapeuty = this._redactPersonalData(session.obserwacjeTerapeuty || '', patient);
        const wynikiTestow = this._redactPersonalData(session.wynikiTestow || '', patient);
        const komunikacjaNiewerbalna = this._redactPersonalData(session.komunikacjaNiewerbalna || '', patient);
        const postepTerapii = this._redactPersonalData(session.postepTerapii || '', patient);
        const aktualizacjaDiagnozy = this._redactPersonalData(session.aktualizacjaDiagnozy || '', patient);
        const odpowiedzInterwencje = this._redactPersonalData(session.odpowiedzInterwencje || '', patient);
        const interwencjeZastosowane = this._redactPersonalData(session.interwencjeZastosowane || '', patient);
        const zadanieDomowe = this._redactPersonalData(session.zadanieDomowe || '', patient);
        const planNastepnaSesja = this._redactPersonalData(session.planNastepnaSesja || '', patient);
        const potrzebaKonsultacji = this._redactPersonalData(session.potrzebaKonsultacji || '', patient);
        const zmianaFarmakoterapii = this._redactPersonalData(session.zmianaFarmakoterapii || '', patient);

        return [
            '<sesjaSOAP>',
            '  <meta>',
            '    <dataSesji>' + this._escapeXml(session.dataSesji || '') + '</dataSesji>',
            '    <nrSesji>' + this._escapeXml(session.nrSesji || '') + '</nrSesji>',
            '    <modalnosc>' + this._escapeXml(session.modalnosc || '') + '</modalnosc>',
            '    <czasMin>' + this._escapeXml(session.czasMin || '') + '</czasMin>',
            '  </meta>',
            '  <S>',
            '    <opisKlienta>' + this._escapeXml(opisKlienta) + '</opisKlienta>',
            '  </S>',
            '  <O>',
            '    <obserwacjeTerapeuty>' + this._escapeXml(obserwacjeTerapeuty) + '</obserwacjeTerapeuty>',
            '    <wynikiTestow>' + this._escapeXml(wynikiTestow) + '</wynikiTestow>',
            '    <komunikacjaNiewerbalna>' + this._escapeXml(komunikacjaNiewerbalna) + '</komunikacjaNiewerbalna>',
            '  </O>',
            '  <A>',
            '    <postepTerapii>' + this._escapeXml(postepTerapii) + '</postepTerapii>',
            '    <aktualizacjaDiagnozy>' + this._escapeXml(aktualizacjaDiagnozy) + '</aktualizacjaDiagnozy>',
            '    <odpowiedzInterwencje>' + this._escapeXml(odpowiedzInterwencje) + '</odpowiedzInterwencje>',
            '  </A>',
            '  <P>',
            '    <interwencjeZastosowane>' + this._escapeXml(interwencjeZastosowane) + '</interwencjeZastosowane>',
            '    <zadanieDomowe>' + this._escapeXml(zadanieDomowe) + '</zadanieDomowe>',
            '    <planNastepnaSesja>' + this._escapeXml(planNastepnaSesja) + '</planNastepnaSesja>',
            '    <potrzebaKonsultacji>' + this._escapeXml(potrzebaKonsultacji) + '</potrzebaKonsultacji>',
            '    <zmianaFarmakoterapii>' + this._escapeXml(zmianaFarmakoterapii) + '</zmianaFarmakoterapii>',
            '  </P>',
            '  <objawy>',
            symptomEntries.join('\n') || '    <brak />',
            '  </objawy>',
            '</sesjaSOAP>'
        ].join('\n');
    },

    async _getApiKey() {
        const stored = localStorage.getItem(this.apiKeyStorageKey);
        if (stored && stored.trim()) return stored.trim();

        // Demo path requested by user
        try {
            const resp = await fetch(this.keyFileUrl, { cache: 'no-store' });
            if (resp.ok) {
                const text = (await resp.text()).trim();
                if (text) {
                    localStorage.setItem(this.apiKeyStorageKey, text);
                    return text;
                }
            }
        } catch (_) {
            // Fallback below
        }

        const entered = window.prompt('Wklej klucz OpenAI API (demo):');
        if (entered && entered.trim()) {
            localStorage.setItem(this.apiKeyStorageKey, entered.trim());
            return entered.trim();
        }

        return null;
    },

    _buildPrompt(xmlData) {
        return [
            'Przygotuj krótkie, robocze podsumowanie sesji SOAP na podstawie XML.',
            'Użyj tylko informacji z danych wejściowych.',
            'Jeśli w sekcji nie ma danych, wpisz: "brak danych".',
            '',
            'Format odpowiedzi:',
            '1) S/O - fakty zgłaszane i obserwowane',
            '2) A - ocena postępu (tylko to, co jest w danych)',
            '3) P - plan dalszych działań (tylko to, co jest w danych)',
            '',
            'Wymagania:',
            '- Styl roboczy i bardzo zwięzły.',
            '- Używaj krótkich punktów (bez długich akapitów).',
            '- NIE dopowiadaj, NIE interpretuj ponad dane, NIE twórz hipotez spoza XML.',
            '- Pomiń puste pola lub oznacz je jako "brak danych".',
            '- Nigdy nie używaj imienia/nazwiska. Zawsze pisz: "pacjent".',
            '',
            'Dane XML:',
            xmlData
        ].join('\n');
    },

    async _callOpenAi(apiKey, prompt) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                temperature: 0.15,
                max_tokens: 800,
                messages: [
                    {
                        role: 'system',
                        content: 'Tworzysz krótkie, robocze podsumowania kliniczne po polsku. Opieraj się WYŁĄCZNIE na dostarczonych danych. Nie wymyślaj i nie dopisuj informacji spoza danych. Jeśli brak danych, napisz "brak danych". Nigdy nie używaj imion ani nazwisk — zawsze używaj określenia "pacjent". Zwracaj wyłącznie treść podsumowania.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            let details = '';
            try {
                const errJson = await response.json();
                details = errJson && errJson.error && errJson.error.message ? errJson.error.message : '';
            } catch (_) {}
            throw new Error('OpenAI API error ' + response.status + (details ? (': ' + details) : ''));
        }

        const data = await response.json();
        const content = data && data.choices && data.choices[0] && data.choices[0].message
            ? data.choices[0].message.content
            : '';

        if (!content || !String(content).trim()) {
            throw new Error('Brak treści odpowiedzi z OpenAI.');
        }

        return String(content).trim();
    },

    async generateForCurrentSession() {
        const btn = document.getElementById('btn-generate-summary-ai');
        const output = document.getElementById('podsumowanieAI');

        if (!btn || !output) return;

        if (typeof SOAP === 'undefined' || !SOAP.currentPatient || SOAP.currentSessionIndex < 0) {
            if (typeof App !== 'undefined' && App.showNotification) {
                App.showNotification('Wybierz pacjenta i sesję przed generowaniem podsumowania AI.', 'error');
            }
            this._setStatus('Najpierw wybierz sesję.', 'error');
            return;
        }

        // Ensure latest form edits are in object
        if (typeof SOAP.collectSessionData === 'function') SOAP.collectSessionData();

        const patient = SOAP.currentPatient;
        const session = patient.sesje[SOAP.currentSessionIndex];

        const existingSummary = String((output.value || session.podsumowanieAI || '')).trim();
        if (existingSummary) {
            let overwriteConfirmed = false;
            if (typeof App !== 'undefined' && typeof App.confirmModal === 'function') {
                overwriteConfirmed = await App.confirmModal({
                    title: 'Nadpisać podsumowanie AI?',
                    message: 'Pole podsumowania AI zawiera już treść. Wygenerowanie nowego podsumowania nadpisze dotychczasowy tekst i utracisz obecną wersję. Czy kontynuować?',
                    confirmText: 'Nadpisz',
                    cancelText: 'Anuluj',
                    danger: true
                });
            }

            if (!overwriteConfirmed) {
                this._setStatus('Anulowano generowanie — zachowano dotychczasowe podsumowanie.', 'info');
                return;
            }
        }

        btn.disabled = true;
        this._setStatus('Generowanie podsumowania AI...', 'info');

        try {
            const key = await this._getApiKey();
            if (!key) throw new Error('Brak klucza API OpenAI.');

            const xmlData = this._buildSessionXml(patient, session);
            const prompt = this._buildPrompt(xmlData);
            const summary = await this._callOpenAi(key, prompt);

            output.value = summary;

            // Persist into current session object + autosave
            session.podsumowanieAI = summary;
            if (typeof SOAP.collectSessionData === 'function') SOAP.collectSessionData();
            if (typeof XlsxHandler !== 'undefined' && typeof XlsxHandler.scheduleAutoSave === 'function') {
                XlsxHandler.scheduleAutoSave(patient);
            }

            this._setStatus('Gotowe. Podsumowanie zapisane w sesji.', 'success');
            if (typeof App !== 'undefined' && App.showNotification) {
                App.showNotification('Podsumowanie AI wygenerowane i zapisane.', 'success');
            }
        } catch (err) {
            this._setStatus('Błąd: ' + (err && err.message ? err.message : String(err)), 'error');
            if (typeof App !== 'undefined' && App.showNotification) {
                App.showNotification('Błąd generowania AI: ' + (err && err.message ? err.message : String(err)), 'error');
            }
            console.error('AISummary.generateForCurrentSession error:', err);
        } finally {
            btn.disabled = false;
        }
    }
};
