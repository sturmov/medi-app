# Cline Rules — PsychoApp

## 1) Architecture rules
- Build UI in a modular way using **Lit** Web Components (`psy-*` components).
- Reusable UI elements (button, label, field, panel/card, checkbox, select, textarea, view header) must be implemented as base components in `js/components/`.
- Prefer composition of base components over copy-pasting raw HTML blocks.
- Migrate incrementally, view-by-view, to avoid breaking production behavior.

## 2) Compatibility rules
- Keep migration **non-breaking** with the existing app logic (`js/app.js`, `Patients`, `Interview`, `MSE`, `SOAP`, `Tests`, `Plan`, `Feedback`).
- During migration, components should render in **Light DOM** (`createRenderRoot() { return this; }`) so existing CSS keeps working.
- Keep current persistence/data flow (XLSX/file-system handling) unchanged unless explicitly requested.

## 3) Styling rules
- Reuse existing CSS classes (`btn`, `input`, `card`, `form-group`, etc.) to preserve UI/UX consistency.
- Do not introduce visual redesign unless explicitly requested.

## 4) Workflow rules
- Start from base primitives, then compose larger view sections.
- Keep each change small, reviewable, and easy to rollback.
- Add concise migration notes in PR/task summaries (what was modularized and what remains).

## 5) Interaction rules
- When user provides new project or interaction rules, **update this `.clinerules` file in the same task**.
- Treat `.clinerules` as the source of truth for ongoing collaboration conventions.

## 6) Storage integration rules (Local + Google Drive)
- Keep **dual-mode storage**: local folder/XLSX and Google Drive/Sheets must coexist without breaking existing flows.
- Use `js/storage-provider.js` as the single abstraction point for storage operations used by app modules.
- Keep existing patient data mapping (Dane, Wywiad, MSE, Sesje, Testy, Plan) consistent across local and Google Drive modes.
- For Google auth in browser mode, use Google Identity Services with **client_id only** (never store `client_secret` in frontend code).
- Preserve minimal-click UX: connect action from top bar and folder gate should support both local and Google Drive paths.

## 7) Komunikacja i forma współpracy
- W komunikacji z użytkownikiem używaj języka **polskiego**.
- Przed implementacją dużej zmiany najpierw zbierz i podsumuj wymagania oraz pokaż zakres fazy.

## 8) Aktualna priorytetyzacja PO (2026-04-04)
1. **Wygląd i architektura UI** (najpierw):
   - layout ma być bardziej kompaktowy (mniejsze odstępy, więcej treści na ekranie),
   - wspierać sekcje typu **collapsible tree** (jak w Excelu) do odsłaniania/schowania detali,
   - najpierw zebrać wymagania wizualne i architektoniczne.
2. **Google Drive – docelowy model folderowy**:
   - analogicznie do trybu lokalnego: folder główny (np. „pacjenci”),
   - w nim folder per pacjent,
   - w folderze pacjenta: Google Sheet + pozostałe załączniki/pliki.
3. **Konstrukcja menu i rozmieszczenie funkcjonalności**:
   - najpierw struktura nawigacji i ekranów,
   - bez szczegółowej treści biznesowej.
4. **Implementacja logiki biznesowej**:
   - po zatwierdzeniu 1–3,
   - etapami (np. funkcjonalności + dostosowanie arkuszy, potem kolejne moduły).

## 9) Globalny kierunek UI (components-first)
- Zanim rozpoczniemy przebudowę konkretnych widoków, najpierw projektujemy i wdrażamy **generyczne komponenty** oraz layouty reużywalne globalnie.
- Każdy typ pola formularza ma mieć własny komponent (np. input/select/textarea/checkbox/radio/date/number/range), wywoływany na stronach przez przekazywanie parametrów.
- Zmiany w stronach docelowych wykonujemy dopiero po zatwierdzeniu katalogu komponentów i ich zachowania w demie.

## 10) Ustalenia PO 2026-04-17 (priorytet kompaktu i modularyzacji)
- **Priorytet #1: kompaktowy, wysokiej jakości layout** — cel to gęstość informacji i profesjonalny wygląd aplikacji na standardowych rozdzielczościach (1366×768 i wyżej). Wszystkie decyzje podporządkowane temu.
- **Pełna modularyzacja**: każdy komponent UI i każdy element layoutu (shell, topbar, sidebar, menu, szablony stron) musi być oddzielnym komponentem wywoływanym przez parametry — żadnego „surowego” HTML w widokach docelowych.
- **Wizyty = dawne Sesje SOAP** (do ewentualnej unifikacji po akceptacji klientki na makiecie).
- **Google Drive root**: konfigurowalny, **domyślna nazwa `pacjenci`**.
- **Auto-collapse collapsible**: zwijaj po **kliknięciu poza sekcją** (nie na globalnym blur/focusout).
- **Nowa wizyta (skrót)**: decyzja (drawer vs osobny widok) odłożona do makiety.
- **Kolejność migracji widoków**: dowolna (decyzja developerska).

## 12) Ustalenia PO 2026-04-18
- **Korekta narracji UI**: wcześniejsze stwierdzenie „klientka ma słaby wzrok" jest nieaktualne. Aplikacja ma być po prostu **wysokiej jakości** (produktywność + profesjonalizm), a kompaktowy layout służy gęstości informacji, nie dostępności dla niedowidzących.
- **Toasty — faza dev**: domyślnie `duration=0` (sticky, nie znikają same). Produkcyjne czasy trwania zostaną dobrane w Fazie 5 (hardening).
- **Samodzielne zarządzanie zadaniami**: developer (Cline) dobiera granulację sub-PR-ów, kolejność i zakres — PO interesuje efekt końcowy.

## 13) Ustalenia PO 2026-04-30 (CRUD inline + autozapis + runner testów)
- **Formularze CRUD są widokami inline (route-based), nie modalami.** Dotyczy: Pacjent, Lek, Diagnoza, Zalecenie, Wizyta. Każdy klik „+ nowy"/„✎ edytuj" przechodzi na osobny route (`#/<sekcja>/new`, `#/<sekcja>/edit/:id`) renderowany w głównym obszarze, z breadcrumbem i przyciskiem „← Wróć do listy".
- **Modal dozwolony tylko dla potwierdzeń** (`openConfirm` z `_modal.js`) — np. „Czy na pewno usunąć rekord?". Generyczna infrastruktura modali (`_modal.js`, `psy-modal`) zostaje w repo.
- **Brak przycisku „Zapisz" w formularzach** — autozapis przy każdej zmianie (`input`/`change`, debounce ~400ms) bezpośrednio do `Store`. Wskaźnik statusu w topbarze (`saveStatus`).
- **Wizyta — lazy create.** Wejście w `#/visit/form/new/:typeId` NIE tworzy od razu rekordu; rekord powstaje w `Store` dopiero przy pierwszym tknięciu pola, po czym hash przechodzi na `#/visit/form/:visitId` (stabilne ID).
- **Status wizyty.** Każda wizyta ma flagę `closed: false|true`. Wizyta `closed=false` to **robocza/niezamknięta** (badge „Robocza"), `closed=true` to **zamknięta** (badge „Zamknięta"). Przycisk „🔒 Zamknij wizytę" / „🔓 Otwórz ponownie" w nagłówku formularza.
- **Usuwanie wizyty** dozwolone TYLKO dla wizyt roboczych (`closed=false`). Zamknięta wizyta jest wpisem medycznym i nie może być skasowana z UI.
- **Testy — runner.** Klik „+ Uruchom test" pokazuje inline picker (karty PHQ-9 / GAD-7) na tej samej stronie. Wybranie testu otwiera widok runnera (`#/tests/run/:code`), wszystkie pytania na jednym ekranie, po wypełnieniu — ekran wyniku z punktacją + interpretacją + zapisem do `Store`. MVP: **PHQ-9 + GAD-7** (okrojone wersje wystarczą — to nadal demo).
- **Pliki modali kasowane:** `js/views/modal-patient.js`, `modal-med.js`, `modal-diagnosis.js`, `modal-recommendation.js`, `modal-visit-preview.js` zostają usunięte po refaktoringu (zastąpione przez `view-*-form.js` + routing). `_modal.js` (generyczny) zostaje.


## 14) Ustalenia PO 2026-05-01 (UX listy / detali pacjenta + modale)
- **Detale pacjenta** = osobny widok read-only pod `#/patients/detail/:id` (`view-patient-detail.js`), wzorowany na karcie ATOL (lewa kolumna: avatar + zakładki, prawa: karty „Pacjent" / „Dane kontaktowe + adresy" / „Powiązania z innymi kontami").
- **Lista pacjentów** ma TYLKO dwie akcje:
  1. klik w cały wiersz → otwarcie detali pacjenta (`#/patients/detail/:id`),
  2. przycisk **„Wybierz"** → ustawia aktywnego pacjenta i przechodzi do `#/history`.
  Z listy znikają przyciski ✎ Edytuj oraz 📦 Archiwizuj.
- **Tag pacjenta w topbarze** jest klikalny — klik (poza przyciskiem „Zmień") otwiera detale. Przycisk „Zmień" zachowany — kieruje do `#/patients` (lista wyboru).
- **Edycja i archiwizacja pacjenta** — wyłącznie z widoku detali pacjenta. Etykieta przycisku archiwizacji ma być pełna („📦 Archiwizuj pacjenta" / „↩ Przywróć z archiwum"), z `openConfirm`.
- **Zakładka „Dokumenty"** w detalach pacjenta — w obecnej fazie STUB UI (struktura widoku gotowa pod podpięcie folderu). Pełna integracja (upload/listing plików) jest częścią Fazy 3 (PR-10/PR-11): docelowy model `pacjenci/{KOD}_{Imie}_{Nazwisko}/Sheet + załączniki` zarówno na Drive jak i lokalnie.
- **Modale globalnie wycentrowane** — `.psy-modal-backdrop` używa `align-items: center` (nie flex-start), aby modale (`openConfirm`) pojawiały się na środku ekranu (poziomo i pionowo).

## 15) Ustalenia PO 2026-05-01 cd. (paczka PR-G — wizyty / reset / pola formularzy)
- **Status wizyty wycofany z UI.** Pole `closed` zostaje w danych jako legacy, ale UI (lista historii + nagłówek formularza) **nie pokazuje** badge'y „Robocza"/„Zamknięta". Każdą wizytę można skasować przyciskiem 🗑 w nagłówku formularza wizyty (`view-visit-form.js`). `Store.removeVisit` nie ma już guard'a `closed`.
- **Lista wizyt — klik w wiersz = otwarcie wizyty.** Cały `<tr>` jest klikalny → `#/visit/form/:id`. Usunięto kolumnę „Status", filtr stanu, kolumnę akcji (✎ Edytuj / 🔍 Otwórz / 🗑) z wiersza. Tło wiersza: `paid=false` → żółtawe (`#FFFBEB`, klasa `.psy-row-unpaid`), `paid=true` → białe. Badge w kolumnie „Płatność" niezmieniony (zielony / żółty, klikalny).
- **Edit = view jednego widoku.** Usunięto `viewVisitDetail` (route `#/visit/detail` + funkcję). Wszystkie kliknięcia w wizytę kierują do `#/visit/form/:id` — tam jest jedyne miejsce edycji i podglądu wizyty.
- **Sekcja „Dane wizyty" — collapsible jak inne**, default closed. Gdy collapsed pokazuje **preview-line** w summary: `data · godzina · typ wizyty · czas trwania · osoby` (zamiast samej etykiety). Wszystkie sekcje formularza wizyty są default closed.
- **Reset / odpięcie folderu (dev).** W Ustawieniach sekcja „Stan lokalnego folderu (dev)" ma 2 przyciski:
  - **🔌 Odłącz folder & wczytaj demo** → `Store.resetAll()` (czyści localStorage, reseeduje z `_fake-data.js`).
  - **🧹 Wyczyść wszystko (czysty start)** → `Store.wipeAll()` — czyści localStorage **bez** seed-a, symuluje pierwsze uruchomienie (puste listy).
- **Pola w `view-recommendation-form.js`:** dodane `type` (single-select z `VISIT_DICT.REKOMENDACJE_TYP`), `dueWhen` (select z `VISIT_DICT.KONTROLNA_TERMIN`), `dueDate` (data konkretna), `linkedVisitId` (select wizyt pacjenta). Wszystkie literalnie z `VISIT_FORM_SPEC.md` §2.16/§3 + notatka PO o grupowaniu per wizyta.
- **Pole w `view-diagnosis-form.js`:** dodane `linkedVisitId` (powiązanie z wizytą, na której rozpoznanie zostało postawione/odnowione). Źródło: `notatki.txt` linia „rozpoznania, leki itp są grupowane per wizyta".
- **`view-med-form.js`:** odłożone na osobny PR — wymaga rozpoznania struktury formularza leku przed dodaniem `linkedVisitId`.

## 16) Ustalenia PO 2026-05-01 cd. 2 (PR-H — pacjent: edit = view)
- **Karta pacjenta = jedno miejsce (edit = view).** Analogicznie do wizyty, detale i edycja pacjenta to **ten sam widok** (`view-patient-detail.js`, route `#/patients/detail/:id`). Wszystkie pola w karcie „Pacjent" są **edytowalne inline** z autozapisem (debounce 400 ms). Brak przycisku „✎ Edytuj" w nagłówku.
- **Akcje w nagłówku detali:** „← Wróć do listy", „📦 Archiwizuj pacjenta" / „↩ Przywróć z archiwum" (z `openConfirm`).
- **Lazy create dla nowego pacjenta:** route `#/patients/new` ładuje ten sam widok z `id=null`. Pierwszy wpis w polu Imię/Nazwisko → `Store.addPatient(...)` + `history.replaceState` na `#/patients/detail/:newId`. Bez osobnego widoku `view-patient-form.js` (został jako legacy).
- **Routing:** `#/patients/edit/:id` przekierowuje do `viewPatientDetail` (alias). `viewPatientForm` jest cienkim delegatem (do skasowania w kolejnym PR).
- **Kontrolka edytowalna:** klasa `.psy-pdf__input` (patient detail form input) — spójna stylistycznie z `.psy-vf__input` (formularz wizyty).

## 17) Ustalenia PO 2026-05-11 (paczka PR-J — sticky profil + 10 sekcji + 5 podzakładek + Plan/Parametry/Dokumenty)
Pełna analiza w `docs/REQUIREMENTS_2026-05-11.md` (zdjęcia `docs/z1.jpg`..`z7.jpg`).

- **Topbar — placeholder logo.** `<div class="psy-new-brand">PsychoApp</div>` → `<div class="psy-new-brand psy-new-brand--placeholder">Logo lub nazwa aplikacji</div>`. Tekst „PsychoApp" zostaje w `<title>` i `<noscript>` (wewnętrzna nazwa kodu); zmiana dotyczy wyłącznie brandu w pasku.
- **Sticky profil pacjenta — duży, czytelny (laptop 14"/tablet).** Pasek pacjenta zawiera: PESEL · Imię (Drugie imię) Nazwisko · ikona płci ♂/♀ · wiek · telefon · mail · badge auto „Pełnoletni" / „Nieletni" (wyliczany z `dataUrodzenia`). Odcienie badge'a **delikatne**: dorosły → jasny niebieski (`#E0F2FE`), dziecko → jasny róż (`#FCE7F3`). Pasek pozostaje **jednowierszowy**, sticky we wszystkich widokach.
- **Lupa = wyszukiwarka pacjenta.** Ikona 🔍 w prawej części paska pacjenta otwiera popover z `<input>`em search. Wpisanie frazy filtruje listę pacjentów po imieniu/nazwisku/kodzie/PESEL; klik wyniku → `Store.selectPatient(p)` + nawigacja do `#/patients/detail/:id` (natychmiastowe przełączenie). Bez wchodzenia w `#/patients` (lista).
- **Menu boczne = 10 pozycji** (rename + nowe). Kolejność: 1) **+ Nowa wizyta** (dropdown z 6 typami notatek), 2) Historia wizyt, 3) Leki, 4) Testy, 5) Zalecenia, 6) **Plan leczenia** (NOWE), 7) **Dane identyfikacyjne** (rename z „Pacjent"), 8) Diagnozy, 9) **Parametry** (NOWE), 10) **Dokumenty** (NOWE).
- **„Nowa wizyta" = submenu w sidebarze.** Klik rozwija/zwija 6 kafelków typów notatek (`1sze spotkanie / Kolejne spotkanie / Superwizja / Notatka administracyjna / Kontakt telefoniczny / Kontakt mailowy`). Stary widok kafelkowy `#/visit/new` zachowany dla wstecznej kompatybilności, ale **domyślny entry-point to submenu** (klik kafelka → `#/visit/form/new/:typeId`).
- **6 typów notatek wizyt.** `VISIT_TYPES` w `_visit-dict.js` zredukowany do 6 pozycji: `first_meeting`, `next_meeting`, `supervision`, `admin_note`, `phone_contact`, `email_contact`. **Bez migracji** istniejących danych — apka jeszcze nie działa produkcyjnie. `FAKE_VISITS` w `_fake-data.js` zaktualizowane na nowe `typeId`.
- **Historia wizyt = strumień akapitów.** `viewHistory()` przebudowany z tabeli na listę akapitów, **od najnowszej do najstarszej** (klientka: „im niżej scrolluję, tym starsze"). Każdy akapit ma nagłówek `[NAZWA NOTATKI] · [typ wizyty] · [data] · [płatność]` i **pełny opis** wizyty z `visit.data._raw` (bez skrótów `buildSummary()`). Klik akapitu → `#/visit/form/:id`.
- **„Dane identyfikacyjne" = 5 podzakładek.** Karta pacjenta (`view-patient-detail.js`) ma drugi rząd tabs w prawej kolumnie:
  1) **Ogólne** (= dotychczasowe dane: PESEL, imię, II imię, nazwisko, adres, telefon, mail — **bez pola Kraj** które klientka przekreśliła),
  2) **Osoby upoważnione** (lista: Imię, Nazwisko, Telefon, Komentarz; „komu przekazywać dane med + opiekun"),
  3) **Zgoda RODO** (checkbox + data + komentarz),
  4) **Inne** (wolne pole tekstowe; klientka: „nie wiem jeszcze jakie"),
  5) **Opieka medyczna** (lista poprzednich kontaktów medycznych: Imię, Nazwisko, Specjalność, Data od/do, Komentarz).
- **Plan leczenia ≠ Zalecenia.** Klientka jasno: Zalecenia = do domu / samodzielne działanie pacjenta. Plan leczenia = wspólnie z doktorem (drzewo celów L1/L2 + zadania per cel). Dwie osobne sekcje, dwa osobne widoki.
- **Parametry.** Nowa sekcja (`view-parameters.js`) — na start: wzrost, waga, BMI auto, ciśnienie skurczowe/rozkurczowe, tętno. Klientka: „to co już mamy idzie na górę, reszta niżej; sekcja powstaje na przyszłość". Schemat danych w `Store.patient.parameters{...}`.
- **Dokumenty.** Nowa sekcja w sidebarze (`view-documents.js`). Na razie **stub UI** (uploader + lista placeholder). Pełna integracja storage w Fazie 3 (PR-10/PR-11).

## 18) Ustalenia PO 2026-05-11 cd. (PR-J11 — bez ikon w menu bocznym)
- **Menu boczne BEZ emoji/ikon przy elementach W TRYBIE PEŁNYM (220px).** Klientka jednoznacznie: zarówno 10 głównych pozycji (Historia wizyt, Leki, Testy, Zalecenia, Plan leczenia, Dane identyfikacyjne, Diagnozy, Parametry, Dokumenty) jak i 6 typów wizyt w submenu „Nowa wizyta" (1sze spotkanie, Kolejne spotkanie, Superwizja, Notatka administracyjna, Kontakt telefoniczny, Kontakt mailowy) renderowane są **tylko jako etykiety tekstowe**, bez kolumny ikon. Profesjonalny, czysty wygląd zamiast „emoji UI".
- **PR-J14c (2026-05-14): wyjątek dla trybu wąskiego form-mode (56px).** Gdy sidebar zwęża się do 56 px (w widokach formularzy zawierających `.psy-form-toolbar`), pokazujemy **ikony emoji** zamiast skrótów tekstowych — klientka raport: skróty `HW`/`Leki`/`Param` mało czytelne. Pole `icon` (emoji) zostało DODANE z powrotem do `APP_MENU`, ale jest renderowane **TYLKO** przez CSS w `.psy-new-shell--form-mode` (atrybut `data-icon` → `attr(data-icon)` w `::before`). W trybie pełnym ikony są ukryte (`.psy-new-sidebar__label` to tekst).
- **Pole `icon` w `VISIT_TYPES` (`_visit-dict.js` / `_fake-data.js`) **pozostaje** — używane w innych miejscach (kafelki picker'a w `viewVisitNew`, ikony nagłówków akapitów w historii wizyt, ikony per typ wizyty w nagłówku formularza). Tylko sidebar submenu nie wyświetla ich.
- **Element `+` w „+ Nowa wizyta" zostaje** — to część etykiety tekstowej (per z2.jpg klientki), nie emoji-ikona.
- **Chevron `▾`/`▸` przy „Nowa wizyta" zostaje** — funkcjonalny wskaźnik rozwijania, nie dekoracja.
- **Klasy CSS `.psy-new-sidebar__icon` i `.psy-new-sidebar__submenu-icon` pozostają w stylesheet z `display: none`** (legacy, gdyby coś zewnętrznego importowało). Renderowanie span'ów ikon usunięte z `_renderSidebar()` w `app-new.js`.

## 19) Ustalenia PO 2026-05-11 cd. 2 (PR-J12 — kolor nagłówka karty pacjenta wg wieku)
- **Nagłówek karty pacjenta** (`view-patient-detail.js`: `.psy-patient-detail__header`) ma **delikatne tło i lewy pasek akcentu** zależne od wieku pacjenta:
  - **Pełnoletni (≥ 18 lat)** → tło `linear-gradient(180deg, #E0F2FE 0%, #F0F9FF 100%)` + lewy pasek `#0EA5E9`. Subtitle/breadcrumb w odcieniu `#075985`/`#0369A1`.
  - **Nieletni (< 18 lat)** → tło `linear-gradient(180deg, #FCE7F3 0%, #FDF2F8 100%)` + lewy pasek `#EC4899`. Subtitle/breadcrumb w odcieniu `#9D174D`/`#BE185D`.
  - **Brak danych o wieku** (nowy pacjent, brak `dataUrodzenia` i `wiek`) → tło neutralne (białe, bez modyfikatora).
- **Zakres = Wariant A** (jedyne miejsce z kolorem): tylko nagłówek widoku karty pacjenta (`#/patients/detail/:id`). Inne widoki (Historia, Leki, Testy, …) zostają neutralne. Sticky pasek pacjenta w topbarze nie zmienia tła (już ma badge „Pełnoletni"/„Nieletni").
- **Próg wieku**: 18 lat (na bazie `dataUrodzenia`, fallback z pola `wiek`). Logika w `view-patient-detail.js` używa `ageOf(patient)` → `parseInt`. Klasy CSS: `.psy-new-view__header--adult` / `.psy-new-view__header--minor` (dodawane warunkowo do `psy-new-view__header psy-patient-detail__header`).
- **Tooltip**: `title="Pacjent pełnoletni"` / `title="Pacjent nieletni"` na headerze (a11y).
- **Spójność kolorystyczna**: dokładnie te same kolory bazowe co badge „Pełnoletni"/„Nieletni" w pasku pacjenta (sekcja 17).

## 20) Ustalenia PO 2026-05-11 cd. 3 (paczka K — format XLSX = przyszły Google Sheet)
- **1 plik `pacjent.xlsx` per pacjent** w folderze `pacjenci/{KOD}_{Nazwisko}_{Imię}/`. Załączniki w podfolderze `dokumenty/`. Bez `_index.xlsx` master (jednoosobowa apka — lista pacjentów = skan folderu).
- **8 zakładek w pliku** (mapowanie 1:1 z menu apki, poza akcją „+ Nowa wizyta" i widokiem Dokumenty który jest folderem):
  1. `Pacjent` — KV z 7 sekcjami (Ogólne / Dodatkowe / Kontakt / Osoby upoważnione / RODO / Inne / Opieka medyczna), separatory merged-cell
  2. `Wizyty` — **akapity drzewkowe**: każda wizyta = blok z headerem + sekcją „Dane wizyty" + sekcją „Treść notatki" (wszystkie pola z `visit.data._raw`)
  3. `Leki` — tabela
  4. `Testy` — tabela
  5. `Zalecenia` — tabela
  6. `PlanLeczenia` — tabela hierarchiczna (CEL / ZADANIE w kolumnie „Poziom")
  7. `Diagnozy` — tabela (ICD-10)
  8. `Parametry` — tabela (wzrost/waga/BMI/ciśnienie/tętno)
- **Cel formatu = czytelność dla człowieka** gdyby klientka porzuciła apkę. Pełna stylizacja (merged cells, granat header `1F4E78`, niebieski section `2E75B6`, jasny label `E8EEF7`, ramki, autofiltry, freeze panes) — wzorzec ze starego `xlsx-handler.js`. Wartości boolean kolorowane (zielony TAK / szary NIE). Wiersz wizyty niezapłaconej ma żółty header.
- **Identyczny format z przyszłym Google Sheets w Drive** (Faza 4) — zmiana tylko backendu, nie modelu danych.
- **Stary `js/xlsx-handler.js` zostaje nietknięty** — to legacy dla `legacy.html` / `app.js`. Nowa apka używa `js/views/_xlsx-codec.js` (paczka K1).
- **Bez wsparcia dla konfliktów / współbieżnej edycji** — jednoosobowa apka.
- **Biblioteka XLSX:** `lib/xlsx-js-style.min.js` (fork SheetJS z pełnym wsparciem styli). Załadowana w `index.html` przez klasyczny `<script>` przed module-script. W Node test-runnerach wymagany pusty shim `lib/cpexcel.js`.
- **Pliki paczki K1:**
  - `js/views/_storage-format.js` — semantyczne mapowanie (sekcje, kolumny, etykiety pól po polsku)
  - `js/views/_xlsx-codec.js` — `writePatientWorkbook(fullPatient) → ArrayBuffer` + `downloadPatientWorkbook(...)` + `buildFullPatient(store, id)`
  - `tools/test-xlsx-codec.js` — test offline z fake-data → `tools/test_output_pacjent.xlsx` (sample do oceny)
  - Przycisk testowy `⬇ Pobierz XLSX` w nagłówku karty pacjenta (`view-patient-detail.js`) — do usunięcia w paczce K3 gdy autozapis przejmie zadanie.
- **Kolejne paczki:** K2 — `_local-folder-store.js` (File System Access API); K3 — integracja Store + autozapis 800ms + migracja localStorage→XLSX; K4 — realne Dokumenty.

## 22) Ustalenia PO 2026-05-13 (PR-J13 — tryb kompaktowy domyślnie ON)
- **Klientka:** „w aplikacji jest za dużo przerw i wtedy tracimy dużo miejsca" / „wygląda za mocno jak nackane" — prosi o gęściejszy layout, więcej treści na ekranie 1366×768.
- **Decyzja PO**: globalna paczka compact-new (Opcja A) — zero zmian w widokach `.js`, tylko CSS override przez selektor `:root.theme--compact`. Rollback = usunięcie 1 klasy z `<html>`.
- **Nowy plik:** `css/compact-new.css` — kompletny zestaw override-ów dla wszystkich klas używanych w `app-new.css`:
  - **Shell**: `.psy-new-shell` (grid `220px 1fr` / `40px 1fr`)
  - **Topbar**: `.psy-new-topbar` (padding 14px, gap 8-10px), brand-placeholder (140×26), btn-icon (28×26), patient-tag (padding 3×10, font 13/11.5)
  - **Sidebar**: `.psy-new-sidebar__item` (padding 5×12, margin 1×6, font 13px), CTA „+ NOWA WIZYTA" (padding 7×12, font 12)
  - **Main/View**: padding 10×14, view header margin 8/6, h1 17px, body padding 10px radius 8
  - **Patient detail**: avatar 110px (z 180px), initials 36px (z 56px), tabs padding 5×10 font 12.5, subtabs padding 5×12 font 12.5, cards padding 8×12 gap 8px, field-row padding 2px label 100px
  - **PDF inputs**: padding 4×8, min-height 26px, font 12.5
  - **Visit form**: summary padding 6×12 min-height 32, title 13px, preview 11.5
  - **Common**: `.btn` (28px), `.btn--sm` (22px), h1-h4 (17/15/13.5/12.5px)
  - **Modal**: header padding 8×14 title 14.5px, body 12×14, footer 8×14
- **Aktywacja**: `index.html` linia 2 → `<html lang="pl" class="theme--compact">` + `<link rel="stylesheet" href="css/compact-new.css">` po `app-new.css`.
- **Skala**: ~30% redukcja paddingów + ~10-15% redukcja fontów. Czcionki **nie schodzą poniżej 11px** (czytelność). Klikalne elementy **min-height ≥ 22px** (`btn--sm`) → ≥ 26px (`btn`).
- **NIE modyfikujemy** `app-new.css` ani plików `js/views/*.js` — tylko `compact-new.css` + 2 linie w `index.html`. Gdyby klientka chciała wrócić do „comfortable": usuwamy `theme--compact` z `<html>`.
- **Tryb domyślnie ON** (klientka prosiła, apka jeszcze nie produkcyjna — testujemy na żywym widoku). W przyszłości można dodać toggle w Ustawieniach (Faza 6), na razie YAGNI.

## 23) Ustalenia PO 2026-05-14 (PR-J14 — pasek narzędzi + pole treści)
Klientka (5 obrazków, ZADANIE 2): jasno prosi o nowy model formularzy — inspiracja: szwedzki system medyczny (drzewo „PASEK NARZĘDZI" po lewej + okno „POLE TREŚCI ZALEŻNE OD OPCJI W PASKU NARZĘDZI" po prawej).

- **Nowy wzorzec UI dla WSZYSTKICH formularzy** (decyzja PO D=C1): 2-kolumnowy layout:
  - **LEWA**: pasek narzędzi z listą WSZYSTKICH pól formularza, pogrupowanych wg sekcji (płaska struktura po spłaszczeniu — bo „skoro są tylko 2 sekcje, można je zlikwidować i będzie płasko" — PO). Każde pole ma kropkę-indicator wypełnienia: **🟢 zielona (wypełnione) / ⚪ pusta z obramowaniem (puste)** (decyzja A=3).
  - **PRAWA**: aktywne pole z labelem + input + opcjonalny slot na notes. **Tylko JEDNO pole widoczne** na raz, jak tab-content (decyzja A1). Pierwsze pole pierwszej grupy jest automatycznie aktywne po wejściu.
- **Główny sidebar zwężony w trybie formularza** (decyzja C=B1, klientka „menu musi nadal być"): klasa `.psy-new-shell--form-mode` na `<html>` shellu (aktywowana automatycznie post-render gdy widok zawiera `.psy-form-toolbar`). Sidebar redukuje się z 220 → 56 px, etykiety zastępowane krótkimi tekstowymi skrótami (`HW`, `Leki`, `Testy`, `Zal`, `Plan`, `Dane`, `Diag`, `Param`, `Dok`, `+` dla CTA). **Bez emoji** (spójność z § 18). Pełna etykieta w `data-label` (tooltip CSS-only on hover).
- **Usunięte ikony przy polach** (klientka 1: „te ikony przy polach też trzeba usunąć bo się tam ostały"): pole `icon` zniknęło ze WSZYSTKICH 16 sekcji w `_visit-form-schema.js`. Doc-comment zaktualizowany.
- **Hierarchia ważne/mniej ważne (zadanie 1)** — odłożona do dostarczenia listy przez klientkę. Na razie wszystkie pola jednoznacznie wizualnie; grupowanie wg sekcji (nagłówki uppercase `.psy-form-toolbar__group-title`) traktujemy jako pierwsze przybliżenie.
- **Sygnaliki ostrzeżeń medycznych** (obrazek 5 — tabela alergii) — **odłożone, „UWAGA nie priorytet"**.

### Pliki paczki PR-J14:
- **NOWY:** `js/views/_form-toolbar.js` (~270 linii) — generyczny widget. API: `createFormToolbar({groups, values, fieldRenderer, fieldNotesValue, fieldIsFilled, showFieldNotes, onSelect, activeFieldUid}) → HTMLElement`. Root wystawia metodę `.refreshDots(newValues?)` do wywołania po autozapisie (bez re-renderu treści).
- **NOWY:** `css/form-toolbar.css` (~280 linii) — style komponentu `.psy-form-toolbar*` + override-y `.psy-new-shell--form-mode` (zwężony sidebar + tooltipy). Grid 260/1fr, max-height calc(100vh - 220px) na obu kolumnach, scrollowalne osobno.
- **Refaktor:** `js/views/view-visit-form.js` — wszystkie renderery pól (`renderInputForField`, `renderUzywkiSpecial`, `renderTagIcd10`, `renderLinkView`, …) **zostają nietknięte**. Wymieniona tylko sekcja „Form body": z pętli `<details>` collapsible'i → `createFormToolbar()`. Komentarze sekcji (`sectionComment`) i puste sekcje (`problemZdrowotny`, `medyczne`) dostają wirtualne pole `__comment` (textarea). Autozapis przepięty z `body` na `toolbar` (Event delegation). Stare funkcje `renderSection`, `renderSubfieldRow`, `buildVisitDataPreview`, `updateVisitDataPreview` zostają jako legacy dead-code (usunięcie w kolejnej paczce).
- **Modyfikacja:** `js/views/_visit-form-schema.js` — usunięte 16 linii `icon: '...'`. Doc-comment zaktualizowany.
- **Modyfikacja:** `js/views/_menu.js` — dodane pole `short` per pozycja menu (HW/Leki/Testy/Zal/Plan/Dane/Diag/Param/Dok/+).
- **Modyfikacja:** `js/app-new.js` — `_renderSidebar()` dodaje atrybuty `data-short` + `data-label` + `title` na `<li>`. `_renderView()` po wyrenderowaniu toggle'uje `.psy-new-shell--form-mode` na shellu zależnie od obecności `.psy-form-toolbar` w `mainEl`.
- **Modyfikacja:** `index.html` — `<link rel="stylesheet" href="css/form-toolbar.css">` po `compact-new.css`.

### Zachowane (kontrakt):
- Autozapis (400 ms debounce, `Store.updateVisit`) — działa bez zmian
- Lazy create (`Store.addVisit` przy pierwszej zmianie) — działa bez zmian
- `data-live="true"` na rootu widoku — pomija pasywny re-render
- Renderery pól tag-input-icd10, uzywki-special, link-view — działają bez modyfikacji

### Etap B (kolejny PR, po akceptacji klientki):
- `view-patient-detail.js`, `view-med-form.js`, `view-diagnosis-form.js`, `view-recommendation-form.js` — przebudowa na ten sam wzorzec `createFormToolbar`
- Plus widoki `view-parameters.js`, `view-treatment-plan.js`

### Etap C (po dostarczeniu listy przez klientkę):
- Dodanie `importance: 1|2` per pole w schematach
- CSS: pola ważne = bold + dosunięte do lewej, mniej ważne = light + wcięte (~16-20 px w prawo)

## 24) Ustalenia PO 2026-05-14 cd. 4 (PR-J14d — krytyczny bug: wartość znika po zmianie pola)
- **Klientka raport (krytyczny):** „nic się nie zapisuje — po zmianie pola to co zostało wpisane od razu znika - choć zielona kropka zostaje". Łańcuch trzeciego z rzędu bugu w merge/closure logic toolbar+autozapis (po PR-J14b/c).
- **Root cause:** `_form-toolbar.js` trzymał `values` jako closure z destrukturyzacji `const`. Metoda `.refreshDots(newValues)` używała `newValues` tylko lokalnie do iteracji kropek + preview, ale NIE aktualizowała wewnętrznej referencji. Skutek: gdy user kliknął inne pole (lub wrócił do edytowanego), `_renderContent(uid)` wywoływał `fieldRenderer(field, values)` ze **STAREGO** obiektu `initialValues` (sprzed wszystkich autozapisów) — input renderował się pusty lub z wartością sprzed edycji. Kropki na pasku już wskazywały „wypełnione" (bo `refreshDots` używało świeżego `vals = newValues`), więc widać było rozbieżność: 🟢 ale pole puste.
- **Fix:** w `js/views/_form-toolbar.js`:
  - Destrukturyzacja: `values: initialValues = {}` (rename do init)
  - Stan wewnętrzny: `let values = initialValues` (MUTOWALNA referencja)
  - `refreshDots(newValues)`: jeśli `newValues` podany — `values = newValues` przed iteracją kropek
- **Konsekwencja:** kolejne wywołania `_renderContent(uid)` (po kliknięciu pola na pasku) używają zawsze świeżego `values`, więc input pokazuje aktualną wartość z Store.
- **Cache-bust w `index.html`** bumped z `?v=202605150024` → `?v=202605150040` (wszystkie CSS + app-new.js).
- **NIE zmienia** kontraktu API — `view-visit-form.js` i przyszłe konsumenty toolbar'a nie wymagają modyfikacji.
- **Wnioski na przyszłość:** wzorzec „init param + mutable internal ref" musi być standardem dla każdego stanu który ma być aktualizowany przez public API komponentu. Komentarz w kodzie zaznacza to wyraźnie.

## 26) Ustalenia PO 2026-06-13 (mandat dewelopera + refaktor wizyty)

### Mandat dewelopera (rola PO)
- **PO = operator + business owner**: rozmawia z klientką, dostarcza wymagania produktowe, akceptuje efekt końcowy.
- **Developer (Cline) = architekt + executor**: dobiera granulację zadań, kolejność implementacji, podział na sub-PR-y, decyzje techniczne.
- **Estymacje czasowe nie mają znaczenia** — PO nie potrzebuje ich znać. Developer nie podaje godzin.
- **Brak quick winsów, dem, mini-mockupów, sub-PR-ów do akceptacji**. Całość zadania = jedno zadanie. Wewnętrzna struktura prac to działka dewelopera.
- **Słowo „demo"** — apka jest niedokończona, nie jest demem. Jeśli pojawia się w wymaganiach klientki, traktować jako synonim „obecna iteracja".

### Refaktor 2026-06-13 — wymagania zaimplementowane
Pełna analiza w `docs/REQUIREMENTS_2026-06-13.md`. Skrót:

- **Główna idea**: Historia wizyt = jedyne źródło prawdy. Boczne menu (Diagnozy / Leki / Parametry / Plan leczenia / Zalecenia) = **read-only osie czasu** z agregatorów Store, bez CRUD-a.
- **Toggle r/o ↔ edit per pole** (`_form-toolbar.js` w `mode: 'journal'`): max 1 pole w edit naraz, focusout poza prawą kolumnę → wszystkie pola wracają do read.
- **Nowe typy pól w schemie wizyty**:
  - `compact-grid` — 1-okienny grid 2-kol dla sekcji z flagą `compactGrid: true` (visitData, parametry).
  - `inline-diagnoses` — mini-CRUD ICD-10 w sekcji „Rozpoznanie" wizyty.
  - `inline-meds` — mini-CRUD leków w sekcji „Farmakoterapia" wizyty.
- **Zmiany w schemacie** (`_visit-form-schema.js`):
  - `przemoc` wycięta z `visitData` → nowa osobna sekcja `przemoc` na pozycji 3 (po „Wywiad"), zawsze widoczna.
  - `visitData`: 4 pola (data/rodzaj/osoby/powod) + flaga `compactGrid: true`.
  - `parametry`: 4 pola (wzrost/masa/bmi auto/komentarz) + flaga `compactGrid: true`. Usunięte: min/max masa.
  - `rozpoznanie.diagnozy`: `link-view` → `inline-diagnoses`.
  - `farmakoterapia.leki`: `link-view` → `inline-meds`.
- **Lek (`view-med-form.js`)**: nazwa handlowa BEZ NAWIASÓW w dropdownie. Substancja + grupa READONLY (auto z bazy). Aktualna dawka = NUMBER + jednostka dziedziczona z max dawki. Max dawka READONLY. Sekcja „Ordynacja" (data + przepisał + notatki) USUNIĘTA.
- **Diagnoza**: jedno pole `kod — opis` (autocomplete ICD-10). Pola `description`, `status` usunięte. Data + autor wypełniane automatycznie (`visit.date`, `'lek. prowadzący'`). `view-diagnosis-form.js` USUNIĘTE z repo. Routes `#/diagnoses/new` i `#/diagnoses/edit/:id` → redirect do `#/history` (lub `#/visit/form/:linkedVisitId`).
- **ICD-10**: architektura słownika skalowalna — `extendIcd10Dict()` helper pozwala dorzucać kody bez zmian w API. Obecny słownik (~60 kodów F + Z) zostaje na razie, ale przygotowany pod pełne 10k+ kodów ICD-10.
- **Agregatory timeline w Store**:
  - `getDiagnosesTimeline(patientId)`, `getMedsTimeline()`, `getRecommendationsTimeline()`, `getParametersTimeline()`, `getTreatmentPlanTimeline()`.
  - Każdy zwraca listę `{visit, ...}` posortowaną wg `visit.date+time DESC`.
- **Sekcja 8 (zamknięcie wizyty + pola wymagane)** — ODŁOŻONA. Klientka: „ale to później".

### Pliki dotknięte 2026-06-13

| Plik | Zmiana |
|---|---|
| `js/views/_visit-form-schema.js` | przebudowa: compactGrid, nowa sekcja `przemoc`, inline-diagnoses/inline-meds |
| `js/views/_icd10-dict.js` | doc + `extendIcd10Dict()` API |
| `js/views/_store.js` | +5 agregatorów timeline |
| `js/views/view-visit-form.js` | +3 globalne renderery (compactGrid/inline-diagnoses/inline-meds) + obsługa typów w `renderInputForField`/`_fieldIsFilled`/`_fieldPreview`/`_fieldReadRenderer` + `inlineCtx` closure |
| `js/views/_form-toolbar.js` | max 1 edit per journal, focusout poza prawą kolumnę → editingSet.clear() |
| `js/views/view-med-form.js` | uproszczenie — bez Ordynacji, bez nawiasów, dose=num+unit z maxDose, maxDose ro |
| `js/views/view-diagnosis-form.js` | **USUNIĘTE** |
| `js/app-new.js` | usuń import renderDiagnosisForm, viewDiagnosisForm → redirect; viewMeds/Diagnoses/Recommendations przepisane na timeline z `Store.get*Timeline()` |
| `js/views/view-parameters.js` | read-only timeline z `Store.getParametersTimeline()`; usunięte ciśnienie/tętno |
| `js/views/view-treatment-plan.js` | read-only timeline z `Store.getTreatmentPlanTimeline()` (ustalenia + ewaluacja + kontrolna z wizyt); stary `treatmentPlan.goals[]` legacy |
| `css/visit-form-2026-06.css` | NOWY plik — style dla compact-grid, inline-diagnoses, inline-meds + delikatne nagłówki sekcji + ukryty X w akapitach |
| `index.html` | dodany `<link>` do nowego CSS + cache-bust `?v=202606131200` na wszystkich CSS/JS |
| `docs/REQUIREMENTS_2026-06-13.md` | NOWY plik — pełna specyfikacja wymagań + 8 decyzji PO |

### Test ręczny (PO)
1. `#/diagnoses` → read-only oś czasu, brak „+ Dodaj/✎ Edytuj".
2. `#/meds`, `#/recommendations`, `#/parameters`, `#/treatment-plan` jw.
3. `#/visit/form/new/first_meeting` → sekcja „Dane wizyty" w pasku po lewej jako 1 pozycja, klik → 1-okienny grid 2-kol. Bez pola „przemoc".
4. Sekcja „Doświadczenie przemocy" na pos. 3 (po „Wywiad").
5. Sekcja „Parametry somatyczne" → 4 pola (wzrost/waga/BMI auto/komentarz). Wpisanie wzrostu+wagi → BMI auto-liczone.
6. Sekcja „Rozpoznanie" → inline picker ICD-10 (autocomplete). Dodanie → chip w liście. Klik X → usunięcie.
7. Sekcja „Farmakoterapia" → inline picker leków (bez nawiasów). Dodanie → wiersz z nazwą/substancją r-o/dose number+unit/maxDose r-o. Klik X → usunięcie.
8. Otwarcie wizyty z wypełnionymi polami → wszystko jako akapity r/o. Klik w akapit → edit. Klik w inne pole / poza toolbar → wraca do read.
9. `node tools/test-xlsx-codec.js` → 21/21 ✅ (round-trip XLSX nie zepsuty).

---

## 25) Ustalenia PO 2026-05-30 (PR-J15 — Historia wizyt: pełna treść zamiast streszczenia)
- **Klientka:** „na liście wizyt zamiast streszczenia chcemy wyświetlone wszystkie wypełnione pola — aby terapeuta mógł przejrzeć szybko wszystkie wizyty w miarę szybko".
- **Decyzje PO:**
  - **Grupowanie** po sekcjach formularza wizyty (Dane wizyty / Wywiad / Status psychiczny / …) — ale **lekko zaznaczone** wizualnie (sub-header w stylu kapitalików: 11 px, uppercase, letter-spacing, kolor #64748B, delikatna kreska pod nagłówkiem). Bez ramek/tła sekcji.
  - **Sekcje puste pomijać** — jeśli w danej wizycie sekcja nie ma żadnego wypełnionego pola/komentarza, jej nagłówek się nie pojawia.
  - **Wszystko zawsze rozwinięte**, bez toggle „zwiń/rozwiń". Klientka jasno: nie chce zwijania.
  - **Layout kompaktowy** — gęsty grid 2-kolumnowy (label `~130–140 px` / wartość), małe gapy (2–3 px pionowo), fonty 11.5–12.5 px (zgodne z `theme--compact`).
- **Co dokładnie pokazujemy z `visit.data._raw`:**
  - **Komentarz sekcji** (`sectionId.__comment`) — pełna linia tekstu pod nagłówkiem sekcji, bez label-a.
  - **Wartości pól** (`sectionId.fieldId`) — w gridzie 2-kolumnowym:
    - `select`/`radio`/`multi-select`/`checkbox-group` → label ze słownika `field.input.options` (w naszej apce słowniki to flat string arrays, więc value === label),
    - `tag-input-icd10` → `kod · opis` per tag (np. `F32.1 · Epizod depresyjny umiarkowany`),
    - `uzywki-special` → format `Substancja: ✓ TAK · {intensywność}` + ewentualna notatka linią niżej (`↳ uwagi`),
    - `text`/`textarea`/`number`/`date` → wartość raw (string).
  - **Notatki pól** (`sectionId.fieldId.__notes`) — wiersz pod wartością, italic, kolor `#64748B`, z prefiksem `↳ ` (strzałka skierowana w dół-prawo).
  - **Pomijane:** pola dekoracyjne (`type: header`), linki do osobnych widoków (`type: link-view`), wartości puste, klucze techniczne `__comment`/`__notes` bez własnej etykiety.
- **Tryb wizyty** (`first` / `followup`) wyliczany z `visit.type` przez `_resolveVisitModeFromType()` — identyczna logika jak w `view-visit-form.js` (`first_meeting`/`interview`/`diagnosis` → `first`, reszta → `followup`).
- **Fallback dla legacy fake-data** (klucze flat typu `rodzajWizyty`, `objawyDepresyjne`, `cosWaznego`) — wszystkie klucze nieprzechwycone przez iterację po schemie trafiają do osobnej sekcji „Pozostałe pola" (etykiety przez `_prettyVisitFieldLabel()`). Jeśli to są jedyne pola wizyty — sekcja pokazuje się bez nagłówka (pojedynczy blok = naturalne).
- **Fallback dla wizyt bez `_raw` i bez żadnych grupowanych pól** — używamy `v.summary` (jak dotychczas). Bez `_raw` i bez `summary` → italic placeholder „(notatka pusta — kliknij, aby uzupełnić)".
- **Pliki paczki PR-J15:**
  - **Modyfikacja:** `js/app-new.js` (+~180 linii) — dodane importy `schemaForMode`, `VISIT_FORM_SCHEMA`, `VISIT_DICT`; nowe funkcje `_resolveVisitModeFromType`, `_formatVisitFieldValue`, `_extractUzywkiEntries`, `_extractVisitGroupedContent`; refaktor sekcji „Body" w `viewHistory()` (render grupowanych sekcji + grid pól + notes + sekcja „Pozostałe pola"). Stara `_extractVisitContent` zostaje jako dead-code/dokumentacja (oznaczona LEGACY).
  - **Modyfikacja:** `css/app-new.css` (+~50 linii) — nowe klasy `.psy-history-paragraph__section`, `__section-title`, `__section-comment`, `__fields`, `__field-label`, `__field-value`, `__field-notes`. Stary `<dl>` zostaje (fallback).
  - **Modyfikacja:** `css/compact-new.css` (+~70 linii) — kompaktowe override-y dla nowych klas (mniejsze padding/gap/font, sub-headery 10.5 px, wartości 12.5 px, notes 11.5 px).
  - **Modyfikacja:** `index.html` — bump cache-bust z `?v=202605301720` → `?v=202605301755`.
- **NIE ruszamy:** widok formularza wizyty (`view-visit-form.js`), `_visit-form-schema.js`, `_visit-dict.js`, `_storage-format.js`, `_xlsx-codec.js`, fake-data. Zmiana wpływa wyłącznie na render listy historii — pełna spójność z autozapisem i podglądem szczegółowym wizyty.

## 21) Procedura kontynuacji między sesjami (NEXT_STEPS.md)

- **Na końcu każdej paczki / sesji** developer aktualizuje `docs/NEXT_STEPS.md` — krótką notatkę kontekstową która pozwala wystartować nowy czat lub `/smol` bez utraty kontekstu.
- **Pierwszy plik do odczytu w nowym czacie** to `docs/NEXT_STEPS.md` (przed `.clinerules`, `IMPLEMENTATION_PLAN.md` i resztą).
- Struktura `NEXT_STEPS.md`:
  1. „Ostatnia sesja" — data + lista ukończonych paczek
  2. „Stan apki — co działa" — przegląd funkcjonalności (UI + storage + …)
  3. „Następna paczka" — szczegółowy plan najbliższej paczki (pliki, kroki, edge cases, test ręczny)
  4. „Plan kolejnych faz" — krótki zarys 2-3 faz w przód
  5. „Pliki — szybkie odniesienie" — drzewo `js/views/`, `docs/`, `tools/`, `lib/`
  6. „Jak odpalić lokalnie" — komendy
  7. „Aktualne ustalenia PO" — tabela sekcji `.clinerules`
- Na końcu sesji developer dorzuca do commita aktualizację `NEXT_STEPS.md` razem ze zmianami kodu.

## 11) Dokumentacja planu

- Pełny, wykonawczy plan wszystkich faz znajduje się w `docs/IMPLEMENTATION_PLAN.md`.
- Każdy chat/dev przed rozpoczęciem pracy czyta: **`docs/NEXT_STEPS.md` → `.clinerules` → `docs/PO_PRIORYTETY_2026-04-04.md` → `docs/IMPLEMENTATION_PLAN.md`** → `components-demo.html`.
- Postęp realizacji śledzony jest w sekcji 8 `docs/IMPLEMENTATION_PLAN.md` (checklisty) i w liście PR (sekcja 4).
