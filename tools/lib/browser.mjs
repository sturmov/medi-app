// ============================================================================
// tools/lib/browser.mjs — serwer plików + sterowanie Chrome/Edge (headless)
// przez protokół DevTools. Bez zależności: wystarczy Node 22+ i zainstalowana
// przeglądarka Chrome albo Edge (ścieżkę można podać w CHROME_PATH).
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
    ].filter(Boolean);
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) throw new Error('Nie znaleziono Chrome/Edge. Ustaw zmienną CHROME_PATH.');
    return found;
}

/**
 * Serwer statyczny dla katalogu `root`. `routes(req, res)` może obsłużyć żądanie
 * samodzielnie (zwraca true) — tak podpinamy atrapę API Google pod ten sam adres.
 */
export async function startServer(root, routes, { port = 0, host = '127.0.0.1' } = {}) {
    const server = http.createServer((req, res) => {
        if (routes && routes(req, res)) return;
        const p = decodeURIComponent(req.url.split('?')[0]);
        const file = path.join(root, p === '/' ? 'index.html' : p);
        fs.readFile(file, (err, buf) => {
            if (err) { res.writeHead(404); res.end('not found'); return; }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(buf);
        });
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
    return { server, origin: 'http://' + (host === '127.0.0.1' && port ? 'localhost' : host) + ':' + server.address().port };
}

export async function launchBrowser({ width = 1366, height = 768 } = {}) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-smoke-'));
    const port = 9400 + Math.floor(Math.random() * 400);
    const proc = spawn(findBrowser(), [
        '--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
        '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        '--window-size=' + width + ',' + height, 'about:blank'
    ], { stdio: 'ignore' });

    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
        await sleep(150);
        try {
            const list = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
            target = list.find((t) => t.type === 'page');
        } catch (_) { /* jeszcze nie wstał */ }
    }
    if (!target) { proc.kill(); throw new Error('Przeglądarka nie wystartowała.'); }

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });

    let seq = 0;
    const pending = new Map();
    const problems = [];     // błędy konsoli i nieobsłużone wyjątki strony
    const dialogs = [];

    const send = (method, params = {}) => new Promise((resolve) => {
        const id = ++seq;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
    });

    ws.addEventListener('message', (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            problems.push('WYJĄTEK: ' + ((d.exception && d.exception.description) || d.text));
        } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            problems.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
        } else if (m.method === 'Page.javascriptDialogOpening') {
            // window.confirm / prompt / beforeunload — akceptujemy i notujemy.
            dialogs.push({ type: m.params.type, message: m.params.message });
            send('Page.handleJavaScriptDialog', { accept: true, promptText: m.params.defaultPrompt || '' });
        }
    });

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

    /** Wykonuje kod w stronie (ciało funkcji async) i zwraca wynik. */
    async function evaluate(body) {
        const r = await send('Runtime.evaluate', {
            expression: '(async () => {' + body + '\n})()', awaitPromise: true, returnByValue: true
        });
        const res = r.result || {};
        if (res.exceptionDetails) {
            const d = res.exceptionDetails;
            throw new Error('Błąd w stronie: ' + ((d.exception && d.exception.description) || d.text));
        }
        return res.result ? res.result.value : undefined;
    }

    /** Prawdziwe kliknięcie myszą w środek elementu (z fokusem, pointerdown itd.). */
    async function click(selectorOrExpr) {
        const expr = selectorOrExpr.trim().startsWith('document') || selectorOrExpr.includes('(')
            ? selectorOrExpr
            : 'document.querySelector(' + JSON.stringify(selectorOrExpr) + ')';
        const pt = await evaluate(`
            const node = ${expr};
            if (!node) return null;
            node.scrollIntoView({ block: 'center', inline: 'nearest' });
            // Czekamy, aż element przestanie się ruszać — animacja wejścia okna albo
            // doładowanie czcionek potrafi przesunąć przycisk tuż po pierwszym
            // wyrysowaniu, a kliknięcie trafiłoby wtedy obok. Wymagamy kilku
            // kolejnych klatek bez ruchu i tego, żeby pod punktem był właśnie ten element.
            try { await document.fonts.ready; } catch (_) { /* */ }
            let b = node.getBoundingClientRect();
            let calm = 0;
            for (let i = 0; i < 90 && calm < 6; i++) {
                await new Promise((r) => requestAnimationFrame(() => r()));
                const next = node.getBoundingClientRect();
                const still = Math.abs(next.left - b.left) < 0.5 && Math.abs(next.top - b.top) < 0.5
                    && Math.abs(next.height - b.height) < 0.5;
                b = next;
                const hit = document.elementFromPoint(b.left + Math.min(b.width / 2, 40), b.top + b.height / 2);
                calm = still && hit && (hit === node || node.contains(hit) || hit.contains(node)) ? calm + 1 : 0;
            }
            return { x: b.left + Math.min(b.width / 2, 40), y: b.top + b.height / 2 };`);
        if (!pt) throw new Error('Brak elementu do kliknięcia: ' + selectorOrExpr);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    }

    /** Kliknięcie w konkretny punkt okna (gdy liczy się miejsce w elemencie, np. górna część wiersza godziny). */
    async function clickAt(pt) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    }

    /** Przeciągnięcie myszą między dwoma punktami okna (np. przeniesienie terminu w kalendarzu). */
    async function drag(from, to) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
            await send('Input.dispatchMouseEvent', {
                type: 'mouseMoved', button: 'left', buttons: 1,
                x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps
            });
            await sleep(30);
        }
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
    }

    /** Wpisuje tekst w aktualnie sfokusowane pole (jak klawiatura). */
    const type = (text) => send('Input.insertText', { text });

    async function key(name) {
        const codes = { Tab: 9, Enter: 13, Escape: 27, ArrowDown: 40 };
        const base = { key: name, code: name, windowsVirtualKeyCode: codes[name], nativeVirtualKeyCode: codes[name] };
        await send('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, base));
        await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
    }

    async function screenshot(file) {
        const r = await send('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    }

    return {
        send, evaluate, click, clickAt, drag, type, key, screenshot, problems, dialogs,
        navigate: async (url) => { await send('Page.navigate', { url }); },
        reload: async () => { await send('Page.reload', { ignoreCache: true }); },
        onNewDocument: (source) => send('Page.addScriptToEvaluateOnNewDocument', { source }),
        async close() {
            try { ws.close(); } catch (_) { /* */ }
            proc.kill();
            await sleep(300);
            try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* profil bywa chwilę zablokowany */ }
        }
    };
}
