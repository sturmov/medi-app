// ============================================================================
// _google-auth.js — jedno logowanie Google dla całej aplikacji (Dysk + Kalendarz)
// oraz wspólna funkcja wywołań API.
//
// Logowanie: Google Identity Services — okienko Google, bez haseł w aplikacji.
// Token dostępu żyje wyłącznie w pamięci karty (~1 h); gdy wygaśnie, aplikacja
// prosi o nowy (zwykle bez pytań — okienko tylko mignie).
//
// Zgody są proszone razem, ale tylko Dysk jest WYMAGANY. Kalendarz i informacja
// „zajęte" są opcjonalne: bez nich aplikacja działa, a strona kalendarza
// pokazuje przycisk „Nadaj dostęp".
// ============================================================================

import { getGoogleClientId, GOOGLE_SCOPES } from './_config.js';
import { StorageError } from './_storage-errors.js';

const ALL_SCOPES = [GOOGLE_SCOPES.drive, GOOGLE_SCOPES.calendar, GOOGLE_SCOPES.freebusy];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Test automatyczny podstawia atrapę API: `window.__PSY_TEST_GDRIVE__ = { base, token, scopes?, authFail? }`. */
function testConfig() {
    const t = (typeof window !== 'undefined' && window.__PSY_TEST_GDRIVE__) || null;
    return t && t.base ? t : null;
}

let gisLoading = null;
function loadGoogleIdentity() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (!gisLoading) {
        gisLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => {
                gisLoading = null;
                reject(new StorageError('offline', 'Nie udało się załadować logowania Google — sprawdź połączenie z internetem.'));
            };
            document.head.appendChild(s);
        });
    }
    return gisLoading;
}

function authMessage(reason) {
    switch (reason) {
        case 'popup_failed_to_open':
            return 'Przeglądarka zablokowała okienko logowania Google. Kliknij „Połącz ponownie".';
        case 'popup_closed':
            return 'Okienko logowania Google zostało zamknięte przed zakończeniem. '
                + 'Jeśli pokazało błąd 400 (origin_mismatch), adres tej aplikacji trzeba dodać w konsoli Google '
                + 'do „Authorized JavaScript origins".';
        case 'access_denied':
            return 'Nie udzielono zgody na dostęp do plików aplikacji na Dysku Google.';
        default:
            return 'Logowanie do Google nie powiodło się' + (reason ? ' (' + reason + ').' : '.');
    }
}

let token = null;
let expiresAt = 0;
let granted = new Set();
let client = null;
let onToken = null;
let onError = null;
let inflight = null;
let loginHint = '';

async function request() {
    const test = testConfig();
    if (test) {
        if (test.authFail) throw new StorageError('auth', authMessage('popup_failed_to_open'));
        token = test.token || 'test-token';
        expiresAt = Date.now() + 3600 * 1000;
        granted = new Set(test.scopes || ALL_SCOPES);
        return token;
    }

    await loadGoogleIdentity();
    const oauth2 = window.google.accounts.oauth2;
    if (!client) {
        client = oauth2.initTokenClient({
            client_id: getGoogleClientId(),
            scope: ALL_SCOPES.join(' '),
            callback: (resp) => { if (onToken) onToken(resp); },
            error_callback: (err) => { if (onError) onError(err); }
        });
    }
    return new Promise((resolve, reject) => {
        onToken = (resp) => {
            if (!resp || resp.error || !resp.access_token) {
                reject(new StorageError('auth', authMessage(resp && resp.error)));
                return;
            }
            // Użytkownik może odznaczyć część zgód w okienku Google.
            const listed = new Set(String(resp.scope || '').split(/\s+/).filter(Boolean));
            const has = (scope) => (typeof oauth2.hasGrantedAnyScope === 'function'
                ? oauth2.hasGrantedAnyScope(resp, scope)
                : listed.has(scope));
            const now = new Set(ALL_SCOPES.filter(has));
            if (!now.has(GOOGLE_SCOPES.drive)) {
                reject(new StorageError('auth', authMessage('access_denied')));
                return;
            }
            granted = now;
            token = resp.access_token;
            expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
            resolve(token);
        };
        onError = (err) => reject(new StorageError('auth', authMessage(err && err.type)));
        // prompt '' = okienko pyta tylko wtedy, gdy to konieczne (pierwsza zgoda / nowe uprawnienie).
        client.requestAccessToken({ prompt: '', login_hint: loginHint || undefined });
    });
}

export const googleAuth = {
    /** Ważny token; gdy wygasł — prosi Google o nowy (może otworzyć okienko). */
    getToken() {
        if (token && Date.now() < expiresAt - 60 * 1000) return Promise.resolve(token);
        if (!inflight) inflight = request().finally(() => { inflight = null; });
        return inflight;
    },
    invalidate() { token = null; expiresAt = 0; },
    setLoginHint(email) { loginHint = email || ''; },
    /** Czy użytkownik udzielił danej zgody (znane dopiero po zalogowaniu). */
    hasScope(scope) { return granted.has(scope); },
    isSignedIn() { return !!token; },
    signOut() {
        const t = token;
        token = null; expiresAt = 0; granted = new Set();
        try {
            if (t && !testConfig() && window.google && window.google.accounts) {
                window.google.accounts.oauth2.revoke(t, () => {});
            }
        } catch (_) { /* */ }
    }
};

/**
 * Wywołanie API Google z tokenem. Sama odnawia wygasły token (raz na żądanie)
 * i ponawia przy przeciążeniu / błędzie serwera (z rosnącą przerwą).
 *
 * @param {object} opts — { json?, body?, headers?, expect?: 'blob' }
 * @throws {StorageError} code: 'auth' | 'offline' | 'io'; `status` = kod HTTP
 */
export async function googleCall(method, url, opts = {}, attempt = 0, reauthed = false) {
    const accessToken = await googleAuth.getToken();
    const headers = Object.assign({ Authorization: 'Bearer ' + accessToken }, opts.headers || {});
    let body = opts.body;
    if (opts.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(opts.json);
    }
    let res;
    try {
        res = await fetch(url, { method, headers, body });
    } catch (e) {
        throw new StorageError('offline', 'Brak połączenia z Google — zmiany czekają na wysłanie.');
    }

    if (res.status === 401) {
        googleAuth.invalidate();
        if (!reauthed) return googleCall(method, url, opts, attempt, true);
        throw new StorageError('auth', 'Sesja Google wygasła.');
    }

    if (!res.ok) {
        let message = '';
        let reason = '';
        try {
            const err = (await res.json()).error || {};
            message = err.message || '';
            reason = (err.errors && err.errors[0] && err.errors[0].reason) || err.status || '';
        } catch (_) { /* odpowiedź bez JSON */ }
        const rateLimited = res.status === 429
            || /rateLimitExceeded|userRateLimitExceeded|RESOURCE_EXHAUSTED/.test(reason);
        if ((rateLimited || res.status >= 500) && attempt < 4) {
            await sleep(700 * Math.pow(2, attempt) + Math.random() * 300);
            return googleCall(method, url, opts, attempt + 1, reauthed);
        }
        const e = new StorageError(res.status >= 500 || rateLimited ? 'offline' : 'io',
            'Google (' + res.status + '): ' + (message || res.statusText || 'błąd'));
        e.status = res.status;
        throw e;
    }

    if (opts.expect === 'blob') return res.blob();
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}
