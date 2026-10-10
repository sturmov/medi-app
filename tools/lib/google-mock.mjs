// ============================================================================
// tools/lib/google-mock.mjs — lokalna atrapa Google Drive v3 + Sheets v4 + Calendar v3.
//
// Obsługuje dokładnie ten podzbiór API, którego używa `_storage-gdrive.js`,
// i pilnuje tych samych reguł co prawdziwe API tam, gdzie pomyłka zepsułaby
// zapis: limity siatki arkusza, unikalność zakładek, atomowość batchUpdate,
// token w nagłówku. NIE zastępuje testu na prawdziwym koncie Google —
// sprawdza logikę aplikacji (kolejność wywołań, ponowienia, bezstratność).
//
// Podpinana pod serwer testowy pod prefiksem `/__gapi` (ten sam origin).
// ============================================================================

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export function createGoogleMock({ token = 'test-token' } = {}) {
    const files = new Map();          // id → { id, name, mimeType, parents, appProperties, trashed, content?, sheets? }
    const calls = [];                 // dziennik: 'METHOD /ścieżka'
    const calendars = new Map();      // id → { id, summary, timeZone, events: Map(id → event) }
    let primaryBusy = [];             // zajęte przedziały głównego kalendarza (freeBusy)
    let nextId = 1;
    let failQueue = [];               // kody HTTP do zwrócenia przy kolejnych żądaniach
    let offline = false;

    const newId = (prefix) => prefix + '_' + (nextId++);
    const now = () => new Date().toISOString();

    function send(res, status, body, headers = {}) {
        const isBuf = Buffer.isBuffer(body);
        res.writeHead(status, Object.assign({
            'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8'
        }, headers));
        res.end(isBuf ? body : JSON.stringify(body == null ? {} : body));
    }
    const fail = (res, status, message, reason = 'badRequest') =>
        send(res, status, { error: { code: status, message, errors: [{ reason }] } });

    /* ---------------- Drive: zapytania `q` ---------------- */
    function matches(file, q) {
        const conds = [];
        let rest = q.replace(/appProperties has \{ key='([^']*)' and value='([^']*)' \}/g, (_, k, v) => {
            conds.push((f) => (f.appProperties || {})[k] === v);
            return '';
        });
        for (const part of rest.split(' and ').map((s) => s.trim()).filter(Boolean)) {
            let m;
            if ((m = part.match(/^mimeType='(.*)'$/))) conds.push((f) => f.mimeType === m[1]);
            else if ((m = part.match(/^name='(.*)'$/))) conds.push((f) => f.name === m[1]);
            else if ((m = part.match(/^'(.*)' in parents$/))) conds.push((f) => (f.parents || []).includes(m[1]));
            else if (part === 'trashed=false') conds.push((f) => !f.trashed);
            else throw new Error('Atrapa nie zna warunku zapytania: ' + part);
        }
        return conds.every((c) => c(file));
    }

    function publicFile(f) {
        return {
            id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents || [],
            appProperties: f.appProperties || {}, createdTime: f.createdTime, modifiedTime: f.modifiedTime,
            size: f.content ? String(f.content.length) : undefined
        };
    }

    /* ---------------- Sheets: batchUpdate ---------------- */
    function applyBatch(spreadsheet, requests) {
        // Pracujemy na kopii — jak w prawdziwym API, błąd w dowolnym żądaniu cofa całość.
        const sheets = spreadsheet.sheets.map((s) => ({
            properties: JSON.parse(JSON.stringify(s.properties)),
            cells: s.cells.map((row) => row.slice())
        }));
        const byId = (id) => sheets.find((s) => s.properties.sheetId === id);

        for (const req of requests) {
            const kind = Object.keys(req)[0];
            const r = req[kind];
            if (kind === 'addSheet') {
                const p = r.properties || {};
                if (sheets.some((s) => s.properties.title === p.title)) throw new Error('A sheet with the name "' + p.title + '" already exists.');
                if (byId(p.sheetId)) throw new Error('addSheet: sheetId ' + p.sheetId + ' already exists.');
                const g = p.gridProperties || {};
                sheets.push({
                    properties: {
                        sheetId: p.sheetId, title: p.title, hidden: !!p.hidden,
                        gridProperties: { rowCount: g.rowCount || 1000, columnCount: g.columnCount || 26, frozenRowCount: g.frozenRowCount || 0 }
                    },
                    cells: []
                });
            } else if (kind === 'deleteSheet') {
                const i = sheets.findIndex((s) => s.properties.sheetId === r.sheetId);
                if (i < 0) throw new Error('No sheet with id: ' + r.sheetId);
                if (sheets.length === 1) throw new Error("You can't remove all the sheets in a document.");
                sheets.splice(i, 1);
            } else if (kind === 'appendDimension') {
                const s = byId(r.sheetId);
                if (!s) throw new Error('No grid with id: ' + r.sheetId);
                const key = r.dimension === 'ROWS' ? 'rowCount' : 'columnCount';
                s.properties.gridProperties[key] += r.length;
            } else if (kind === 'updateCells') {
                const range = r.range || {};
                const s = byId(range.sheetId);
                if (!s) throw new Error('No grid with id: ' + range.sheetId);
                if (r.fields !== 'userEnteredValue') throw new Error('Atrapa obsługuje tylko fields=userEnteredValue');
                const g = s.properties.gridProperties;
                const rows = r.rows || [];
                if (rows.length > g.rowCount) {
                    throw new Error('Attempting to write row: ' + rows.length + ', beyond the last requested row of: ' + g.rowCount);
                }
                // Zakres = cała zakładka → komórki spoza przesłanych danych są czyszczone.
                s.cells = rows.map((row) => {
                    const values = row.values || [];
                    if (values.length > g.columnCount) {
                        throw new Error('Attempting to write column: ' + values.length + ', beyond the last requested column of: ' + g.columnCount);
                    }
                    return values.map((c) => {
                        const v = c.userEnteredValue;
                        if (!v) return '';
                        if ('stringValue' in v) {
                            if (v.stringValue.length > 50000) throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.');
                            return v.stringValue;
                        }
                        if ('numberValue' in v) return v.numberValue;
                        throw new Error('Atrapa: nieobsługiwany typ wartości komórki');
                    });
                });
            } else if (kind === 'repeatCell' || kind === 'updateDimensionProperties') {
                const id = (r.range || {}).sheetId;
                if (!byId(id)) throw new Error('No grid with id: ' + id);
            } else {
                throw new Error('Atrapa nie zna żądania: ' + kind);
            }
        }
        spreadsheet.sheets = sheets;
    }

    /* ---------------- multipart (upload załącznika) ---------------- */
    function parseMultipart(buf, contentType) {
        const boundary = '--' + /boundary=(.*)$/.exec(contentType)[1];
        const text = buf.toString('latin1');
        const parts = text.split(boundary).slice(1, -1);
        let meta = {};
        let content = Buffer.alloc(0);
        for (const part of parts) {
            const split = part.indexOf('\r\n\r\n');
            const head = part.slice(0, split);
            const bodyLatin1 = part.slice(split + 4, part.length - 2);
            if (/name="metadata"/.test(head)) meta = JSON.parse(Buffer.from(bodyLatin1, 'latin1').toString('utf8'));
            else content = Buffer.from(bodyLatin1, 'latin1');
        }
        return { meta, content };
    }

    /* ---------------- router ---------------- */
    async function handle(req, res, url) {
        const p = url.pathname;
        const method = req.method;
        calls.push(method + ' ' + p);

        if (offline) { req.socket.destroy(); return; }
        if (failQueue.length) {
            const status = failQueue.shift();
            return fail(res, status, 'Wymuszony błąd testowy', status === 429 ? 'rateLimitExceeded' : 'backendError');
        }
        if (req.headers.authorization !== 'Bearer ' + token) return fail(res, 401, 'Invalid Credentials', 'authError');

        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks);
        const json = () => (raw.length ? JSON.parse(raw.toString('utf8')) : {});

        let m;
        if (p === '/drive/v3/about' && method === 'GET') {
            return send(res, 200, { user: { emailAddress: 'terapeuta@example.com' } });
        }
        if (p === '/drive/v3/files' && method === 'GET') {
            const q = url.searchParams.get('q') || '';
            let list;
            try { list = Array.from(files.values()).filter((f) => matches(f, q)); }
            catch (e) { return fail(res, 400, e.message); }
            return send(res, 200, { files: list.map(publicFile) });
        }
        if (p === '/drive/v3/files' && method === 'POST') {
            const meta = json();
            const f = {
                id: newId(meta.mimeType === FOLDER_MIME ? 'folder' : meta.mimeType === SHEET_MIME ? 'sheet' : 'file'),
                name: meta.name, mimeType: meta.mimeType, parents: meta.parents || [],
                appProperties: meta.appProperties || {}, trashed: false, createdTime: now(), modifiedTime: now()
            };
            if (f.mimeType === SHEET_MIME) {
                // Nowy arkusz Google ma jedną domyślną zakładkę.
                f.sheets = [{
                    properties: { sheetId: 0, title: 'Arkusz1', hidden: false, gridProperties: { rowCount: 1000, columnCount: 26, frozenRowCount: 0 } },
                    cells: []
                }];
            }
            files.set(f.id, f);
            return send(res, 200, { id: f.id });
        }
        if ((m = p.match(/^\/drive\/v3\/files\/([^/]+)$/))) {
            const f = files.get(decodeURIComponent(m[1]));
            if (!f) return fail(res, 404, 'File not found', 'notFound');
            if (method === 'PATCH') {
                const patch = json();
                if (patch.name != null) f.name = patch.name;
                if (patch.trashed != null) f.trashed = !!patch.trashed;
                if (patch.appProperties) f.appProperties = Object.assign({}, f.appProperties, patch.appProperties);
                f.modifiedTime = now();
                return send(res, 200, { id: f.id });
            }
            if (method === 'GET' && url.searchParams.get('alt') === 'media') return send(res, 200, f.content || Buffer.alloc(0));
        }
        if (p === '/upload/drive/v3/files' && method === 'POST') {
            const { meta, content } = parseMultipart(raw, req.headers['content-type'] || '');
            const f = {
                id: newId('file'), name: meta.name, mimeType: 'application/octet-stream', parents: meta.parents || [],
                appProperties: {}, trashed: false, createdTime: now(), modifiedTime: now(), content
            };
            files.set(f.id, f);
            return send(res, 200, { id: f.id, name: f.name });
        }
        if ((m = p.match(/^\/v4\/spreadsheets\/([^/:]+)(:batchUpdate)?$/))) {
            const f = files.get(decodeURIComponent(m[1]));
            if (!f || !f.sheets) return fail(res, 404, 'Requested entity was not found.', 'notFound');
            if (m[2] && method === 'POST') {
                try { applyBatch(f, json().requests || []); }
                catch (e) { return fail(res, 400, 'Invalid requests: ' + e.message); }
                f.modifiedTime = now();
                return send(res, 200, { spreadsheetId: f.id, replies: [] });
            }
            if (method === 'GET') return send(res, 200, { sheets: f.sheets.map((s) => ({ properties: s.properties })) });
        }
        if ((m = p.match(/^\/v4\/spreadsheets\/([^/]+)\/values\/(.+)$/)) && method === 'GET') {
            const f = files.get(decodeURIComponent(m[1]));
            if (!f || !f.sheets) return fail(res, 404, 'Requested entity was not found.', 'notFound');
            const range = decodeURIComponent(m[2]);
            const rm = range.match(/^'(.*)'!A2:A$/);
            if (!rm) return fail(res, 400, 'Atrapa obsługuje tylko zakres \'Zakładka\'!A2:A');
            const sheet = f.sheets.find((s) => s.properties.title === rm[1]);
            if (!sheet) return fail(res, 400, 'Unable to parse range: ' + range);
            const col = sheet.cells.slice(1).map((r) => r[0]);
            while (col.length && (col[col.length - 1] === '' || col[col.length - 1] == null)) col.pop();
            return send(res, 200, col.length ? { range, majorDimension: 'COLUMNS', values: [col] } : { range });
        }
        /* ---------------- Calendar v3 ---------------- */
        if (p === '/calendar/v3/calendars' && method === 'POST') {
            const body = json();
            if (!body.summary) return fail(res, 400, 'Missing summary');
            const cal = { id: 'cal' + (nextId++) + '@group.calendar.google.com', summary: body.summary, timeZone: body.timeZone || 'UTC', events: new Map() };
            calendars.set(cal.id, cal);
            return send(res, 200, { id: cal.id, summary: cal.summary, timeZone: cal.timeZone });
        }
        if (p === '/calendar/v3/freeBusy' && method === 'POST') {
            const body = json();
            const from = Date.parse(body.timeMin);
            const to = Date.parse(body.timeMax);
            if (!(from < to)) return fail(res, 400, 'Bad time range');
            const out = {};
            for (const item of (body.items || [])) {
                out[item.id] = item.id === 'primary'
                    ? { busy: primaryBusy.filter((b) => Date.parse(b.end) > from && Date.parse(b.start) < to) }
                    : { errors: [{ domain: 'global', reason: 'notFound' }] };
            }
            return send(res, 200, { kind: 'calendar#freeBusy', calendars: out });
        }
        if ((m = p.match(/^\/calendar\/v3\/calendars\/([^/]+)(?:\/events(?:\/([^/]+))?)?$/))) {
            const calId = decodeURIComponent(m[1]);
            // Zakres `calendar.app.created` nie daje dostępu do głównego kalendarza użytkownika.
            if (calId === 'primary') return fail(res, 403, 'Request had insufficient authentication scopes.', 'insufficientPermissions');
            const cal = calendars.get(calId);
            if (!cal) return fail(res, 404, 'Not Found', 'notFound');
            const isEvents = p.includes('/events');
            const eventId = m[2] ? decodeURIComponent(m[2]) : null;

            if (!isEvents && method === 'GET') return send(res, 200, { id: cal.id, summary: cal.summary, timeZone: cal.timeZone });

            const instant = (t) => (t.dateTime ? Date.parse(t.dateTime) : Date.parse(t.date + 'T00:00:00Z'));
            const validate = (ev) => {
                for (const side of ['start', 'end']) {
                    const t = ev[side];
                    if (!t || (!t.dateTime && !t.date)) throw new Error('Missing ' + side + ' time.');
                    if (t.dateTime && isNaN(Date.parse(t.dateTime))) throw new Error('Invalid ' + side + '.dateTime');
                    if (t.date && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) throw new Error('Invalid ' + side + '.date');
                }
                if (!!ev.start.date !== !!ev.end.date) throw new Error('Start and end must both be all-day or both timed.');
                if (!(instant(ev.end) > instant(ev.start))) throw new Error('The specified time range is empty.');
            };

            if (isEvents && !eventId && method === 'GET') {
                const from = Date.parse(url.searchParams.get('timeMin'));
                const to = Date.parse(url.searchParams.get('timeMax'));
                const items = Array.from(cal.events.values())
                    .filter((ev) => instant(ev.end) > from && instant(ev.start) < to)
                    .sort((a, b) => instant(a.start) - instant(b.start));
                return send(res, 200, { kind: 'calendar#events', items });
            }
            if (isEvents && !eventId && method === 'POST') {
                const ev = Object.assign({ status: 'confirmed' }, json(), { id: 'ev' + (nextId++) });
                try { validate(ev); } catch (e) { return fail(res, 400, e.message); }
                cal.events.set(ev.id, ev);
                return send(res, 200, ev);
            }
            if (isEvents && eventId) {
                const ev = cal.events.get(eventId);
                if (!ev) return fail(res, 404, 'Not Found', 'notFound');
                if (method === 'GET') return send(res, 200, ev);
                if (method === 'DELETE') { cal.events.delete(eventId); return send(res, 204, null); }
                if (method === 'PATCH') {
                    const body = json();
                    const next = Object.assign({}, ev, body);
                    if (body.extendedProperties && body.extendedProperties.private) {
                        next.extendedProperties = {
                            private: Object.assign({}, (ev.extendedProperties || {}).private, body.extendedProperties.private)
                        };
                    }
                    try { validate(next); } catch (e) { return fail(res, 400, e.message); }
                    cal.events.set(eventId, next);
                    return send(res, 200, next);
                }
            }
        }

        return fail(res, 404, 'Atrapa nie obsługuje: ' + method + ' ' + p, 'notFound');
    }

    return {
        /** Handler dla `startServer(root, routes)`: obsługuje ścieżki `/__gapi/...`. */
        routes(req, res) {
            if (!req.url.startsWith('/__gapi/')) return false;
            const url = new URL(req.url.slice('/__gapi'.length), 'http://mock');
            handle(req, res, url).catch((e) => { try { fail(res, 500, 'Błąd atrapy: ' + e.message); } catch (_) { /* */ } });
            return true;
        },

        // ---- narzędzia testu ----
        files,
        calls,
        calendars,
        setPrimaryBusy(list) { primaryBusy = list; },
        /** Wszystkie wydarzenia jedynego kalendarza aplikacji. */
        events() { const c = Array.from(calendars.values())[0]; return c ? Array.from(c.events.values()) : []; },
        failNext(...statuses) { failQueue = failQueue.concat(statuses); },
        setOffline(v) { offline = !!v; },
        find(predicate) { return Array.from(files.values()).filter((f) => !f.trashed).filter(predicate); },
        spreadsheets() { return this.find((f) => f.mimeType === SHEET_MIME); },
        /** Wiersze zakładki (z nagłówkiem), bez pustych wierszy na końcu. */
        tab(spreadsheetId, title) {
            const f = files.get(spreadsheetId);
            const s = f && f.sheets.find((x) => x.properties.title === title);
            return s ? s.cells : null;
        },
        tabTitles(spreadsheetId) {
            const f = files.get(spreadsheetId);
            return f ? f.sheets.map((s) => s.properties.title) : [];
        },
        /** Dokument pacjenta odczytany z zakładki `_dane` (tak, jak zrobi to aplikacja). */
        doc(spreadsheetId) {
            const rows = this.tab(spreadsheetId, '_dane') || [];
            return JSON.parse(rows.slice(1).map((r) => r[0]).join(''));
        }
    };
}
