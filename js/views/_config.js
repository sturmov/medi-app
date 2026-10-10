// ============================================================================
// _config.js — ustawienia integracji (Google).
//
// Identyfikator klienta OAuth jest JAWNY z natury (widać go w każdym adresie
// logowania Google) — to nie jest sekret. Sekretu klienta (`client_secret`)
// aplikacja nie potrzebuje i NIGDY nie może go zawierać: logowanie odbywa się
// w przeglądarce terapeuty, a token dostępu żyje tylko w pamięci karty.
// ============================================================================

const LS_CLIENT_ID = 'psy-new:googleClientId';

/** Domyślny klient OAuth (projekt Google Cloud właściciela aplikacji). */
export const DEFAULT_GOOGLE_CLIENT_ID =
    '1063412397649-vkie8h726ckit3hcdbhk8ce8bfc8dor5.apps.googleusercontent.com';

/**
 * Zgody Google, o które prosi aplikacja:
 *   drive     — `drive.file`: WYŁĄCZNIE pliki utworzone przez tę aplikację
 *               (folder pacjentów, arkusze, załączniki); bez wglądu w resztę Dysku.
 *   calendar  — `calendar.app.created`: WYŁĄCZNIE kalendarz założony przez tę
 *               aplikację („PsychoApp — wizyty"); bez wglądu w prywatne kalendarze.
 *   freebusy  — `calendar.freebusy`: tylko informacja zajęte / wolne w głównym
 *               kalendarzu terapeuty (bez tytułów wydarzeń).
 */
export const GOOGLE_SCOPES = {
    drive: 'https://www.googleapis.com/auth/drive.file',
    calendar: 'https://www.googleapis.com/auth/calendar.app.created',
    freebusy: 'https://www.googleapis.com/auth/calendar.freebusy'
};

/** Nazwa folderu głównego zakładanego na Dysku przy pierwszym połączeniu. */
export const DRIVE_ROOT_FOLDER_NAME = 'pacjenci';

export function getGoogleClientId() {
    try {
        const custom = window.localStorage.getItem(LS_CLIENT_ID);
        if (custom && custom.trim()) return custom.trim();
    } catch (_) { /* */ }
    return DEFAULT_GOOGLE_CLIENT_ID;
}

export function setGoogleClientId(value) {
    try {
        const v = String(value || '').trim();
        if (v && v !== DEFAULT_GOOGLE_CLIENT_ID) window.localStorage.setItem(LS_CLIENT_ID, v);
        else window.localStorage.removeItem(LS_CLIENT_ID);
    } catch (_) { /* */ }
}

/**
 * Adresy API Google. Test automatyczny (tools/smoke-test.mjs) podstawia tu
 * lokalną atrapę przez `window.__PSY_TEST_GDRIVE__ = { base, token }` (patrz też `_google-auth.js`).
 */
export function googleEndpoints() {
    const test = (typeof window !== 'undefined' && window.__PSY_TEST_GDRIVE__) || null;
    if (test && test.base) {
        return {
            drive: test.base + '/drive/v3',
            upload: test.base + '/upload/drive/v3',
            sheets: test.base + '/v4/spreadsheets',
            calendar: test.base + '/calendar/v3'
        };
    }
    return {
        drive: 'https://www.googleapis.com/drive/v3',
        upload: 'https://www.googleapis.com/upload/drive/v3',
        sheets: 'https://sheets.googleapis.com/v4/spreadsheets',
        calendar: 'https://www.googleapis.com/calendar/v3'
    };
}
