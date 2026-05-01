// ============================================================================
// _visit-dict.js — słowniki pick-list dla formularza wizyty.
//
// Wszystkie listy są domyślnymi propozycjami Cline (Excel nie miał pick-list).
// Zgodnie z docs/VISIT_FORM_SPEC.md §3 — edytowalne w Ustawieniach (Faza 5+).
// ============================================================================

export const VISIT_DICT = {
    RODZAJ_WIZYTY: [
        'Konsultacja',
        'Konsultacja rodziców',
        'Wizyta kontrolna',
        'Wizyta terapeutyczna',
        'Interwencja kryzysowa',
        'Diagnoza psychologiczna',
        'Zakończenie / podsumowanie procesu'
    ],

    OSOBY_OBECNE: [
        'Pacjent',
        'Nieletnia/ny pacjent',
        'Matka',
        'Ojciec',
        'Matka i ojciec',
        'Opiekun prawny',
        'Inny członek rodziny',
        'Partner/ka'
    ],

    PRZEMOC: ['nie', 'tak', 'nieznane'],

    STAN_CYWILNY: [
        'Nie dotyczy (dziecko)',
        'Panna / Kawaler',
        'W związku (nieformalny)',
        'Małżeństwo',
        'Separacja',
        'Rozwód',
        'Wdowa / Wdowiec'
    ],

    RYZYKO_S: ['Niskie', 'Umiarkowane', 'Wysokie', 'Krytyczne (pilna interwencja)'],

    INTENSYWNOSC_UZYWEK: [
        'Nigdy',
        'Okazjonalnie',
        'Regularnie',
        'Uzależnienie (podejrzenie / diagnoza)'
    ],

    // ------- Aktualne objawy (sekcja 2.2) -------

    OBJAWY_DEPRESYJNE: [
        'anhedonia', 'apatia', 'obniżony nastrój', 'poczucie winy', 'beznadzieja',
        'myśli samobójcze', 'bezsenność', 'hipersomnia', 'spadek masy ciała',
        'utrata energii', 'spowolnienie psychoruchowe', 'labilność emocjonalna', 'drażliwość'
    ],

    OBJAWY_LEKOWE: [
        'GAD (uogólniony)', 'napady paniki', 'fobia społeczna', 'agorafobia',
        'lęk rozłąkowy', 'lęk antycypacyjny', 'hipochondria', 'PTSD',
        'lęk o zdrowie bliskich', 'zamartwianie'
    ],

    OBJAWY_MANIAKALNE: ['brak', 'hipomania', 'mania', 'epizod mieszany'],

    OBJAWY_PSYCHOTYCZNE: [
        'urojenia prześladowcze', 'urojenia odnoszące', 'urojenia wielkościowe',
        'omamy słuchowe', 'omamy wzrokowe', 'dezorganizacja myślenia',
        'katatonia', 'zubożenie afektu', 'wycofanie społeczne'
    ],

    OBJAWY_OC: [
        'obsesje czystości', 'obsesje kontroli', 'obsesje symetrii',
        'kompulsje rytualne', 'kompulsje liczenia', 'skubanie skóry',
        'trichotillomania', 'gromadzenie'
    ],

    REGULACJA_EMOCJI: [
        'labilność', 'impulsywność', 'wybuchy złości', 'samouszkodzenia',
        'zaburzenia odżywiania', 'dysocjacja', 'tiki', 'bierność', 'wycofanie'
    ],

    // ------- Tło / kontekst (sekcja 2.4) -------

    SYTUACJA_RODZINNA: [
        'rodzina pełna', 'rodzina niepełna', 'rodzina patchworkowa',
        'konflikt rozwodowy', 'opieka naprzemienna', 'rodzina zastępcza',
        'samotne rodzicielstwo', 'wielopokoleniowa'
    ],

    SZKOLA_PRACA: [
        'funkcjonuje prawidłowo', 'trudności w nauce/pracy', 'absencje',
        'zawieszenie / zwolnienie', 'nie uczy się / nie pracuje', 'nauczanie indywidualne'
    ],

    RELACJE_ROWIESNICZE: [
        'dobre', 'ograniczone', 'konfliktowe', 'brak',
        'doświadcza przemocy rówieśniczej', 'agresor w konflikcie rówieśniczym'
    ],

    TRAUMY: [
        'przemoc fizyczna', 'przemoc psychiczna', 'przemoc seksualna',
        'strata bliskiej osoby', 'wypadek', 'mobbing / bullying',
        'zaniedbanie', 'katastrofa / wojna', 'brak (negacja)'
    ],

    CZAS_WOLNY: [
        'sport', 'kultura / sztuka', 'gry / internet', 'znajomi',
        'sam', 'hobby', 'brak zainteresowań', 'praca dorywcza'
    ],

    // ------- Somatyczne (sekcja 2.5) -------

    APETYT: [
        'prawidłowy', 'zwiększony', 'obniżony', 'wybiórczy',
        'epizody napadowego jedzenia', 'restrykcje'
    ],

    SEN: [
        'prawidłowy', 'problem z zasypianiem', 'wybudzenia nocne',
        'wczesne budzenie', 'hipersomnia', 'koszmary', 'parasomnie'
    ],

    AKTYWNOSC_FIZ: [
        'brak', 'sporadyczna', 'regularna umiarkowana', 'intensywna / kompulsywna'
    ],

    ALERGIE: ['brak', 'pokarmowe', 'wziewne', 'na leki', 'kontaktowe'],

    // ------- Historia leczenia (sekcja 2.7) -------

    BADANIE_STATUS: [
        'wykonane — w normie', 'wykonane — odchylenia', 'nie wykonane', 'nieznane'
    ],

    // ------- Status psychiczny (sekcja 2.11) -------

    STAN_PSYCHICZNY: [
        'stabilny', 'labilny', 'obniżony', 'podwyższony',
        'niespokojny', 'wycofany', 'pobudzony', 'apatyczny'
    ],

    WGLAD: ['pełny', 'częściowy', 'brak', 'negatywistyczny'],

    W_NORMIE: ['w normie', 'odchylenia'],

    SUICYDALNOSC_SHORT: [
        'brak', 'myśli', 'plan', 'próby', 'aktualne samouszkodzenia'
    ],

    ZACHOWANIE_PSYCHORUCHOWE: ['w normie', 'pobudzenie', 'spowolnienie'],

    STYL_INTERAKCYJNY: [
        'adekwatny', 'wycofany', 'konfrontacyjny', 'nadmiernie towarzyski'
    ],

    MOWA: [
        'tempo prawidłowe', 'przyspieszone', 'spowolnione',
        'głośna', 'cicha', 'spójna', 'dezorganizacja'
    ],

    NASTROJ: [
        'obniżony', 'podwyższony', 'drażliwy', 'labilny',
        'apatyczny', 'stabilny', 'anhedoniczny'
    ],

    AFEKT: [
        'dostosowany', 'spłaszczony', 'stępiały', 'labilny', 'niedostosowany', 'blady'
    ],

    PROCES_MYSLENIA: [
        'logiczny', 'przyspieszony (gonitwa)', 'spowolniony',
        'skojarzenia luźne', 'perseweracje', 'blokady'
    ],

    TRESC_MYSLENIA: [
        'prawidłowa', 'urojenia', 'idee nadwartościowe',
        'myśli natrętne', 'poczucie winy'
    ],

    PERCEPCJA_JA: [
        'prawidłowe', 'depersonalizacja', 'derealizacja', 'déjà vu'
    ],

    ZABURZENIA_PERCEPCYJNE: [
        'brak', 'omamy słuchowe', 'wzrokowe', 'dotykowe',
        'smakowe', 'węchowe', 'pseudoomamy'
    ],

    KONCENTRACJA: ['prawidłowa', 'obniżona', 'wzmożona (hiperfokus)'],

    ORIENTACJA: ['pełna', 'częściowa', 'zaburzona'],

    PAMIEC: [
        'prawidłowa', 'problemy z krótkotrwałą', 'z długotrwałą', 'konfabulacje'
    ],

    FUNKCJONOWANIE_INTEL: [
        'adekwatny do wieku', 'poniżej', 'powyżej', 'niemożność oceny'
    ],

    OSAD: [
        'prawidłowy', 'osłabiony', 'zachowany krytycyzm', 'brak krytycyzmu'
    ],

    // ------- Ocena ryzyka S (sekcja 2.12) -------

    RYZYKO_DEPRESJA: ['brak', 'łagodna', 'umiarkowana', 'nasilona'],

    RYZYKO_MYSLI_SMIERC: ['brak', 'obecne', 'natrętne'],

    RYZYKO_MYSLI_SAM: ['brak', 'bierne', 'aktywne bez planu', 'aktywne z planem'],

    RYZYKO_ZAMIAR: ['brak', 'niepewny', 'jasny'],

    RYZYKO_PLAN: ['brak', 'mglisty', 'konkretny z dostępem do środka'],

    RYZYKO_PRZYGOTOWANIA: ['brak', 'myśli', 'kroki podjęte', 'gotowość'],

    RYZYKO_PROBY: ['brak', '1', '2–3', 'liczne'],

    RYZYKO_SLADY: ['brak', 'obecne — blizny', 'obecne — świeże'],

    ZDOLNOSC_BEZP: ['tak', 'z zastrzeżeniami', 'nie'],

    GOTOWOSC_POMOC: ['wysoka', 'umiarkowana', 'niska', 'brak'],

    // ------- Ocena kliniczna (sekcja 2.14) -------

    CZYNNIKI_PODTRZYMUJACE: [
        'stres rodzinny', 'stres szkolny', 'trauma nieprzerobiona',
        'brak wsparcia społecznego', 'używki', 'zaburzenia somatyczne',
        'predyspozycja genetyczna', 'styl myślenia (ruminacje, katastrofizacja)',
        'unikanie', 'konflikt w związku'
    ],

    MOTYWACJA: [
        'wysoka (z własnej inicjatywy)', 'umiarkowana',
        'niska (ambiwalentna)', 'brak / wymuszona (np. przez rodzica)'
    ],

    POSTAWA_RODZICOW: [
        'wspierająca', 'obojętna', 'nadopiekuńcza',
        'negująca / konfrontacyjna', 'konfliktowa (rozbieżna między rodzicami)',
        'nie dotyczy'
    ],

    // ------- Oddziaływania (sekcja 2.16) -------

    REKOMENDACJE_TYP: [
        'psychoterapia indywidualna', 'psychoterapia rodzinna',
        'psychoterapia grupowa', 'konsultacja psychiatryczna',
        'leczenie farmakologiczne', 'diagnostyka pogłębiona (testy)',
        'obserwacja (wizyta kontrolna)', 'interwencja kryzysowa',
        'zgłoszenie do SOR', 'zmiana środowiska'
    ],

    PILNA_KONSULTACJA: [
        'nie', 'tak — psychiatra', 'tak — neurolog',
        'tak — endokrynolog', 'tak — pediatra / internista', 'tak — SOR'
    ],

    KONTROLNA_TERMIN: [
        'za tydzień', 'za 2 tygodnie', 'za miesiąc',
        'za 2 miesiące', 'za 3 miesiące', 'inne (wpisz datę)'
    ],

    // ------- Używki — 11 pozycji z Excela (sekcja 2.9) -------

    UZYWKI_11: [
        'Produkty nikotynowe: papierosy, cygara, papierosy elektroniczne, tytoń bezdymny',
        'Produkty zawierające kofeinę: kawa, napoje energetyczne (monster, red bull itp.)',
        'Alkohol',
        'Marihuana: palona, jadalna, inna',
        'Halucynogeny: mdma/ecstasy, grzyby, psylocyny, haszysz',
        'Opioidy: morfina, heroina, kodeina, opium, fentanyl, metadon, leki p/bólowe bez recepty',
        'Leki: barbiturany',
        'Środki wziewne',
        'Przyjmowanie narkotyków dożylnie?',
        'Czy używałeś leków na receptę / bez recepty / suplementów w sposób inny niż przepisany?',
        'Czy używałeś innych substancji odurzających?'
    ]
};
