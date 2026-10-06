// ============================================================================
// _icd10-dict.js — słownik kodów ICD-10 dla autocomplete w wizycie.
//
// Stan obecny (2026-06-13): ~60 najczęściej używanych kodów (F00-F98 + Z03/Z63/Z73)
// z psychologii/psychiatrii klinicznej. Architektura skalowalna — pełna lista
// ICD-10 (10k+ kodów wraz z chorobami somatycznymi, urazami, kodami Z/R) może
// być wstawiona BEZ ZMIAN W API. Konsumenci (formularz wizyty) wołają tylko
// `searchIcd10()` i `findIcd10ByCode()`.
//
// Decyzja PO 2026-06-13: „wszystkie F-ki dostępne, ale aktualnie nie muszą być
// wszystkie — trzeba to zrobić tak aby później łatwo było dodać wszystkie."
//
// Jak dorzucić więcej kodów:
//   1. Dopisz wpisy do `ICD10_DICT` (format `{code, description}`).
//   2. Albo zaimportuj z pliku zewnętrznego — patrz `extendIcd10Dict()` poniżej.
//   3. Search działa identycznie (prefix-match kodu > opis-match).
//
// Źródło: Międzynarodowa Statystyczna Klasyfikacja Chorób i Problemów
// Zdrowotnych ICD-10 (rozdział V: Zaburzenia psychiczne i zachowania,
// + kody Z/R do uzupełnienia w przyszłości).
// ============================================================================

export const ICD10_DICT = [
    // --- F00-F09: Organiczne zaburzenia psychiczne ---
    { code: 'F00',   description: 'Otępienie w chorobie Alzheimera' },
    { code: 'F01',   description: 'Otępienie naczyniowe' },
    { code: 'F03',   description: 'Otępienie bliżej nieokreślone' },
    { code: 'F05',   description: 'Majaczenie niewywołane alkoholem ani innymi substancjami psychoaktywnymi' },
    { code: 'F06',   description: 'Inne zaburzenia psychiczne spowodowane uszkodzeniem lub dysfunkcją mózgu' },
    { code: 'F07',   description: 'Zaburzenia osobowości i zachowania spowodowane chorobą, uszkodzeniem lub dysfunkcją mózgu' },

    // --- F10-F19: Zaburzenia spowodowane używaniem substancji ---
    { code: 'F10.1', description: 'Zaburzenia psychiczne i zachowania spowodowane używaniem alkoholu — używanie szkodliwe' },
    { code: 'F10.2', description: 'Zaburzenia psychiczne i zachowania spowodowane używaniem alkoholu — zespół uzależnienia' },
    { code: 'F11.2', description: 'Zaburzenia spowodowane używaniem opioidów — zespół uzależnienia' },
    { code: 'F12.2', description: 'Zaburzenia spowodowane używaniem kanabinoli — zespół uzależnienia' },
    { code: 'F13.2', description: 'Zaburzenia spowodowane używaniem leków uspokajających i nasennych — zespół uzależnienia' },
    { code: 'F14.2', description: 'Zaburzenia spowodowane używaniem kokainy — zespół uzależnienia' },
    { code: 'F17.2', description: 'Zaburzenia spowodowane używaniem tytoniu — zespół uzależnienia' },
    { code: 'F19.2', description: 'Zaburzenia spowodowane używaniem wielu substancji — zespół uzależnienia' },

    // --- F20-F29: Schizofrenia, zaburzenia schizotypowe i urojeniowe ---
    { code: 'F20.0', description: 'Schizofrenia paranoidalna' },
    { code: 'F20.1', description: 'Schizofrenia hebefreniczna' },
    { code: 'F20.3', description: 'Schizofrenia niezróżnicowana' },
    { code: 'F21',   description: 'Zaburzenie schizotypowe' },
    { code: 'F22',   description: 'Uporczywe zaburzenia urojeniowe' },
    { code: 'F25',   description: 'Zaburzenia schizoafektywne' },

    // --- F30-F39: Zaburzenia nastroju (afektywne) ---
    { code: 'F30',   description: 'Epizod maniakalny' },
    { code: 'F31',   description: 'Zaburzenie afektywne dwubiegunowe' },
    { code: 'F31.3', description: 'Zaburzenie afektywne dwubiegunowe, obecnie epizod depresji łagodnej lub umiarkowanej' },
    { code: 'F32.0', description: 'Epizod depresyjny łagodny' },
    { code: 'F32.1', description: 'Epizod depresyjny umiarkowany' },
    { code: 'F32.2', description: 'Epizod depresyjny ciężki bez objawów psychotycznych' },
    { code: 'F32.3', description: 'Epizod depresyjny ciężki z objawami psychotycznymi' },
    { code: 'F33.0', description: 'Zaburzenie depresyjne nawracające, obecnie epizod łagodny' },
    { code: 'F33.1', description: 'Zaburzenie depresyjne nawracające, obecnie epizod umiarkowany' },
    { code: 'F33.2', description: 'Zaburzenie depresyjne nawracające, obecnie epizod ciężki bez objawów psychotycznych' },
    { code: 'F33.4', description: 'Zaburzenie depresyjne nawracające, obecnie w remisji' },
    { code: 'F34.0', description: 'Cyklotymia' },
    { code: 'F34.1', description: 'Dystymia' },

    // --- F40-F48: Zaburzenia nerwicowe, związane ze stresem i somatoform ---
    { code: 'F40.0', description: 'Agorafobia' },
    { code: 'F40.1', description: 'Fobia społeczna' },
    { code: 'F40.2', description: 'Specyficzne (izolowane) postacie fobii' },
    { code: 'F41.0', description: 'Zaburzenie lękowe z napadami lęku (lęk paniczny)' },
    { code: 'F41.1', description: 'Zaburzenia lękowe uogólnione (GAD)' },
    { code: 'F41.2', description: 'Zaburzenia depresyjne i lękowe mieszane' },
    { code: 'F42.0', description: 'Zaburzenie obsesyjno-kompulsyjne — przeważnie myśli natrętne' },
    { code: 'F42.1', description: 'Zaburzenie obsesyjno-kompulsyjne — przeważnie czynności natrętne (rytuały)' },
    { code: 'F42.2', description: 'Zaburzenie obsesyjno-kompulsyjne mieszane' },
    { code: 'F43.0', description: 'Ostra reakcja na stres' },
    { code: 'F43.1', description: 'Zespół stresu pourazowego (PTSD)' },
    { code: 'F43.2', description: 'Zaburzenia adaptacyjne' },
    { code: 'F44',   description: 'Zaburzenia dysocjacyjne (konwersyjne)' },
    { code: 'F45.0', description: 'Zaburzenia somatyzacyjne' },
    { code: 'F45.2', description: 'Zaburzenia hipochondryczne' },
    { code: 'F48.0', description: 'Neurastenia' },

    // --- F50-F59: Zespoły behawioralne zw. z zab. fizjologicznymi ---
    { code: 'F50.0', description: 'Jadłowstręt psychiczny (anorexia nervosa)' },
    { code: 'F50.2', description: 'Bulimia psychiczna' },
    { code: 'F50.8', description: 'Inne zaburzenia odżywiania (w tym zaburzenie z napadami objadania się)' },
    { code: 'F51.0', description: 'Bezsenność nieorganiczna' },
    { code: 'F52',   description: 'Zaburzenia seksualne niespowodowane zaburzeniem organicznym' },

    // --- F60-F69: Zaburzenia osobowości i zachowania dorosłych ---
    { code: 'F60.0', description: 'Osobowość paranoiczna' },
    { code: 'F60.1', description: 'Osobowość schizoidalna' },
    { code: 'F60.2', description: 'Osobowość dyssocjalna' },
    { code: 'F60.3', description: 'Osobowość chwiejna emocjonalnie (typ borderline)' },
    { code: 'F60.4', description: 'Osobowość histrioniczna' },
    { code: 'F60.5', description: 'Osobowość anankastyczna (obsesyjno-kompulsyjna)' },
    { code: 'F60.6', description: 'Osobowość unikowa (lękliwa)' },
    { code: 'F60.7', description: 'Osobowość zależna' },
    { code: 'F60.8', description: 'Inne określone zaburzenia osobowości (w tym narcystyczna)' },

    // --- F70-F79: Upośledzenie umysłowe ---
    { code: 'F70',   description: 'Lekkie upośledzenie umysłowe' },
    { code: 'F71',   description: 'Umiarkowane upośledzenie umysłowe' },

    // --- F80-F89: Zaburzenia rozwoju psychicznego ---
    { code: 'F80',   description: 'Specyficzne zaburzenia rozwoju mowy i języka' },
    { code: 'F81',   description: 'Specyficzne zaburzenia rozwoju umiejętności szkolnych' },
    { code: 'F84.0', description: 'Autyzm dziecięcy' },
    { code: 'F84.5', description: 'Zespół Aspergera' },

    // --- F90-F98: Zaburzenia emocjonalne i zachowania u dzieci i młodzieży ---
    { code: 'F90.0', description: 'Zaburzenie aktywności i uwagi (ADHD)' },
    { code: 'F91',   description: 'Zaburzenia zachowania' },
    { code: 'F92',   description: 'Mieszane zaburzenia zachowania i emocji' },
    { code: 'F93',   description: 'Zaburzenia emocjonalne rozpoczynające się w dzieciństwie' },
    { code: 'F95',   description: 'Tiki' },
    { code: 'F98.0', description: 'Moczenie nieorganiczne' },

    // --- Z-codes: kontakty ze służbą zdrowia ---
    { code: 'Z03',   description: 'Obserwacja w kierunku podejrzewanej choroby lub stanu' },
    { code: 'Z63',   description: 'Inne problemy związane z sytuacją rodzinną' },
    { code: 'Z73',   description: 'Problemy związane z trudnością radzenia sobie z życiem' }
];

/**
 * Szuka kodów/opisów zawierających zapytanie.
 * Priorytet: trafienia kodu > trafienia opisu.
 */
export function searchIcd10(query, limit = 10) {
    if (!query) return ICD10_DICT.slice(0, limit);
    const q = String(query).toLowerCase().trim();
    const byCode = [];
    const byDesc = [];
    for (const entry of ICD10_DICT) {
        const code = entry.code.toLowerCase();
        const desc = entry.description.toLowerCase();
        if (code.startsWith(q) || code === q) byCode.push(entry);
        else if (code.includes(q) || desc.includes(q)) byDesc.push(entry);
        if (byCode.length + byDesc.length >= limit * 2) break;
    }
    return byCode.concat(byDesc).slice(0, limit);
}

export function findIcd10ByCode(code) {
    if (!code) return null;
    return ICD10_DICT.find((e) => e.code.toLowerCase() === String(code).toLowerCase()) || null;
}

/**
 * Rozszerza słownik o dodatkowe kody (np. pełna lista ICD-10 dorzucona
 * w przyszłości z pliku zewnętrznego). Operacja idempotentna: duplikaty
 * (po `code`) są pomijane.
 *
 * Użycie:
 *   import { extendIcd10Dict } from './_icd10-dict.js';
 *   extendIcd10Dict([
 *     { code: 'A00', description: 'Cholera' },
 *     { code: 'I10', description: 'Pierwotne (samoistne) nadciśnienie tętnicze' }
 *   ]);
 *
 * @param {Array<{code: string, description: string}>} entries
 * @returns {number} ile NOWYCH wpisów zostało dodanych
 */
export function extendIcd10Dict(entries) {
    if (!Array.isArray(entries) || !entries.length) return 0;
    const known = new Set(ICD10_DICT.map((e) => String(e.code).toUpperCase()));
    let added = 0;
    for (const e of entries) {
        if (!e || !e.code) continue;
        const code = String(e.code).toUpperCase();
        if (known.has(code)) continue;
        ICD10_DICT.push({ code, description: e.description || '' });
        known.add(code);
        added++;
    }
    return added;
}
