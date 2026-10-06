// ============================================================================
// tools/serve.mjs — lokalny serwer aplikacji (bez instalowania czegokolwiek).
//
//   node tools/serve.mjs          → http://localhost:8123
//   node tools/serve.mjs 9000     → http://localhost:9000
//
// Do logowania Google z tego adresu trzeba go dodać w konsoli Google Cloud
// (klient OAuth → „Authorized JavaScript origins"), np. http://localhost:8123.
// ============================================================================

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 8123;

try {
    const { origin } = await startServer(root, null, { port });
    console.log('PsychoApp: ' + origin + '   (Ctrl+C kończy)');
} catch (e) {
    console.error('Nie udało się uruchomić serwera na porcie ' + port + ': ' + (e && e.message || e));
    process.exit(1);
}
