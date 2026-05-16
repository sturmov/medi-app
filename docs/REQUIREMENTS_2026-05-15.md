# Wymagania klientki z 15.05.2026

Trzy ręcznie zaznaczone screeny PsychoApp (różowy + niebieski + zielony + żółty pisak), datowane „15/05". Dotyczą obecnego stanu po PR-J14d (commit `1b94f65`).

> Pliki źródłowe: `docs/(temp)` — nie przyłączone do repo, screeny zostały zinterpretowane wprost w tym pliku.

## 1. Stan emocjonalny klientki

- Karta pacjenta: **„DUŻO LEPIEJ!"** (różowy, dół screen 1) ✅
- Formularz wizyty (pasek + treść): **„SUPER"** (zielony, screen 2) ✅
- **ALE** krytyka „tab-content" formularza wizyty: „nie wiem co wypełniłam w poprzedniej sekcji"

## 2. Screen 1 — Lista pacjentów + Karta pacjenta

### 2.1 Sticky pasek pacjenta (topbar)

Klientka strzałka na sticky pasek + napis: **„dodaj jeszcze mail"**.

**Diagnoza:** kod już renderuje email (`p.email` w `app-new.js`, klasa `psy-new-patient-tag__field--mail`), ALE w `css/app-new.css` jest:

```css
@media (max-width: 1280px) {
    .psy-new-patient-tag__field--mail {
        display: none;
    }
}
```

Klientka na ekranie 1366×768 ma viewport ~1280px (DevTools + scroll w przeglądarce) → email automatycznie schowany. Nie wie o tym.

**Wymaganie:**
- Email musi być WIDOCZNY w sticky pasku przy normalnych rozdzielczościach (1366+).
- Próg media-query przesunąć z 1280px → ~900px (ukrywać tylko na bardzo małych ekranach / mobile).
- Telefon analogicznie (obecnie schowany od 1100px → ~860px).

### 2.2 Nagłówek karty pacjenta — usunięcie duplikatu

Klientka strzałka między „Imię" a górą widoku + napis: **„tam na górze jest tytuł, USUŃ"**.

**Diagnoza:** `view-patient-detail.js` renderuje:
- breadcrumb „📋 Pacjenci › Magdalena Bogusz"
- duże `<h1>Magdalena Bogusz</h1>`
- subtitle „Kod: P001 · PESEL 90121204409 · 35 lat · 💾 autozapis aktywny"

To samo (imię + nazwisko + PESEL + wiek) jest już w sticky pasku **wyżej**. Duplikat → klientka chce usunąć.

**Wymaganie:**
- Usunąć `<h1>` z `.psy-new-view__header.psy-patient-detail__header`.
- Usunąć subtitle z imieniem/PESEL/wiekiem (zostaje tylko mały hint „💾 autozapis aktywny" — niezauważalny).
- Breadcrumb może zostać (cienki, „nawigacyjny", nie duplikuje danych pacjenta).
- Strip akcji „← Wróć | ⬇ Pobierz kopię | 📦 Archiwizuj" zostaje.

### 2.3 Pole `Adres` — rozbij na 3 osobne

Klientka zakreśla pole „Adres:" + lista: **„× kod · × miasto · × ul. → wyżej masz przykład ze szwedzkiego"** + napis: **„chyba zrób oddzielnie do wypełnienia"**.

**Obecny stan:** jedno pole textarea z placeholderem „ul. ..., kod pocztowy, miasto".

**Wymaganie:**
- Rozbić na 3 osobne pola: `ulica`, `kodPocztowy`, `miasto`.
- Każde pole = osobny `editableRow` z odpowiednim labelem.
- Backward-compat: jeśli stara wartość `patient.adres` (string) istnieje, jednorazowo migrować (parsować) lub zostawić jako fallback (`uwagi do adresu`).

### 2.4 Adres korespondencyjny — rozbij analogicznie

Obecnie jest tylko placeholder „inny niż adres zamieszkania ☐ (TODO: pole opcjonalne — Faza 5)". 

**Wymaganie (PO 2026-05-16):**
- Również rozbić na 3 pola: `korespUlica`, `korespKodPocztowy`, `korespMiasto`.
- Domyślnie schowane za checkboxem „Inny niż adres zamieszkania" — odznaczone = pola ukryte (lub readonly puste).

### 2.5 Pole `Lekarz prowadzący` — auto z profilu

Klientka strzałka + napis: **„tutaj automatycznie musi być — dane z profilu prowadzącego dokumentację"**.

**Wymaganie:**
- Pole readonly z placeholderem informującym o automatyzacji: `"(auto z profilu prowadzącego — Faza X)"`.
- Ikonka 🔒 obok labela (sygnalizuje read-only).
- W przyszłej fazie (osobny PR) podpięcie pod globalny profil usera (config aplikacji / settings).

### 2.6 Pole `Placówka` — auto z profilu

Klientka: **„najlepiej też automatycznie"**.

**Wymaganie:** analogicznie jak 2.5.

### 2.7 Pole `Grupa` — usunąć

Klientka pisze tylko „?" — sama nie wie co to.

**Wymaganie:**
- Usunąć pole `Grupa` z karty pacjenta.
- Usunąć z autozapisu (`payload.grupa`).
- Usunąć z fake-data (jeśli ktoś ma).
- Backward-compat: `patient.grupa` jako legacy ignorowane (nie kasujemy z localStorage, po prostu nie używamy).

## 3. Screen 2 + 3 — Formularz wizyty: model „growing journal"

### 3.1 Problem klientki

Po PR-J14 prawa kolumna pokazuje **tylko 1 aktywne pole** (tab-content). Po kliknięciu nowego pola na pasku — poprzednie znika.

Klientka:
> „Jak klikam to **całe okno przeskakuje**; tzn **nie wiem co wypełniłam w poprzedniej sekcji**."
> „Chciałabym by jak np. klikam data… to odrazu to zostaje; a jak klikam kolejną sekcję to okazuje się **poniżej** i wraca w dodanie tylko jak wypełniam."
> **„końcowo w oknie jest tylko to co wypełniłam!"**

### 3.2 Diagram klientki (screen 3)

```
LEWA (pasek):          PRAWA (dziennik):
1                ───→   1   treść 1
2                       ──────
3                       ↓
4                       ↓
5  KLIK          ───→   5   treść 5
6                       ──────
7                       ↓
```

Pisze: „sekcja wypełnione odrazu wskakuje w okno jako »historia«" + „cyfry — to te zagadnienia z panelu wyboru" + „notatka tworzy się w dół zależnie od tego co wypełnię".

### 3.3 Kontrakt (po Q1/Q2/Q3 PO)

#### Stan widoczności pól

Każde pole formularza ma 2 niezależne wymiary:
- **wypełnione / puste** (czy ma wartość w `_raw`)
- **widoczne / ukryte** (czy renderowane w prawej kolumnie)

```
visit.data._uiState[fieldUid] = 'visible' | 'hidden' | undefined
```

| Stan `_uiState[uid]` | Wartość pusta | Wartość niepusta |
|---|---|---|
| `undefined` (default) | ukryte (nie w prawej kolumnie) | widoczne (akapit po prawej) |
| `'visible'` (kliknięto z paska) | widoczne — pusty input gotowy do wypełnienia | widoczne (akapit) |
| `'hidden'` (kliknięto X) | nieosiągalne (puste pole nie staje się hidden) | ukryte, ale wartość zostaje w Store |

#### Operacje UI

**Klik pola w pasku (lewa kolumna):**
```js
if (isHidden(uid)) {
    delete _uiState[uid];          // reset hidden flag → wartość niepusta = widoczne
}
if (!isFilled(uid)) {
    _uiState[uid] = 'visible';     // wymuszone widoczne (pusty input)
}
saveUIState();
renderJournal();
scrollToEntry(uid);
activateEdit(uid);                  // od razu inline edit (Q2)
```

**Klik X w prawym górnym rogu akapitu:**
```js
_uiState[uid] = 'hidden';
saveUIState();
renderJournal();
// wartość w _raw[uid] ZOSTAJE
```

**Klik akapitu (read-mode):**
```js
activateEdit(uid);     // input zastępuje paragraph (in-place, Q2)
```

**Po blur / Enter w inline-edit:**
```js
autosaveNow();          // zapis do _raw
renderEntry(uid);       // powrót do read-mode (paragraph)
// jeśli wartość pusta → akapit znika? NIE — zostaje jako visible+empty
// (dopiero X usuwa)
```

#### Kolejność akapitów w dzienniku

Wymuszona przez kolejność pól w `_visit-form-schema.js` (= kolejność na pasku po lewej). Dodanie pola (klik z paska) wstawia akapit w odpowiednie miejsce, nie na koniec.

#### Nagłówki sekcji (Q3: wariant α)

Sekcja (`DANE WIZYTY`, `TŁO / KONTEKST FUNKCJONOWANIA`, …) renderowana jako mały nagłówek `<h3>` **przed** 1. widocznym polem tej sekcji.

Sekcje bez widocznych pól → nagłówek pominięty.

#### Pre-fill nowej wizyty

Data wizyty: dzisiejsza data (już działa po PR-J14b/c). Auto-widoczna (niepusta wartość → default visible).

Pierwsze otwarcie nowej wizyty: prawa kolumna pokazuje tylko 1 akapit „Data wizyty: 2026-05-16". Klientka klika kolejne pola na pasku → akapity narastają.

### 3.4 Struktura DOM (proponowana)

```html
<div class="psy-form-toolbar">
  <div class="psy-form-toolbar__nav">
    <!-- pasek z polami, BEZ ZMIAN po PR-J14 -->
  </div>
  <div class="psy-form-toolbar__journal">
    <h3 class="psy-form-toolbar__journal-section-title">DANE WIZYTY</h3>
    <article class="psy-form-toolbar__entry" data-uid="visitData::data">
      <header class="psy-form-toolbar__entry-header">
        <span class="psy-form-toolbar__entry-label">Data wizyty</span>
        <button class="psy-form-toolbar__entry-close" title="Ukryj">✕</button>
      </header>
      <div class="psy-form-toolbar__entry-body psy-form-toolbar__entry-body--read">
        2026-05-16
      </div>
      <!-- ALTERNATYWNIE (edit-mode): -->
      <!-- <div class="psy-form-toolbar__entry-body psy-form-toolbar__entry-body--edit">
        <input type="date" name="visitData.data" value="2026-05-16" />
      </div> -->
    </article>
    <!-- kolejne akapity… -->
    <h3 class="psy-form-toolbar__journal-section-title">TŁO / KONTEKST</h3>
    <article class="psy-form-toolbar__entry" data-uid="tlo::sytuacjaRodzinna">
      …
    </article>
  </div>
</div>
```

### 3.5 Plan implementacji (PR-J16)

1. `_form-toolbar.js`:
   - Nowa funkcja `_renderJournal()` zamiast `_renderContent(uid)`
   - Lista akapitów per widoczne pole, kolejność wymuszona schemą
   - Stan `_uiState` per pole + getter `isVisible(field, raw, uiState)`
   - Event handlery: klik X (hide), klik akapitu (edit), blur/Enter (zapis + read-mode)
   - `refreshDots(newValues, newUiState?)` re-renderuje dziennik
2. `css/form-toolbar.css`:
   - `.psy-form-toolbar__journal` (lista akapitów, scrollowalna w dół)
   - `.psy-form-toolbar__entry` (kontener akapitu) + warianty `--read` / `--edit`
   - `.psy-form-toolbar__entry-close` (X) w prawym górnym rogu
   - `.psy-form-toolbar__journal-section-title` (header sekcji)
3. `view-visit-form.js`:
   - Po stronie autozapisu: `_uiState` zapisywany do Store razem z `_raw`
   - `autosaveNow()` musi zachować `_uiState` (analogicznie do `_raw`)
4. `_store.js`:
   - `Store.updateVisit(id, { _raw, _uiState })` — nowe pole obok `_raw`
   - Migracja: stare wizyty bez `_uiState` → default empty `{}`
5. Test ręczny:
   - Nowa wizyta → widzę tylko datę (pre-fill)
   - Klikam „Rodzaj wizyty" → wsuwa się POD datą → wybieram → zostaje
   - Klikam „Powód zgłoszenia" → trzeci akapit POD
   - X na „Rodzaj wizyty" → znika, ale dane zostają (refresh → widać że wartość OK)
   - Klik „Rodzaj wizyty" w pasku → wraca w pierwotnym miejscu z wartością

## 4. Podział na PR

### PR-J15 (drobne, ~45 min)
Realizuje sekcje 2.1–2.7 tego dokumentu.

### PR-J16 (duże, ~2-3 h)
Realizuje sekcję 3 — wzorzec growing journal.

### PR-J17 (opcjonalne)
Nagłówek dziennika z metadanymi notatki (typ wizyty · data · autor — z profilu).
