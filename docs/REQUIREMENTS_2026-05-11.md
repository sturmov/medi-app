# Wymagania PsychoApp — pakiet 2026-05-11

> **Źródło:** zdjęcia `docs/z1.jpg` … `docs/z7.jpg` (notatki klientki narysowane na zrzutach: 1) starego szwedzkiego systemu medycznego jako inspiracja layoutowa oraz 2) naszego aktualnego widoku `view-patient-detail.js`).
>
> **Status decyzji PO (siostra-PM klientki):** zatwierdzone w rozmowie 2026-05-11. Idziemy szerokim frontem — wszystkie etapy (PR-J1 → PR-J9) realizowane w jednej serii.
>
> **Autor dokumentu:** Cline (na podstawie zdjęć + odpowiedzi PO z 2026-05-11).

---

## 0. Streszczenie kierunkowe

Klientka — psycholog pracująca na **laptopie 14"** lub **tablecie** — chce, aby:

1. W **pasku górnym** zniknął napis „PsychoApp"; w jego miejsce pojawia się placeholder pod logo z tekstem **„Logo lub nazwa aplikacji"** (na razie bez pliku graficznego).
2. **Profil pacjenta był stale widoczny na górze** ekranu — z dużymi, **czytelnymi** danymi (PESEL, imię, drugie imię, nazwisko, płeć, wiek, telefon, mail), wraz z badge'em automatycznie wyliczanym z daty urodzenia („Pełnoletni" / „Nieletni"). Odcienie tła badge'a delikatne — nie krzyczące.
3. W pasku górnym była **ikona lupy** (🔍) otwierająca **wyszukiwarkę pacjenta** — wpisuję frazę, klikam wynik → **natychmiastowe przełączenie pacjenta** bez wchodzenia w listę.
4. **Lewy panel boczny** był rozbudowany z 6 do **10 pozycji** (drzewo sekcji per pacjent), a pierwsza pozycja „Nowa wizyta" rozwijała submenu z **6 kafelkami typów notatek** zamiast otwierać osobny widok.
5. Karta **„Dane identyfikacyjne"** (rename z „Pacjent") miała **5 wewnętrznych zakładek** (Ogólne / Osoby upoważnione / Zgoda RODO / Inne / Opieka medyczna).
6. **Historia wizyt** wyglądała jak chronologiczny strumień akapitów (najnowsza u góry), bez skrótów, z pełnym opisem każdej wizyty.
7. Powstały **3 nowe sekcje** pacjenta: **Plan leczenia** (osobno od Zaleceń), **Parametry** (na razie minimalny zestaw — wzrost/waga/BMI/ciśnienie/tętno), **Dokumenty** (stub UI gotowy na podpięcie storage w Fazie 3).

---

## 1. Mapa zdjęć → wymagania

### 1.1 `z1.jpg` — **SEKCJE**
- Górny screen: drzewo sekcji w starym systemie (listy folderów typu „Enhetens anteckningar / Basdata / Levnadsvanor / Akut och slutenvård / …") + okno wybranej notatki po prawej.
- Strzałka pokazuje, że dotyczy to naszego **lewego sidebara** w `view-patient-detail.js`.
- Pytanie klientki: „**JAK MA WYGLĄDAĆ PANEL?**" — prosi o makietę panelu pacjenta wzorowanego na drzewie sekcji.

**Wymaganie #1:** lewy panel pacjenta = drzewo sekcji, nie pojedyncza lista.

### 1.2 `z2.jpg` — **NAZWY / STYL**
- Górny screen: rozbudowana, długa lista plików w drzewie (Vårdplaner → VP_Sår 2019-11-14, VP_Allmän 2019-10-21, VP_Levertransplantation 2020-…) → przykład **chronologicznej historii**.
- Strzałka pomarańczowa pokazuje nasz sidebar (Historia wizyt / Leki / Diagnozy / Zalecenia / Testy / + NOWA WIZYTA).
- Dopisek **„NAZWY"** + **„STYL"** sygnalizuje rebranding pozycji menu + styl wizualny.
- **„1) Nowa wizyta * → opcje rozwijające się w dół"** — klik „Nowa wizyta" rozwija submenu.
- **„2) Historia wizyt"** — początek listy 10 zakładek (kontynuacja w `z4.jpg`).

**Wymaganie #2:** „Nowa wizyta" jest **dropdown'em w sidebarze** — kliknięcie rozwija/zwija listę typów notatek (klientka mówi: „**kafelki to takie submenu**").

### 1.3 `z3.jpg` — **DANE IDENTYFIKACYJNE + PROFIL PACJENTA (sticky bar)**
Górny screen: pasek pacjenta wzorowany na szwedzkim — `19 101010-1010, test testare, testsson, 110 år` (PESEL, imiona/nazwisko, wiek), płeć (ikona), ikona zamknięcia/wyjścia.

Adnotacje klientki:
- **ZAWARTOŚĆ paska**: PESEL · IMIĘ NAZWISKO · 2gie IMIĘ · PŁEĆ · „WIĘCEJ INFO" (ikona po prawej).
- **„ja bym dodała: tel., mail."** — dodatkowe pola w pasku.
- **„STATUS — NIELETNI/PEŁNOLETNI"** — auto, klientka pisze „my możemy inaczej to zrobić" (czyli badge zamiast „110 år" rytm szwedzki).
- **„WIDOCZNY PRZEZ CAŁY CZAS PROFIL PACJENTA"** — sticky we wszystkich widokach.
- **„tutaj to oznacza wyjście; my zróbmy LUPKĘ"** — ikona X w starym systemie → u nas **lupa = wyszukiwarka pacjenta** (klik wyniku = natychmiastowa zmiana pacjenta).

Dolny screen: duża karta szwedzkiego formularza identyfikacyjnego (PESEL, Imię, Adres, Telefon, Mail, KRAJ przekreślony X).

Adnotacje klientki:
- **„CAŁE OKNO INFORMACJI / DUŻE CZYTELNE OKNO — dane pacjenta"**.
- Pola: PESEL · IMIĘ · II IMIĘ · NAZWISKO · ADRES (UL., POST NR/KOD POCZT., MIASTO) · TELEFON · MAIL · KOMENTARZ.
- **KRAJ przekreślony X** → usunąć z formularza (rezydencja domyślnie Polska, klientka nie potrzebuje pola).
- **„MIEJSCE ZAWARTOŚCI PANELI FUNKCJI"** = prawa kolumna (content).
- **„DODATKOWE ZAKŁADKI"** = drugi rząd tabs widoczny w szwedzkim screenie (Allmänt / Medlemskap / Psykiatri-information / Tolkbehov / Fast vårdkontakt / …) → klientka wskazuje, że pacjent ma mieć **wewnętrzne podzakładki** (uszczegółowienie w `z6.jpg`).

**Wymaganie #3:** sticky topbar z dużym profilem pacjenta + lupa + auto-badge pełnoletni/nieletni.
**Wymaganie #4:** karta „Dane identyfikacyjne" ma drugi rząd tabs (5 sztuk, patrz `z6.jpg`).
**Wymaganie #5:** usunąć pole „Kraj" z formularza pacjenta.

### 1.4 `z4.jpg` — **Lista zakładek panelu pacjenta**
Lista numeryczna (kontynuacja z `z2.jpg`):
```
1) (z z2:  Nowa wizyta)
2) (z z2:  Historia wizyt)
3) Leki
4) Testy
5) Zalecenia
6) Plan leczenia       ← NOWE
7) Dane identyfikacyjne ← rename z „Pacjent"
8) Diagnozy
9) Parametry           ← NOWE
10) DOKUMENTY          ← NOWE w głównym sidebarze
```

**Wymaganie #6:** sidebar = 10 pozycji w podanej kolejności.

### 1.5 `z5.jpg` — **HISTORIA WIZYT (jak ma wyglądać) + NAZWY NOTATEK**
- **„AKAPIT TYTUŁ"** — każda wizyta jako osobny akapit z nagłówkiem.
- **„UKŁAD/KOLEJNOŚĆ od najnowszej do najstarszej"**.
- **„HISTORIA WIZYT JAK?"** → **„wszystkie te co były wypełnione → opisy; bez skrótów"**. Pełne treści, nie 1-linijkowy `buildSummary()`.
- **„im niżej scrolluję → tym starsze wizyty"** — chronologia rosnąco-malejąco z góry na dół.

**Sekcja „NAZWY NOTATEK"** (różowa ramka, 6 pozycji):
```
1) 1sze SPOTKANIE
2) KOLEJNE SPOTKANIE
3) SUPERWIZJA
4) NOTATKA ADMINISTRACYJNA
5) KONTAKT TELEFONICZNY
6) KONTAKT MAILOWY
```

**Wymaganie #7:** historia wizyt = lista akapitów od najnowszej z pełnym opisem (raw form fields, nie summary).
**Wymaganie #8:** `VISIT_TYPES` w `_visit-dict.js` zredukować do 6 powyższych typów (bez migracji — apka jeszcze nie działa produkcyjnie).

### 1.6 `z6.jpg` — **„NASZE ZAKŁADKI" + Widok podstawowy historii**
Górna część: opis 5 wewnętrznych zakładek karty „Dane identyfikacyjne":

```
1) OGÓLNE
2) OSOBY UPOWAŻNIONE
   → „czyli komu przekazywać dane med + opiekun"
   → dane jakie zbieramy:
       Imię, Nazwisko, Telefon, Komentarz
3) ZGODA NA PRZETWARZANIE DANYCH
4) INNE (klientka: „nie wiem jeszcze jakie")
5) OPIEKA MEDYCZNA
   → „tutaj bd wpisywać z kim pacjent wcześniej miał kontakt"
```

Dolna część (**WIDOK PODSTAWOWY**, niebieska ramka) — komentarze pomarańczowe na liście notatek (z szwedzkiego systemu) wskazujące, co ma być na każdej wizycie:
- **NAZWA NOTATKI** (tytuł akapitu — np. „1sze SPOTKANIE", „KONTAKT TELEFONICZNY")
- **„CO TO ZA WIZ, KTO PRZYJMUJE"** (typ wizyty + osoba/terapeuta przyjmujący)
- **DATA WIZYTY · PŁATNOŚĆ?** (po prawej w nagłówku akapitu)

**Wymaganie #9:** karta „Dane identyfikacyjne" = 5 wewnętrznych zakładek (Ogólne / Osoby upoważnione / Zgoda RODO / Inne / Opieka medyczna).
**Wymaganie #10:** nagłówek akapitu wizyty w historii = `[NAZWA NOTATKI] · [typ wizyty] · [data] · [płatność]`.

### 1.7 `z7.jpg` — **PANEL BOCZNY → różne funkcje + ZAWARTOŚĆ danej funkcji**
Schemat funkcjonalny:
```
PANEL BOCZNY → różne funkcje
                  ↓
        ZAWARTOŚĆ DANEJ FUNKCJI
                  ↓
            DANE PACJENTA (sticky top)
```

**Wymaganie #11:** układ jak ATOL — sticky topbar z danymi pacjenta, lewy sidebar z 10 sekcjami, prawa kolumna z zawartością wybranej sekcji.

---

## 2. Decyzje PO (rozmowa 2026-05-11)

| # | Pytanie | Odpowiedź |
|---|---------|-----------|
| 1 | Czy klientka ma plik z logo (PNG/SVG)? | **Nie.** Wpisać w div napis **„Logo lub nazwa aplikacji"** jako placeholder. |
| 2 | Telefon/mail inline w pasku czy w popoverze? | **Inline.** Klientka pracuje na 14"/tablecie — dane muszą być wyraźnie widoczne. |
| 3 | Status nieletni/pełnoletni auto czy ręczny? | **Auto** z daty urodzenia. Delikatne odcienie rozróżnienia (np. jasnoniebieski dorosły, jasny róż dziecko). |
| 4 | Jakie pola „Parametry"? | Bierzemy to co już mamy w systemie. Na górę idzie to co klientka zapisała, reszta niżej. Sekcja powstaje na przyszłość. |
| 5 | Plan leczenia vs Zalecenia — relacja? | **Różne.** Zalecenia = do domu/samodzielnego działania. Plan leczenia = wspólnie z doktorem. |
| 6 | „Opieka medyczna" — pole tekstowe czy lista rekordów? | **Lista rekordów.** |
| 7 | „Inne" w Danych identyfikacyjnych — wolne pole tekstowe OK? | **Tak**, na razie wolne pole tekstowe. |
| 8 | Migracja istniejących typów wizyt? | **Nie trzeba.** Apka jeszcze nie działa produkcyjnie. |
| 9 | „Nowa wizyta" — co rozwija? | **Kafelki zostają** (jako submenu w sidebarze). |
| 10 | Tempo realizacji? | **Idziemy szerokim frontem.** Wszystko (PR-J1 → PR-J9) jednym ciągiem. |

---

## 3. Mapowanie wymagań na kod (co tworzymy / co modyfikujemy)

### 3.1 Pliki **do modyfikacji**
| Plik | Zmiana |
|------|--------|
| `index.html` | Linia 25: zamiana `<div class="psy-new-brand">PsychoApp</div>` → placeholder z napisem „Logo lub nazwa aplikacji". |
| `css/app-new.css` | Style placeholdera (ramka, kursywa, jasne tło). Style sticky paska pacjenta — rozszerzenie. Style submenu „Nowa wizyta" w sidebarze. Style listy akapitów w historii wizyt. Style podzakładek w karcie pacjenta. |
| `js/app-new.js` | `_renderPatientTag()` — rozbudowa: PESEL, II imię, telefon, mail, ikona ♂/♀, badge auto (pełnoletni/nieletni), lupka 🔍 z popoverem search. `_renderSidebar()` — submenu dla „Nowa wizyta". `viewHistory()` — przebudowa z tabeli na strumień akapitów. ROUTE_MAP — nowe route'y `#/treatment-plan`, `#/parameters`, `#/documents`. |
| `js/views/_menu.js` | Rozbudowa `APP_MENU` z 6 → 10 pozycji, „Nowa wizyta" z `submenu: VISIT_TYPES`. |
| `js/views/_visit-dict.js` | `VISIT_TYPES` przebudowany na 6 typów: `first_meeting`, `next_meeting`, `supervision`, `admin_note`, `phone_contact`, `email_contact`. |
| `js/views/_fake-data.js` | Aktualizacja istniejących `FAKE_VISITS` na nowe `typeId` (bo apka jeszcze nie działa produkcyjnie). |
| `js/views/_store.js` | Nowe pola pacjenta: `consents{rodo, date, comment}`, `otherInfo` (free text), `medicalCare[]` (lista poprzednich kontaktów medycznych), `parameters{height, weight, bmi, systolic, diastolic, pulse, …}`. Nowe metody Store: `addMedicalCare`, `removeMedicalCare`, `addTreatmentGoal`, `removeTreatmentGoal`. |
| `js/views/view-patient-detail.js` | Drugi rząd tabs w prawej kolumnie (Ogólne / Osoby upoważnione / Zgoda RODO / Inne / Opieka medyczna). Usunięcie pola „Kraj". |

### 3.2 Pliki **do utworzenia**
| Plik | Opis |
|------|------|
| `js/views/view-treatment-plan.js` | Plan leczenia — drzewo celów L1/L2 + zadania per cel + autozapis. |
| `js/views/view-parameters.js` | Parametry pacjenta — formularz z polami wzrost/waga/BMI auto/ciśnienie/tętno + miejsce na przyszłe pola. |
| `js/views/view-documents.js` | Dokumenty pacjenta — stub UI z `<psy-file-input>`, lista plików w localStorage (Faza 3 = podpięcie storage). |

---

## 4. Lista TODO (mini-PR-y)

| Mini-PR | Zakres | Zależności |
|---------|--------|-----------|
| **PR-J1** | Placeholder logo w topbarze (`index.html` + CSS). | — |
| **PR-J2** | Sticky profil pacjenta z lupą (PESEL + 2 imiona + tel + mail + ikona płci + badge auto + popover search). | — |
| **PR-J3** | Rozbudowa lewego menu do 10 pozycji + submenu „Nowa wizyta". | PR-J4 (typy notatek) |
| **PR-J4** | 6 typów notatek wizyt w `_visit-dict.js`. | — |
| **PR-J5** | Historia wizyt jako strumień akapitów (najnowsze u góry, pełny opis). | PR-J4 |
| **PR-J6** | „Dane identyfikacyjne" → 5 podzakładek + usunięcie „Kraj". | — |
| **PR-J7** | Sekcja „Plan leczenia" — nowy widok + Store. | PR-J3 |
| **PR-J8** | Sekcja „Parametry" — nowy widok + Store. | PR-J3 |
| **PR-J9** | Sekcja „Dokumenty" — stub UI. | PR-J3 |

Realizacja **szerokim frontem** — wszystko w jednej serii commitów (po dekcyzji PO).

---

## 5. Otwarte zadania na przyszłość (Faza 3+)

- **Logo file**: gdy klientka dostarczy plik PNG/SVG → wymiana `<div>` na `<img>`.
- **Dokumenty**: podpięcie real storage (folder lokalny + Drive) w **PR-10/PR-11** (Faza 3 IMPLEMENTATION_PLAN sekcja 8).
- **Parametry**: rozbudowa o trendy historyczne (wykres BMI/ciśnienia w czasie), być może powiązane z wizytami (`parameter@visit`).
- **„Inne"** w danych identyfikacyjnych: gdy klientka dookreśli, czym ma to być — dostosujemy strukturę.

---

## 6. Pomyłki w narracji uniknięte

Dla porządku — w trakcie analizy zdjęć **nie** wprowadzamy:
- ❌ Listy zakładek „Allmänt / Medlemskap / Psykiatri-information / …" 1:1 ze szwedzkiego — to inspiracja, klientka definiuje **swoje** 5 polskich zakładek (z6).
- ❌ Drzewa folderów dosłownie jak szwedzkie — u nas pozostaje **lista 10 pozycji** z opcjonalnym submenu na „Nowej wizycie".
- ❌ Większego rozdmuchania paska pacjenta — chociaż klientka chce wszystkich danych (PESEL/2 imiona/tel/mail), pasek musi pozostać sticky i wyraźny, ale nie wielowierszowy (laptop 14" → wysokość max ~48 px).

---

**Koniec dokumentu.**

> Następny krok: realizacja PR-J1 → PR-J9 (patrz `docs/IMPLEMENTATION_PLAN.md` sekcja 8, etap J).
