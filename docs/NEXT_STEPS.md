# NEXT_STEPS.md — co dalej w PsychoApp

> **Aktualizowane na końcu każdej paczki/sesji.**
> Pierwszy plik do odczytania w nowym czacie / po `/smol` / przy ograniczonym kontekście.
> Reguła w `.clinerules` § 21.

## Ostatnia sesja: 2026-06-13 (Refaktor — Historia wizyt jako źródło prawdy)

**Ukończone:**
- **2026-06-13 — Refaktor po spotkaniu z klientką** (`.clinerules § 26`, pełna spec w `docs/REQUIREMENTS_2026-06-13.md`)
  - **Główna idea**: Historia wizyt = JEDYNE źródło prawdy. Boczne menu (Diagnozy/Leki/Parametry/Plan leczenia/Zalecenia) = read-only osie czasu z `Store.get*Timeline()`.
  - **Toggle r/o ↔ edit per pole** w `_form-toolbar.js` (mode='journal'): max 1 pole w edit naraz, focusout poza prawą kolumnę → wszystkie wracają do read.
  - **Nowe typy pól w schemie wizyty**:
    - `compact-grid` — 1-okienny grid 2-kol (visitData / parametry)
    - `inline-diagnoses` — mini-CRUD ICD-10 w sekcji „Rozpoznanie"
    - `inline-meds` — mini-CRUD leków w sekcji „Farmakoterapia"
  - **Sekcje**: `visitData` (4 pola compactGrid, bez przemocy), nowa `przemoc` na pos. 3, `parametry` (4 pola compactGrid wzrost/masa/BMI/komentarz), `rozpoznanie.diagnozy` → inline-diagnoses, `farmakoterapia.leki` → inline-meds.
  - **Lek**: bez nawiasów w dropdownie, substancja+grupa+maxDose r-o, dose=number+unit z maxDose, sekcja „Ordynacja" usunięta.
  - **Diagnoza**: jedno pole „kod — opis", data+autor auto z wizyty, `view-diagnosis-form.js` usunięte z repo, routes redirect do historii.
  - **ICD-10**: dodany `extendIcd10Dict()` API + komentarz o skalowalności do pełnego ICD-10.
  - **Store**: +5 agregatorów `getDiagnosesTimeline`/`getMedsTimeline`/`getRecommendationsTimeline`/`getParametersTimeline`/`getTreatmentPlanTimeline`.
  - **Widoki boczne**: `viewDiagnoses`/`viewMeds`/`viewRecommendations` w `app-new.js` przepisane na timeline z `Store.get*Timeline()`. `view-parameters.js` i `view-treatment-plan.js` przepisane na read-only timeline. Brak akcji „+ Dodaj/✎ Edytuj/🗑 Usuń" — klik wiersza otwiera wizytę powiązaną.
  - **CSS**: nowy plik `css/visit-form-2026-06.css` (compact-grid + inline-diagnoses + inline-meds + delikatne nagłówki sekcji + ukryty X w akapitach).
  - **Cache-bust**: bump `?v=202605301755` → `?v=202606131200` na wszystkich CSS + JS.

**Mandat dewelopera (sekcja 26 `.clinerules`):**
- PO = operator + business owner. Developer (Cline) = architekt + executor.
- Estymacje czasowe nie mają znaczenia. Brak quick winsów / dem / mini-mockupów. Całość zadania = jedno zadanie.
- Słowo „demo" wycofane — apka jest niedokończona, nie demem.

**Weryfikacja:**
- `node --check` na wszystkich 9 zmodyfikowanych plikach JS → OK ✓
- `node tools/test-xlsx-codec.js` → **21/21 testów ✅** (round-trip XLSX nie został zepsuty mimo dużej refaktoryzacji)

**Test ręczny do wykonania przez PO:**
1. `#/diagnoses` → read-only oś czasu, brak „+ Dodaj/✎ Edytuj/🗑 Usuń".
2. `#/meds`, `#/recommendations`, `#/parameters`, `#/treatment-plan` jw.
3. `#/visit/form/new/first_meeting` → sekcja „Dane wizyty" jako 1 pozycja w pasku po lewej, klik → 1-okienny grid 2-kol z 4 polami (data/rodzaj/osoby/powod). Bez pola „przemoc".
4. Sekcja „Doświadczenie przemocy" na pozycji 3 (po „Wywiad"), zawsze widoczna.
5. Sekcja „Parametry somatyczne" → 4 pola (wzrost/waga/BMI auto/komentarz). Wpisanie wzrostu+wagi → BMI obliczone automatycznie.
6. Sekcja „Rozpoznanie" → inline picker ICD-10 z autocomplete. Dodanie kodu → chip w liście. Klik X → usunięcie. Diagnoza ma auto-fill data+autor z visit.date/'lek. prowadzący'.
7. Sekcja „Farmakoterapia" → inline picker leków bez nawiasów. Dodanie → wiersz z nazwą/substancją r-o/dose number+unit/maxDose r-o. Klik X → usunięcie.
8. Otwarcie wizyty z wypełnionymi polami → wszystkie pola jako akapity r/o. Klik w akapit → przełącza w edit. Klik w inne pole na pasku → poprzednie wraca do read, nowe w edit. Klik gdzie indziej (poza prawą kolumną) → wszystkie wracają do read.
9. Stare URL-e `#/diagnoses/new` lub `#/diagnoses/edit/:id` → toast + redirect do historii.

**Skipped (intencjonalnie):**
- Sekcja 8 wymagań — zamknięcie wizyty + pola wymagane. Klientka: „ale to później".
- Migracja `treatmentPlan.goals[]` na nowy model — legacy pole zostaje w danych, UI go nie pokazuje.
- Hierarchia ważne/mniej ważne pól w toolbarze (Etap C z PR-J14) — wciąż czeka na listę od PO.

---

## Ostatnia sesja: 2026-05-30 (PR-J15 — Historia wizyt: pełna treść zamiast streszczenia)

**Ukończone:**
- **PR-J15 — historia wizyt pokazuje wszystkie wypełnione pola** (`.clinerules § 25`)
  - Klientka: „na liście wizyt zamiast streszczenia chcemy wyświetlone wszystkie wypełnione pola — aby terapeuta mógł przejrzeć szybko wszystkie wizyty w miarę szybko".
  - **Decyzje PO:** grupowanie po sekcjach formularza (lekko zaznaczone — sub-headery w kapitalikach), sekcje puste pomijać, wszystko zawsze rozwinięte (bez toggle), gęsty kompaktowy layout.
  - **`js/app-new.js`** (+~180 linii):
    - Dodane importy `schemaForMode`, `VISIT_FORM_SCHEMA` z `_visit-form-schema.js` + `VISIT_DICT` z `_visit-dict.js`.
    - Nowa funkcja `_resolveVisitModeFromType(type)` → `'first'` / `'followup'` (identyczna logika co `view-visit-form.js`).
    - Nowa funkcja `_formatVisitFieldValue(field, primary, arrayAlt)` — mapowanie wartości na string z obsługą `tag-input-icd10` (kod · opis per tag), `multi-select`/`checkbox-group` (join przecinkami), `select`/`radio`/`text`/`textarea`/`number`/`date`.
    - Nowa funkcja `_extractUzywkiEntries(raw, sectionId, usedKeys)` — special extractor dla sekcji „Używki" (klucze `<sectionId>_u_<idx>` z `VISIT_DICT.UZYWKI_11`), zwraca `[{label, value:'✓ TAK · {intensywność}', notes}]`.
    - Nowa funkcja `_extractVisitGroupedContent(raw, mode)` → `{sections: [...], otherFields: [...]}` — iteruje po sekcjach `schemaForMode(mode)`, dla każdej zbiera komentarz sekcji (`__comment`) + niepuste pola + ich notatki (`.__notes`). Sekcje puste pomijane. Pozostałe klucze (legacy fake-data z flat-keyami) → `otherFields`.
    - Refaktor sekcji „Body" w `viewHistory()` — render grupowanych sekcji (sub-headery + grid 2-kolumnowy pól + notes z prefiksem `↳`) + sekcja „Pozostałe pola" jako fallback. Stara funkcja `_extractVisitContent` zostaje jako LEGACY (fallback dla wizyt bez `_raw`).
  - **`css/app-new.css`** (+50 linii) — nowe klasy `.psy-history-paragraph__section`, `__section-title` (uppercase 11px), `__section-comment`, `__fields` (grid `minmax(140px, max-content) 1fr`), `__field-label`, `__field-value`, `__field-notes` (italic, italic gray, prefix `↳`). Stary `<dl>` zostaje (fallback).
  - **`css/compact-new.css`** (+70 linii) — kompaktowe override-y: sub-headery 10.5px, wartości 12.5px, notes 11.5px, gap 2px×10px, padding zredukowany.
  - **`index.html`** — cache-bust bumped `?v=202605301720` → `?v=202605301755`.

**Test ręczny do wykonania przez PO:**
1. `#/history` z fake-pacjentem P001 (4 wizyty z fake-data) → każda wizyta pokazuje sekcję „Pozostałe pola" z `rodzajWizyty`, `osobyObecne`, `objawyDepresyjne` etc. (legacy flat keys).
2. Po wejściu do formularza wizyty i dodaniu wartości w sekcji „Wywiad" → wartości pojawiają się w gridzie pod sub-headerem „Wywiad — aktualne objawy".
3. Komentarz sekcji „Aktualny problem zdrowotny" → linia tekstu pod sub-headerem (bez label-a).
4. Notatki pól (`.__notes`) → italic pod wartością, z `↳`.
5. Wizyta zupełnie pusta → italic placeholder.
6. Layout pozostaje gęsty na 1366×768 — terapeuta widzi przegląd kilku wizyt bez scrolla.

**Skipped (intencjonalnie):**
- Migracja fake-data na schema-driven keys — odłożona; legacy keys działają przez fallback `otherFields`.
- Toggle „zwiń/rozwiń wszystkie" — klientka wprost odrzuciła.
- Hierarchia ważne/mniej ważne (Etap C z PR-J14) — nadal czekamy na listę od PO.

**Co dalej:**
- **Etap B z PR-J14 (kolejna paczka):** aplikuj wzorzec `createFormToolbar` na pozostałe formularze (pacjent, lek, diagnoza, zalecenie, parametry, plan leczenia).
- **PR-K3 (Faza 3):** integracja Store + autozapis → `_local-folder-store.js` (File System Access API).
- **Etap C z PR-J14 (po dostarczeniu listy przez klientkę):** importance: 1|2 w schemacie pól.

---

## Sesja: 2026-05-14 (PR-J14 — pasek narzędzi + pole treści)

**Ukończone (Etap A — POC na formularzu wizyty):**
- **PR-J14a — generyczny widget `psy-form-toolbar`** (`.clinerules § 23`)
  - Klientka (5 obrazków, ZADANIE 2): nowy model formularzy — inspiracja: szwedzki system medyczny (drzewo „PASEK NARZĘDZI" po lewej + okno „POLE TREŚCI ZALEŻNE OD OPCJI W PASKU NARZĘDZI" po prawej).
  - **Nowe pliki:**
    - `js/views/_form-toolbar.js` (~270 linii) — `createFormToolbar({groups, values, fieldRenderer, fieldNotesValue, fieldIsFilled, showFieldNotes, onSelect, activeFieldUid}) → HTMLElement`. Root wystawia `.refreshDots(newValues)` do wywołania po autozapisie.
    - `css/form-toolbar.css` (~280 linii) — style komponentu `.psy-form-toolbar*` + override-y `.psy-new-shell--form-mode` (zwężony sidebar do 56 px + tooltipy CSS-only).
  - **Refaktor `view-visit-form.js`** — wymieniona TYLKO sekcja „Form body" (collapsible `<details>` → `createFormToolbar`). Wszystkie renderery pól (`renderInputForField`, `renderUzywkiSpecial`, `renderTagIcd10`, `renderLinkView`, `renderTextarea`, …) zostają nietknięte. Komentarze sekcji (`sectionComment`) i puste sekcje (`problemZdrowotny`, `medyczne`) dostają wirtualne pole `__comment` (textarea).
  - **`_visit-form-schema.js`** — usunięte 16 linii `icon: '...'` (klientka: „te ikony przy polach trzeba usunąć bo się tam ostały").
  - **`_menu.js`** — dodane pole `short` per pozycja (HW, Leki, Testy, Zal, Plan, Dane, Diag, Param, Dok, `+`).
  - **`app-new.js`** — `_renderSidebar()` dodaje `data-short`/`data-label`/`title` na `<li>`. `_renderView()` toggle'uje `.psy-new-shell--form-mode` na shellu po renderze (heurystyka: obecność `.psy-form-toolbar` w mainEl).
  - **`index.html`** — `<link rel="stylesheet" href="css/form-toolbar.css">` po `compact-new.css`.
- **Decyzje UX PO** (z planu): A=3 (kropka kolorowa 🟢/⚪), B=A1 (pierwsze pole auto-aktywne), C=B1 (sidebar auto-collapse w form-mode), D=C1 (jednolity wzorzec dla wszystkich formularzy).
- **Hierarchia ważne/mniej ważne** (zadanie 1 z 5 obrazków) — odłożona do dostarczenia listy przez klientkę (Etap C).
- **Sygnaliki ostrzeżeń medycznych** (alergie, obrazek 5) — odłożone, „UWAGA nie priorytet".

**Weryfikacja:**
- `node --check` na wszystkich 5 zmodyfikowanych plikach JS — OK ✓
- `http-server :8123` żyje, apka się ładuje bez błędów konsoli (folder gate → tryb dev → lista pacjentów renderują się czysto)
- Pełny test formularza wizyty wymaga viewport >900 px (browser_action puppeteer ma 900×600, akcje listy pacjentów wypadają poza) — **PO sprawdza na prodzie po push**

**Co dalej:**
- **Etap B (kolejna paczka, po akceptacji klientki):** aplikuj wzorzec `createFormToolbar` na pozostałe formularze (`view-patient-detail.js`, `view-med-form.js`, `view-diagnosis-form.js`, `view-recommendation-form.js`, `view-parameters.js`, `view-treatment-plan.js`).
- **Etap C (po dostarczeniu listy przez klientkę):** dodanie `importance: 1|2` w schemacie, CSS dla bold/dosunięte-do-lewej vs light/wcięte.

---

## Sesja: 2026-05-13 (PR-J13 — tryb kompaktowy)

**Ukończone:**
- **PR-J13 — tryb kompaktowy domyślnie ON** (`.clinerules § 22`)
  - Klientka: „za dużo przerw, tracimy dużo miejsca / wygląda za mocno jak nackane"
  - **Nowy plik:** `css/compact-new.css` (~450 linii override-ów dla wszystkich klas `.psy-new-*`, `.psy-patient-detail__*`, `.psy-pdf__*`, `.psy-vf__*`, `.btn`, `.psy-modal__*`, h1-h4)
  - **Aktywacja**: `<html class="theme--compact">` + `<link href="css/compact-new.css">` w `index.html`
  - **Zero zmian** w widokach `.js` ani w `app-new.css` — czysty CSS override
  - **Rollback**: usunięcie klasy z `<html>` (1 linia)
  - **Skala**: ~30% redukcja paddingów + ~10-15% redukcja fontów. Min font 11px, min-height kontrolek 22px (btn--sm) / 26px (btn).
  - **Weryfikacja**: apka odpalona na `http://localhost:8123`, widok „Dane identyfikacyjne" + lista pacjentów wyrenderowane bez błędów, layout zwarty.

---

## Sesja: 2026-05-11 (Faza 5 — Hardening)

**Ukończone w tej sesji:**
- **F5.1 — Toasty produkcyjne** (`psy-toast-container.js`, `psy-toast.js`)
  - Default duration per variant: info/success = 4 s, warning/danger = 8 s
  - Helper `window.Toast` z metodami `.success() / .info() / .warning() / .danger() / .sticky() / .dismiss()`
- **F5.2 — Error recovery dla folderu** (`_store.js`)
  - `_isFolderUnavailableError()` — wykrywa NotFoundError / NotAllowedError / SecurityError / InvalidStateError / AbortError
  - `_onFolderUnavailable()` — sticky warning toast „⚠ Folder niedostępny" + przycisk „Przywróć dostęp"
  - `_startFolderHealthCheck()` — watcher co 60 s cicho sprawdza `verifyPermission`
  - `_onFolderRecovered()` — auto-resume sync przy powrocie folderu
  - W `_doFolderSync` — przy utracie folderu PRZYWRACA dirty pacjentów do Set, by nie zgubić zmian
- **F5.3 — Auto-rename folderu pacjenta** (`_local-folder-store.js`, `_store.js`)
  - `renamePatientFolderIfNeeded()` w `_local-folder-store.js` rozbudowane:
    - Kopiuje cały podfolder `dokumenty/` (rekursywnie) przy zmianie nazwy
    - Wykrywa konflikt nazw (folder docelowy już istnieje) — zwraca `{conflict: true}`
  - `_doFolderSync` używa `renamePatientFolderIfNeeded` zamiast plain `savePatient`
  - Aktualizuje `patient._folderName` po sukcesie
  - Toast info „📁 Aktualizacja struktury" przy rename + warning przy konflikcie
- **F5.4 — Walidatory PESEL / tel / mail + autofill** (`_form-helpers.js`, `view-patient-detail.js`, `app-new.css`)
  - `validatePesel()` z algorytmem sumy kontrolnej (waga 1,3,7,9,1,3,7,9,1,3)
  - `parsePesel()` zwraca `{dataUrodzenia, plec}` z kodowaniem wieku 1800-2299
  - `validatePhone()` — regex `+48 XXX XXX XXX` lub 9 cyfr (luźno)
  - `validateEmail()` — regex RFC 5322 (uproszczony)
  - Inline błąd w karcie pacjenta (`.psy-pdf__error` + `.psy-pdf__input--invalid`)
  - **Autofill z PESEL** — po poprawnym (checksum OK) PESEL, jeśli `dataUrodzenia`/`plec` puste → wypełnione + toast info
  - Walidacja OSTRZEGAWCZA — nie blokuje autozapisu, tylko czerwony tekst inline

**Skipped (decyzja PO 2026-05-11):**
- ~~F5.5 Backup ZIP~~ — odłożone (PO: „na razie bez backupu")
- ~~F5.6 Deploy~~ — apka już na GitHub Pages
- ~~F5.7 PWA/Service Worker~~ — niepotrzebne (apka zawsze online wg PO)

**Wcześniej ukończone (sesja 2026-05-11 ranna):**
- PR-J1..J12 (UI overhaul — sticky pasek, 10 sekcji menu, 6 typów wizyt, historia akapitów, 5 podzakładek, Plan/Parametry/Dokumenty, bez ikon w menu, kolor wg wieku)
- Paczka K1 — spec XLSX + codec write+read, round-trip 21/21 ✅
- Paczka K2 — `_folder-handle.js` binary I/O + `_local-folder-store.js` (scan/load/save)
- Paczka K3 — integracja Store + autozapis 800 ms + migracja localStorage/legacy data.json → XLSX
- Paczka K4 — realne Dokumenty (drag&drop upload, tabela, podgląd PDF/JPG, rename/delete)
- `docs/NEXT_STEPS.md` jako stała notatka kontekstowa + `.clinerules` § 21 z procedurą

---

## Stan apki — co działa

### UI (paczka PR-J — sekcje 17/18/19 `.clinerules`)
- Sticky pasek pacjenta w topbarze: PESEL · ikona płci · imię (II imię) nazwisko · wiek · telefon · mail · badge Pełnoletni/Nieletni · 🔍 lupa-szukajka
- 10 sekcji menu bocznego (bez ikon, sama nazwa): `+ Nowa wizyta` (submenu 6 typów), Historia wizyt, Leki, Testy, Zalecenia, Plan leczenia, Dane identyfikacyjne, Diagnozy, Parametry, Dokumenty
- 6 typów wizyt: `first_meeting`, `next_meeting`, `supervision`, `admin_note`, `phone_contact`, `email_contact`
- Historia wizyt = strumień akapitów (najnowsza na górze, pełne treści, klik → edycja)
- Karta pacjenta = 5 podzakładek: Ogólne / Osoby upoważnione / Zgoda RODO / Inne / Opieka medyczna
- Kolorowy nagłówek karty pacjenta wg wieku (jasny niebieski dorosły / jasny róż nieletni, próg 18 lat)
- Nowe widoki: Plan leczenia (drzewo celów L1/L2 + zadania), Parametry (wzrost/waga/BMI auto/ciśnienie/tętno)
- Brand topbara: placeholder „Logo lub nazwa aplikacji"

### Storage (paczki K1–K4 — sekcja 20 `.clinerules`)
- Podpięcie folderu lokalnego (File System Access API, Chrome/Edge desktop)
- **Format XLSX:** 1 plik per pacjent `pacjenci/{KOD}_{Naz}_{Imię}/pacjent.xlsx`, **8 zakładek** (Pacjent / Wizyty / Leki / Testy / Zalecenia / PlanLeczenia / Diagnozy / Parametry)
- Pełna stylizacja: merged cells, kolory (granat header `#1F4E78`, niebieski section `#2E75B6`, jasny label `#E8EEF7`), ramki, autofiltry, freeze panes, kolorowane TAK/NIE, żółty header niezapłaconych wizyt
- **Round-trip 21/21 testów** (`tools/test-xlsx-codec.js`)
- **Autozapis 800 ms debounce** per pacjent (`_dirtyPatientIds` Set)
- **Migracja przy 1. podpięciu folderu:**
  - Folder z XLSX → load + cache do localStorage
  - Folder z legacy `data.json` (PR-I) → konwersja JSON → XLSX
  - Folder pusty + state fake-data → eksport wszystkich pacjentów do XLSX
- localStorage zostaje jako offline fallback

### Dokumenty (paczka K4)
- Widok „Dokumenty" w sidebarze działa z folderem `pacjenci/{KOD}/dokumenty/`
- Drag & drop + `<input type="file" multiple>` (multi-upload)
- Tabela z ikonami per typ: 📄 PDF · 🖼 JPG/PNG · 📝 DOCX · 📊 XLSX · 🎵 MP3 · 📦 ZIP · 📎 inne
- Akcje wiersza: 🔍 podgląd · ⬇ pobierz · ✏ zmień nazwę · 🗑 usuń (z `openConfirm`)
- Podgląd inline w modalu: PDF w `<iframe>`, JPG/PNG w `<img>`
- Sanityzacja nazw Windows-safe, kolizje → `_1`, `_2`
- Warning gdy plik > 50 MB

### Faza 5 — Hardening (NOWE w tej sesji)
- **Toasty produkcyjne** — 4 s info/success, 8 s warning/danger, helper `window.Toast`
- **Error recovery** — gdy folder znika (USB odpięty, plik przeniesiony) → sticky toast „⚠ Folder niedostępny" + watcher 60 s
- **Auto-rename folderu** — zmiana nazwiska pacjenta → folder na dysku też się przemianowuje (z kopiowaniem `dokumenty/`)
- **Walidatory PESEL/tel/mail** — inline ostrzegawczy błąd pod polem, autofill `dataUrodzenia`/`plec` po poprawnym PESEL

---

## Następna paczka: **Faza 4 — Google Drive** (~6–8 h, strategiczna)

Replikujemy `_local-folder-store.js` jako `_gdrive-store.js` przez Drive API + Sheets API.
Identyczny interfejs (`listPatientFolders`, `loadPatient`, `savePatient`, dokumenty), inny backend.

**Otwarte pytania PO przed startem Fazy 4:**
- `.xlsx` w Drive (kompatybilność Excel) czy natywny Google Sheet (lepszy preview Drive)?
- Sync one-way (apka→Drive) czy bi-directional (z conflict detection przez `etag`)?

**Pliki do utworzenia:**
- `js/views/_gdrive-store.js` (NOWY, ~300 linii) — OAuth GIS + Drive API + Sheets API
- `js/config.js` — `OAuth client_id` (BEZ `client_secret`!)
- `js/views/_store.js` — dual-mode flag + przełącznik (`useLocalFolder` / `useDrive`)
- Topbar: badge „📁 Folder lokalny" / „☁ Google Drive (user@gmail)"

**Krok 1 (przed kodowaniem):**
- Zarejestrować nowy OAuth Client ID dla `https://sturmov.github.io/medi-app/` (Google Cloud Console)
- Odpowiedź PO na pytania powyżej

---

## Plan dalszy (po Fazie 4)

### Faza 6 — Sticky features na życzenie klientki (TBD)
- Strukturalna lista „Opieka medyczna" (zamiast wolnego tekstu) — pola: Imię, Nazwisko, Specjalność, Data od, Data do, Komentarz
- Strukturalna lista „Osoby upoważnione" (Imię, Nazwisko, Telefon, Komentarz)
- Adres korespondencyjny (opcjonalny, gdy ≠ adres zamieszkania)
- Dodatkowe pola PESEL: NIP, REGON (jeśli klientka będzie ich potrzebować)
- Backup ZIP (opcjonalnie, gdy klientka zażyczy)

### Faza 7 — Multi-user / chmurowy backend (jeśli sens dla 1 użytkowniczki — raczej NIE)

---

## Odłożone / wycofane

### Import ze starego silnika (legacy XLSX) — WYCOFANE 2026-05-12

**Kontekst:** Klientka przed wdrożeniem paczki K1-K4 (storage XLSX, 2026-05-11)
pracowała kilka dni na starym silniku (`legacy.html` + `js/xlsx-handler.js`):
6 zakładek `Dane / Wywiad / MSE / Sesje / Testy / Plan`, jeden plik XLSX per
pacjent w płaskiej strukturze folderu (bez podfolderu per pacjent).

**Próba migracji 2026-05-12 ranna:** rozpoczęto implementację ręcznego
importera (Settings → „📥 Import ze starego formatu" → file picker → migracja).
Zaimplementowane:
- `_legacy-xlsx-parser.js` (parser 6 zakładek, mapowania pól)
- `_legacy-importer.js` (mapper stary→nowy, backup do `_archive-legacy/`)
- `Store.importLegacyFile()` + `Store.detectLegacyFiles()` API

**Decyzja PO 2026-05-12:** Klientka po rozmowie zaakceptowała utratę
dotychczasowych wpisów (jej stare Excele zostają jako backup poza apką,
zaczyna od nowa w nowym silniku). Importer NIE jest potrzebny — kod wycofany.

**Stan po wycofaniu:** repo czyste, commit `9004cad` na main. Wszystkie 3
pliki (parser + importer + zmiany w `_store.js`) usunięte przez `git checkout`
+ `del`. Brak długu technicznego.

**Gdyby wrócić w przyszłości** (klientka zmieni zdanie):
- Wzorzec parsera: czysty port `_daneLabels`/`_wywiadLabels`/`_mseLabels`/
  `_sesjaHeaders`/`_testHeaders`/`_planLabels` + funkcji `_aoaToKv`/
  `_parseSesjeSheet`/`_parsePlanSheet`/`_parseTestySheet` z `js/xlsx-handler.js`.
- Mapping high-level: `dane`→`patient.*`, `wywiad`→1 wizyta `first_meeting`,
  `mse`→ta sama wizyta (jeśli data blisko) lub osobna, `sesje`→kolejne
  wizyty `next_meeting` (S/O/A/P→`data._raw.soap_*`), `testy`→`tests[]`,
  `plan`→`treatmentPlan{goals[],_legacy{...}}`.
- Safety net: nieznane pola → `_legacy.{key}` w każdej sekcji.
- Effort ponownej implementacji: ~2-3h (parser + mapper + UI w Settings).

---

## Pliki — szybkie odniesienie

```
js/views/
├── _store.js              — pub/sub, autozapis, integracja folder (K3 + F5.2 + F5.3)
├── _folder-handle.js      — File System Access API (read/write/list, K2.1)
├── _local-folder-store.js — scan/load/save per pacjent (CRUD na XLSX, K2.2 + F5.3 rename+docs)
├── _xlsx-codec.js         — write/read pliku pacjent.xlsx (K1+K2.3)
├── _storage-format.js     — spec 8 zakładek, etykiety pól po polsku (K1)
├── _documents-store.js    — CRUD na plikach w dokumenty/ (K4.1)
├── _form-helpers.js       — helpers + F5.4 walidatory (validatePesel, parsePesel, validatePhone, validateEmail)
├── view-folder-gate.js    — modal blokujący przed wyborem trybu storage
├── view-documents.js      — Dokumenty (K4 — real, nie stub)
├── view-patient-detail.js — karta pacjenta + 5 podzakładek + ⬇ Pobierz kopię + F5.4 walidatory
├── view-treatment-plan.js — Plan leczenia (J7)
├── view-parameters.js     — Parametry (J8)
└── ... (reszta widoków)

js/components/
├── psy-toast.js           — pojedynczy toast (F5.1: variant-based duration via container)
├── psy-toast-container.js — stack + window.Toast helper (F5.1)
└── ... (reszta komponentów Lit)

docs/
├── NEXT_STEPS.md               — ten plik (pierwszy do czytania!)
├── REQUIREMENTS_2026-05-11.md  — wymagania z 7 zdjęć klientki (z1-z7)
├── IMPLEMENTATION_PLAN.md      — pełny plan faz
├── PO_PRIORYTETY_2026-04-04.md — priorytetyzacja produktowa
└── VISIT_FORM_SPEC.md          — pola formularza wizyty

tools/
├── test-xlsx-codec.js          — test round-trip (21/21 ✅)
└── test_output_pacjent.xlsx    — przykładowy plik dla PO

lib/
├── xlsx-js-style.min.js        — fork SheetJS ze stylami (K1)
├── xlsx.full.min.js            — vanilla SheetJS (legacy)
└── cpexcel.js                  — shim dla Node test-runnera
```

---

## Jak odpalić lokalnie

```bash
cd C:\Users\Michael\Projects\psycho
python -m http.server 8123
# Otwórz http://localhost:8123/index.html
```

Test round-trip XLSX (offline):
```bash
node tools/test-xlsx-codec.js
# Oczekiwany wynik: ✅ Wynik: 21/21 testów przeszło
```

Sanity check walidatorów F5.4 (offline):
```bash
node -e "const f=require('./js/views/_form-helpers.js'); console.log(f.validatePesel('44051401359'), f.parsePesel('44051401359'));"
# Oczekiwane: true { dataUrodzenia: '1944-05-14', plec: 'M' }
```

---

## Aktualne ustalenia PO — szybkie linki do `.clinerules`

| Sekcja | Co |
|--------|-----|
| § 7    | Komunikacja po polsku |
| § 8    | Priorytety 2026-04-04 (UI → Drive folder → menu → biznes) |
| § 9-10 | Components-first, kompaktowy layout |
| § 11   | `docs/IMPLEMENTATION_PLAN.md` jako source of truth fazowy |
| § 12   | Toasty — produkcyjne czasy w F5.1 (ukończone!) |
| § 13-16| Inline CRUD + autozapis 400ms + edit=view |
| § 17   | Paczka PR-J (sticky pasek, 10 sekcji, 5 podzakładek, Plan/Parametry/Dokumenty) |
| § 18   | Menu boczne bez ikon |
| § 19   | Kolor nagłówka karty pacjenta wg wieku |
| § 20   | Format XLSX = przyszły Google Sheet (8 zakładek, czytelne dla człowieka) |
| § 21   | Procedura aktualizacji `NEXT_STEPS.md` na końcu każdej paczki |
| § 22   | Tryb kompaktowy (PR-J13) — domyślnie ON przez `<html class="theme--compact">` + `css/compact-new.css` |
| § 23   | **PR-J14 — pasek narzędzi + pole treści** (formularze: lista pól po lewej z 🟢/⚪, aktywne pole po prawej; sidebar zwężony do skrótów w form-mode; ikony przy polach usunięte) |
| § 24   | PR-J14d — fix krytyczny bug toolbar: mutable internal ref na `values` zamiast closure |
| § 25   | **PR-J15 — Historia wizyt: pełna treść zamiast streszczenia** (grupowanie po sekcjach formularza, sekcje puste pomijane, zawsze rozwinięte, gęsty grid) |
| § 26   | **Refaktor 2026-06-13** — Historia wizyt = jedyne źródło prawdy; mandat dewelopera (PO=operator, dev=architekt); inline-diagnoses/inline-meds/compact-grid w wizycie; boczne menu = read-only osie czasu z `Store.get*Timeline()`; toggle r/o↔edit per pole; view-diagnosis-form.js usunięte |

---

## Procedura na koniec każdej sesji

1. Zaktualizuj sekcję **„Ostatnia sesja"** z datą i listą ukończonych paczek
2. Zaktualizuj **„Stan apki — co działa"** o nowe funkcjonalności
3. Zaktualizuj **„Następna paczka"** o szczegóły kolejnej do zrobienia (pliki, kroki, edge cases, test ręczny)
4. Dopisz otwarte pytania PO / decyzje do podjęcia w odpowiedniej sekcji
5. Commit razem z resztą zmian
