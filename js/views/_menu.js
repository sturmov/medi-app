// ============================================================================
// _menu.js — konfiguracja globalnego menu bocznego (6 pozycji wg rysunku Magdy).
//
// Wszystkie pozycje są KONTEKSTOWE per wybrany pacjent. Dopóki pacjent nie jest
// wybrany, pozycje pozostają widoczne, ale kliknięcie przypomina o konieczności
// wyboru (via toast), a treść głównego obszaru pokazuje listę pacjentów.
// ============================================================================

export const APP_MENU = [
    { id: 'history',         label: 'Historia wizyt', icon: '🗓️', route: '#/history',         order: 1 },
    { id: 'meds',            label: 'Leki',           icon: '💊', route: '#/meds',            order: 2 },
    { id: 'diagnoses',       label: 'Diagnozy',       icon: '🏥', route: '#/diagnoses',       order: 3 },
    { id: 'recommendations', label: 'Zalecenia',      icon: '📋', route: '#/recommendations', order: 4 },
    { id: 'tests',           label: 'Testy',          icon: '📊', route: '#/tests',           order: 5 },
    {
        id: 'visit-new',
        label: '+ NOWA WIZYTA',
        icon: '➕',
        route: '#/visit/new',
        order: 6,
        cta: true   // wyróżnione CTA (styl inny)
    }
];

// Domyślny hash po starcie aplikacji (gdy nie ma żadnego routa)
export const APP_DEFAULT_ROUTE = '#/patients';

// Route „pacjenci" (ekran startowy — wybór pacjenta) nie pojawia się w menu,
// bo wybór robi się z topbara (search + dropdown). Ten route jest celem akcji
// „Zmień pacjenta".
export const APP_PATIENTS_ROUTE = '#/patients';
export const APP_SETTINGS_ROUTE = '#/settings';
