// ============================================================================
// _tests-catalog.js — definicje testów psychometrycznych dla runnera.
//
// MVP: PHQ-9 + GAD-7 (wersje DEMO, dla pokazania flow uruchamiania testów).
//      Pełne kwestionariusze z normami klinicznymi zostaną dodane po akceptacji
//      makiety przez klientkę (PO 2026-04-30).
//
// Każdy test ma:
//   - code:        kod (np. 'PHQ-9')
//   - name:        pełna nazwa
//   - description: krótki opis (kategoria: Depresja / Lęk / ...)
//   - questions:   lista pytań [{ id, text }]
//   - options:     lista opcji odpowiedzi z punktacją [{ value, label, score }]
//   - interpret(score) → string (krótka interpretacja kliniczna)
//
// Punktacja: każde pytanie ma ten sam zestaw opcji; suma score ze wszystkich
// odpowiedzi = wynik. Niezaznaczone pytanie liczy się jako 0 (zachowanie demo).
// ============================================================================

const PHQ9_OPTIONS = [
    { value: '0', label: 'Wcale (0)',                  score: 0 },
    { value: '1', label: 'Kilka dni (1)',              score: 1 },
    { value: '2', label: 'Więcej niż połowę dni (2)',  score: 2 },
    { value: '3', label: 'Niemal codziennie (3)',      score: 3 }
];

const GAD7_OPTIONS = [
    { value: '0', label: 'Wcale (0)',                  score: 0 },
    { value: '1', label: 'Kilka dni (1)',              score: 1 },
    { value: '2', label: 'Więcej niż połowę dni (2)',  score: 2 },
    { value: '3', label: 'Niemal codziennie (3)',      score: 3 }
];

export const TESTS_CATALOG = {

    'PHQ-9': {
        code: 'PHQ-9',
        name: 'Kwestionariusz depresji (PHQ-9)',
        description: 'Przesiewowy kwestionariusz nasilenia objawów depresyjnych w ostatnich 2 tygodniach.',
        instruction: 'W ciągu ostatnich 2 tygodni, jak często dokuczały Ci poniższe problemy?',
        options: PHQ9_OPTIONS,
        questions: [
            { id: 'q1', text: 'Mała przyjemność lub brak zainteresowania wykonywaniem czynności' },
            { id: 'q2', text: 'Uczucie smutku, przygnębienia lub beznadziejności' },
            { id: 'q3', text: 'Trudności z zasypianiem, problemy z utrzymaniem snu lub zbyt długi sen' },
            { id: 'q4', text: 'Uczucie zmęczenia lub brak energii' },
            { id: 'q5', text: 'Słaby apetyt lub objadanie się' },
            { id: 'q6', text: 'Złe samopoczucie ze sobą — poczucie porażki lub że zawiodłaś/eś siebie lub rodzinę' },
            { id: 'q7', text: 'Trudności z koncentracją, np. przy czytaniu lub oglądaniu telewizji' },
            { id: 'q8', text: 'Spowolnienie ruchowe lub mowy zauważalne dla innych — albo przeciwnie: niepokój ruchowy' },
            { id: 'q9', text: 'Myśli, że lepiej byłoby umrzeć lub zrobić sobie krzywdę' }
        ],
        interpret(score) {
            if (score >= 20) return 'Ciężka depresja (≥20). Wskazana pilna konsultacja psychiatryczna.';
            if (score >= 15) return 'Umiarkowana / ciężka depresja (15–19). Rozważyć farmakoterapię + psychoterapię.';
            if (score >= 10) return 'Umiarkowana depresja (10–14). Wskazana konsultacja i plan leczenia.';
            if (score >= 5)  return 'Łagodne objawy depresyjne (5–9). Obserwacja, ewentualnie psychoterapia.';
            return 'Brak / minimalne objawy depresyjne (<5).';
        },
        // Czerwona flaga (samobójstwo) — pytanie q9
        redFlag(answers) {
            return Number(answers && answers.q9) >= 1;
        }
    },

    'GAD-7': {
        code: 'GAD-7',
        name: 'Kwestionariusz lęku uogólnionego (GAD-7)',
        description: 'Przesiewowy kwestionariusz nasilenia objawów lęku w ostatnich 2 tygodniach.',
        instruction: 'W ciągu ostatnich 2 tygodni, jak często dokuczały Ci poniższe problemy?',
        options: GAD7_OPTIONS,
        questions: [
            { id: 'q1', text: 'Uczucie zdenerwowania, niepokoju lub napięcia' },
            { id: 'q2', text: 'Niemożność powstrzymania lub kontrolowania zamartwiania się' },
            { id: 'q3', text: 'Nadmierne zamartwianie się o różne sprawy' },
            { id: 'q4', text: 'Trudności z odprężeniem się' },
            { id: 'q5', text: 'Niepokój utrudniający usiedzenie spokojnie' },
            { id: 'q6', text: 'Łatwa irytacja lub rozdrażnienie' },
            { id: 'q7', text: 'Uczucie strachu, jakby miało się stać coś okropnego' }
        ],
        interpret(score) {
            if (score >= 15) return 'Ciężki lęk (≥15). Wskazana pilna konsultacja psychiatryczna.';
            if (score >= 10) return 'Umiarkowany lęk (10–14). Wskazana konsultacja i plan leczenia.';
            if (score >= 5)  return 'Łagodny lęk (5–9). Obserwacja, psychoedukacja, ewentualnie psychoterapia.';
            return 'Brak / minimalne objawy lękowe (<5).';
        }
    }
};

/**
 * Zwraca definicję testu po kodzie. Zwraca `null` jeśli kod nieznany.
 */
export function getTestDefinition(code) {
    return TESTS_CATALOG[code] || null;
}

/**
 * Lista kodów testów dostępnych do uruchomienia (do inline-pickera).
 */
export function listAvailableTests() {
    return Object.keys(TESTS_CATALOG).map((code) => {
        const def = TESTS_CATALOG[code];
        return {
            code,
            name: def.name,
            description: def.description,
            questions: def.questions.length
        };
    });
}

/**
 * Liczy wynik na podstawie odpowiedzi `{questionId: optionValue}`.
 * Zwraca { score, answeredCount, totalCount, interpretation, redFlag }.
 */
export function computeTestResult(code, answers) {
    const def = getTestDefinition(code);
    if (!def) return null;

    let score = 0;
    let answered = 0;
    for (const q of def.questions) {
        const v = answers && answers[q.id];
        if (v == null || v === '') continue;
        const opt = def.options.find((o) => String(o.value) === String(v));
        if (opt) {
            score += Number(opt.score) || 0;
            answered++;
        }
    }

    return {
        score,
        answeredCount: answered,
        totalCount: def.questions.length,
        interpretation: def.interpret ? def.interpret(score) : '',
        redFlag: def.redFlag ? !!def.redFlag(answers) : false
    };
}
