# PsychoApp — Plan implementacji (handoff dla dowolnego chatu)

> **Cel dokumentu:** kompletny, samowystarczalny plan, który pozwala dowolnemu chatowi / developerowi kontynuować prace w dowolnym momencie, z pełnym kontekstem decyzji PO i ustalonych reguł.
>
> **Data utworzenia:** 2026-04-17
> **Źródła ustaleń:** `.clinerules`, `docs/PO_PRIORYTETY_2026-04-04.md`, `notatki.txt`, rozmowa z PO (siostra klientki) 2026-04-17.

---

## 0. Kontekst projektu

PsychoApp to aplikacja webowa (frontend w czystym JS + Lit Web Components) do dokumentacji psychologicznej. Działa dwutrybowo:

- **Tryb lokalny** — wybrany folder na dysku, XLSX per pacjent (`xlsx-handler.js`).
- **Tryb Google Drive** — Google Sheets per pacjent + załączniki (`gdrive-handler.js`, auth przez GIS, client_id only).

Wspólna abstrakcja: `js/storage-provider.js` (używana przez moduły `Patients`, `Interview`, `MSE`, `SOAP`, `Tests`, `Plan`, `Feedback`).

### Reguły stałe (z `.clinerules`)
1. UI budujemy modularnie w Lit Web Components (`psy-*`), komponenty w **Light DOM** (`createRenderRoot(){return this;}`), żeby istniejące CSS nadal działało.
2. Migracja musi być **non-breaking** wobec `app.js` i modułów biznesowych.
3. Reużywamy istniejące klasy CSS (`btn`, `input`, `card`, `form-group`, ...). Bez wizualnego redesignu ponad to co uzgodnione.
4. Dualny storage (lokal + Drive) musi koegzystować.
5. Auth Google: tylko `client_id` w frontendzie, nigdy `client_secret`.
6. Komunikacja z userem po **polsku**. Przed dużą zmianą najpierw zebranie wymagań.
7. Components-first: najpierw generyczne komponenty i szablony, potem dopiero migracja widoków.

### Kluczowe ustalenia PO (2026-04-17)
- **Priorytet #1: kompaktowy layout.** Klientka (psycholog) ma słaby wzrok — im więcej pól widać na ekranie 1366×768 bez scrolla, tym lepiej. **To jest nadrzędne.**
- Wszystko ma być **modularne**: każdy komponent osobno, wywoływany przez parametry. To samo dotyczy layoutów stron i menu.
- **Wizyty = sesje SOAP** z poprzedniej wersji. Można je zunifikować, ale klientka musi najpierw zobaczyć nową iterację UI, zanim podejmie decyzję.
- **Drive root:** konfigurowalny, **domyślna nazwa `pacjenci`**.
- **Collapsible auto-close:** zwijaj po **kliknięciu poza sekcją** (nie na globalnym `focusout`).
- **„Nowa wizyta (skrót)”:** decyzja odłożona — klientka musi najpierw zobaczyć makietę.
- **Kolejność migracji widoków:** dowolna (decyzja developerska).

---

## 1. Stan obecny repozytorium (baseline)

### Istnieje i działa
- `index.html` — klasyczny layout: topbar + sidebar + main z widokami `view-patients/interview/mse/soap/tests/plan`.
- `js/app.js` — kontroler nawigacji, folder-gate, banner pacjenta, modal, autozapis.
- `js/storage-provider.js` — abstrakcja local/gdrive.
- `js/gdrive-handler.js` — OAuth GIS, CRUD Sheets (zakładki: Dane/Wywiad/MSE/Sesje/Testy/Plan). **Jeszcze bez „folder per pacjent”.**
- `js/xlsx-handler.js` — lokalny odpowiednik.
- Moduły biznesowe: `patients.js`, `interview.js`, `mse.js`, `soap.js`, `tests.js`, `plan.js`, `feedback.js`, `ai-summary.js`.
- `css/style.css`, `css/compat.css`, `css/feedback.css`.

### Katalog komponentów Lit (już istnieją)
`js/components/`:
- Prymitywy: `psy-button`, `psy-label`, `psy-input`, `psy-select`, `psy-textarea`, `psy-checkbox`.
- Kontenery: `psy-card`, `psy-panel`, `psy-form-field` (uniwersalne pole, `kind="input|select|textarea|checkbox|date|number|range"`), `psy-field-group`.
- Grupy: `psy-checkbox-group`, `psy-radio-group`.
- Nawigacja/struktura: `psy-view-header`, `psy-collapsible` (L1/L2/L3, atrybuty `open`, `compact`, `auto-collapse` **do dodania**), `psy-patient-context` (sticky).
- Demo: `js/components/demo.js` + `components-demo.html`.

### Czego brakuje (do zrobienia w Fazie 1)
- Shell layoutu jako komponent: `psy-app-shell`, `psy-topbar`, `psy-sidebar`, `psy-sidebar-item`, `psy-view`, `psy-toolbar`.
- Helpery layoutu: `psy-grid`, `psy-stack`, `psy-split`, `psy-tabs`, `psy-modal`, `psy-drawer`, `psy-toast`, `psy-status-badge`, `psy-empty-state`, `psy-loader`, `psy-breadcrumbs`.
- Brakujące typy pól: `psy-date`, `psy-time`, `psy-datetime`, `psy-number` (spinner), `psy-range` (slider+value), `psy-tag-input`, `psy-search-input`, `psy-file-input`, `psy-rich-textarea`, `psy-help-hint`.
- Szablony stron: `psy-template-list`, `psy-template-form`, `psy-template-dashboard`, `psy-template-split`.
- Compact design tokens (`css/tokens.css` + `:root.theme--compact`).
- Auto-collapse (po kliknięciu poza) dla `psy-collapsible` + `psy-collapsible-group`.
- Drive: model folderowy (`pacjenci/P001_.../Sheet + załączniki`).
- Finalna IA: Wizyty/Dokumenty/Załączniki/Ustawienia.

---

## 2. Priorytet bezwzględny: **kompaktowy, modularny layout**

Wszystkie zmiany są podporządkowane temu celowi. Każda decyzja projektowa musi odpowiadać na pytanie: *„Czy klientka widzi więcej pól na jednym ekranie bez utraty czytelności?”*

### Zasady projektowe
- `theme--compact` domyślnie włączony (przełącznik w ustawieniach i w demo, żeby porównać).
- Kontrolki: wysokość 28 px w kompakcie, padding minimalny ale z zachowaniem czytelności.
- Typografia: bazowo 12.5 px, nagłówki sekcji 13 px.
- Formularze: siatki 2/3-kolumnowe tam, gdzie to sensowne (wybory, checkboxy, pary pól).
- Drzewo collapsible L1/L2/L3 — wcięcia 14 px, subtelne tła per poziom.
- Pola różnego typu rozróżniane **delikatnymi odcieniami** (np. border-left w odrobinę innym kolorze per `kind`).
- Sticky „kontekst pacjenta” u góry widoków wizytowych.

### Metryka sukcesu
Skrypt w demo zlicza liczbę widocznych pól `above the fold` na 1366×768. Cel: **~+40% więcej** niż w obecnym `index.html`.

---

## 3. Plan faz (szczegółowy, wykonawczy)

### FAZA 1 — Kompaktowy layout + pełna modularyzacja UI (PRIORYTET)

**Cel:** klientka widzi wyraźnie gęstszy, czytelny interfejs zbudowany wyłącznie z komponentów. Istniejąca aplikacja nie ma regresji.

#### 1.A Design tokens i motyw compact
- Utwórz `css/tokens.css` z zmiennymi:
  - spacing: `--space-xxs:2px; --space-xs:4px; --space-sm:6px; --space-md:10px; --space-lg:16px;`
  - kontrolki: `--control-h:28px; --control-h-md:32px; --control-h-lg:40px;`
  - typografia: `--font-xs:11px; --font-sm:12.5px; --font-md:14px;`
  - promienie: `--radius-sm:4px; --radius-md:6px;`
  - drzewo: `--tree-indent:14px;`
  - odcienie per pole: `--hue-text, --hue-select, --hue-checkbox, --hue-number, --hue-date, --hue-section` (bardzo subtelne `hsl`).
- Dodaj klasę `:root.theme--compact` aktywującą kompakt globalnie.
- W `css/compat.css` zmapuj istniejące `.btn`, `.input`, `.card`, `.form-group`, `.form-actions` na tokens.
- Załaduj `tokens.css` jako pierwszy stylesheet w `index.html` i `components-demo.html`.

#### 1.B Wyróżnienie typów pól (subtelne odcienie)
- W każdym `psy-*` polu dodaj klasę `psy-field--{kind}` z `border-left: 2px solid var(--hue-{kind})` + bardzo jasne tło.
- W `components-demo.html` sekcja „Typy pól obok siebie” do akceptacji przez klientkę.

#### 1.C `psy-collapsible` — auto-collapse po kliknięciu poza + `psy-collapsible-group`
- Rozszerz `psy-collapsible` o:
  - `auto-collapse` (Boolean) — gdy włączone, nasłuchuje `document.pointerdown`; jeśli cel nie jest w `this`, zamyka `details`.
  - `level` już jest (1/2/3); dodaj `compact` i spójne style per poziom.
  - klawiatura: Enter/Space toggle (z `summary` to działa natywnie, dopilnować a11y).
- Utwórz `psy-collapsible-group` z atrybutami:
  - `accordion` (tylko jedna sekcja otwarta naraz),
  - `initial-open` (id sekcji domyślnie otwartej),
  - `level-persistent="1"` (sekcje L1 zostają otwarte przy auto-collapse, L2/L3 zamykają się).
- W demo: dodaj fragment z `auto-collapse` aktywnym, pokaż zachowanie klik‑poza.

#### 1.D Domknięcie katalogu pól (components-first)
Każde pole = oddzielny komponent (może być cienką nakładką na `psy-form-field`):
- `psy-date`, `psy-time`, `psy-datetime` — wrap `input[type=date/time/datetime-local]`.
- `psy-number` — spinner + jednostka (atrybut `unit`).
- `psy-range` — slider z widocznym `value` i opcjonalnymi znacznikami.
- `psy-tag-input` — chipy (np. rozpoznania, leki); eventy `add`, `remove`.
- `psy-search-input` — ikona + skrót klawiszowy `/`.
- `psy-file-input` — upload z miniaturą; emit `file-selected` (File/Blob).
- `psy-rich-textarea` — prosty edytor (B/I/U + nowa linia). **Opcjonalnie**, jeśli klientka zasygnalizuje potrzebę.
- `psy-help-hint` — pod polem, ikona `?` + tooltip (podpowiedzi AI/help).

Wszystkie pola:
- Light DOM.
- Publiczne API: `value`, `disabled`, `readonly`, `placeholder`, `label`, `helper-text`, `error-text`.
- Zdarzenie `psy-change` (typ `CustomEvent<{ value }>`).

#### 1.E Layout shell + nawigacja (modularne)
- `psy-app-shell` — root layout, slots: `topbar`, `sidebar`, `main`, `drawer`, `toast`. Obsługuje responsywność (toggle sidebara).
- `psy-topbar` — slots: `left` (brand, toggle sidebar), `center`, `right` (akcje: storage, recenzja, status zapisu). Nie zawiera żadnej logiki biznesowej.
- `psy-sidebar` — przyjmuje `sections=[{id,label,icon,href,children}]`, renderuje `psy-sidebar-item` rekurencyjnie. Stan aktywny sterowany atrybutem `active` (ustawianym przez router).
- `psy-sidebar-item` — ikona + label + opcjonalny badge; emituje `psy-nav` z id sekcji.
- `psy-view` — kontener widoku z wymuszonym `view--compact`, slot `header`, `body`, `footer`.
- `psy-toolbar` — pasek akcji (search + filtry + CTA) nad listami/tabelami.
- `psy-grid` — CSS-grid helper (`columns="1|2|3|auto"`, `gap="sm|md|lg"`).
- `psy-stack` — flex column z `gap` (zamiennik `.form-actions`).
- `psy-split` — dwukolumnowy layout (lista + detale), opcjonalny `resizable`.
- `psy-tabs` + `psy-tab-panel` — zakładki.
- `psy-modal` — dialog generyczny (zastępuje `_setupModal` z `app.js` stopniowo; interfejs: `open`, `title`, `actions`, `close()`).
- `psy-drawer` — panel wysuwany (np. „Nowa wizyta (skrót)”).
- `psy-toast` + `psy-status-badge` — powiadomienia i status.
- `psy-empty-state`, `psy-loader`, `psy-breadcrumbs`.

#### 1.F Szablony stron (page templates)
Szablon = komponent, który przyjmuje dane/konfig przez parametry i komponuje powyższe prymitywy:
- `psy-template-list` (parametry: `title`, `search`, `filters`, `items`, `detailSlot`).
- `psy-template-form` (parametry: `title`, `patientContext`, `sections=[{id,label,level,content}]`, `actions`).
- `psy-template-dashboard` (KPI cards + sekcje).
- `psy-template-split` (lista po lewej, detale po prawej).

Każdy szablon **nie zna** modułów biznesowych. Widok biznesowy = tylko wywołanie szablonu z danymi.

#### 1.G Demo + metryka „above the fold” + przełącznik compact/standard
- Rozbuduj `components-demo.html`:
  - przełącznik `compact ↔ standard`,
  - sekcje: „Typy pól”, „Drzewo L1/L2/L3 z auto-collapse”, „Sticky kontekst pacjenta”, „Layouty stron” (przykłady szablonów z fake-danymi),
  - licznik widocznych pól w viewporcie (skrypt pomocniczy),
  - porównanie „przed/po” (screenshot lub iframe na starym `index.html`).

#### 1.H Kryteria akceptacji Fazy 1
- Istniejąca aplikacja działa bez zmian (regresja 0).
- Klientka zatwierdza gęstość layoutu w demo.
- Każdy element UI aplikacji można zbudować kompozycją `psy-*` bez pisania surowego HTML.
- Drzewo collapsible zamyka się po kliknięciu poza sekcją.
- Odcienie typów pól są widoczne, ale subtelne.

---

### FAZA 2 — Migracja istniejących widoków na komponenty (bez zmian logiki)

**Cel:** zastąpić „surowy HTML” w `index.html` kompozycjami komponentów. Dzięki temu kolejne zmiany UX sprowadzają się do zmiany parametrów.

#### 2.A Szkielet aplikacji
- Zamień topbar/sidebar/main w `index.html` na `psy-app-shell` + `psy-topbar` + `psy-sidebar`.
- `App.js` zasila `psy-sidebar` listą sekcji (konfig w JS, nie HTML).
- `folder-gate` i `patient-banner` zostają tymczasowo, ale są opakowane w `psy-modal`/`psy-status-badge` w kolejnych krokach.

#### 2.B Widoki (kolejność dowolna, proponowana: Pacjenci → Wywiad → SOAP → MSE → Testy → Plan)
Dla każdego widoku:
1. Utwórz plik `js/views/psy-view-{name}.js` renderujący szablon.
2. Przenoś pola 1:1 (te same `data-field`, te same `id`), tylko w kompozycji komponentów.
3. Utrzymaj kontrakt z modułem biznesowym (`Patients.onFieldChange` itd.) — **nie** zmieniaj nazw pól.
4. Zwolnij HTML starego widoku gdy nowy przejdzie testy manualne.

Szczególne reguły:
- **Pacjenci**: `psy-template-list` + `psy-template-form` w panelu szczegółów.
- **Wywiad kliniczny**: `psy-template-form` z drzewem L1/L2/L3; sekcje wyboru 2-kolumnowe.
- **SOAP / Wizyty**: kompakt, 2 kolumny dla S/O/A/P, sticky kontekst pacjenta.
- **MSE**: drzewo dziedzin + checkboxy w 2/3 kolumnach.
- **Testy**: `psy-tabs` po kategoriach + `psy-template-form`.
- **Plan**: drzewo celów L1/L2 + listy zadań.

#### 2.C Zasady migracji
- Zero copy-paste HTML — tylko parametryzacja komponentów.
- Każdy PR = jeden widok + nota migracyjna.
- Jeśli czegoś brakuje w komponentach — wracamy do Fazy 1 i dodajemy (nie hackujemy HTML w widoku).

#### 2.D Kryteria akceptacji Fazy 2
- Wszystkie 6 widoków w pełni zrenderowane przez komponenty.
- Istniejące moduły `Patients/Interview/...` działają bez zmian.
- Kompaktowy motyw działa globalnie.

---

### FAZA 3 — Google Drive: docelowy model folderowy

**Cel:** odwzorować tryb lokalny w Drive — root `pacjenci/` + folder per pacjent + Google Sheet + załączniki.

#### 3.A Konfiguracja (`js/config.js`)
- `googleDrive.rootFolderName` — string, **default `"pacjenci"`**, edytowalne w UI Ustawień.
- `googleDrive.rootFolderId` — zapamiętywane po podpięciu.
- `googleDrive.clientId` — już jest.
- Zachowaj backward compat: jeśli `rootFolderName` nie ustawione, czytaj `PsychoApp` (stara wartość).

#### 3.B Rozbudowa `GDriveHandler`
Nowe metody (zachowujące istniejący publiczny kontrakt `init/load/save/delete`):
- `ensureRootFolder(name)` — find-or-create, zwraca `folderId`.
- `ensurePatientFolder(patient)` — nazwa `P{kod}_{imie}_{nazwisko}` (sanitize), persist `patient.driveFolderId`.
- `listPatients()` — iteruje subfoldery rootu; w każdym szuka Sheet o dopasowanej nazwie.
- `getOrCreatePatientSheet(patient)` — Sheet w folderze pacjenta; zakładki `Dane/Wywiad/MSE/Sesje/Testy/Plan`.
- `uploadPatientAttachment(patient, file)` — upload do folderu pacjenta.
- `listPatientAttachments(patient)` — lista plików w folderze (pomijając Sheet).
- `getAttachmentPreviewUrl(fileId)` — URL do `webViewLink` lub `webContentLink`.
- `migrateLooseSheet(patient)` — jeśli istnieje arkusz „luzem” przypisany do pacjenta poza folderem, przenieś go do folderu pacjenta.

Reguły:
- Tylko scope `drive.file` + `spreadsheets` (minimum uprawnień).
- Wszystkie operacje przez `fetch` z bieżącym access tokenem (istniejąca logika `_ensureTokenClient`).
- Zwróć wyraźne błędy (`_notify`) przy braku uprawnień.

#### 3.C `StorageProvider` — spójny kontrakt
- `loadAllPatients / loadPatient / savePatient / deletePatient` w trybie `gdrive` używają nowych metod folderowych.
- Zachowaj identyczne mapowanie zakładek między local i gdrive.
- Dopisz `uploadAttachment/listAttachments` w providerze (delegacja do handlera; dla local — zapis w folderze pacjenta na dysku).

#### 3.D UX folder gate + topbar
- W folder gate i w topbarze: jedna akcja „Połącz Google Drive” → dialog wyboru/utworzenia folderu głównego (domyślnie `pacjenci`, edytowalne).
- `psy-status-badge` w topbarze pokazuje tryb (local/gdrive) i nazwę rootu.
- Minimum kliknięć: 1 (jeśli zapamiętano `rootFolderId`), 2 (przy pierwszym podpięciu).

#### 3.E Kryteria akceptacji Fazy 3
- Utworzenie nowego pacjenta w Drive tworzy `pacjenci/P001_.../Sheet`.
- Upload załącznika trafia do folderu pacjenta.
- Tryb lokalny nadal działa bez zmian.
- Przełączenie trybu zachowuje dane (każdy tryb czyta swoje źródło; spójny kontrakt danych).

---

### FAZA 4 — Architektura menu i IA (placeholdery)

**Cel:** docelowa struktura nawigacji i ekranów, wciąż bez pełnej logiki biznesowej.

#### 4.A Finalne menu (propozycja PO do potwierdzenia przez klientkę)
- **Pacjenci** → Lista, Profil
- **Wizyty** (= dawne „Sesje SOAP”, do ewentualnej unifikacji) → *Nowa wizyta (skrót)*, *Wywiad kliniczny (pierwsza wizyta)*, *Kolejna wizyta*
- **Dokumenty** → Zaświadczenie, Skierowanie, Wniosek (wgląd)
- **Testy i oceny**
- **Plan terapii**
- **Załączniki**
- **Ustawienia / Integracje** (Drive, Kalendarz Google)

**Uwaga:** klientka musi zobaczyć makietę **Nowej wizyty (skrót)** i **Wizyt**, żeby zdecydować, czy to ma być osobny widok czy tryb „slim” wysuwany z `psy-drawer`. Dopóki decyzji nie ma — implementujemy obie opcje w demo i pokazujemy.

#### 4.B Routing
- Hash-routing (`#/patients`, `#/patients/:id`, `#/visits/new`, `#/visits/:id`, `#/documents/:type`, `#/attachments`, `#/settings`).
- Adapter w `app.js` konwertuje routing na `App.showView` + parametry.
- `psy-sidebar` podświetla aktywną sekcję na podstawie routera.

#### 4.C Makiety widoków
Każda jako kompozycja szablonów + fake-data (placeholder):
- `view-visit-new` — `psy-drawer` **lub** `psy-template-form` (warianty do porównania).
- `view-interview-first` — `psy-template-form` z drzewem L1/L2.
- `view-visit-followup` — `psy-template-form` + sekcja „zmiany od poprzedniej wizyty”.
- `view-documents` — `psy-tabs` (Zaświadczenie/Skierowanie/Wniosek).
- `view-attachments` — lista + `psy-file-input` + podgląd (placeholder).
- `view-settings` — sekcje: Integracje (Drive, Kalendarz), UI (compact on/off, motyw), Dane (eksport/import).

#### 4.D Kryteria akceptacji Fazy 4
- Pełna nawigacja działa, wszystkie sekcje otwierają się.
- Klientka zatwierdza układ menu i decyduje o „Nowej wizycie (skrót)”.

---

### FAZA 5 — Logika biznesowa (po zatwierdzeniu 1–4)

#### 5.A Wywiad (pierwsza wizyta) i Wizyta (kolejna)
- Pełna logika formularza wywiadu na drzewie L1/L2/L3.
- Autopropagacja **leku wymienionego w notatce wizyty** do listy leków pacjenta (reguła z `notatki.txt`).
- Grupowanie rozpoznań/leków **per wizyta** na podstawie wywiadu wizyty.
- Akcja AI: „Ulepsz klinicznie tekst diagnozy” (wykorzystuje `ai-summary.js`).
- Dostosowanie zakładek Sheet/XLSX do nowych pól **bez zrywania** mapowania.
- **Decyzja o unifikacji** „Wizyta” ↔ „SOAP” po akceptacji klientki.

#### 5.B Dokumenty
- Szablony: Zaświadczenie, Skierowanie, Wniosek (wgląd).
- Generator PDF/DOCX (biblioteka do uzgodnienia — `docx` lub HTML→PDF przez przeglądarkę).
- Dane pobierane z pacjenta + bieżącej wizyty.

#### 5.C Załączniki z podglądem
- Upload + lista w folderze pacjenta (Drive + local).
- **Podgląd bez otwierania pliku**: obrazy (`<img>`), PDF (PDF.js), TXT (plain), DOCX (prosty parser typu `mammoth.js` lub fallback link).
- **Komentarze** pod podglądem (zapisywane przy pacjencie/wizycie).
- Miniatury obok listy.

#### 5.D Testy i oceny
- Kompaktowe formularze testów.
- Import/eksport wyników (CSV/XLSX).
- Porównanie wyników między wizytami (wykres lub tabela).

#### 5.E Plan terapii
- Drzewo celów L1/L2 + zadania sesyjne.
- Statusy (planowane / w trakcie / zrealizowane).
- Widok postępu w czasie.

#### 5.F Integracja Google Kalendarz
- Scope `https://www.googleapis.com/auth/calendar.events`.
- Synchronizacja wizyta ↔ wydarzenie (create/update/delete).
- Ustawienia integracji: wybór kalendarza, kolor, przypomnienia.

#### 5.G Podpowiedzi AI (opcjonalnie)
- `psy-help-hint` przy polach — kontekstowe wskazówki generowane na żądanie.
- Akcje AI: podsumowanie wizyty, sugestia diagnozy.

#### 5.H Hardening
- `js/validators.js` — PESEL, daty, telefony, email.
- Spójny wskaźnik autozapisu (local/gdrive).
- A11y: focus rings, role ARIA, nawigacja klawiaturą w drzewach i zakładkach.
- Testy manualne: przełączanie local↔drive, offline→online, edycja z dwóch kart, rozdzielczość 1366×768 i 1920×1080.

---

## 4. Kamienie milowe (lista PR-ów)

| PR | Zakres | Faza |
|----|--------|------|
| PR-01 | `tokens.css` + `theme--compact` + porównanie w demo | 1.A, 1.G |
| PR-02 | Odcienie typów pól + demo „Typy pól” | 1.B, 1.G |
| PR-03 | `psy-collapsible` auto-collapse + `psy-collapsible-group` | 1.C |
| PR-04 | Brakujące pola: date/time/number/range/tag/search/file/help-hint | 1.D |
| PR-05 | Layout shell + nawigacja: app-shell/topbar/sidebar/view/toolbar/grid/stack/split/tabs/modal/drawer/toast/status-badge | 1.E |
| PR-06 | Szablony stron: template-list/form/dashboard/split | 1.F |
| PR-07 | Migracja widoku Pacjenci na komponenty | 2.B |
| PR-08 | Migracja Wywiad + SOAP | 2.B |
| PR-09 | Migracja MSE + Testy + Plan | 2.B |
| PR-10 | Drive: `ensureRootFolder`, `ensurePatientFolder`, `listPatients`, `getOrCreatePatientSheet` + config `rootFolderName` | 3.A, 3.B |
| PR-11 | Drive: załączniki (upload/list/preview-url) + migracja luźnych arkuszy | 3.B, 3.C |
| PR-12 | Folder gate + topbar UX + `psy-status-badge` | 3.D |
| PR-13 | Nowa IA + hash-routing + `psy-sidebar` z danymi z konfigu | 4.A, 4.B |
| PR-14 | Makiety: Nowa wizyta (drawer vs widok), Wywiad, Kolejna wizyta, Dokumenty, Załączniki, Ustawienia | 4.C |
| PR-15 | Logika: Wywiad (pierwsza wizyta) + SOAP (kolejna) + update arkuszy | 5.A |
| PR-16 | Dokumenty (Zaświadczenie/Skierowanie/Wniosek) + generator | 5.B |
| PR-17 | Załączniki z podglądem + komentarze | 5.C |
| PR-18 | Testy i oceny + porównania | 5.D |
| PR-19 | Plan terapii | 5.E |
| PR-20 | Integracja Google Kalendarz | 5.F |
| PR-21 | Podpowiedzi AI (opcjonalnie) | 5.G |
| PR-22 | Hardening: walidacje, autozapis spójny, A11y, testy manualne | 5.H |

**Każdy PR zawiera:**
- krótką notę migracyjną (co dodane, co zastąpione),
- zrzut ekranu z `components-demo.html` lub docelowego widoku,
- wpis w CHANGELOG (jeśli zostanie wprowadzony).

---

## 5. Decyzje potwierdzone i otwarte

### Potwierdzone (2026-04-17)
1. **Root w Google Drive:** konfigurowalny, default **`pacjenci`**.
2. **Auto-collapse collapsible:** po **kliknięciu poza sekcją** (nie po globalnym blur).
3. **Kolejność migracji widoków:** dowolna (decyzja developerska).
4. **„Wizyty” vs „SOAP”:** w nowej wersji to ten sam koncept; **decyzja o unifikacji** po pokazaniu makiety klientce.

### Otwarte (czeka na decyzję klientki)
- **„Nowa wizyta (skrót)”:** `psy-drawer` (slim overlay) czy osobny widok? Pokażemy oba warianty w demo/makiecie.
- **Generator dokumentów:** biblioteka do PDF/DOCX (rekomendacja: HTML→PDF dla prostoty + `docx` dla DOCX).
- **Podpowiedzi AI:** zakres i model (czy lokalne, czy API).

---

## 6. Reguły pracy (dla każdego chatu/dev)

1. **Components-first.** Jeśli brakuje komponentu — najpierw dodaj komponent, potem go użyj.
2. **Light DOM** w komponentach Lit (`createRenderRoot(){return this;}`).
3. **Non-breaking.** Każda zmiana musi współistnieć ze starą apką aż do pełnej migracji danego widoku.
4. **Polski** w komunikacji i komentarzach UI.
5. **Aktualizuj `.clinerules`** gdy pojawiają się nowe reguły.
6. **Pracuj w małych PR-ach** wg listy kamieni milowych; nie łącz Faz.
7. **Demo (`components-demo.html`) jest źródłem prawdy wizualnej** — każda nowa prymitywa musi się tam pojawić.
8. **Nie modyfikuj `app.js`** poza delegacjami do shell/routera — biznes zostawiamy w modułach.

---

## 7. Jak kontynuować w dowolnym momencie

1. Przeczytaj ten plik + `.clinerules` + `docs/PO_PRIORYTETY_2026-04-04.md`.
2. Sprawdź w `js/components/` które komponenty już istnieją.
3. Otwórz `components-demo.html` — zobaczysz aktualny stan systemu UI.
4. Zajrzyj do listy PR (sekcja 4) i wybierz pierwszy niezrealizowany.
5. Przed kodem — zweryfikuj z PO decyzje z sekcji 5 („otwarte”).
6. Pracuj w cyklach: komponent → demo → migracja widoku → PR.

---

## 8. Checklist realizacji (źródło prawdy dla postępu)

- [x] **Faza 1 — Compact + modular UI (ZAMKNIĘTA 2026-04-18)**
  - [x] 1.A tokens.css + theme--compact (PR-01)
  - [x] 1.B odcienie typów pól (PR-02)
  - [x] 1.C psy-collapsible auto-collapse (klik-poza) + psy-collapsible-group (PR-03)
  - [x] 1.D katalog pól: date/time/datetime/number/range/tag/search/file/help-hint (PR-04)  *(rich-textarea odłożony — patrz 1.D uwagi)*
  - [x] 1.E layout shell — PR-05 podzielony na 4 sub-PR (a/b/c/d)
    - [x] PR-05a: psy-app-shell + psy-topbar + psy-sidebar + psy-sidebar-item + psy-view + psy-toolbar + psy-patient-context (variant="bar" default)
    - [x] PR-05b: helpery layoutu — psy-grid, psy-stack, psy-split (resizable+persist), psy-tabs/psy-tab-panel (WAI-ARIA + keyboard)
    - [x] PR-05cd: overlays (psy-modal, psy-drawer, psy-toast + psy-toast-container) + utility (psy-status-badge, psy-empty-state, psy-loader, psy-breadcrumbs); focus-trap helper w `_focus-trap.js`; toasty sticky w dev
  - [x] 1.F szablony stron (PR-06): psy-template-list, psy-template-form, psy-template-dashboard, psy-template-split — komponują shell + helpery + overlays + utility
  - [x] 1.G demo + metryka above-the-fold + przełącznik compact/standard

- [~] **Faza 2 — Nowa aplikacja `app.html` (wg rysunków Magdy + arkuszy)**
  - **Rewizja 2026-04-18:** zamiast migracji `index.html`, budujemy równoległą nową apkę `app.html` z menu 6-pozycyjnym (Historia wizyt / Leki / Diagnozy / Zalecenia / Testy / + Nowa wizyta). Stare `index.html` pozostaje nietknięte.
  - [x] PR-07 — szkielet: `app.html` + `js/app-new.js` (router + shell) + `js/views/_menu.js` + `_fake-data.js` + `_store.js` + 8 placeholder-owych widoków + `css/app-new.css`
  - [x] **PR-08** — Historia wizyt: podgląd notatki (modal read-only `modal-visit-preview.js`) + inline toggle „✓ Zapłacono" w tabeli i w podglądzie _(2026-04-18)_
  - [x] **PR-09** — **Leki** (CRUD + autocomplete z FAKE_MED_DICT, walidacja max dawki) + **Diagnozy** (CRUD + autocomplete ICD-10 z własnego słownika ~75 kodów w `_icd10-dict.js`) _(2026-04-18)_
  - [x] **PR-10** — **Zalecenia** (edytor + CRUD + checkbox „zrealizowane") + **Testy runner** (PHQ-9, GAD-7) — wszystko z autozapisem, inline form _(zrobione 2026-04-30 w paczce CRUD-inline)_
  - [ ] PR-11 — Wywiad kliniczny (1. wizyta) — pełny formularz wg „1sza notatka" z Dokumentacja.xlsx (treść biznesowa — schemat już jest)
  - [ ] PR-12 — Kolejna wizyta (skrócona) + Diagnoza rozszerzona (wielodomenowa z DIAGNOZA.xlsx)
  - [ ] PR-13 — Dokumenty (Zaświadczenie / Skierowanie / Wniosek o wgląd) dostępne z kontekstu wizyty
  - [ ] PR-14 — Załączniki (upload + podgląd obrazów/PDF) + Plan terapii (pod Zaleceniami)
  - [~] **PR-15 (częściowo)** — Ustawienia rozbudowane o sekcję „Lokalne dane (dev)" z przyciskiem „Wyczyść lokalne dane" i statystykami. Pełna integracja folder/Drive — nadal TODO _(2026-04-18)_
  - [ ] PR-16 — Hardening: propagacja leku z notatki do listy leków, autozapis (✓ zrobione 2026-04-30), walidacja


  - **Paczka Faza 3 formularz wizyty (2026-04-19)** — baza leków + ICD-10 autocomplete:
    - `js/views/_meds-dict.js` — single source of truth bazy leków psychotropowych. Warstwa strukturalna `MEDS_DB` (50 substancji z listą preparatów `brands: []`, grupa kliniczna PL, max dose, opcjonalne `note` dla importów docelowych) + warstwa spłaszczona `FAKE_MED_DICT` (114 wpisów per preparat handlowy) zachowująca wsteczną kompatybilność API `{ name, substance, maxDose, group }`. 5 grup z arkusza Magdy: przeciwdepresyjne (19), stabilizatory nastroju (6), przeciwpsychotyczne (11), ADHD (4), przeciwlękowe / nasenne (10). Helpery `searchMeds(q, limit)`, `findMedByBrand(name)`, `findMedBySubstance(s)`, `listMedGroups()`. `_fake-data.js` re-eksportuje `FAKE_MED_DICT` — konsumenci (`modal-med.js`, `view-settings.js`) działają bez zmian.
    - `view-visit-form.js` `renderTagIcd10()` — multi-tag ICD-10 autocomplete dla slotu „tag-input-icd10" (sekcja 2.14 Ocena kliniczna → Hipoteza diagnostyczna). Reuse klas `.psy-autocomplete*` z `modal-diagnosis.js` + chipy z przyciskiem `✕`, nawigacja klawiaturą (ArrowUp/Down, Enter, Escape, Backspace-usuwa-ostatni-chip, przecinek/średnik jako separator), fallback dla kodu spoza słownika, dedupe. Wartość w hidden-inpucie jako CSV kodów (czytelne przez przyszłe `readForm()` w Fazie 4).
    - CSS chipów w `css/app-new.css`: `.psy-vf__tag-icd10__chip` (indygo pill), `.psy-vf__tag-icd10__chip-code/desc/remove`.
    - **Bug-fix** regexa typu wizyty: `interview` / `diagnosis` z `VISIT_TYPES` były mapowane na tryb `followup` (powinny być `first`). Wprowadzono helper `resolveMode(visitType)` z `Set` typów wymagających pełnego wywiadu + fallback po fragmentach nazwy.
    - **Weryfikacja w przeglądarce**: Ustawienia → Baza leków pokazuje „Baza leków psychotropowych (114)" z prawidłowymi grupami PL ✓. Modal „+ Dodaj lek" → `<select>` z 114 preparatów w formacie `Brand (Substancja)` (osobne wpisy per brand) ✓. Istniejące leki pacjenta P001 (Sertralina 50mg, Xanax 0.25mg) renderują się bez regresji ✓. Dev-switcher first/followup w formularzu wizyty działa (16 vs 12 sekcji, override odzwierciedlony w subtitle) ✓. Autocomplete ICD-10 zweryfikowany przez kod (bazuje na działającym pattern `modal-diagnosis.js`); pełny test manualny (popover + chipy) po stronie Magdy w normalnej przeglądarce — scroll w `#psy-new-main` nie działa w Puppeteerze, sekcja 2.14 była poza viewportem.
    - **Do zrobienia w Fazie 4**: przechwycenie wartości formularza (input/change handlers) + zapis do `_store.js` wg modelu `{ value, notes, _comment }` z §5 specu + prefill przy edycji realnych danych wizyty. Dopiero wtedy hidden-input ICD-10 zostanie faktycznie odczytany.

  - **Paczka sub-PR-08..PR-13 (2026-04-18)** — **CRM core** („Magda klika i coś się dzieje"):
    - `_store.js` rozszerzone o pełny CRUD + persistencja do `localStorage` (klucz `psy-new:data`, seed z `_fake-data.js` przy pierwszym uruchomieniu). **Brak `removePatient`** — decyzja PO 2026-04-18: kasacja pacjenta tylko przez ręczne usunięcie folderu (lokalnie/Drive). W UI jedynie **archiwizacja** (odwracalna).
    - `_modal.js` — własny helper modalny (bez `psy-modal` — unikamy slotów w Light DOM), mount w `document.body`, ESC + click-outside + focus-trap + stack, event `psy-modal-closed` → re-render widoku.
    - `_form-helpers.js` — `el()/field()/row()/section()/readForm()/showFieldError()/clearFieldErrors()`.
    - Modale: `modal-patient.js`, `modal-med.js`, `modal-diagnosis.js`, `modal-recommendation.js`, `modal-visit-preview.js` _(USUNIĘTE 2026-04-30 — zastąpione widokami inline, patrz Paczka PR-A..E)_.
    - Słownik ICD-10: `_icd10-dict.js` (~75 kodów F00-F98 + Z03/Z63/Z73) + funkcje `searchIcd10(q)` / `findIcd10ByCode(code)`.
    - Save-indicator w topbarze (idle / saving / saved / error) napędzany przez `Store.state.saveStatus`.
    - Filtr pacjentów „Aktywni / Archiwalni / Wszyscy" z flagą `archived` na pacjencie.
    - W widokach: inline akcje `✎ Edytuj` + `📦 Archiwizuj` (pacjent) / `🗑 Usuń z potwierdzeniem` (leki / diagnozy / zalecenia). Brak usuwania wizyt / testów (wpisy medyczne).
    - Bug-fixy: `el()` w `app-new.js` — obsługa booleanów (`selected: false` → skip atrybutu); `_modal.js.close()` — dispatch `psy-modal-closed` by wywołać re-render widoku pod modalem.

  - **Paczka PR-A..E (2026-04-30)** — **CRUD inline + autozapis + runner testów + status wizyty**:
    Refaktor po feedbacku PO: wszystkie formularze CRUD (Pacjent, Lek, Diagnoza, Zalecenie, Wizyta) zamienione z modali na **widoki inline** (route-based), z **autozapisem** (debounce 400 ms) zamiast przycisku „Zapisz". Dodatkowo: runner testów PHQ-9 / GAD-7 oraz status wizyty (Robocza / Zamknięta) z możliwością kasacji tylko roboczych.

    **Zmiany w `_store.js`:**
    - Wizyta: nowe pole `closed: false|true` (default `false` = robocza). Nowe metody `closeVisit(id)`, `reopenVisit(id)`, `removeVisit(id)` (gdzie `removeVisit` zwraca `false` dla zamkniętych — guard).
    - Test: `removeTest(id)` (kasacja pojedynczego wyniku).
    - `addVisit` przyjmuje pole `data: { _raw: {} }` jako kontener flat-mapy stanu formularza.
    - Wszystkie historyczne FAKE_VISITS dostały `closed: true` (to wpisy medyczne).

    **Nowe widoki (`js/views/`):**
    - `view-patient-form.js` — `#/patients/new`, `#/patients/edit/:id`. Lazy-create kodu pacjenta (P006 itd.) przy 1. wpisie. Wiek auto z daty urodzenia. Sekcja „Opiekunowie" pokazuje się tylko gdy `minor=true`. Brak 🗑 (zgodnie z PO 2026-04-18) — tylko archiwizacja.
    - `view-med-form.js` — `#/meds/new`, `#/meds/edit/:id`. Select z `FAKE_MED_DICT` (114 preparatów) + opcja „inne (wpisz ręcznie)". Auto-fill substancji + max dawki po wyborze ze słownika.
    - `view-diagnosis-form.js` — `#/diagnoses/new`, `#/diagnoses/edit/:id`. Custom autocomplete ICD-10 (popover, ArrowKeys, Enter, Esc), reuse `searchIcd10` ze słownika.
    - `view-recommendation-form.js` — `#/recommendations/new`, `#/recommendations/edit/:id`. Tytuł, treść (textarea), data, checkbox „zrealizowane" (tylko w trybie edit).
    - `view-visit-form.js` (refactor) — autozapis wszystkich pól do `visit.data._raw` (flat-mapa po `name` z form), `buildSummary()` generuje krótki opis na listę historii. Lazy create przy 1. wpisie + `history.replaceState` na route edycji bez triggerowania hashchange. Header: badge „✏️ Robocza" / „🔒 Zamknięta", przycisk „🔒 Zamknij wizytę" (po confirm) / „🔓 Otwórz ponownie", 🗑 Usuń (tylko draft, po confirm). Read-only overlay (disable inputów) przy `closed=true`.
    - `_tests-catalog.js` — definicje PHQ-9 (9 pytań, 4 opcje 0-3, próg ≥10 = umiarkowana) i GAD-7 (7 pytań, ten sam scoring). `interpret(score)` zwraca interpretację kliniczną. `redFlag(answers)` dla PHQ-9 sprawdza q9 (myśli rezygnacyjne). `computeTestResult(code, answers)` zwraca `{score, answeredCount, totalCount, interpretation, redFlag}`.
    - `view-test-runner.js` — `#/tests/run/:code`. Wszystkie pytania na jednym ekranie (bez nawigacji „następne pytanie"), na końcu „📊 Pokaż wynik" → karta wyniku + interpretacja + (opcjonalnie) czerwona flaga + przyciski „🔄 Wypełnij ponownie" / „💾 Zapisz wynik". Zapis przez `Store.addTest(...)` + toast success + powrót do listy.

    **Zmiany w `app-new.js`:**
    - Usunięte importy modali CRUD (`openPatientModal`, `openMedModal`, `openDiagnosisModal`, `openRecommendationModal`, `openVisitPreviewModal`). Zachowany tylko `openConfirm` z `_modal.js` (jedyny dozwolony modal — potwierdzenia kasacji).
    - Dodane importy widoków inline + `renderTestRunner` + `listAvailableTests`.
    - **ROUTE_MAP rozszerzona** o nowe ścieżki: `#/patients/new`, `#/patients/edit`, `#/diagnoses/new`, `#/diagnoses/edit`, `#/recommendations/new`, `#/recommendations/edit`, `#/meds/new`, `#/meds/edit`, `#/tests/run`.
    - **Live-view skip:** `_renderView(force)` przyjmuje parametr — pasywny re-render (po `Store.subscribe`) pomija widoki z `dataset.live === 'true'` (formularze inline trzymają stan sam). Hashchange zawsze forsuje (`force=true`). Zapobiega zabijaniu focusu/scroll/wartości pola podczas autozapisu.
    - **`viewVisitNew`** klik karty typu → `#/visit/form/new/:typeId` (zamiast bezsensownego ekranu „Symuluj zapis"). Formularz wizyty otwiera się od razu.
    - **`viewHistory`** dodała kolumnę „Status" (badge Robocza/Zamknięta), filtr stanu (Wszystkie / Zamknięte / Robocze), 🗑 przy roboczych, „✎ Edytuj" / „🔍 Otwórz" zamiast „🔍 Szczegóły".
    - **`viewTests`** klik „+ Uruchom test" → inline picker (karty PHQ-9/GAD-7 na tej samej stronie, nie modal) → klik karty → `#/tests/run/:code`. Lista wyników ma 🗑 do kasacji wyniku. Czerwona flaga (PHQ-9 q9) wyświetla 🚨 przed interpretacją.
    - **`resolveRoute`** — fix routingu: warunek `h.startsWith(key + '/') || h === key` (zamiast `h.startsWith(key)`) by `#/patients/new` nie mapowało się na `#/patients`.

    **Zmiany w `_fake-data.js`:** Wszystkie 6 historycznych wizyt dostało `closed: true`.

    **Skasowane pliki:** `js/views/modal-patient.js`, `modal-med.js`, `modal-diagnosis.js`, `modal-recommendation.js`, `modal-visit-preview.js` (zastąpione widokami inline). Zachowane: `_modal.js` (generyczny + `openConfirm`), `_form-helpers.js`, `_icd10-dict.js`, `_meds-dict.js`.

    **CSS dodatki (`css/app-new.css`):** `.psy-vf__sections--readonly` (closed wizyta = tło/cursor inaczej), `.psy-test-runner__q/__q-text/__q-num/__q-options/__option` (runner testów — niebieski lewy border, radio buttons w 1-2 kolumnach), `.psy-new-tests-picker .psy-new-visit-card:hover` (efekt hover na pickerze).

    **Zaktualizowane reguły** w `.clinerules` sekcja 13 (Ustalenia PO 2026-04-30) — dokumentują wszystkie wybory: CRUD inline, brak Zapisz, lazy create, status closed, removeVisit tylko draft, runner testów, kasacja modali.

    **Weryfikacja w przeglądarce (2026-04-30):**
    - `#/patients/new` → formularz inline z breadcrumbem, autozapisem, zero modali ✓
    - `#/history` → badge „🔒 Zamknięta" przy każdej historycznej wizycie, filtr „Wszystkie (4)" ✓
    - `#/visit/new` → klik typu → `#/visit/form/new/followup` → pełny formularz wizyty z badge „✏️ Robocza", przyciskami „🔒 Zamknij wizytę" / „← Wróć do listy" / „🗑 Usuń", 12 sekcji + sticky „Dane wizyty" + dev mode-switcher ✓
    - `#/tests` → klik „+ Uruchom test" → inline picker (PHQ-9, GAD-7) → klik PHQ-9 → runner z 9 pytaniami, instrukcją, opcjami 0-3 ✓


  - **Paczka PR-F (2026-05-01)** — **UX listy / detali pacjenta + centrowanie modali**:
    Po feedbacku PO (sekcja §14 w `.clinerules`) przebudowano UX listy pacjentów oraz dodano nowy widok read-only karty pacjenta wzorowany na ATOL.

    **Nowy widok:** `js/views/view-patient-detail.js` (route `#/patients/detail/:id`, opcjonalnie `/documents` jako tab):
    - Layout dwukolumnowy: lewa kolumna (240 px) — awatar (placeholder z inicjałami) + pionowe zakładki, prawa kolumna — karty „Pacjent" + „Dane kontaktowe + adres zamieszkania + adres korespondencyjny" + „Powiązania z innymi kontami" (jeśli minor lub są opiekunowie).
    - **2 realne zakładki:** „📇 Pacjent" (read-only dane), „📁 Dokumenty" (stub do Fazy 3 — UI gotowy, upload pokazuje toast „Wymaga podpięcia folderu").
    - **5 skrótów** do menu głównego z licznikami: Historia wizyt / Leki / Diagnozy / Zalecenia / Testy. Klik skrótu = `Store.selectPatient(p)` + nawigacja.
    - **Akcje:** „← Wróć do listy" / „✎ Edytuj" (route `#/patients/edit/:id`) / „📦 Archiwizuj pacjenta" / „↩ Przywróć z archiwum" (pełne etykiety, z `openConfirm`).

    **Zmiany w `app-new.js`:**
    - Import `renderPatientDetail` + delegat `viewPatientDetail()`.
    - Nowy route `#/patients/detail` w `ROUTE_MAP` (umieszczony PRZED `#/patients`, by `resolveRoute` go wyłapywał).
    - `viewPatients()` — usunięte przyciski ✎ Edytuj i 📦 Archiwizuj z wiersza listy. Klik wiersza zmieniony z `selectAndGo` na `goToDetail` (otwarcie detali read-only). Pozostał tylko przycisk „Wybierz" (z `stopPropagation` + `selectAndGo` → `#/history`).
    - `_renderPatientTag` — całe tag pacjenta klikalne (klasa `psy-new-patient-tag--clickable`, `onclick: goToDetail(p)`). Przycisk „Zmień" zachowany z `stopPropagation` — nadal kieruje do `#/patients`.
    - Nowa funkcja helper `goToDetail(patient)` jako single source of truth dla nawigacji do detali.

    **Zmiany w `css/app-new.css`:**
    - **Modale globalnie wycentrowane:** `.psy-modal-backdrop` zmieniona z `align-items: flex-start; padding: 40px 16px;` na `align-items: center; padding: 24px 16px;` (centrowanie pionowo + poziomo). Dla bardzo wysokich modali zachowane `overflow-y: auto` + `margin: auto 0` na `.psy-modal`.
    - Dodano sekcję `PATIENT DETAIL VIEW` (~210 linii) z klasami `.psy-patient-detail__layout / sidebar / avatar / tabs / tab / cards / card / field-row / field-label / field-value` itd. + responsywne breakpointy (≤1100px stack cards, ≤900px stack sidebar).
    - Dodano `.psy-new-patient-tag--clickable` z hover background-color (subtelny efekt klikalności tagu w topbarze).

    **Status struktury folderowej (odpowiedź na pyt. PO):**
    - **Stara apka** (`index.html` + `xlsx-handler.js`/`gdrive-handler.js`) wspiera folder lokalny i Sheety, ale BEZ docelowego modelu folderowego per pacjent. To jest ZAPLANOWANE w Fazie 3 (PR-10/PR-11): `ensureRootFolder('pacjenci')` + `ensurePatientFolder(p)` + `listPatientAttachments(p)`.
    - **Nowa apka** (`app.html` + `app-new.js`) na razie używa wyłącznie localStorage (`psy-new:data`). Storage providery nie są podpięte. Przyciski „📁 Folder pacjentów" i „☁️ Google Drive" w topbarze pokazują tylko toast informacyjny.
    - **Wniosek:** zakładka „Dokumenty" w detalach pacjenta jest STUB-em UI gotowym do podpięcia gdy w Fazie 3 zaimplementujemy storage adapter dla nowej apki.

    **Zaktualizowane reguły** w `.clinerules` sekcja 14 (Ustalenia PO 2026-05-01) — dokumentują wszystkie powyższe wybory.


  - **Paczka PR-G (2026-05-01 cd.)** — **wizyty UX + reset folderu + pola formularzy z VISIT_FORM_SPEC**:

    **G1 · Wizyty UX (status, klik wiersza, sekcja „Dane wizyty"):**
    - `_store.js`: `removeVisit` bez guard'a `closed` (PO 2026-05-01 wycofał status z UI). Pole `closed` zostaje w danych jako legacy. Nowa metoda `wipeAll()` — czyści localStorage do zera (bez seed-a; symuluje pierwsze uruchomienie).
    - `view-visit-form.js`: usunięto status badge „Robocza"/„Zamknięta", przyciski „🔒 Zamknij wizytę"/„🔓 Otwórz ponownie", read-only overlay przy `closed=true`. 🗑 Usuń zawsze widoczne w nagłówku (gdy nie isNew). Sekcja sticky „Dane wizyty" → collapsible details (default closed) z preview-line w summary (`data · godzina · typ wizyty · czas · osoby`); `updateVisitDataPreview()` aktualizuje preview po każdym autozapisie. Wszystkie sekcje formularza ignorują `defaultOpen` ze schematu — default closed.
    - `app-new.js` (`viewHistory`): usunięto kolumnę „Status" + filtr stanu + kolumnę akcji. Cały `<tr>` klikalny → `#/visit/form/:id`. Tło wiersza wg `paid`: niezapłacona = `.psy-row-unpaid` (żółtawe), zapłacona = białe. Badge w kolumnie „Płatność" zachowany (klikalny `togglePaid`).
    - Usunięto `viewVisitDetail` + route `#/visit/detail` z `ROUTE_MAP` (redundantny widok).

    **G2 · Reset / odłączenie folderu (dev):**
    - `_store.js`: nowa metoda `Store.wipeAll()` (bez seed-a, czysty start).
    - `viewSettings`: sekcja przemianowana na „Stan lokalnego folderu (dev)" z dwoma przyciskami:
      - **🔌 Odłącz folder & wczytaj demo** → `Store.resetAll()` + redirect `#/patients`.
      - **🧹 Wyczyść wszystko (czysty start)** → `Store.wipeAll()` + redirect `#/patients`.
    - Oba z `openConfirm`. Przycisk topbar „🔌 Odłącz" odłożony — sekcja Settings wystarczy.

    **G3 · Pola w formularzach z `VISIT_FORM_SPEC.md` §2.16/§3 + notatki PO:**
    - `view-recommendation-form.js`: dodane 4 pola — `type` (select REKOMENDACJE_TYP), `dueWhen` (select KONTROLNA_TERMIN), `dueDate` (data konkretna), `linkedVisitId` (select wizyt pacjenta). `buildVisitOptions()` lista chronologiczna z formatem „YYYY-MM-DD · typ · krótki opis".
    - `view-diagnosis-form.js`: dodane 1 pole — `linkedVisitId` (powiązanie z wizytą gdzie rozpoznanie zostało postawione/odnowione). Źródło: `notatki.txt` linia „rozpoznania, leki itp są grupowane per wizyta".
    - `view-med-form.js`: NIE zmieniony w tej paczce — wymaga rozpoznania obecnej struktury (osobny PR).
    - **Brak zmian w listach** (`viewMeds`/`viewDiagnoses`/`viewRecommendations`): pole `linkedVisitId` zapisane w Store, ale wyświetlanie kolumny „Wizyta" w listach jest opcjonalne i zostawione na przyszły PR (gdy fake-data dostanie tę referencję).

    **CSS (`css/app-new.css`):**
    - `.psy-vf__summary-preview` — preview-line w summary (kolor `#475569`, ellipsis, flex 1 1 auto).
    - `.psy-vf__section--datadown[open]` — niebieski `border-left: 4px solid #2563EB` dla otwartej sekcji „Dane wizyty"; `:not([open]) > .psy-vf__summary` — tło jasnoniebieskie żeby wyróżnić tę sekcję.
    - `.psy-new-table tbody tr.psy-row-unpaid` — tło `#FFFBEB`, hover `#FEF3C7`.
    - `.psy-new-table--clickrows tbody tr:hover` — tło `#F1F5F9`.

    **Zaktualizowane reguły** w `.clinerules` sekcja **15** (Ustalenia PO 2026-05-01 cd.) — dokumentują wszystkie powyższe wybory.


  - **Paczka PR-J (2026-05-11)** — **sticky profil pacjenta + menu 10 sekcji + 5 podzakładek pacjenta + Plan/Parametry/Dokumenty**:
    Pełna analiza wymagań w `docs/REQUIREMENTS_2026-05-11.md` (zdjęcia od klientki `docs/z1.jpg`..`docs/z7.jpg`).

    Realizacja w 9 mini-PR-ach (J1–J9) wg ustalenia PO 2026-05-11 „idziemy szerokim frontem":

    - **PR-J1 · Placeholder logo w topbarze.** `index.html` linia 25: `<div class="psy-new-brand">PsychoApp</div>` → `<div class="psy-new-brand psy-new-brand--placeholder">Logo lub nazwa aplikacji</div>`. CSS w `app-new.css`: ramka punktowana, kursywa, jasne tło, kolor `#94A3B8`. `<title>` i `<noscript>` zachowują „PsychoApp" (kod wewnętrzny).

    - **PR-J2 · Sticky profil pacjenta z lupą.** `_renderPatientTag()` w `app-new.js`: rozszerzenie do wyrazistego paska (laptop 14"/tablet). Treść: `[ikona ♂/♀] [PESEL] [Imię (II imię) Nazwisko] [wiek] [📞 tel] [✉ mail] [badge Pełnoletni/Nieletni auto] [🔍 lupa]`. Badge auto wyliczany z `dataUrodzenia` (≥18 lat = jasny niebieski `#E0F2FE`, <18 = jasny róż `#FCE7F3`). Lupa otwiera popover z `<input>`em search + listą wyników (filtr po imię/nazwisko/kod/PESEL); klik wyniku → `Store.selectPatient(p)` + redirect `#/patients/detail/:id`. Przycisk „Zmień" zachowany.

    - **PR-J3 · Menu 10 pozycji + submenu „Nowa wizyta".** `_menu.js`: nowa lista `APP_MENU` w kolejności wg z2+z4: 1) + Nowa wizyta (z polem `submenu: VISIT_TYPES`), 2) Historia wizyt, 3) Leki, 4) Testy, 5) Zalecenia, 6) Plan leczenia (NOWE), 7) Dane identyfikacyjne (rename z „Pacjent"), 8) Diagnozy, 9) Parametry (NOWE), 10) Dokumenty (NOWE). `_renderSidebar()` w `app-new.js` wspiera `submenu` — klik rozwija/zwija listę kafelków typów notatek; klik kafelka → `#/visit/form/new/:typeId`. Stan rozwinięcia trzymany w `_sidebarState.visitNewExpanded`.

    - **PR-J4 · 6 typów notatek wizyt.** `_visit-dict.js` `VISIT_TYPES` zredukowany do: `first_meeting`, `next_meeting`, `supervision`, `admin_note`, `phone_contact`, `email_contact`. Bez migracji legacy `interview`/`followup`/`diagnosis` (klientka: „apka jeszcze nie działa"). `FAKE_VISITS` w `_fake-data.js` zaktualizowane na nowe `typeId`. `resolveMode(typeId)` w `view-visit-form.js` mapuje: `first_meeting` → `first`, wszystko inne → `followup` (z możliwością przełączenia dev-switcherem).

    - **PR-J5 · Historia wizyt jako strumień akapitów.** `viewHistory()` w `app-new.js` przebudowany z `<table>` na listę `<article>`-akapitów. Sortowanie: od najnowszej (`b.date - a.date`). Każdy akapit:
      - nagłówek: `[NAZWA NOTATKI] · [typ wizyty] · [data] · [📅 godzina] · [💰 badge płatność]`
      - body: pełna treść z `visit.data._raw` (mapowanie wszystkich wypełnionych pól, bez `buildSummary()`)
      - klik akapitu → `#/visit/form/:id`
      - tło akapitu: `paid=false` → `#FFFBEB`, `paid=true` → białe.
      Klasa `.psy-history-paragraph`.

    - **PR-J6 · 5 podzakładek w „Dane identyfikacyjne" + usunięcie pola Kraj.** Refactor `view-patient-detail.js`:
      - drugi rząd tabs w prawej kolumnie: `Ogólne / Osoby upoważnione / Zgoda RODO / Inne / Opieka medyczna`
      - **Ogólne**: dotychczasowe pola pacjenta (PESEL, imię, II imię, nazwisko, adres) **minus pole „Kraj"**
      - **Osoby upoważnione**: lista wpisów z polami Imię, Nazwisko, Telefon, Komentarz; przyciski „+ Dodaj osobę" / 🗑 per wpis; współdzielone z istniejącymi `patient.guardians[]` (rozszerzone o pole `komentarz`)
      - **Zgoda RODO**: checkbox `consents.rodo`, data `consents.rodoDate`, textarea `consents.rodoComment`
      - **Inne**: wolne pole textarea `patient.otherInfo`
      - **Opieka medyczna**: lista wpisów `patient.medicalCare[]` z polami `firstName, lastName, specialty, dateFrom, dateTo, comment`; przyciski „+ Dodaj wpis" / 🗑 per wpis
      Wszystkie pola z autozapisem (debounce 400 ms).

    - **PR-J7 · Nowy widok „Plan leczenia".** `view-treatment-plan.js`:
      - drzewo celów L1 (główne) + L2 (podcele) + zadania per cel
      - klik „+ Dodaj cel" — lazy create rekordu `treatmentPlan.goals[]`
      - per cel: pola `title`, `description`, `priority` (low/medium/high), lista `tasks[]` (każde z `text`, `done`, `dueDate`)
      - autozapis 400 ms
      - route `#/treatment-plan`
      Klientka: „Plan leczenia robiony wspólnie z doktorem — inaczej niż Zalecenia (do domu)".

    - **PR-J8 · Nowy widok „Parametry".** `view-parameters.js`:
      - pola na górze (od klientki): wzrost (cm), waga (kg), BMI auto (z wzrost+waga), ciśnienie skurczowe (mmHg), ciśnienie rozkurczowe (mmHg), tętno (bpm)
      - poniżej placeholder „Dodatkowe parametry — sekcja w rozwoju" (klientka: „reszta niżej, na przyszłość")
      - autozapis 400 ms na każdym polu
      - route `#/parameters`
      - dane w `patient.parameters{}`

    - **PR-J9 · Nowy widok „Dokumenty" (stub).** `view-documents.js`:
      - karta `<psy-file-input>` z napisem „Upload zostanie podpięty w Fazie 3 (storage)"
      - lista placeholder „Brak dokumentów (struktura folderowa: `pacjenci/{KOD}/`)" — gotowy slot pod `listPatientAttachments(p)` z PR-10/PR-11
      - route `#/documents`

    **Zmiany w Store (`_store.js`):**
    - rozszerzony patient: `consents{rodo, rodoDate, rodoComment}`, `otherInfo`, `medicalCare[]`, `parameters{}`, `treatmentPlan{goals[]}`
    - rozszerzone guardian: dodatkowo pole `komentarz`
    - nowe metody: `addMedicalCareEntry(patientId, entry)`, `removeMedicalCareEntry(patientId, idx)`, `addTreatmentGoal(patientId, goal)`, `removeTreatmentGoal(patientId, goalId)`, `addTask(patientId, goalId, task)`, `removeTask(patientId, goalId, taskIdx)`
    - migracja seedu: istniejące pacjenci z `_fake-data.js` dostają puste obiekty consents/parameters/treatmentPlan/medicalCare, by stary zapis localStorage się nie wykrzaczał

    **Routing (`ROUTE_MAP` w `app-new.js`):** dodane `#/treatment-plan`, `#/parameters`, `#/documents`. Wszystkie wymagają wybranego pacjenta (jak `#/history`).

    **CSS (`css/app-new.css`):** klasy `.psy-new-brand--placeholder`, `.psy-new-patient-tag--big` (rozszerzony pasek), `.psy-new-patient-tag__field`, `.psy-new-patient-tag__badge--adult/--minor`, `.psy-new-search-popover` + items, `.psy-new-sidebar__submenu`, `.psy-history-paragraph` + nagłówek, sekcja podzakładek pacjenta, plan-leczenia tree, parameters grid, documents stub.

    **Zaktualizowane reguły** w `.clinerules` sekcja **17** (Ustalenia PO 2026-05-11).


- [ ] **Faza 3 — Google Drive folderowy**

  - [ ] 3.A config `rootFolderName` (default „pacjenci”) + `rootFolderId`
  - [ ] 3.B metody ensureRoot/ensurePatientFolder/listPatients/sheet/attachments (PR-10, PR-11)
  - [ ] 3.C spójny kontrakt w StorageProvider
  - [ ] 3.D UX folder gate + status badge (PR-12)
- [ ] **Faza 4 — IA + placeholdery**
  - [ ] 4.A finalne menu zatwierdzone
  - [ ] 4.B hash-routing + psy-sidebar z danymi (PR-13)
  - [ ] 4.C makiety: Nowa wizyta (drawer vs widok), Wywiad, Kolejna wizyta, Dokumenty, Załączniki, Ustawienia (PR-14)
- [ ] **Faza 5 — Logika biznesowa**
  - [ ] 5.A Wywiad + Wizyta + aktualizacja arkuszy (PR-15)
  - [ ] 5.B Dokumenty (PR-16)
  - [ ] 5.C Załączniki z podglądem + komentarze (PR-17)
  - [ ] 5.D Testy + porównania (PR-18)
  - [ ] 5.E Plan terapii (PR-19)
  - [ ] 5.F Google Kalendarz (PR-20)
  - [ ] 5.G Podpowiedzi AI — opcjonalnie (PR-21)
  - [ ] 5.H Hardening: walidacje, autozapis, A11y, testy manualne (PR-22)

---

## 9. Słownik nazw (żeby nie było nieporozumień)

- **Wizyta** = dawna „Sesja SOAP”. Do potencjalnej unifikacji po akceptacji klientki.
- **Wywiad kliniczny** = pierwsza wizyta (bardziej rozbudowany formularz).
- **Kolejna wizyta** = wizyta śledząca (krótszy formularz, różnice vs poprzednia).
- **Nowa wizyta (skrót)** = szybka forma tworzenia wizyty (wariant do wyboru: drawer / osobny widok).
- **Root `pacjenci`** = folder główny w Drive lub na dysku lokalnym.
- **Sheet/Arkusz pacjenta** = plik Google Sheet (Drive) lub XLSX (local) z zakładkami `Dane/Wywiad/MSE/Sesje/Testy/Plan`.

---

**Koniec dokumentu.** Po zatwierdzeniu przez PO i klientkę (lub po prostu „ruszamy”) zaczynamy od **PR-01** (`tokens.css` + theme--compact + porównanie w demo).
