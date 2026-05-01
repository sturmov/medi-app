// ============================================================================
// _meds-dict.js — baza leków psychotropowych (single source of truth).
//
// Źródło: arkusz "Leki psychotropowe" z `docs/Dokumentacja.xlsx`
//         (raw dump: `docs/VISIT_FORM_SPEC_RAW.md` linie 4124–4191).
//
// ── Struktura dwuwarstwowa ─────────────────────────────────────────────────
//
//   Warstwa 1 (structural, forward-looking):
//     MEDS_DB = [{ substance, brands: string[], maxDose, group, note? }]
//     — jeden wpis per substancja czynna, z listą preparatów handlowych.
//     Używana przez helpery `searchMeds()` / `findMedByBrand()` i w przyszłości
//     (Faza 5) przez inline-edytor leków w formularzu wizyty.
//
//   Warstwa 2 (flat, legacy-compat):
//     FAKE_MED_DICT = [{ name, substance, maxDose, group }]
//     — spłaszczona do formatu używanego przez `modal-med.js` i `view-settings.js`.
//     Każdy preparat handlowy = osobny wpis (dla UX: psycholog szuka "Xanax",
//     nie "alprazolam"). Re-eksportowana z `_fake-data.js` bez zmian API.
//
// ── Legenda adnotacji w `maxDose` ──────────────────────────────────────────
//   *   — dawka max zależna od wskazania / wieku / monitorowania stężeń,
//         wymaga ostrożnej tytracji (zachowana z Excela).
//   **  — preparat niedostępny w polskim obrocie regularnym / import docelowy
//         (np. Ativan, Valium, Elvanse, Intuniv, Nortrilen). Adnotacja na
//         poziomie substancji w `note`.
//
// ── Grupy (5, zgodnie z arkuszem Magdy — polskie kategorie kliniczne) ──────
//   • Leki przeciwdepresyjne                          (19 substancji)
//   • Stabilizatory nastroju / leki normotymiczne     (6)
//   • Leki przeciwpsychotyczne                        (11)
//   • Leki stosowane w ADHD                           (4)
//   • Inne — przeciwlękowe / nasenne / uspokajające   (10)
//   ─────────────────────────────────────────────────────────────────
//   Razem: 50 substancji / ~120 preparatów handlowych.
// ============================================================================

/** @typedef {Object} MedEntry
 *  @property {string}    substance — substancja czynna (lower-case, z Excela)
 *  @property {string[]}  brands    — lista preparatów handlowych
 *  @property {string}    maxDose   — max dawka dzienna (tekst, może zawierać *)
 *  @property {string}    group     — grupa kliniczna (polska kategoria Magdy)
 *  @property {string=}   note      — opcjonalna notka (np. "import docelowy")
 */

/** @type {MedEntry[]} */
export const MEDS_DB = [
    // ── Leki przeciwdepresyjne ─────────────────────────────────────────────
    { substance: 'fluoksetyna',        brands: ['Bioxetin', 'Fluoksetyna Egis'],                           maxDose: '60 mg/d',              group: 'Leki przeciwdepresyjne' },
    { substance: 'sertralina',         brands: ['Setaloft', 'Stimuloton', 'Sertralina Krka'],              maxDose: '200 mg/d',             group: 'Leki przeciwdepresyjne' },
    { substance: 'fluwoksamina',       brands: ['Fevarin'],                                                 maxDose: '300 mg/d',             group: 'Leki przeciwdepresyjne' },
    { substance: 'paroksetyna',        brands: ['Rexetin', 'Paroxetine Aurovitas', 'Paroxinor'],           maxDose: '50–60 mg/d*',          group: 'Leki przeciwdepresyjne' },
    { substance: 'citalopram',         brands: ['Citabax', 'Cipramil', 'Pram'],                            maxDose: '40 mg/d*',             group: 'Leki przeciwdepresyjne' },
    { substance: 'escitalopram',       brands: ['Escitil', 'Mozarin', 'Escitalopram Actavis'],             maxDose: '20 mg/d',              group: 'Leki przeciwdepresyjne' },
    { substance: 'wenlafaksyna',       brands: ['Velaxin ER', 'Efectin ER', 'Olwexya'],                    maxDose: '375 mg/d*',            group: 'Leki przeciwdepresyjne' },
    { substance: 'duloksetyna',        brands: ['Dulsevia', 'Depratal', 'Cymbalta'],                       maxDose: '120 mg/d',             group: 'Leki przeciwdepresyjne' },
    { substance: 'mirtazapina',        brands: ['Mirtor', 'Mirzaten', 'Mirtagen'],                         maxDose: '45 mg/d',              group: 'Leki przeciwdepresyjne' },
    { substance: 'trazodon',           brands: ['Trittico CR', 'Trittico XR'],                             maxDose: '300 mg/d*',            group: 'Leki przeciwdepresyjne' },
    { substance: 'bupropion',          brands: ['Wellbutrin XR', 'Zyban', 'Bupropion Neuraxpharm'],        maxDose: '300 mg/d',             group: 'Leki przeciwdepresyjne' },
    { substance: 'klomipramina',       brands: ['Anafranil'],                                              maxDose: '250 mg/d',             group: 'Leki przeciwdepresyjne' },
    { substance: 'amitryptylina',      brands: ['Amitriptylinum VP', 'Saroten'],                           maxDose: '150–200 mg/d*',        group: 'Leki przeciwdepresyjne' },
    { substance: 'imipramina',         brands: ['Apo-Imipramine'],                                         maxDose: '200 mg/d*',            group: 'Leki przeciwdepresyjne' },
    { substance: 'nortryptylina',      brands: ['Nortrilen'],                                              maxDose: '150 mg/d*',            group: 'Leki przeciwdepresyjne', note: 'Import docelowy (**)' },
    { substance: 'mianseryna',         brands: ['Lerivon', 'Miansec', 'Miansegen'],                        maxDose: '90–120 mg/d*',         group: 'Leki przeciwdepresyjne' },
    { substance: 'agomelatyna',        brands: ['Valdoxan'],                                               maxDose: '50 mg/d',              group: 'Leki przeciwdepresyjne' },
    { substance: 'wortioksetyna',      brands: ['Brintellix'],                                             maxDose: '20 mg/d',              group: 'Leki przeciwdepresyjne' },
    { substance: 'moklobemid',         brands: ['Aurorix', 'Moklar', 'Mobemid'],                           maxDose: '600 mg/d',             group: 'Leki przeciwdepresyjne' },

    // ── Stabilizatory nastroju / leki normotymiczne ────────────────────────
    { substance: 'lit (węglan litu)',  brands: ['Lithium carbonicum GSK'],                                 maxDose: 'wg litemii; zwykle 1200–1500 mg/d*', group: 'Stabilizatory nastroju' },
    { substance: 'lamotrygina',        brands: ['Lamitrin', 'Lamictal', 'Lamotrix', 'Symla'],              maxDose: '200 mg/d*',            group: 'Stabilizatory nastroju' },
    { substance: 'kwas walproinowy',   brands: ['Depakine', 'Convulex', 'Orfiril'],                        maxDose: '60 mg/kg/d',           group: 'Stabilizatory nastroju' },
    { substance: 'karbamazepina',      brands: ['Tegretol', 'Amizepin', 'Neurotop Retard'],                maxDose: '1600 mg/d*',           group: 'Stabilizatory nastroju' },
    { substance: 'okskarbazepina',     brands: ['Trileptal'],                                              maxDose: '2400 mg/d*',           group: 'Stabilizatory nastroju' },
    { substance: 'topiramat',          brands: ['Topamax', 'Epitoram'],                                    maxDose: '400 mg/d*',            group: 'Stabilizatory nastroju' },

    // ── Leki przeciwpsychotyczne ───────────────────────────────────────────
    { substance: 'arypiprazol',        brands: ['Abilify', 'Aripiprazole Accord', 'Aribit'],               maxDose: '30 mg/d',              group: 'Leki przeciwpsychotyczne' },
    { substance: 'olanzapina',         brands: ['Zyprexa', 'Zolafren', 'Zolaxa'],                          maxDose: '20 mg/d*',             group: 'Leki przeciwpsychotyczne' },
    { substance: 'kwetiapina',         brands: ['Ketrel', 'Kventiax', 'Quetiapine Accord'],                maxDose: '800 mg/d',             group: 'Leki przeciwpsychotyczne' },
    { substance: 'rysperydon',         brands: ['Rispolept', 'Risset'],                                    maxDose: '16 mg/d*',             group: 'Leki przeciwpsychotyczne' },
    { substance: 'paliperydon',        brands: ['Invega', 'Xeplion', 'Trevicta'],                          maxDose: '12 mg/d (p.o.)*',      group: 'Leki przeciwpsychotyczne' },
    { substance: 'amisulpryd',         brands: ['Solian', 'Amisulpride Mylan', 'Amisulpride Teva'],        maxDose: '1200 mg/d',            group: 'Leki przeciwpsychotyczne' },
    { substance: 'klozapina',          brands: ['Klozapol', 'Leponex'],                                    maxDose: '900 mg/d*',            group: 'Leki przeciwpsychotyczne' },
    { substance: 'haloperydol',        brands: ['Haloperidol WZF', 'Haldol'],                              maxDose: '20 mg/d*',             group: 'Leki przeciwpsychotyczne' },
    { substance: 'chlorprotyksen',     brands: ['Chlorprothixen Zentiva'],                                 maxDose: '600 mg/d*',            group: 'Leki przeciwpsychotyczne' },
    { substance: 'perazyna',           brands: ['Perazinum'],                                              maxDose: '600 mg/d*',            group: 'Leki przeciwpsychotyczne' },
    { substance: 'lurazydon',          brands: ['Latuda'],                                                 maxDose: '148 mg/d*',            group: 'Leki przeciwpsychotyczne' },

    // ── Leki stosowane w ADHD ──────────────────────────────────────────────
    { substance: 'metylofenidat IR/MR', brands: ['Medikinet', 'Medikinet CR', 'Concerta'],                 maxDose: '60–72 mg/d*',          group: 'Leki ADHD' },
    { substance: 'atomoksetyna',       brands: ['Strattera', 'Atomoxetine Accord', 'Atomoxetine Adamed'],  maxDose: '100 mg/d',             group: 'Leki ADHD' },
    { substance: 'lisdeksamfetamina',  brands: ['Elvanse'],                                                maxDose: '70 mg/d',              group: 'Leki ADHD',  note: 'Import docelowy (**)' },
    { substance: 'guanfacyna XR',      brands: ['Intuniv'],                                                maxDose: '7 mg/d*',              group: 'Leki ADHD',  note: 'Import docelowy (**)' },

    // ── Inne — przeciwlękowe / nasenne / uspokajające ──────────────────────
    { substance: 'alprazolam',         brands: ['Afobam', 'Xanax', 'Neurol', 'Zomiren'],                   maxDose: '4–10 mg/d*',           group: 'Przeciwlękowe / nasenne' },
    { substance: 'lorazepam',          brands: ['Lorafen', 'Ativan'],                                      maxDose: '10 mg/d*',             group: 'Przeciwlękowe / nasenne', note: 'Ativan — import docelowy (**)' },
    { substance: 'klonazepam',         brands: ['Clonazepam TZF', 'Rivotril'],                             maxDose: '8 mg/d*',              group: 'Przeciwlękowe / nasenne' },
    { substance: 'diazepam',           brands: ['Relanium', 'Diazepam TZF', 'Valium'],                     maxDose: '40 mg/d*',             group: 'Przeciwlękowe / nasenne', note: 'Valium — import docelowy (**)' },
    { substance: 'bromazepam',         brands: ['Lexotan', 'Bromox', 'Sedam'],                             maxDose: '18–30 mg/d*',          group: 'Przeciwlękowe / nasenne' },
    { substance: 'buspiron',           brands: ['Buspiron Orion', 'Spamilan'],                             maxDose: '60 mg/d',              group: 'Przeciwlękowe / nasenne' },
    { substance: 'hydroksyzyna',       brands: ['Hydroxyzinum VP', 'Atarax'],                              maxDose: '100 mg/d*',            group: 'Przeciwlękowe / nasenne' },
    { substance: 'zolpidem',           brands: ['Stilnox', 'Nasen', 'Zolpic'],                             maxDose: '10 mg/d',              group: 'Przeciwlękowe / nasenne' },
    { substance: 'zopiclon',           brands: ['Imovane', 'Dobroson'],                                    maxDose: '7,5 mg/d',             group: 'Przeciwlękowe / nasenne' },
    { substance: 'pregabalina',        brands: ['Pregabalin Zentiva', 'Linefor', 'Lyrica'],                maxDose: '600 mg/d',             group: 'Przeciwlękowe / nasenne' }
];

// ── Helpery ────────────────────────────────────────────────────────────────

function capitalize(s) {
    if (!s) return s;
    // Zachowaj nawias: 'lit (węglan litu)' → 'Lit (węglan litu)'
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Spłaszcza MEDS_DB do tablicy wpisów per preparat handlowy (brand).
 * Zachowuje format kompatybilny z `modal-med.js` + `view-settings.js`:
 *   { name: brand, substance, maxDose, group }
 */
function flattenMedsForAutocomplete(db) {
    const out = [];
    for (const entry of db) {
        for (const brand of entry.brands) {
            out.push({
                name: brand,
                substance: capitalize(entry.substance),
                maxDose: entry.maxDose,
                group: entry.group
            });
        }
    }
    return out;
}

/**
 * Płaski widok bazy — eksportowany dla wstecznej kompatybilności.
 * Każdy wpis = jeden preparat handlowy (brand).
 */
export const FAKE_MED_DICT = flattenMedsForAutocomplete(MEDS_DB);

/**
 * Wyszukuje preparaty po fragmencie nazwy handlowej LUB substancji.
 * Priorytet: prefix-match brand > prefix-match substancja > contains.
 *
 * @param {string} query
 * @param {number} [limit=10]
 * @returns {Array<{ name: string, substance: string, maxDose: string, group: string }>}
 */
export function searchMeds(query, limit = 10) {
    if (!query) return FAKE_MED_DICT.slice(0, limit);
    const q = String(query).toLowerCase().trim();
    const prefix = [];
    const subPrefix = [];
    const contains = [];
    for (const entry of FAKE_MED_DICT) {
        const name = entry.name.toLowerCase();
        const sub = entry.substance.toLowerCase();
        if (name.startsWith(q)) prefix.push(entry);
        else if (sub.startsWith(q)) subPrefix.push(entry);
        else if (name.includes(q) || sub.includes(q)) contains.push(entry);
        if (prefix.length + subPrefix.length + contains.length >= limit * 3) break;
    }
    return prefix.concat(subPrefix, contains).slice(0, limit);
}

/**
 * Zwraca wpis z FAKE_MED_DICT o dokładnie takiej nazwie handlowej (case-insensitive),
 * albo null jeśli brak.
 */
export function findMedByBrand(name) {
    if (!name) return null;
    const q = String(name).toLowerCase().trim();
    return FAKE_MED_DICT.find((e) => e.name.toLowerCase() === q) || null;
}

/**
 * Zwraca wpis z MEDS_DB po nazwie substancji (case-insensitive), albo null.
 */
export function findMedBySubstance(substance) {
    if (!substance) return null;
    const q = String(substance).toLowerCase().trim();
    return MEDS_DB.find((e) => e.substance.toLowerCase() === q) || null;
}

/**
 * Lista dostępnych grup (unikalnych) — przydatne do filtrów i UI grupowania.
 * @returns {string[]}
 */
export function listMedGroups() {
    const seen = new Set();
    const out = [];
    for (const e of MEDS_DB) {
        if (!seen.has(e.group)) {
            seen.add(e.group);
            out.push(e.group);
        }
    }
    return out;
}
