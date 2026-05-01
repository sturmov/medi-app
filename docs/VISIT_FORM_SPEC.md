# VISIT_FORM_SPEC — specyfikacja formularza wizyty

**Źródło**: analiza plików `docs/DIAGNOZA.xlsx`, `docs/Dokumentacja.xlsx`, `docs/Formularz próba.xlsx` (raw dump: `docs/VISIT_FORM_SPEC_RAW.md`).
**Data pierwsza**: 2026-04-18. **Aktualizacja**: 2026-04-18 (v2 — struktura akordeonu z 5 slotami po feedbacku PO/Magdy).
**Autor analizy**: Cline (Faza 0 + 0b planu z `.clinerules` §10).

---

## 0. Kluczowe obserwacje

1. **Pick-listy w Excelu nie istnieją jako data-validation.** Po sprawdzeniu `xl/worksheets/*.xml` w każdym z 3 plików `<dataValidations>` ani `<x14:dataValidation>` nie są obecne. Magda wypełniała komórki **wolnym tekstem**. Wniosek: **proponujemy własne słowniki** (sekcja 3) — do akceptacji.
2. **Jedyny rzeczywisty picklistowy element** w Excelu to **lista używek/substancji** (11 pozycji) zrealizowana jako kolumna `TRUE/FALSE` obok etykiet — to jest **checkbox-group**.
3. **Dwa warianty wizyty**: `first` (pierwsza notatka, z wywiadem rozszerzonym) / `followup` (kolejna, uproszczona). Jeden widok, pola oznaczone ⬆ widoczne tylko w trybie `first`.
4. **Diagnoza** (plik `DIAGNOZA.xlsx`) = **osobny moduł** od wizyty (Ciąża, Edukacja, Wykształcenie, Historia rodzinna, Status prawny, Warunki mieszkaniowe, Zasoby) — nie mieszać; osobny widok w kolejnej fazie.
5. **Skierowanie do szpitala** = **dokument generowany z wizyty** (reużywa pola + sekcja „Powód pilnego skierowania"). Faza dokumenty, nie teraz.
6. **Baza leków** w Excelu ma ~60 leków w 5 kategoriach. Obecny `_meds-dict.js` (11 pozycji) jest namiastką — rozszerzenie w Fazie 3.
7. **Arkusze sandbox** (`Arkusz5`, `Arkusz7`) w `Formularz próba.xlsx` pomijamy.

---

## 1. Pola „Karta informacyjna" (tylko pierwsza wizyta — tryb `first`)

Dane pacjenta pokazywane w nagłówku widoku. **Nie edytowalne** w formularzu wizyty (edycja z modala pacjenta).

Imię · Nazwisko · Data ur. · Wiek (auto) · PESEL · Płeć · Orientacja · Telefon · Mail

---

## 2.0 Struktura wiersza (akordeon-rozdział) — wzorzec renderowania

Po analizie Excela (screen Magdy 2026-04-18) **każdy główny rozdział** wizyty renderuje się w 5-slotowym wzorcu:

```
ROZDZIAŁ ZWINIĘTY:
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ▶ [Tytuł rozdziału] (1)                             │ Komentarz: [ textarea (5) ]│
└──────────────────────────────────────────────────────────────────────────────────┘

ROZDZIAŁ ROZWINIĘTY (po kliku w belkę):
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ▼ [Tytuł rozdziału] (1)                             │ Komentarz: [ textarea (5) ]│
├──────────────────────────────────────────────────────────────────────────────────┤
│   [Sub-label] (2)    │ [Pole główne (3) — zmienny typ]    │ Uwagi: [textarea (4)]│
│   [Sub-label] (2)    │ [Pole główne (3)]                  │ Uwagi: [textarea (4)]│
│   ...                                                                            │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Sloty

| # | Slot | Rola | Typ | Widoczność |
|---|------|------|-----|------------|
| **1** | Belka rozdziału | Nagłówek collapsible, klik → toggle | label + ikona ▶/▼ | zawsze |
| **2** | Sub-label podpola | Tekstowy label po lewej rzędu | label | po rozwinięciu |
| **3** | **Pole główne** podpola | ZMIENNY typ — `textarea` / `select` / `multi-select` / `radio` / `checkbox-group` / `date` / `number` / `tag-input` | po rozwinięciu |
| **4** | Uwagi podpola | **Zawsze** textarea — doprecyzowanie wolnym tekstem obok pola głównego | po rozwinięciu |
| **5** | Komentarz rozdziału | Textarea dla całego rozdziału | zawsze (na prawej krawędzi belki, także gdy zwinięty) |

### Warianty specjalne

- **Rozdział bez podpól** (np. 2.3 „Aktualny problem zdrowotny") — ma tylko slot (5). Nie ma belki collapsible — renderuje się jako `[Nagłówek] [ textarea (5) ]`.
- **Checkbox-group z warunkiem** (sekcja 2.9 Używki) — każda zaznaczona pozycja „odpala" swój własny wiersz z intensywnością (3) i uwagami (4).

### Schemat JS — specyfikacja sekcji

```js
{
  id: 'wywiad',                          // stabilny klucz (do storage)
  title: 'Wywiad',
  icon: '📋',
  onlyIn: 'first',                       // 'first' | 'followup' | undefined (=oba)
  defaultOpen: true,                     // domyślnie otwarty?
  sectionComment: true,                  // czy pokazywać pole (5)
  subfields: [                           // [] → rozdział ma tylko (5)
    {
      id: 'depresyjne',
      label: 'Depresyjne',
      input: {                           // pole (3)
        type: 'multi-select',
        options: ['anhedonia','apatia','obniżony nastrój', ...]
      },
      notes: true                        // pole (4) — zawsze textarea (domyślnie true)
    },
    ...
  ]
}
```

---

## 2. Sekcje wizyty (drzewo collapsible, format zgodny z §2.0)

Legenda typów pola głównego (slot 3):
- `textarea` — wolne pole wielolinijkowe
- `text` — krótkie pole tekstowe
- `select` — pojedynczy wybór z listy
- `multi-select` — wielokrotny wybór (tag-input)
- `radio` — pojedynczy wybór (widoczny inline)
- `checkbox-group` — wielokrotny wybór (widoczny inline)
- `date`, `number`, `tag-input-icd10`
- `—` = brak pola głównego (tylko label + uwagi (4) = textarea)

⬆ = widoczne tylko w trybie `first` (pierwsza wizyta).

---

### 2.1 🗓 Dane wizyty *(nie-collapsible, sticky na górze)*

Sekcja bez akordeonu — zawsze widoczna.

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Data wizyty * | `date` | nie |
| Rodzaj wizyty * | `select: RODZAJ_WIZYTY` | nie |
| Osoby obecne | `multi-select: OSOBY_OBECNE` | tak |
| Powód zgłoszenia | `textarea` | nie |
| Doświadczenie przemocy | `radio: [nie, tak, nieznane]` | tak (opis) |

**Komentarz rozdziału (5)**: nie (zastępuje go „Powód zgłoszenia").

---

### 2.2 📋 Wywiad ⬆ *(collapsible, domyślnie otwarty)*

**Komentarz rozdziału (5)**: tak.

**Podsekcja „Aktualne objawy"** (pod-collapsible w tym rozdziale):

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Depresyjne | `multi-select: OBJAWY_DEPRESYJNE` | tak |
| Lękowe | `multi-select: OBJAWY_LEKOWE` | tak |
| Maniakalne / hipomaniakalne | `radio: [brak, hipomania, mania, epizod mieszany]` | tak |
| Psychotyczne / zaburzenia spostrzegania i myślenia | `multi-select: OBJAWY_PSYCHOTYCZNE` | tak |
| Obsesyjno-kompulsyjne | `multi-select: OBJAWY_OC` | tak |
| Regulacja emocji i inne | `multi-select: REGULACJA_EMOCJI` | tak |

---

### 2.3 🩺 Aktualny problem zdrowotny *(rozdział bez podpól)*

**Komentarz rozdziału (5)**: tak (jedyne pole — duża textarea z tytułem).

---

### 2.4 🏠 Tło / kontekst funkcjonowania *(collapsible)*

**Komentarz rozdziału (5)**: tak.

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Sytuacja rodzinna | `multi-select: SYTUACJA_RODZINNA` | tak |
| Szkoła / Praca | `radio: SZKOLA_PRACA` | tak |
| Relacje rówieśnicze | `radio: RELACJE_ROWIESNICZE` | tak |
| Stan cywilny | `select: STAN_CYWILNY` | tak |
| Wydarzenia traumatyczne | `multi-select: TRAUMY` | tak |
| Czas wolny | `multi-select: CZAS_WOLNY` | tak |

---

### 2.5 ❤ Funkcjonowanie somatyczne *(collapsible)*

**Komentarz rozdziału (5)**: tak.

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Apetyt / jedzenie | `radio: APETYT` | tak |
| Sen | `radio: SEN` | tak |
| Aktywność fizyczna | `radio: AKTYWNOSC_FIZ` | tak |
| Alergie ⬆ | `radio: [brak, pokarmowe, wziewne, na leki, kontaktowe]` | tak („jakie?") |

---

### 2.6 🏥 Aktualne problemy medyczne ⬆ *(rozdział bez podpól)*

**Komentarz rozdziału (5)**: tak (jedyne pole).

---

### 2.7 💊 Historia leczenia *(collapsible)*

**Komentarz rozdziału (5)**: tak (ogólny opis historii).

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Morfologia ⬆ | `radio: BADANIE_STATUS` | tak („wyniki / odchylenia") |
| EKG ⬆ | `radio: BADANIE_STATUS` | tak („QTc itp.") |

---

### 2.8 💉 Ogólna farmakoterapia (i suplementy) *(collapsible)*

**Komentarz rozdziału (5)**: tak („ogólny opis leczenia / suplementy").

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Leki psychotropowe | `link-to-view` („Przejdź do sekcji Leki" + lista ref.) | tak |

Uwaga: inline edycja leków → reużywa modal z `modal-med.js` + autocomplete z rozszerzonego `_meds-dict.js` (60+ leków, Faza 3).

---

### 2.9 🚬 Używki *(collapsible, specjalna struktura)*

**Komentarz rozdziału (5)**: tak.

Pole główne to checkbox-group (11 pozycji dosłownie z Excela):

```
☐ Produkty nikotynowe: papierosy, cygara, papierosy elektroniczne, tytoń bezdymny
☐ Produkty zawierające kofeinę: kawa, napoje energetyczne (monster, red bull itp.)
☐ Alkohol
☐ Marihuana: palona, jadalna, inna
☐ Halucynogeny: mdma/ecstasy, grzyby, psylocyny, haszysz
☐ Opioidy: morfina, heroina, kodeina, opium, fentanyl, metadon, leki p/bólowe bez recepty
☐ Leki: barbiturany
☐ Środki wziewne
☐ Przyjmowanie narkotyków dożylnie?
☐ Czy używałeś leków na receptę / bez recepty / suplementów w sposób inny niż przepisany?
☐ Czy używałeś innych substancji odurzających?
```

**Dla każdej zaznaczonej pozycji** rozwijają się dwa pola:
- Intensywność ⬆: `select: INTENSYWNOSC_UZYWEK`
- Uwagi (4): `textarea`

Uwaga: klasyczne 8 wierszy z Excela („Wyroby nikotynowe / Alkohol / Konopia / Alkaloidy roślinne / Leki / Halucynogeny / Opioidy / Stymulatory") **zduplikowane** z listą 11 — ignorujemy.

---

### 2.10 📏 Parametry somatyczne *(collapsible, kompaktowa siatka 2 kolumn)*

**Komentarz rozdziału (5)**: nie (same liczby).

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Wzrost | `number (cm)` | nie |
| Masa ciała | `number (kg)` | nie |
| BMI | `number (auto z wzrost/masa)` | nie |
| Najniższa masa ciała | `number (kg)` | tak (kiedy?) |
| Najwyższa masa ciała | `number (kg)` | tak (kiedy?) |

---

### 2.11 🧠 Status psychiczny *(collapsible, tryb „mały/duży")*

**Komentarz rozdziału (5)**: tak.

#### Tryb mały (kolejna wizyta = `followup`):

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Stan psychiczny | `multi-select: STAN_PSYCHICZNY` | tak (główny opis) |
| Stopień współpracy / wgląd | `radio: WGLAD` | tak |
| Obserwacje podczas spotkania | — | tak (textarea pełna szer.) |
| Suicydalność / zachowania autoagresywne | `radio: [brak, myśli, plan, próby, aktualne samouszkodzenia]` | tak |
| Ocena ryzyka S | `select: RYZYKO_S` | tak |

#### Tryb duży ⬆ (pierwsza wizyta) — dodatkowe pola:

Dla wszystkich pól poniżej: `radio: [w normie, odchylenia]` + uwagi (4) textarea.

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Wygląd i prezentacja | `radio: W_NORMIE` | tak |
| Zachowanie i aktywność psychoruchowa | `radio: [w normie, pobudzenie, spowolnienie]` | tak |
| Styl interakcyjny | `radio: [adekwatny, wycofany, konfrontacyjny, nadmiernie towarzyski]` | tak |
| Mowa | `multi-select: [tempo prawidłowe, przyspieszone, spowolnione, głośna, cicha, spójna, dezorganizacja]` | tak |
| Nastrój | `multi-select: NASTROJ` | tak |
| Afekt | `radio: AFEKT` | tak |
| Proces myślenia | `radio: [logiczny, przyspieszony (gonitwa), spowolniony, skojarzenia luźne, perseweracje, blokady]` | tak |
| Treść myślenia | `multi-select: [prawidłowa, urojenia, idee nadwartościowe, myśli natrętne, poczucie winy]` | tak |
| Percepcja i doświadczenia ja | `multi-select: [prawidłowe, depersonalizacja, derealizacja, déjà vu]` | tak |
| Zaburzenia percepcyjne | `multi-select: [brak, omamy słuchowe, wzrokowe, dotykowe, smakowe, węchowe, pseudoomamy]` | tak |
| Koncentracja i uwaga | `radio: [prawidłowa, obniżona, wzmożona (hiperfokus)]` | tak |
| Orientacja | `radio: [pełna, częściowa, zaburzona]` | tak |
| Pamięć | `radio: [prawidłowa, problemy z krótkotrwałą, z długotrwałą, konfabulacje]` | tak |
| Funkcjonowanie intelektualne / zasób wiedzy | `radio: [adekwatny do wieku, poniżej, powyżej, niemożność oceny]` | tak |
| Osąd | `radio: [prawidłowy, osłabiony, zachowany krytycyzm, brak krytycyzmu]` | tak |
| Wgląd | `radio: WGLAD` | tak |

---

### 2.12 🚨 Ocena ryzyka S ⬆ *(collapsible, tylko tryb `first` — w `followup` jest pod 2.11)*

**Komentarz rozdziału (5)**: tak.

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Depresja / beznadzieja | `select: [brak, łagodna, umiarkowana, nasilona]` | tak |
| Myśli o śmierci | `radio: [brak, obecne, natrętne]` | tak |
| Myśli samobójcze | `radio: [brak, bierne, aktywne bez planu, aktywne z planem]` | tak |
| Zamiar | `radio: [brak, niepewny, jasny]` | tak |
| Plan | `radio: [brak, mglisty, konkretny z dostępem do środka]` | tak |
| Przygotowania | `radio: [brak, myśli, kroki podjęte, gotowość]` | tak |
| Próby w przeszłości | `radio: [brak, 1, 2–3, liczne]` | tak (Kiedy? Jak? Ile razy? Szpital? Kto znalazł? Przyczyny?) |
| Widoczne ślady samouszkodzeń | `radio: [brak, obecne — blizny, obecne — świeże]` | tak (lokalizacja) |

**Podsekcja „Czynniki ochronne"** (pod-collapsible):

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Co powstrzymuje przed działaniem | — | tak |
| Osoba dostępna do kontaktu dziś/w nocy | `text` | tak |
| Zdolność do utrzymania bezpieczeństwa | `radio: [tak, z zastrzeżeniami, nie]` | tak |
| Gotowość do skorzystania z pomocy | `radio: [wysoka, umiarkowana, niska, brak]` | tak |

**Podsumowanie**: `select: RYZYKO_S` (to samo co w 2.11).

---

### 2.13 🧪 Testy przesiewowe ⬆ *(collapsible, tryb `first`)*

**Komentarz rozdziału (5)**: tak.

W wizycie kontrolnej → link do widoku „Testy". W `first` → lista ostatnich wyników (preview PHQ-9 / GAD-7 itp.) + przycisk „+ Uruchom test" → PR-16 (runner).

---

### 2.14 🎯 Ocena kliniczna *(collapsible)*

**Komentarz rozdziału (5)**: tak.

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Hipoteza diagnostyczna | `tag-input-icd10` (wielokrotny wybór z `_icd10-dict.js`) | tak |
| Czynniki podtrzymujące | `multi-select: CZYNNIKI_PODTRZYMUJACE` | tak |
| Motywacja do leczenia | `radio: MOTYWACJA` | tak |
| Postawa rodziców | `radio: POSTAWA_RODZICOW` | tak |

---

### 2.15 📖 Rozpoznanie *(collapsible)*

**Komentarz rozdziału (5)**: tak.

Pole główne = lista rozpoznań ICD-10 z modala (`modal-diagnosis.js` → otwierany inline). Każde rozpoznanie: kod + opis + status + data.

Brak sub-labeli jako takich — renderuje się jak lista kart diagnoz.

---

### 2.16 ➡ Podjęte oddziaływania podczas wizyty *(collapsible)*

**Komentarz rozdziału (5)**: tak.

| Sub-label | Pole główne (3) | Uwagi (4) |
|-----------|-----------------|-----------|
| Rekomendacje ⬆ | `multi-select: REKOMENDACJE_TYP` | tak |
| Ustalenia i plan leczenia | — | tak (pełna szer.) |
| Pilna konsultacja z innym specjalistą? | `radio: PILNA_KONSULTACJA` | tak |
| Wizyta kontrolna | `select: KONTROLNA_TERMIN` + `date` (jeśli „inne") | tak |
| Ewaluacja | — | tak |
| Informacje dodatkowe i zabezpieczenia ⬆ | — | tak (pełna szer.) |

---

## 3. Słowniki (propozycja — do akceptacji w Fazie 3)

Wszystkie listy są **moimi defaultami** (Excel nie miał pick-list). Edytowalne w Ustawieniach (Faza 5+).

### RODZAJ_WIZYTY
Konsultacja · Konsultacja rodziców · Wizyta kontrolna · Wizyta terapeutyczna · Interwencja kryzysowa · Diagnoza psychologiczna · Zakończenie / podsumowanie procesu

### OSOBY_OBECNE (multi + wolny tekst)
Pacjent · Nieletnia/ny pacjent · Matka · Ojciec · Matka i ojciec · Opiekun prawny · Inny członek rodziny · Partner/ka

### STAN_CYWILNY
Nie dotyczy (dziecko) · Panna / Kawaler · W związku (nieformalny) · Małżeństwo · Separacja · Rozwód · Wdowa / Wdowiec

### RYZYKO_S
Niskie · Umiarkowane · Wysokie · Krytyczne (pilna interwencja)

### INTENSYWNOSC_UZYWEK
Nigdy · Okazjonalnie · Regularnie · Uzależnienie (podejrzenie / diagnoza)

### OBJAWY_DEPRESYJNE (multi)
anhedonia · apatia · obniżony nastrój · poczucie winy · beznadzieja · myśli samobójcze · bezsenność · hipersomnia · spadek masy ciała · utrata energii · spowolnienie psychoruchowe · labilność emocjonalna · drażliwość

### OBJAWY_LEKOWE (multi)
GAD (uogólniony) · napady paniki · fobia społeczna · agorafobia · lęk rozłąkowy · lęk antycypacyjny · hipochondria · PTSD · lęk o zdrowie bliskich · zamartwianie

### OBJAWY_PSYCHOTYCZNE (multi)
urojenia prześladowcze · urojenia odnoszące · urojenia wielkościowe · omamy słuchowe · omamy wzrokowe · dezorganizacja myślenia · katatonia · zubożenie afektu · wycofanie społeczne

### OBJAWY_OC (multi)
obsesje czystości · obsesje kontroli · obsesje symetrii · kompulsje rytualne · kompulsje liczenia · skubanie skóry · trichotillomania · gromadzenie

### REGULACJA_EMOCJI (multi)
labilność · impulsywność · wybuchy złości · samouszkodzenia · zaburzenia odżywiania · dysocjacja · tiki · bierność · wycofanie

### SYTUACJA_RODZINNA (multi)
rodzina pełna · rodzina niepełna · rodzina patchworkowa · konflikt rozwodowy · opieka naprzemienna · rodzina zastępcza · samotne rodzicielstwo · wielopokoleniowa

### SZKOLA_PRACA (radio)
funkcjonuje prawidłowo · trudności w nauce/pracy · absencje · zawieszenie / zwolnienie · nie uczy się / nie pracuje · nauczanie indywidualne

### RELACJE_ROWIESNICZE (radio)
dobre · ograniczone · konfliktowe · brak · doświadcza przemocy rówieśniczej · agresor w konflikcie rówieśniczym

### TRAUMY (multi)
przemoc fizyczna · przemoc psychiczna · przemoc seksualna · strata bliskiej osoby · wypadek · mobbing / bullying · zaniedbanie · katastrofa / wojna · brak (negacja)

### CZAS_WOLNY (multi)
sport · kultura / sztuka · gry / internet · znajomi · sam · hobby · brak zainteresowań · praca dorywcza

### APETYT (radio)
prawidłowy · zwiększony · obniżony · wybiórczy · epizody napadowego jedzenia · restrykcje

### SEN (radio)
prawidłowy · problem z zasypianiem · wybudzenia nocne · wczesne budzenie · hipersomnia · koszmary · parasomnie

### AKTYWNOSC_FIZ (radio)
brak · sporadyczna · regularna umiarkowana · intensywna / kompulsywna

### BADANIE_STATUS (radio)
wykonane — w normie · wykonane — odchylenia · nie wykonane · nieznane

### STAN_PSYCHICZNY (multi, „szybki opis")
stabilny · labilny · obniżony · podwyższony · niespokojny · wycofany · pobudzony · apatyczny

### WGLAD (radio)
pełny · częściowy · brak · negatywistyczny

### W_NORMIE (radio)
w normie · odchylenia

### NASTROJ (multi)
obniżony · podwyższony · drażliwy · labilny · apatyczny · stabilny · anhedoniczny

### AFEKT (radio)
dostosowany · spłaszczony · stępiały · labilny · niedostosowany · blady

### CZYNNIKI_PODTRZYMUJACE (multi)
stres rodzinny · stres szkolny · trauma nieprzerobiona · brak wsparcia społecznego · używki · zaburzenia somatyczne · predyspozycja genetyczna · styl myślenia (ruminacje, katastrofizacja) · unikanie · konflikt w związku

### MOTYWACJA (radio)
wysoka (z własnej inicjatywy) · umiarkowana · niska (ambiwalentna) · brak / wymuszona (np. przez rodzica)

### POSTAWA_RODZICOW (radio)
wspierająca · obojętna · nadopiekuńcza · negująca / konfrontacyjna · konfliktowa (rozbieżna między rodzicami) · nie dotyczy

### REKOMENDACJE_TYP (multi)
psychoterapia indywidualna · psychoterapia rodzinna · psychoterapia grupowa · konsultacja psychiatryczna · leczenie farmakologiczne · diagnostyka pogłębiona (testy) · obserwacja (wizyta kontrolna) · interwencja kryzysowa · zgłoszenie do SOR · zmiana środowiska

### PILNA_KONSULTACJA (radio)
nie · tak — psychiatra · tak — neurolog · tak — endokrynolog · tak — pediatra / internista · tak — SOR

### KONTROLNA_TERMIN (select)
za tydzień · za 2 tygodnie · za miesiąc · za 2 miesiące · za 3 miesiące · inne (wpisz datę)

---

## 4. Układ UI (realizacja)

- Widok: **osobna strona** `view-visit-form` (route `#/visit/edit/:id` lub `#/visit/new/:typeId`).
- Nagłówek: breadcrumb „Historia › Wizyta z DD.MM.RRRR" + „← Wróć do historii".
- Toolbar: kontekst pacjenta + save-indicator + „Zapisz roboczo" / „Zakończ wizytę" / „Drukuj / PDF" (ostatnie w fazie Dokumenty).
- Body: pionowy stack rozdziałów z sekcji 2.1–2.16.
- Sekcje w trybie `first` pokazują pola ⬆; w trybie `followup` ukrywają.

### 4.1 Komponenty użyte do renderowania (reuse)

| Slot | Komponent |
|------|-----------|
| 1 (belka rozdziału) | `psy-collapsible` + `psy-collapsible-group` |
| 2 (sub-label) | element `<label>` w customowym wrapperze `.psy-visit-row__label` |
| 3 (pole główne) | wariantowo: `psy-input`, `psy-textarea`, `psy-select`, `psy-tag-input` (multi-select), `psy-radio-group`, `psy-checkbox-group`, `psy-date`, `psy-number` |
| 4 (uwagi) | `psy-textarea` (size: compact, 2 rows expand) |
| 5 (komentarz rozdziału) | `psy-textarea` (mały) — osadzony w headerze collapsible, flex-shrink |

### 4.2 Domyślnie otwarte sekcje

Pierwsza wizyta (`first`): 2.1, 2.2, 2.3, 2.11, 2.14, 2.16.
Kolejna (`followup`): 2.1, 2.3, 2.11, 2.14, 2.16.

### 4.3 Kompaktowy layout (wg `.clinerules` §10)

- Siatka dwukolumnowa w rzędach sub-label (2) + pole (3) + uwagi (4): proporcje **180px · 2fr · 3fr**.
- Gdy brak (3) — (4) zajmuje 2fr+3fr.
- Komentarz rozdziału (5) na belce: maksymalna szerokość 380px, flex-shrink: 0.
- Na mobile (< 800 px): rzędy stacked pionowo.

### 4.4 Zachowanie collapsible

- Klik w belkę → toggle.
- Auto-collapse po kliku poza sekcją (zgodnie z `.clinerules` §10).
- Liczba wypełnionych pól w etykiecie po prawej: `📋 Wywiad (6 z 7)`.

---

## 5. Model danych (`_store.js` klucz `visits`)

```json
{
  "id": "V000123",
  "patientId": "P0001",
  "date": "2026-04-18",
  "time": "14:30",
  "type": "first | followup",
  "createdAt": "...",
  "updatedAt": "...",
  "status": "draft | finalized",
  "data": {
    "visitData": {
      "rodzaj":  { "value": "Konsultacja" },
      "osoby":   { "value": ["Matka","Ojciec"], "notes": "ojciec spóźniony" },
      "powod":   { "notes": "..." },
      "przemoc": { "value": "nie", "notes": "" }
    },
    "wywiad": {
      "_comment": "ogólny komentarz rozdziału (slot 5)",
      "objawy": {
        "depresyjne":  { "value": ["anhedonia","obniżony nastrój"], "notes": "od 3 tygodni" },
        "lekowe":      { "value": [], "notes": "" },
        "maniakalne":  { "value": "brak", "notes": "" },
        "psychotyczne":{ "value": [], "notes": "" },
        "oc":          { "value": [], "notes": "" },
        "regulacja":   { "value": ["labilność"], "notes": "wybuchy wieczorem" }
      }
    },
    "problemZdrowotny": {
      "_comment": "jedyne pole rozdziału"
    },
    "kontekst": {
      "_comment": "...",
      "rodzina":     { "value": ["rodzina niepełna"], "notes": "..." },
      "szkolaPraca": { "value": "trudności w nauce/pracy", "notes": "matematyka" },
      "rowiesnicy":  { "value": "ograniczone", "notes": "" },
      "stanCywilny": { "value": "Nie dotyczy (dziecko)", "notes": "" },
      "trauma":      { "value": [], "notes": "" },
      "czasWolny":   { "value": ["gry/internet","sam"], "notes": "" }
    },
    "somatyczne": {
      "_comment": "...",
      "apetyt":    { "value": "obniżony", "notes": "" },
      "sen":       { "value": "problem z zasypianiem", "notes": "2-3 h" },
      "aktywnosc": { "value": "brak", "notes": "" },
      "alergie":   { "value": "brak", "notes": "" }
    },
    "medyczne":   { "_comment": "..." },
    "leczenie": {
      "_comment": "...",
      "morfologia": { "value": "wykonana — w normie", "notes": "03.2026" },
      "ekg":        { "value": "wykonane — w normie", "notes": "QTc 420" }
    },
    "farmakoterapia": {
      "_comment": "...",
      "leki": { "value": [], "notes": "lekiRef zapisane w visit.lekiRef" }
    },
    "uzywki": {
      "_comment": "...",
      "substancje": {
        "checked": [0, 2],
        "details": {
          "0": { "intensywnosc": "Okazjonalnie", "notes": "papierosy elektroniczne, ok. 5/dzień" },
          "2": { "intensywnosc": "Regularnie", "notes": "weekend, 3-4 piwa" }
        }
      }
    },
    "parametry": {
      "wzrost": { "value": 170 },
      "masa":   { "value": 65 },
      "bmi":    { "value": 22.5 },
      "min":    { "value": 60, "notes": "09.2025" },
      "max":    { "value": 75, "notes": "12.2024" }
    },
    "status": {
      "_comment": "...",
      "mode": "followup",
      "stanPsy":       { "value": ["obniżony","wycofany"], "notes": "..." },
      "wglad":         { "value": "częściowy", "notes": "" },
      "obserwacje":    { "notes": "..." },
      "suicydalnosc":  { "value": "myśli", "notes": "..." },
      "ryzykoS":       { "value": "umiarkowane", "notes": "" },
      "_rozszerzony":  { /* pola z 2.11 tryb duży, puste jeśli followup */ }
    },
    "ryzykoS": {
      "_comment": "...",
      "depresja":    { "value": "umiarkowana", "notes": "" },
      "mysliSmierc": { "value": "obecne", "notes": "" },
      "mysliSam":    { "value": "bierne", "notes": "" },
      "zamiar":      { "value": "brak", "notes": "" },
      "plan":        { "value": "brak", "notes": "" },
      "przygotowania": { "value": "brak", "notes": "" },
      "proby":       { "value": "brak", "notes": "" },
      "slady":       { "value": "obecne — blizny", "notes": "przedramiona" },
      "czynnikiOchronne": {
        "powstrzymuje":  { "notes": "..." },
        "osoba":         { "value": "matka", "notes": "" },
        "zdolnoscBezp":  { "value": "tak", "notes": "" },
        "gotowosc":      { "value": "umiarkowana", "notes": "" }
      },
      "podsumowanie":  { "value": "umiarkowane" }
    },
    "testyRef": ["T0001"],
    "ocenaKliniczna": {
      "_comment": "...",
      "hipoteza":    { "value": ["F32.1","F41.1"], "notes": "..." },
      "czynniki":    { "value": ["stres rodzinny","unikanie"], "notes": "" },
      "motywacja":   { "value": "umiarkowana", "notes": "" },
      "postawaRodzicow": { "value": "konfliktowa", "notes": "" }
    },
    "rozpoznanieRef": ["D0001","D0002"],
    "oddzialywania": {
      "_comment": "...",
      "rekomendacje":     { "value": ["psychoterapia indywidualna","konsultacja psychiatryczna"], "notes": "" },
      "ustalenia":        { "notes": "..." },
      "pilnaKonsultacja": { "value": "tak — psychiatra", "notes": "przy najbliższej wolnej" },
      "kontrolna":        { "value": "za 2 tygodnie", "date": "2026-05-02", "notes": "" },
      "ewaluacja":        { "notes": "..." },
      "dodatkowe":        { "notes": "..." }
    }
  }
}
```

**Konwencja pól**: każde podpole to `{ value, notes }` (gdzie `value` to slot 3, `notes` to slot 4). Komentarz rozdziału (slot 5) jest pod kluczem `_comment` na poziomie rozdziału.

---

## 6. Kolejność wdrożenia (Fazy 1–5)

1. **Faza 1** — konwersja `modal-visit-preview` → `view-visit-detail` z breadcrumb. ✅ **Wykonane (2026-04-18)**.
2. **Faza 2** — szkielet `view-visit-form.js` wg §2 (puste pola, bez zapisu) + `_visit-form-schema.js` (to JS-data z sekcji 2).
3. **Faza 3** — słowniki (`_visit-dict.js`) + rozszerzenie `_meds-dict.js` (11 → 60+ leków z Excela).
4. **Faza 4** — zapis/odczyt do `_store` (model §5), integracja z historią.
5. **Faza 5** — `view-visit-detail` read-only z realnych danych; „Edytuj" → `view-visit-form` z prefillem.

**Gotowe do Fazy 2** po akceptacji tego specu.
