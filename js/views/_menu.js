// ============================================================================
// _menu.js — konfiguracja globalnego menu bocznego.
//
// PR-J3 (2026-05-11): rozbudowa z 6 do 10 pozycji wg z2.jpg + z4.jpg
// (notatki klientki). Kolejność i nazwy 1:1 z `docs/REQUIREMENTS_2026-05-11.md`
// §1.4 (Wymaganie #6). „+ Nowa wizyta" jest dropdownem z 6 typami notatek
// (submenu, patrz `VISIT_TYPES` w `_fake-data.js`).
//
// PR-J11 (2026-05-11): usunięto pole `icon` — klientka jasno: bez emoji
// przy elementach menu. Pozycje renderowane są wyłącznie po `label`.
// Pozostawione: `cta` (styl CTA dla „+ Nowa wizyta") i `submenu` (rozwijane).
//
// PR-J14 (2026-05-14): dodane pole `short` — krótka etykieta wyświetlana
// w trybie `.psy-new-shell--form-mode` (sidebar zwężony do 56 px gdy
// jesteśmy w formularzu). Pełna etykieta `label` widoczna jako tooltip
// (atrybut `data-label` w renderowanym `<li>`).
//
// PR-J14c (2026-05-14): dodane pole `icon` (emoji) — wyświetlane w trybie
// wąskim form-mode ZAMIAST tekstu `short` (klientka: „menu zmniejszone ma
// być ikonami a nie tekstem - tekst na rozszerzonej wersji"). Sekcja 18
// `.clinerules` (bez emoji w menu) dotyczy TYLKO trybu pełnego — w form-mode
// ikony są dozwolone bo skróty tekstowe (HW/Leki/Param) są mało czytelne.
//
// 2026-10 (decyzja właściciela): pozycje od „Leki" do „Dokumenty" są wyłącznie
// WYCIĄGAMI Z WIZYT (patrz `view-extracts.js`). „Dane identyfikacyjne" zniknęły
// z menu — otwiera je kliknięcie w nazwisko pacjenta na górnym pasku
// (route `#/patient-data` został).
//
// Wszystkie pozycje są KONTEKSTOWE per wybrany pacjent. Dopóki pacjent nie jest
// wybrany, pozycje pozostają widoczne, ale kliknięcie przypomina o konieczności
// wyboru (via toast), a treść głównego obszaru pokazuje listę pacjentów.
// ============================================================================

export const APP_MENU = [
    // 1) + Nowa wizyta — z submenu (6 typów notatek), CTA wyróżnione w sidebarze
    {
        id: 'visit-new',
        label: '+ Nowa wizyta',
        short: '+',                // w trybie compact: ikona „+"
        icon: '➕',                 // w form-mode (PR-J14c): ikona zamiast tekstu
        route: '#/visit/new',      // klik główny = stary widok kafelkowy (back-compat)
        order: 1,
        cta: true,                 // styl CTA (niebieski)
        submenu: true              // _renderSidebar() rozwija/zwija listę typów
    },
    // 2) Historia wizyt
    { id: 'history',         label: 'Historia wizyt',        short: 'HW',    icon: '📅', route: '#/history',         order: 2 },
    // Kalendarz pacjenta — terminy tego pacjenta (dodane na prośbę właściciela, 2026-10)
    { id: 'patient-calendar', label: 'Kalendarz',            short: 'Kal',   icon: '🗓️', route: '#/patient-calendar', order: 2.5 },
    // 3) Leki
    { id: 'meds',            label: 'Leki',                  short: 'Leki',  icon: '💊', route: '#/meds',            order: 3 },
    // 4) Testy
    { id: 'tests',           label: 'Testy',                 short: 'Testy', icon: '🧪', route: '#/tests',           order: 4 },
    // 5) Zalecenia
    { id: 'recommendations', label: 'Zalecenia',             short: 'Zal',   icon: '📌', route: '#/recommendations', order: 5 },
    // 6) Plan leczenia
    { id: 'treatment-plan',  label: 'Plan leczenia',         short: 'Plan',  icon: '🎯', route: '#/treatment-plan',  order: 6 },
    // 7) Diagnozy
    { id: 'diagnoses',       label: 'Diagnozy',              short: 'Diag',  icon: '🏥', route: '#/diagnoses',       order: 7 },
    // 8) Parametry
    { id: 'parameters',      label: 'Parametry',             short: 'Param', icon: '📊', route: '#/parameters',      order: 8 },
    // 9) Dokumenty
    { id: 'documents',       label: 'Dokumenty',             short: 'Dok',   icon: '📁', route: '#/documents',       order: 9 }
];

// Domyślny hash po starcie aplikacji (gdy nie ma żadnego routa)
export const APP_DEFAULT_ROUTE = '#/calendar';

// Route „pacjenci" (ekran startowy — wybór pacjenta) nie pojawia się w menu,
// bo wybór robi się z topbara (search + dropdown). Ten route jest celem akcji
// „Zmień pacjenta".
export const APP_PATIENTS_ROUTE = '#/patients';
export const APP_SETTINGS_ROUTE = '#/settings';
