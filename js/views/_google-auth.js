// ============================================================================
// _google-auth.js — jedno logowanie Google dla całej aplikacji (Dysk + Kalendarz)
// oraz wspólna funkcja wywołań API.
//
// Logowanie: Google Identity Services — okienko Google, bez haseł w aplikacji.
// Token dostępu jest ważny ~1 h; gdy wygaśnie, aplikacja prosi o nowy (zwykle
// bez pytań — okienko tylko mignie).
//
// ODŚWIEŻENIE STRONY (F5) nie wymaga logowania: token leży w `sessionStorage`
// tej karty — znika z jej zamknięciem i nigdy nie trafia do `localStorage`.
// Google nie pozwala aplikacji bez serwera odnowić tokenu bez okienka, więc po
// godzinie albo w nowej karcie potrzebne jest jedno kliknięcie.
//
// ZGODY PROSIMY PO JEDNEJ. Gdy aplikacja prosi o kilka zgód naraz, Google
// pokazuje pola wyboru, które są domyślnie ODZNACZONE — łatwo kliknąć „Dalej"
// i zostać bez kalendarza. Dlatego:
//   1) przy łączeniu z Dyskiem prosimy tylko o Dysk (wymagane),
//   2) Kalendarz i „zajęte" włącza się osobnym przyciskiem (`enable(scope)`):
//      jedna prośba = jedna nowa zgoda, a token obejmuje też wcześniejsze,
//   3) zgody udzielone wcześniej pamiętamy w tej przeglądarce i przy kolejnych
//      logowaniach prosimy o nie od razu (Google już o nic nie pyta).
// ============================================================================

import { getGoogleClientId, GOOGLE_SCOPES } from './_config.js';
import { StorageError } from './_storage-errors.js';

const OPTIONAL_SCOPES = [GOOGLE_SCOPES.calendar, GOOGLE_SCOPES.freebusy];
const ALL_SCOPES = [GOOGLE_SCOPES.drive, ...OPTIONAL_SCOPES];
const LS_EXTRAS = 'psy-new:googleExtras';
const LS_DECLINED = 'psy-new:googleDeclined';
const SS_SESSION = 'psy-new:googleSession';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Test automatyczny podstawia atrapę API i „konto Google":
 * `window.__PSY_TEST_GDRIVE__ = { base, token, authFail?, grant?(zakresy, { consent }) → zakresy tokenu }`.
 */
function testConfig() {
    const t = (typeof window !== 'undefined' && window.__PSY_TEST_GDRIVE__) || null;
    return t && t.base ? t : null;
}

/* ---------------- zgody dodatkowe zapamiętane w tej przeglądarce ---------------- */
function readScopes(key) {
    let raw = '';
    try { raw = window.localStorage.getItem(key) || ''; } catch (_) { /* */ }
    const saved = raw.split(' ').filter(Boolean);
    return OPTIONAL_SCOPES.filter((s) => saved.includes(s));
}
function writeScopes(key, list) {
    try {
        if (list.length) window.localStorage.setItem(key, list.join(' '));
        else window.localStorage.removeItem(key);
    } catch (_) { /* */ }
}
const rememberedExtras = () => readScopes(LS_EXTRAS);
const saveExtras = (list) => writeScopes(LS_EXTRAS, list);

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
function authError(reason) {
    const e = new StorageError('auth', authMessage(reason));
    e.reason = reason || '';
    return e;
}

let token = null;
let expiresAt = 0;
let granted = new Set();
let client = null;
let onToken = null;
let onError = null;
let refreshing = null;
let queue = Promise.resolve();      // okienko Google jest jedno — prośby idą po kolei
let loginHint = '';
const enableTries = new Map();      // zakres → ile razy użytkownik próbował go włączyć

const tokenValid = () => !!token && Date.now() < expiresAt - 60 * 1000;

/* ---------------- sesja tej karty (przetrwa F5, nie przetrwa zamknięcia karty) ---------------- */
function saveSession() {
    try {
        if (token) window.sessionStorage.setItem(SS_SESSION, JSON.stringify({ token, expiresAt, scopes: Array.from(granted) }));
        else window.sessionStorage.removeItem(SS_SESSION);
    } catch (_) { /* */ }
}
function forgetToken() {
    token = null;
    expiresAt = 0;
    saveSession();
}
function loadSession() {
    let saved = null;
    try { saved = JSON.parse(window.sessionStorage.getItem(SS_SESSION) || 'null'); } catch (_) { /* */ }
    if (!saved || typeof saved.token !== 'string' || !Array.isArray(saved.scopes)) return false;
    token = saved.token;
    expiresAt = Number(saved.expiresAt) || 0;
    if (!tokenValid() || !saved.scopes.includes(GOOGLE_SCOPES.drive)) {
        forgetToken();
        return false;
    }
    granted = new Set(ALL_SCOPES.filter((s) => saved.scopes.includes(s)));
    return true;
}

const serial = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
};

/**
 * Jedna prośba do Google. Niczego nie zapamiętuje — zwraca, co Google odpowiedział.
 * @param {string[]} scopes — o co prosimy
 * @param {{ consent?: boolean }} opts — consent: pokaż ekran zgody nawet, gdy Google uznałby go za zbędny
 * @returns {Promise<{ accessToken: string, expiresIn: number, scopes: string[] }>} scopes = co obejmuje token
 */
async function ask(scopes, { consent = false } = {}) {
    const test = testConfig();
    if (test) {
        if (test.authFail) throw authError('popup_failed_to_open');
        const covered = typeof test.grant === 'function' ? test.grant(scopes.slice(), { consent }) : scopes;
        return { accessToken: test.token || 'test-token', expiresIn: 3600, scopes: covered };
    }

    await loadGoogleIdentity();
    const oauth2 = window.google.accounts.oauth2;
    if (!client) {
        client = oauth2.initTokenClient({
            client_id: getGoogleClientId(),
            scope: GOOGLE_SCOPES.drive,         // właściwy zakres podajemy przy każdej prośbie
            callback: (resp) => { if (onToken) onToken(resp); },
            error_callback: (err) => { if (onError) onError(err); }
        });
    }
    return new Promise((resolve, reject) => {
        onToken = (resp) => {
            if (!resp || resp.error || !resp.access_token) {
                reject(authError(resp && resp.error));
                return;
            }
            const listed = String(resp.scope || '').split(' ').filter(Boolean);
            const has = (scope) => listed.includes(scope)
                || (typeof oauth2.hasGrantedAnyScope === 'function' && oauth2.hasGrantedAnyScope(resp, scope));
            resolve({ accessToken: resp.access_token, expiresIn: Number(resp.expires_in) || 3600, scopes: ALL_SCOPES.filter(has) });
        };
        onError = (err) => reject(authError(err && err.type));
        client.requestAccessToken({
            scope: scopes.join(' '),
            // '' = Google pyta tylko o to, na co jeszcze nie ma zgody (a gdy ma wszystko — o nic)
            prompt: consent ? 'consent' : '',
            include_granted_scopes: true,       // token obejmuje też zgody udzielone wcześniej
            login_hint: loginHint || undefined
        });
    });
}

/** Przyjmuje token: od teraz to on i jego zgody obowiązują. */
function adopt(answer) {
    token = answer.accessToken;
    expiresAt = Date.now() + answer.expiresIn * 1000;
    granted = new Set(ALL_SCOPES.filter((s) => answer.scopes.includes(s)));
    // Pamiętamy dokładnie to, co Google przyznał — o cofniętą zgodę nie prosimy przy każdym logowaniu.
    saveExtras(OPTIONAL_SCOPES.filter((s) => granted.has(s)));
    writeScopes(LS_DECLINED, readScopes(LS_DECLINED).filter((s) => !granted.has(s)));
    saveSession();
    console.info('[google] zgody: ' + ALL_SCOPES.map((s) => s.split('/').pop() + (granted.has(s) ? ' ✓' : ' ✗')).join(', '));
}

export const googleAuth = {
    /**
     * Po odświeżeniu strony: podejmuje sesję tej karty, jeśli jej token jest jeszcze
     * ważny. Nie otwiera okienka Google. → czy jest token, na którym można pracować
     */
    resume() {
        return tokenValid() || loadSession();
    },

    /** Ważny token; gdy wygasł — prosi Google o nowy (Dysk + zgody udzielone wcześniej). */
    getToken() {
        if (tokenValid()) return Promise.resolve(token);
        if (!refreshing) {
            refreshing = serial(async () => {
                const answer = await ask([GOOGLE_SCOPES.drive, ...rememberedExtras()]);
                if (!answer.scopes.includes(GOOGLE_SCOPES.drive)) throw authError('access_denied');
                adopt(answer);
                return token;
            }).finally(() => { refreshing = null; });
        }
        return refreshing;
    },

    /**
     * Włącza jedną dodatkową zgodę (Kalendarz albo „zajęte"). Musi być wywołane
     * z kliknięcia użytkownika — otwiera okienko Google z prośbą o tę jedną zgodę.
     * @returns {Promise<boolean>} czy Google ją przyznał (false = użytkownik odmówił)
     * @throws {StorageError} gdy okienko się nie otworzyło albo zostało zamknięte
     */
    async enable(scope) {
        if (granted.has(scope)) {
            // Zgoda już jest — wystarczy ważny token (to kliknięcie pozwala go odnowić).
            await this.getToken();
            if (granted.has(scope)) return true;
        }
        // Pierwsza próba: zwykła prośba (jeśli zgoda była już kiedyś udzielona, okienko tylko mignie).
        // Kolejne: wymuszamy ekran zgody — na wypadek, gdyby Google nie pokazał go sam.
        const tries = enableTries.get(scope) || 0;
        enableTries.set(scope, tries + 1);
        let answer;
        try {
            answer = await serial(() => ask([scope], { consent: tries > 0 }));
        } catch (e) {
            if (e && e.reason === 'access_denied') return false;
            throw e;
        }
        if (!answer.scopes.includes(scope)) return false;
        if (answer.scopes.includes(GOOGLE_SCOPES.drive)) {
            adopt(answer);
        } else {
            // Token tylko na nową zgodę (Google nie dołączył wcześniejszych): zapamiętujemy ją,
            // a pełny token aplikacja pobierze przy najbliższym wywołaniu.
            const remembered = rememberedExtras();
            saveExtras(OPTIONAL_SCOPES.filter((s) => s === scope || remembered.includes(s)));
            granted.add(scope);
            forgetToken();
        }
        return true;
    },

    /** API odpowiedziało, że token nie obejmuje tej zgody — przestajemy na nią liczyć. */
    dropScope(scope) {
        granted.delete(scope);
        saveExtras(rememberedExtras().filter((s) => s !== scope));
        saveSession();
    },

    /**
     * Użytkownik nie chce teraz tej zgody: nie proponujemy jej przy każdym łączeniu
     * (włączyć da się ją zawsze — przyciskiem przy kalendarzu albo w Ustawieniach).
     */
    decline(scope) {
        writeScopes(LS_DECLINED, OPTIONAL_SCOPES.filter((s) => s === scope || readScopes(LS_DECLINED).includes(s)));
    },
    isDeclined(scope) { return readScopes(LS_DECLINED).includes(scope); },

    invalidate() { forgetToken(); },
    setLoginHint(email) { loginHint = email || ''; },
    /** Czy użytkownik udzielił danej zgody (znane dopiero po zalogowaniu). */
    hasScope(scope) { return granted.has(scope); },
    isSignedIn() { return tokenValid(); },
    signOut() {
        const t = token;
        granted = new Set();
        forgetToken();
        enableTries.clear();
        saveExtras([]);         // cofnięcie dostępu kasuje w Google wszystkie zgody — następnym razem od nowa
        writeScopes(LS_DECLINED, []);
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
 * @param {object} opts — { json?, body?, headers?, expect?: 'blob', reauth?: false }
 *        reauth: false — odrzucony token (401) to od razu błąd, bez okienka Google
 *        (przy wznawianiu sesji po odświeżeniu strony nie ma kliknięcia, które pozwala je otworzyć)
 * @throws {StorageError} code: 'auth' | 'offline' | 'io'; `status` = kod HTTP, `reason` = powód podany przez Google
 */
export async function googleCall(method, url, opts = {}, attempt = 0, reauthed = opts.reauth === false) {
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
        e.reason = reason;
        throw e;
    }

    if (opts.expect === 'blob') return res.blob();
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
}
