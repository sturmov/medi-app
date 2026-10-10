// ============================================================================
// tools/stamp.mjs — znaczniki wersji plików w index.html.
//
//   node tools/stamp.mjs           → wpisuje aktualne znaczniki
//   node tools/stamp.mjs --check   → tylko sprawdza (kod wyjścia 1, gdy nieaktualne)
//
// PO CO. GitHub Pages pozwala przeglądarce trzymać każdy plik 10 minut bez
// pytania serwera, a zwykłe odświeżenie (F5) sprawdza tylko sam index.html.
// Bez znaczników po wdrożeniu przeglądarka składała aplikację z nowych i starych
// plików naraz (np. nowy CSS + stary moduł JS = nowy układ bez nowego pola).
//
// JAK. Każdy plik dostaje w adresie odcisk swojej TREŚCI (`plik.js?v=3f9a…`).
// Zmieniony plik ma więc nowy adres, którego żadna pamięć podręczna nie zna,
// a niezmieniony — ten sam, więc nie jest pobierany ponownie.
//   • arkusze stylów i skrypty wymienione w index.html: `?v=` w `href` / `src`,
//   • moduły importowane przez inne moduły (`import './x.js'`): mapa importów
//     (`<script type="importmap">`) między znacznikami `stamp:importmap` —
//     przeglądarka podmienia adres każdego importu na ten z odciskiem.
//
// KIEDY. Po każdej zmianie w `js/` lub `css/`, przed zatwierdzeniem zmian.
// `tools/smoke-test.mjs` zaczyna od `--check` i nie przejdzie z nieaktualnymi
// znacznikami. Znaczników nie edytuje się ręcznie.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.html');
const MAP_START = '<!-- stamp:importmap:start -->';
const MAP_END = '<!-- stamp:importmap:end -->';

/** Odcisk treści pliku. Końce linii są ujednolicane, żeby wynik nie zależał od systemu (CRLF / LF). */
function fingerprint(relPath) {
    const text = fs.readFileSync(path.join(ROOT, relPath), 'utf8').replace(/\r\n/g, '\n');
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 10);
}

function walk(dir) {
    const out = [];
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = dir + '/' + entry.name;
        if (entry.isDirectory()) out.push(...walk(rel));
        else if (entry.name.endsWith('.js')) out.push(rel);
    }
    return out;
}

/** index.html z aktualnymi znacznikami (końce linii jak w `html`). */
export function stamped(html) {
    const eol = html.includes('\r\n') ? '\r\n' : '\n';
    let out = html.replace(/\r\n/g, '\n');

    // 1) pliki wymienione wprost w index.html
    out = out.replace(/\b(href|src)="((?:css|js|lib)\/[^"?#]+\.(?:css|js))(?:\?v=[^"]*)?"/g,
        (whole, attr, file) => attr + '="' + file + '?v=' + fingerprint(file) + '"');

    // 2) moduły importowane przez inne moduły
    const a = out.indexOf(MAP_START);
    const b = out.indexOf(MAP_END);
    if (a < 0 || b < a) throw new Error('W index.html brakuje znaczników ' + MAP_START + ' … ' + MAP_END);
    const imports = {};
    for (const file of walk('js').sort()) imports['./' + file] = './' + file + '?v=' + fingerprint(file);
    const indent = '    ';
    const block = [
        MAP_START,
        '<script type="importmap">',
        JSON.stringify({ imports }, null, 4),
        '</script>'
    ].join('\n').split('\n').map((line, i) => (i ? indent : '') + line).join('\n');
    out = out.slice(0, a) + block + '\n' + indent + out.slice(b);

    return eol === '\n' ? out : out.replace(/\n/g, eol);
}

/** @returns {{ current: boolean, html: string }} */
export function checkStamp() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const want = stamped(html);
    return { current: want === html, html: want };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const { current, html } = checkStamp();
    if (process.argv.includes('--check')) {
        console.log(current
            ? 'Znaczniki wersji w index.html są aktualne.'
            : 'Znaczniki wersji w index.html są NIEAKTUALNE — uruchom: node tools/stamp.mjs');
        process.exit(current ? 0 : 1);
    }
    if (!current) fs.writeFileSync(INDEX, html);
    console.log(current ? 'Znaczniki wersji bez zmian.' : 'Zaktualizowano znaczniki wersji w index.html.');
}
