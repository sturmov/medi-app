// ============================================================================
// _holidays-pl.js — dni ustawowo wolne od pracy w Polsce (liczone lokalnie,
// bez żadnego dostępu do kalendarzy Google).
// ============================================================================

function iso(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

/** Niedziela wielkanocna (kalendarz gregoriański, algorytm Meeusa/Jonesa/Butchera). */
export function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
}

function plusDays(date, n) {
    const d = new Date(date.getTime() + n * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** @returns {Array<{date: 'RRRR-MM-DD', name: string}>} posortowane wg daty */
export function polishHolidays(year) {
    const easter = easterSunday(year);
    const list = [
        { date: iso(year, 1, 1), name: 'Nowy Rok' },
        { date: iso(year, 1, 6), name: 'Trzech Króli' },
        { date: plusDays(easter, 0), name: 'Wielkanoc' },
        { date: plusDays(easter, 1), name: 'Poniedziałek Wielkanocny' },
        { date: iso(year, 5, 1), name: 'Święto Pracy' },
        { date: iso(year, 5, 3), name: 'Święto Konstytucji 3 Maja' },
        { date: plusDays(easter, 49), name: 'Zielone Świątki' },
        { date: plusDays(easter, 60), name: 'Boże Ciało' },
        { date: iso(year, 8, 15), name: 'Wniebowzięcie NMP' },
        { date: iso(year, 11, 1), name: 'Wszystkich Świętych' },
        { date: iso(year, 11, 11), name: 'Święto Niepodległości' },
        { date: iso(year, 12, 25), name: 'Boże Narodzenie' },
        { date: iso(year, 12, 26), name: 'Drugi dzień Bożego Narodzenia' }
    ];
    // Wigilia jest dniem wolnym od pracy od 2025 r.
    if (year >= 2025) list.push({ date: iso(year, 12, 24), name: 'Wigilia' });
    return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Święta w przedziale dat [from, to] (daty `RRRR-MM-DD`, obie włącznie). */
export function holidaysBetween(from, to) {
    const out = [];
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
        for (const h of polishHolidays(y)) {
            if (h.date >= from && h.date <= to) out.push(h);
        }
    }
    return out;
}
