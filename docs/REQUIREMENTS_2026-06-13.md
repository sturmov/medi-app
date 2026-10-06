# Wymagania PO — spotkanie 2026-06-13

> Źródło: luźne notatki ze spotkania z klientką + decyzje PO doprecyzowujące.
> Status: **wymagania zaakceptowane, czeka na paczkę PR**.
> Następna sesja: rozpisać konkretny plan PR-ów i wejść w implementację.

---

## 🧭 1. Główna idea — Historia wizyt jako jedyne źródło prawdy

```
                ╔══════════════════════════════════════╗
                ║   📜  HISTORIA WIZYT                  ║
                ║   ═ JEDYNE ŹRÓDŁO PRAWDY ═            ║
                ║   (tu wpisujemy WSZYSTKO)             ║
                ╚══════════════════╤═══════════════════╝
                                   │
            ┌──────────┬───────────┼───────────┬──────────────┐
            ▼          ▼           ▼           ▼              ▼
       🏥 Diagnozy  💊 Leki   📈 Parametry  🎯 Plan       ✅ Zalecenia
       (read-only) (r/o)      (r/o)        leczenia      (r/o)
       extract     extract    extract       (r/o)         extract
       z wizyt     z wizyt    z wizyt       extract       z wizyt
                                            z wizyt
       ─────────  ─────────  ─────────   ─────────      ─────────
       sortowane wg DATY wizyty (oś czasu), bez własnego CRUD-a
```

**Konsekwencje:**
- Boczne menu (Diagnozy / Leki / Parametry / Plan leczenia / Zalecenia) = **strony read-only**, agregaty/projekcje na historię wizyt. Pozycje w menu **zostają** (§7 decyzji) — przydatne do skanu osi czasu.
- Lekarz wpisuje rozpoznanie / lek / parametr **w formularzu wizyty**, nie w osobnej zakładce CRUD.
- Model przejścia: **z „CRUD per encja" → na „dziennik wizyt + projekcje"**.

---

## 🔁 2. Read-only ↔ Edit toggle w formularzu wizyty

Najważniejsza zmiana UX. Każda sekcja formularza wizyty ma 2 stany:

```
  ─────────────────────── PO WYJŚCIU FOCUSU (blur) ───────────────────────

  ┌─ Sen (EDIT) ─────────────────┐                ┌─ Sen ─────────────────────────────┐
  │ ○ dobry    ● przerywany       │   ─focus─▶    │ przerywany                          │
  │ ○ bezsenność  ○ nadmierna     │   tracony      │ ↳ wybudza się o 3:00, od 2 mies.   │
  │ ↳ wybudza się o 3:00...       │                │ [zwarty tekst, jak akapit notatki] │
  └──────────────────────────────┘                └────────────────────────────────────┘
                                                                  │
                                                             klik w sekcję
                                                                  ▼
                                                   ┌─ Sen (EDIT) ─────────────────────┐
                                                   │ ○ dobry    ● przerywany           │
                                                   │ ○ bezsenność  ○ nadmierna         │
                                                   │ ↳ [wybudza się o 3:00...]         │
                                                   └────────────────────────────────────┘
```

**Reguły:**
- **Default po wejściu w formularz**:
  - sekcja **już ma dane** → render jako `view` (read-only)
  - sekcja **pusta** → render jako `edit`
- **Trigger `edit → view`**: blur focus poza sekcję (klik w inny element strony)
- **Trigger `view → edit`**: klik gdziekolwiek w obszarze sekcji
- W trybie `view` widać **tylko zaznaczone opcje** (np. tylko „przerywany"), nie wszystkie do wyboru
- **Wszystkie wizyty zamknięte = stos akapitów** — estetyka spójna z obecną Historią wizyt (PR-J15)

**Wygląd nagłówka sekcji w trybie `view` (decyzja PO #1):**
- Nagłówek sekcji jako **delikatna labelka** — obecny tytuł sekcji ma być **mniej wyrazisty** (mniejszy font, jaśniejszy kolor, bez bordera/tła sekcji). „Niech będzie, ale niech się nie wybija."
- Bez ikonki „✎" — cała sekcja klikalna.

---

## 📦 3. Dane wizyty — kompaktowy „jednooknowy" widok

```
  AKTUALNIE                              PO ZMIANIE
  ┌─ Dane wizyty (sticky, 5 wierszy) ┐  ┌─ Dane wizyty ────────────────────┐
  │ Data:    [____]                   │  │ Data: [____]   Rodzaj: [▾]      │
  │ Rodzaj:  [▾]                      │  │ Osoby: [▾▾▾]   Czas: [__]       │
  │ Osoby:   [▾▾▾]                    │  │ Powód: [______________________]  │
  │ Powód:   [______]                 │  └──────────────────────────────────┘
  │ Przemoc: ○○○                     │
  └─────────────────────────────────┘    [Doświadczenie przemocy → OSOBNA sekcja]
```

- Wszystko w **jednym oknie / grid 2-kolumnowym**, kompaktowo, bez akordeonu.
- Pole „doświadczenie przemocy" **wycięte z sekcji `visitData`**.

---

## ⚠️ 4. Doświadczenie przemocy — oddzielna sekcja

- **Pozycja w schemacie**: **3** (po sekcji „Wywiad", przed „Aktualnym problemem zdrowotnym") — decyzja PO #2.
- **Widoczność**: **zawsze widoczne** (nie `onlyIn: 'first'`) — temat wagi klinicznej, może wracać na kolejnych wizytach.
- **Pola**: radio (`VISIT_DICT.PRZEMOC`) + textarea/uwagi.

---

## 📈 5. Parametry somatyczne — uproszczone

**Sekcja `parametry` w formularzu wizyty:**

```
┌─ Parametry somatyczne ──────────────────────────────────┐
│ Wzrost: [__] cm   Waga: [__] kg   BMI: [_._] (auto)     │
│                                                          │
│ Komentarz: [____________________________________________]│
│            [____________________________________________]│
└──────────────────────────────────────────────────────────┘
```

- Zostają: **wzrost / waga / BMI auto / komentarz** (4 pola).
- Wylatuje: **najniższa masa, najwyższa masa**.
- Wszystko w **jednym oknie / grid 3-kolumnowym** + textarea pod spodem.

**Strona `view-parameters.js` (boczne menu):**
- Kasujemy **cały dolny grid** (ciśnienie skurczowe / rozkurczowe / tętno) — decyzja PO #3.
- Zostają tylko wzrost / waga / BMI auto.
- Po refaktorze ta strona staje się **read-only osią czasu parametrów** (kolejność DATA wizyty → wzrost/waga/BMI z tej wizyty), zgodnie z modelem § 1.

---

## 🏥 6. Diagnoza — radykalne uproszczenie

```
  AKTUALNIE                                  PO ZMIANIE
  ┌──────────────────────────────────┐       ┌──────────────────────────────────┐
  │ Kod ICD-10:    [F32.1]           │       │ Rozpoznanie:                      │
  │ Opis:          [Epizod...]       │  ──▶  │   [F32.1 — Epizod depresyjny... ▾]│
  │ Status:        [▾ aktualne]      │       │   (jedno pole, kod + opis razem)  │
  │ Data nadania:  [2026-06-13]      │       │                                   │
  │ Autor:         [________]        │       │  (data + autor: AUTO, ukryte      │
  │ Powiązana wizyta: [▾]            │       │   z kontekstu wizyty)             │
  └──────────────────────────────────┘       └──────────────────────────────────┘
                                              + diagnoza = część formularza wizyty
                                                (nie osobny widok CRUD)
```

**Decyzje PO:**
1. **Jedno połączone pole** — autocomplete-select pokazujący od razu `kod — opis`.
2. **Pole `description` znika** (zlepione z kodem).
3. **Pole `status` znika**.
4. **`assignedAt` (data) + `author` (autor)** → wypełniane automatycznie:
   - `assignedAt = visit.date`
   - `author = Store.state.currentUser || 'lek. prowadzący'`
5. **Diagnoza = inline w wizycie**: sekcja `rozpoznanie` (2.15 w schemacie) zamiast link-view `🔍 Diagnozy →` dostaje **inline picker + listę** rozpoznań tej wizyty.
6. Strona `#/diagnoses` (boczne menu) = **read-only oś czasu** wszystkich rozpoznań pacjenta.

**Decyzje PO #6 (ICD-10 zakres):**
- **Wszystkie kody ICD-10** dostępne (nie filtr F-only) — decyzja #4.
- W aktualnej **wersji demo** nie muszą być wszystkie kody załadowane — ważne, żeby **architektura słownika ICD-10** (`_icd10-dict.js`) była przygotowana tak, by **łatwo dorzucić pozostałe kody później** (Z-codes, R-codes, choroby somatyczne itp.) bez przepisywania logiki.
- **Stary `view-diagnosis-form.js` kasujemy całkowicie** — nic legacy nie potrzeba (decyzja #5).

---

## 💊 7. Sekcja leki — uproszczenie

| Pole | Dziś | Po zmianie |
|---|---|---|
| Nazwa handlowa | `Sertraline (Sertralina)` w dropdownie | `Sertraline` — sama nazwa, bez nawiasu |
| Substancja czynna | osobne pole edytowalne | widoczne, ale **read-only** auto-fill ze słownika |
| Aktualna dawka | tekst „100 mg/d" | **liczba** + jednostka **dziedziczona z `maxDose`** |
| Max dawka | tekst edytowalny | **read-only** (auto z bazy) |
| Sekcja „Ordynacja" (data + przepisał + notatki) | jest | **cała sekcja wylatuje** (decyzja PO #6) |

```
PO ZMIANIE:

┌─ Lek ────────────────────────────────────────────────────────┐
│ Nazwa handlowa:    [Sertraline                              ▾]│
│ Substancja czynna:  Sertralina                  (auto, r/o)   │
│ Grupa:              SSRI                        (auto, r/o)   │
│                                                                │
│ Aktualna dawka:    [____] mg/d   ← jednostka z max dawki      │
│ Max dawka:          200 mg/d                    (auto, r/o)   │
└────────────────────────────────────────────────────────────────┘
```

**Konsekwencja modelu § 1**: Lek = część wizyty (sekcja `farmakoterapia` 2.8). Strona `#/meds` = read-only oś czasu („od 14.05.2026 — Sertraline 100→150 mg/d").

---

## 🔒 8. Zamknięcie wizyty + pola wymagane — ODŁOŻONE

Klientka: „**ale to później**". Backlog:
- Mechanizm „zamknij wizytę" (przycisk „🔒")
- Lista pól `required: true` które muszą być wypełnione przed zamknięciem
- Walidacja inline na blur
- Status sekcji „kompletne / brak danych"

→ **Pomijamy w obecnej paczce.**

---

## 🗺️ Mapa zadań — proponowana kolejność PR-ów

```
   ┌──────────────────────────────────────────┬──────────────────────────────────────────┐
   ▼                                          ▼                                           ▼
┌─PR-A─────────────┐               ┌─PR-B─────────────────┐               ┌─PR-C────────────────┐
│ Read-only ↔ edit │               │ Boczne menu = views  │               │ Drobne sekcje wizyty │
│ toggle wewnątrz   │               │ read-only ekstrakt   │               │ • Dane wizyty 1-okno │
│ formularza wizyty │               │ z wizyt              │               │ • Przemoc oddzielnie │
│                   │               │ • Diagnozy           │               │ • Parametry: 3+kom.  │
│ (NAJWIĘKSZA       │               │ • Leki               │               │ • Lek: ordynacja out │
│  zmiana UX,       │               │ • Parametry          │               │ • Diagnoza inline    │
│  fundament reszty)│               │ • Plan leczenia      │               │                       │
│                   │               │ • Zalecenia          │               │                       │
└──────────┬────────┘               └──────────┬──────────┘               └────────┬─────────────┘
           │                                    │                                    │
           └──────────────────┬─────────────────┴────────────────────────────────────┘
                              ▼
                     ┌─────────────────────┐
                     │ PR-D (LATER):        │
                     │ • zamknięcie wizyty   │
                     │ • pola wymagane       │
                     │ • walidacja blokująca │
                     └─────────────────────┘
```

**Sugerowana kolejność wdrożenia:**
1. **PR-A** — toggle r/o↔edit. To fundament — wszystkie kolejne sekcje będą żyć w tym dwustanie.
2. **PR-C** — drobne sekcje (Dane wizyty 1-okno, Przemoc oddzielnie, Parametry uproszczone, Lek bez ordynacji, Diagnoza inline). Można podzielić na sub-PR jeśli za duże.
3. **PR-B** — boczne menu jako read-only views (po dopracowaniu schemy).
4. **PR-D** — LATER (czeka aż klientka zdefiniuje listę pól wymaganych).

---

## 📌 Tabela finalnych decyzji PO (2026-06-13)

| # | Pytanie | Decyzja PO |
|---|---|---|
| 1 | Read-only `view` — nagłówek sekcji + ikonka? | Nagłówek jako **delikatna labelka** (mniej wyrazista, nie wyróżniona bardzo), bez ikonki, cała sekcja klikalna |
| 2 | „Doświadczenie przemocy" — onlyIn i pozycja? | **Zawsze widoczne, pozycja 3** (po Wywiadzie) |
| 3 | Parametry — ciśnienie + tętno też kasujemy? | **TAK, cały dolny grid out** — zostają wzrost/waga/BMI/komentarz |
| 4 | Diagnoza — filtr F-only czy wszystkie ICD-10? | **Wszystkie ICD-10**, format `kod — opis` |
| 5 | Stary `view-diagnosis-form.js` — kasujemy? | **TAK, całkowicie**. Nic legacy |
| 6 | Diagnoza demo — czy wszystkie kody mają być załadowane? | **Aktualnie demo** = ograniczony zbiór; ale architektura słownika musi **łatwo skalować** do pełnego ICD-10 później |
| 7 | Lek „ordynacja" — cała sekcja czy tylko „Przepisał(a)"? | **Cała sekcja out** (data + przepisał + notatki) |
| 8 | Menu boczne — kasujemy te pozycje? | **Zostają** jako read-only przegląd osi czasu |

---

## 💡 Sumaryczna interpretacja

> Apka przechodzi z modelu **„CRUD per encja"** (diagnoza/lek/parametr osobno) na model **„dziennik wizyt + projekcje"**. Wizyta staje się dokumentem-rekordem, a wszystkie boczne strony to **filtry / osie czasu**. To dużo bardziej przypomina realny workflow lekarza (jeden formularz = jedna wizyta, reszta jest pochodną).
>
> Plus: tryb **„read-only po wyjściu focusu"** sprawia, że ekran nie wygląda jak puste pole formularza, tylko jak **gotowa notatka kliniczna** — spójnie z PR-J15 (historia wizyt jako stos akapitów).

---

## 📂 Pliki do dotknięcia (oszacowanie)

| Plik | Zakres zmian |
|---|---|
| `js/views/_visit-form-schema.js` | dodać sekcję „Doświadczenie przemocy" (pos. 3); wyciąć `przemoc` z `visitData`; zredukować `parametry` do 3 pól + komentarz; zmienić `rozpoznanie.diagnozy` z `link-view` na inline |
| `js/views/view-visit-form.js` | wprowadzić tryb `view`/`edit` per sekcja (toggle on blur/click); dodać renderer „kompaktowy 1-okno" dla `visitData` i `parametry` |
| `css/app-new.css` + `css/compact-new.css` | style dla read-only akapitów + delikatne labelki sekcji |
| `js/views/view-diagnoses.js` | przepisać na read-only oś czasu (z wizyt) |
| `js/views/view-meds.js` | przepisać na read-only oś czasu |
| `js/views/view-parameters.js` | usunąć dolny grid (ciśnienie/tętno); przepisać na oś czasu z wizyt |
| `js/views/view-recommendations.js` | read-only oś czasu |
| `js/views/view-treatment-plan.js` | read-only oś czasu |
| `js/views/view-med-form.js` | usunąć sekcję „Ordynacja"; nazwa bez nawiasu w dropdownie; aktualna dawka jako number + unit z maxDose; maxDose readonly |
| `js/views/view-diagnosis-form.js` | **DO USUNIĘCIA** (zastąpione inline w wizycie) |
| `js/views/_icd10-dict.js` | przegląd architektury słownika — przygotować pod łatwe dorzucenie pełnego ICD-10 |
| `js/views/_store.js` | API: `Store.getDiagnosesFromVisits(patientId)`, `getMedsFromVisits()`, `getParametersFromVisits()` itd. — agregatory dla projekcji |
| `js/app-new.js` | routing — sprawdzić czy `#/diagnoses/new` i `#/diagnoses/edit` mają nadal sens (raczej redirect do wizyty) |

---

## ⏭️ Następny krok

W kolejnej sesji: rozpisanie konkretnego planu **PR-A** (toggle r/o↔edit) — szczegóły implementacji, lista plików per sub-paczka, oszacowanie czasu, test ręczny. Po akceptacji — kodowanie.
