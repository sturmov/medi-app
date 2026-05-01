# Ustalenia z PO (siostra) — 2026-04-04

## Cel dokumentu
Podsumowanie wymagań i zakresu faz **przed implementacją dużych zmian**.

---

## 1) Priorytet #1 — Wygląd i architektura UI

### 1.1 Wymagania biznesowe (z notatek)
- UI ma być **bardziej kompaktowe** (mniej pustej przestrzeni, więcej treści na ekranie).
- Sekcje formularzy mają wspierać wzorzec **collapsible tree** (jak w Excelu):
  - łatwe odsłanianie/schowanie detali,
  - hierarchia L1/L2/L3.
- W obszarach wyboru (checkbox/select) preferowane układy **2–3 kolumnowe**.
- Różne typy pól powinny być czytelne wizualnie (delikatne różnice odcieni/kolorów).
- Dane kontekstowe pacjenta przy wizycie powinny być stale widoczne (read-only / „szare”).

### 1.2 Zakres Fazy 1 (bez logiki biznesowej)
1. Ustalenie i wdrożenie „compact tokens” (spacing/typografia/wysokości kontrolek).
2. Wdrożenie bazowego komponentu/układu `collapsible tree` w istniejących widokach.
3. Przebudowa kluczowych layoutów formularzy do 1/2/3 kolumn w zależności od sekcji.
4. Wyróżnienie typów pól (text/select/checkbox/sekcja) bez zmiany ogólnej identyfikacji wizualnej.
5. Przygotowanie miejsca na „kontekst pacjenta” sticky/pinned w widoku wizyty.

### 1.3 Kryteria akceptacji Fazy 1
- Na ekranie 1366×768 widocznych jest wyraźnie więcej pól „above the fold”.
- Co najmniej 2 główne sekcje formularza działają jako collapsible tree.
- Brak regresji funkcjonalnej (istniejące flow i autozapis działają jak dotychczas).

---

## 2) Priorytet #2 — Google Drive: docelowy model folderowy

### 2.1 Stan docelowy
Model ma odpowiadać lokalnemu trybowi „folderowemu”:

```text
Google Drive
└── pacjenci/                      (folder główny podpinany przez użytkownika)
    ├── P001_Imie_Nazwisko/        (folder pacjenta)
    │   ├── P001_Imie_Nazwisko     (Google Sheet z zakładkami Dane/Wywiad/MSE/Sesje/Testy/Plan)
    │   └── załączniki...          (PDF/JPG/DOCX/itp.)
    └── P002_.../
```

### 2.2 Różnica względem aktualnej implementacji
- Aktualnie Google Drive zapisuje arkusze bez pełnej struktury „folder per pacjent”.
- Docelowo potrzebna jest warstwa organizująca zasoby pacjenta (sheet + attachments) w jednym folderze.

### 2.3 Zakres Fazy 2
1. Wybór/podpięcie folderu głównego `pacjenci`.
2. Tworzenie i utrzymanie folderu per pacjent.
3. Zapis i odczyt Google Sheet w folderze pacjenta.
4. Podstawa pod załączniki w folderze pacjenta (bez pełnego UI biznesowego na tym etapie).

---

## 3) Priorytet #3 — Konstrukcja menu i rozmieszczenie funkcjonalności

### 3.1 Zasada
Najpierw architektura ekranów/nawigacji, **bez** szczegółowej treści biznesowej.

### 3.2 Proponowany szkic IA (do zatwierdzenia)
- **Pacjenci**
  - Lista pacjentów
  - Profil pacjenta
- **Wizyty**
  - Nowa wizyta (skrót)
  - Wywiad kliniczny (pierwsza wizyta)
  - Kolejna wizyta
- **Dokumenty**
  - Zaświadczenie
  - Skierowanie
  - Wniosek (wgląd)
- **Testy i oceny**
- **Plan terapii**
- **Załączniki**
- **Ustawienia / Integracje**

### 3.3 Zakres Fazy 3
1. Finalny układ sidebar/menu + mapowanie na widoki.
2. Routing i stany przejść między ekranami.
3. Makiety/placeholdery ekranów (bez docelowej logiki domenowej).

---

## 4) Priorytet #4 — Implementacja logiki biznesowej

Po zatwierdzeniu faz 1–3.

### 4a) Etap pierwszy logiki
- Implementacja kluczowych funkcjonalności formularzy.
- Dostosowanie arkuszy (Google Sheet/XLSX) do nowych pól i struktury.

### 4b) Kolejne etapy
- Rozszerzenia modułowe (dokumenty, załączniki, automatyzacje, itp.)
- Integracje dodatkowe (np. kalendarz) według osobnego priorytetu.

---

## Decyzje do doprecyzowania przed ACT (kolejna iteracja)
1. Czy „Nowa wizyta (skrót)” ma być osobnym ekranem, czy trybem w istniejącym widoku wizyty?
2. Czy zachowanie collapsible ma się automatycznie zwijać przy `blur` globalnym, czy po kliknięciu poza sekcją?
3. Czy folder główny w Google Drive ma być zawsze sztywno `pacjenci`, czy wybieralny z domyślną nazwą?
4. Które 2–3 widoki mają być pierwsze do kompaktowej przebudowy (propozycja: Wywiad, SOAP/Kolejna wizyta, Pacjenci)?
