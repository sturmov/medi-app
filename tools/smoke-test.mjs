// ============================================================================
// tools/smoke-test.mjs — test aplikacji w prawdziwej przeglądarce (headless).
//
//   node tools/smoke-test.mjs            (wszystkie scenariusze)
//   node tools/smoke-test.mjs demo       (tylko wybrany: demo | calendar | gdrive | local)
//
// Klika i pisze jak użytkownik (zdarzenia myszy i klawiatury przez DevTools),
// po czym sprawdza stan aplikacji i zawartość magazynu.
//
//   demo   — formularz wizyty: każdy typ pola, szybkie przełączanie pól,
//            tryb odczyt/edycja, historia, osie czasu, usuwanie wizyty.
//   calendar — kalendarz: umawianie, przeciąganie terminu, notatka z terminu,
//            płatność w obu kierunkach, kalendarz pacjenta, święta.
//   gdrive — Dysk Google na lokalnej atrapie API: zakładanie pacjenta,
//            zawartość arkusza, wczytanie po odświeżeniu strony (bezstratność),
//            zmiana nazwiska, błędy sieci / wygasła sesja, załączniki.
//   local  — folder lokalny (na prywatnym systemie plików przeglądarki):
//            zapis pacjent.xlsx, automatyczne przywrócenie po odświeżeniu.
//
// Zrzuty ekranu lądują w tools/.smoke/ (do obejrzenia ręcznie).
// ============================================================================

import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startServer, launchBrowser, sleep } from './lib/browser.mjs';
import { createGoogleMock, FOLDER_MIME } from './lib/google-mock.mjs';
import { checkStamp } from './stamp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tools', '.smoke');
const only = process.argv[2] || '';

let passed = 0;
let failed = 0;
let activeBrowser = null;       // przeglądarka bieżącego scenariusza — do zrzutu ekranu przy błędzie
const RUN_ID = new Date().toTimeString().slice(0, 8).replace(/:/g, '');

async function step(name, fn) {
    try {
        await fn();
        passed++;
        console.log('  ✓ ' + name);
    } catch (e) {
        failed++;
        console.error('  ✗ ' + name + '\n      ' + String(e && e.message || e).split('\n').slice(0, 14).join('\n      '));
        // Stan ekranu w chwili błędu: tools/.smoke/BLAD-<godzina uruchomienia>-<nr>.png
        if (activeBrowser) {
            const shot = path.join(SHOTS, 'BLAD-' + RUN_ID + '-' + failed + '.png');
            try { await activeBrowser.screenshot(shot); console.error('      zrzut ekranu: ' + shot); } catch (_) { /* */ }
        }
    }
}

async function waitFor(b, expr, ms = 6000, what = expr) {
    const until = Date.now() + ms;
    for (;;) {
        if (await b.evaluate('return !!(' + expr + ');')) return;
        if (Date.now() > until) throw new Error('Nie doczekano się: ' + what);
        await sleep(80);
    }
}

const go = (b, hash) => b.evaluate('location.hash = ' + JSON.stringify(hash) + ';');

/** Pomocniki dostępne w stronie jako `__t`. */
const PAGE_HELPERS = `
window.__t = {
    nav: (uid) => document.querySelector('.psy-form-toolbar__field[data-field-uid="' + uid + '"]'),
    ent: (uid) => document.querySelector('.psy-form-toolbar__entry[data-field-uid="' + uid + '"]'),
    ctl: (uid, sel) => { const a = window.__t.ent(uid); return a ? a.querySelector(sel) : null; },
    mode: (uid) => { const a = window.__t.ent(uid); return !a ? 'absent' : (a.classList.contains('psy-form-toolbar__entry--edit') ? 'edit' : 'read'); },
    setSelect: (node, value) => { node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); },
    main: () => document.getElementById('psy-new-main').innerText,
    cal: () => document.querySelector('.psy-cal-view').psyCalendar,
    setInput: (sel, value) => { const n = document.querySelector(sel); n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); },
    calApi: async () => (await import('/js/views/_calendar-api.js')).getCalendarApi(),
    // wszystkie terminy z szerokiego zakresu (do asercji)
    appointments: async () => (await window.__t.calApi()).list('2020-01-01T00:00:00Z', '2035-01-01T00:00:00Z')
};`;

const SCOPE = {
    drive: 'https://www.googleapis.com/auth/drive.file',
    calendar: 'https://www.googleapis.com/auth/calendar.app.created',
    busy: 'https://www.googleapis.com/auth/calendar.freebusy'
};

/**
 * „Konto Google" dla scenariusza z atrapą API: pamięta udzielone zgody (także po
 * odświeżeniu strony — jak prawdziwe konto) i wydaje token niosący ich listę,
 * żeby atrapa mogła odmówić wywołań spoza zgód.
 */
const GOOGLE_ACCOUNT_MODEL = `
window.__PSY_TEST_GDRIVE__ = {
    base: location.origin + '/__gapi',
    token: 'test-token',
    deny: [],            // zgody, których „użytkownik" nie zatwierdzi w okienku Google
    incremental: true,   // false: token obejmuje tylko to, o co poproszono (bez wcześniejszych zgód)
    hideFromToken: [],   // zgody zgłoszone jako udzielone, których token faktycznie nie ma
    asked: [],           // dziennik próśb: { requested, consent }
    account() { return new Set(JSON.parse(sessionStorage.getItem('__psy_test_google_account') || '[]')); },
    revoke(scope) {
        const a = this.account();
        a.delete(scope);
        sessionStorage.setItem('__psy_test_google_account', JSON.stringify([...a]));
    },
    grant(requested, opts) {
        const a = this.account();
        for (const s of requested) if (!this.deny.includes(s)) a.add(s);
        sessionStorage.setItem('__psy_test_google_account', JSON.stringify([...a]));
        const covered = this.incremental ? [...a] : requested.filter((s) => a.has(s));
        this.token = 'test-token:' + covered.filter((s) => !this.hideFromToken.includes(s)).map((s) => s.split('/').pop()).join(',');
        this.asked.push({ requested, consent: !!(opts && opts.consent) });
        return covered;
    }
};`;

/** Środa przyszłego tygodnia (zawsze w przyszłości, więc „najbliższy termin" jest przewidywalny). */
function nextWeekWednesday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 9);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Otwiera stronę z kalendarzem i ustawia tydzień zawierający `date`. */
async function openCalendar(b, hash, date, view = 'timeGridWeek') {
    await go(b, '#/settings');
    await go(b, hash);
    await waitFor(b, `location.hash === '${hash}' && document.querySelector('.psy-cal-view') && document.querySelector('.psy-cal-view').psyCalendar`, 10000, 'kalendarz (' + hash + ')');
    await b.evaluate(`__t.cal().changeView('${view}', '${date}');`);
    await sleep(500);
}

function noPageProblems(b) {
    assert.deepEqual(b.problems, [], 'błędy w konsoli strony');
}

/* ==========================================================================
   SCENARIUSZ: tryb demo — formularz wizyty i projekcje
   ========================================================================== */
async function scenarioDemo(origin) {
    console.log('\nTryb demo — formularz wizyty');
    const b = (activeBrowser = await launchBrowser());
    try {
        await b.onNewDocument(`try { localStorage.setItem('psy-new:devMode', '1'); } catch (e) {} ${PAGE_HELPERS}`);
        await b.navigate(origin + '/index.html#/patients');
        await waitFor(b, `window.PsyStore && document.querySelector('.psy-new-table tbody tr')`, 8000, 'lista pacjentów');

        await step('strona bez zepsutych znaków (tytuł, pasek górny)', async () => {
            const r = await b.evaluate(`return { title: document.title, top: document.querySelector('.psy-new-topbar').innerText };`);
            assert.equal(r.title, 'PsychoApp — Dokumentacja Psychologiczna');
            assert.ok(!/[ÃÅ]|â€|ðŸ/.test(r.title + r.top), 'krzaczki w: ' + r.top);
            assert.match(r.top, /Tryb demo/);
        });

        await step('każdy typ wizyty otwiera właściwy formularz', async () => {
            await b.evaluate(`PsyStore.selectPatient('P004');`);
            const expected = {
                first_meeting: ['1sze spotkanie', true], next_meeting: ['Kolejne spotkanie', false],
                supervision: ['Superwizja', false], admin_note: ['Notatka administracyjna', false],
                phone_contact: ['Kontakt telefoniczny', false], email_contact: ['Kontakt mailowy', false]
            };
            for (const [id, [label, fullInterview]] of Object.entries(expected)) {
                await go(b, '#/visit/form/new/' + id);
                await waitFor(b, `location.hash.endsWith('${id}') && __t.ent('visitData::__grid')`);
                const r = await b.evaluate(`return {
                    title: document.querySelector('.psy-new-view__title').innerText,
                    hasInterview: !!__t.nav('wywiad::depresyjne'),
                    dateRead: __t.ent('visitData::__grid').innerText };`);
                assert.ok(r.title.includes(label), id + ': tytuł „' + r.title + '"');
                assert.equal(r.hasInterview, fullInterview, id + ': pełny wywiad');
                assert.match(r.dateRead, /\d{4}-\d{2}-\d{2}/, id + ': data domyślna');
            }
        });

        await go(b, '#/visit/form/new/first_meeting');
        await waitFor(b, `location.hash.endsWith('first_meeting') && __t.nav('wywiad::depresyjne')`);

        await step('wypełnianie wszystkich typów pól bez czekania między nimi', async () => {
            // Dane wizyty (sekcja w jednym oknie): klik w akapit → edycja
            await b.click(`__t.ent('visitData::__grid')`);
            assert.equal(await b.evaluate(`return __t.mode('visitData::__grid');`), 'edit');
            await b.evaluate(`__t.setSelect(__t.ctl('visitData::__grid', 'select[name="visitData.rodzaj"]'), 'Konsultacja');`);
            await b.click(`__t.ctl('visitData::__grid', 'input[name="visitData.osoby[]"][value="Pacjent"]')`);
            await b.click(`__t.ctl('visitData::__grid', 'textarea[name="visitData.powod"]')`);
            await b.type('obniżony nastrój od pół roku');

            // radio + uwagi
            await b.click(`__t.nav('somatyczne::sen')`);
            await b.click(`__t.ctl('somatyczne::sen', 'input[type="radio"][value="wybudzenia nocne"]')`);
            await b.click(`__t.ctl('somatyczne::sen', 'textarea')`);
            await b.type('budzi się o 3:00');

            // pole tekstowe (kursor od razu w polu)
            await b.click(`__t.nav('oddzialywania::ustalenia')`);
            await b.type('CBT raz w tygodniu');

            // sekcja, która jest samym opisem
            await b.click(`__t.nav('problemZdrowotny::__comment')`);
            await b.type('Trudności z koncentracją');

            // wielokrotny wybór
            await b.click(`__t.nav('wywiad::depresyjne')`);
            await b.click(`__t.ctl('wywiad::depresyjne', 'input[value="anhedonia"]')`);
            await b.click(`__t.ctl('wywiad::depresyjne', 'input[value="apatia"]')`);

            // tagi ICD-10
            await b.click(`__t.nav('ocenaKliniczna::hipoteza')`);
            await b.type('F32.1');
            await waitFor(b, `__t.ctl('ocenaKliniczna::hipoteza', '.psy-autocomplete__item')`);
            await b.key('Enter');

            // używki
            await b.click(`__t.nav('uzywki::substancje')`);
            await b.click(`__t.ctl('uzywki::substancje', 'input[name="uzywki_u_2"]')`);
            await b.evaluate(`__t.setSelect(__t.ctl('uzywki::substancje', 'select[name="uzywki_u_2_i"]'), 'Regularnie');`);

            // parametry + BMI liczone automatycznie
            await b.click(`__t.nav('parametry::__grid')`);
            await b.click(`__t.ctl('parametry::__grid', 'input[name="parametry.wzrost"]')`);
            await b.type('170');
            await b.click(`__t.ctl('parametry::__grid', 'input[name="parametry.masa"]')`);
            await b.type('65');
            assert.equal(await b.evaluate(`return __t.ctl('parametry::__grid', 'input[name="parametry.bmi"]').value;`), '22.5');

            // rozpoznanie w wizycie
            await b.click(`__t.nav('rozpoznanie::diagnozy')`);
            await b.type('F41.1');
            await waitFor(b, `__t.ctl('rozpoznanie::diagnozy', '.psy-autocomplete__item')`);
            await b.key('Enter');

            // lek w wizycie: wybór z listy, potem dawka
            await b.click(`__t.nav('farmakoterapia::leki')`);
            await b.type('setal');
            await waitFor(b, `__t.ctl('farmakoterapia::leki', '.psy-autocomplete__item')`);
            await b.click(`__t.ctl('farmakoterapia::leki', '.psy-autocomplete__item')`);
            await waitFor(b, `document.activeElement && document.activeElement.classList.contains('psy-vf__inline-meds__dose-input')`, 2000, 'kursor w polu dawki');
            await b.type('50');

            // klik poza formularzem i natychmiastowe wyjście z widoku
            await b.click('.psy-new-brand');
            await go(b, '#/history');
            await waitFor(b, `document.querySelector('.psy-history-paragraph')`);
        });

        let visitId = '';
        await step('nic nie zginęło: stan wizyty po szybkim wypełnieniu', async () => {
            const v = await b.evaluate(`return PsyStore.getVisits('P004')[0];`);
            visitId = v.id;
            const raw = v.data._raw;
            assert.equal(v.type, 'first_meeting');
            assert.equal(raw['visitData.rodzaj'], 'Konsultacja');
            assert.deepEqual(raw['visitData.osoby'], ['Pacjent']);
            assert.equal(raw['visitData.powod'], 'obniżony nastrój od pół roku');
            assert.equal(raw['somatyczne.sen'], 'wybudzenia nocne');
            assert.equal(raw['somatyczne.sen.__notes'], 'budzi się o 3:00');
            assert.equal(raw['oddzialywania.ustalenia'], 'CBT raz w tygodniu');
            assert.equal(raw['problemZdrowotny.__comment'], 'Trudności z koncentracją');
            assert.deepEqual(raw['wywiad.depresyjne'], ['anhedonia', 'apatia']);
            assert.equal(raw['ocenaKliniczna.hipoteza'], 'F32.1');
            assert.equal(raw['uzywki_u_2'], true);
            assert.equal(raw['uzywki_u_2_i'], 'Regularnie');
            assert.deepEqual([raw['parametry.wzrost'], raw['parametry.masa'], raw['parametry.bmi']], ['170', '65', '22.5']);
            assert.equal(v.data.diagnoses.length, 1);
            assert.equal(v.data.diagnoses[0].code, 'F41.1');
            assert.equal(v.data.meds.length, 1);
            assert.match(v.data.meds[0].name, /^Setal/);
            assert.deepEqual([v.data.meds[0].dose, v.data.meds[0].unit], ['50', 'mg/d']);
        });

        await step('historia wizyt pokazuje całą treść, razem z lekami i rozpoznaniami', async () => {
            const text = await b.evaluate(`return document.querySelector('.psy-history-paragraph').innerText;`);
            for (const s of ['1sze spotkanie', 'Konsultacja', 'obniżony nastrój od pół roku', 'wybudzenia nocne', 'budzi się o 3:00',
                'CBT raz w tygodniu', 'Trudności z koncentracją', 'anhedonia, apatia', 'F32.1', 'F41.1', 'Setal', '50 mg/d', 'Regularnie', '22.5']) {
                assert.ok(text.includes(s), 'brak w historii: ' + s);
            }
            await b.screenshot(path.join(SHOTS, 'demo-01-historia.png'));
        });

        await step('ponowne otwarcie: wypełnione pola jako gotowa notatka (tryb odczytu)', async () => {
            await go(b, '#/visit/form/' + visitId);
            await waitFor(b, `__t.ent('oddzialywania::ustalenia')`);
            const r = await b.evaluate(`
                const c = document.querySelector('.psy-form-toolbar__content');
                return { text: c.innerText, controls: c.querySelectorAll('input, select, textarea').length,
                         entries: [...c.querySelectorAll('article')].map((a) => a.dataset.fieldUid),
                         dots: document.querySelectorAll('.psy-form-toolbar__field--filled').length };`);
            assert.equal(r.controls, 0, 'w trybie odczytu nie ma kontrolek');
            assert.ok(!/brak renderera|\(puste/.test(r.text), 'pusty / zepsuty akapit: ' + r.text.slice(0, 200));
            assert.deepEqual(r.entries, ['visitData::__grid', 'wywiad::depresyjne', 'problemZdrowotny::__comment', 'somatyczne::sen',
                'farmakoterapia::leki', 'uzywki::substancje', 'parametry::__grid', 'ocenaKliniczna::hipoteza',
                'rozpoznanie::diagnozy', 'oddzialywania::ustalenia']);
            assert.equal(r.dots, 10);
            for (const s of ['Konsultacja', 'wybudzenia nocne', 'budzi się o 3:00', 'Setal', '50 mg/d', 'max 200 mg/d', 'F41.1', '22.5', 'Alkohol']) {
                assert.ok(r.text.includes(s), 'brak w notatce: ' + s);
            }
            await b.screenshot(path.join(SHOTS, 'demo-02-wizyta-odczyt.png'));
        });

        await step('zwarty odczyt: wpis to jedna linia „nazwa pola | treść", cała notatka mieści się na ekranie 1366×768', async () => {
            const r = await b.evaluate(`
                const c = document.querySelector('.psy-form-toolbar__content');
                const entry = (uid) => {
                    const a = __t.ent(uid);
                    const label = a.querySelector('.psy-form-toolbar__entry-label').getBoundingClientRect();
                    const body = a.querySelector('.psy-form-toolbar__entry-body--read').getBoundingClientRect();
                    return { height: Math.round(a.getBoundingClientRect().height), header: !!a.querySelector('header'),
                             sameLine: Math.abs(label.top - body.top) < 6 && body.left > label.right - 1,
                             text: a.innerText.replace(/\\s+/g, ' ').trim() };
                };
                return {
                    sen: entry('somatyczne::sen'), ustalenia: entry('oddzialywania::ustalenia'), leki: entry('farmakoterapia::leki'),
                    labelColumns: [...new Set([...c.querySelectorAll('.psy-form-toolbar__entry-body--read')].map((n) => Math.round(n.getBoundingClientRect().left)))],
                    sectionTitle: Math.round(c.querySelector('.psy-form-toolbar__journal-section-title').getBoundingClientRect().height),
                    // wysokość samej notatki (nie okna, w którym się przewija)
                    noteHeight: Math.round(c.querySelector('.psy-form-toolbar__journal').getBoundingClientRect().height),
                    windowHeight: c.clientHeight };`);
            for (const [name, e] of [['Sen', r.sen], ['Ustalenia', r.ustalenia], ['Leki', r.leki]]) {
                assert.equal(e.header, false, name + ': w odczycie nie ma nagłówka-belki');
                assert.equal(e.sameLine, true, name + ': nazwa pola i treść w jednej linii');
                assert.ok(e.height <= 24, name + ': wysokość jednej linii (' + e.height + ' px)');
            }
            assert.equal(r.sen.text, 'Sen wybudzenia nocne uwagi: budzi się o 3:00', 'uwagi w tej samej linii co wartość');
            assert.equal(r.labelColumns.length, 1, 'treść wszystkich wpisów zaczyna się w jednej kolumnie');
            assert.ok(r.sectionTitle <= 16, 'drobny nagłówek sekcji (' + r.sectionTitle + ' px)');
            // Ta notatka (10 wpisów w 8 sekcjach) w układzie z kartami miała ponad 1000 px; zwarta ma ok. 400.
            assert.ok(r.noteHeight <= 420 && r.noteHeight < r.windowHeight,
                'notatka z 10 wpisami mieści się na ekranie z zapasem (' + r.noteHeight + ' z ' + r.windowHeight + ' px)');
        });

        await step('edycja „Danych wizyty": pola wyboru mają zwykły rozmiar i stoją obok swoich podpisów', async () => {
            await b.click(`__t.ent('visitData::__grid')`);
            await waitFor(b, `__t.mode('visitData::__grid') === 'edit'`);
            const r = await b.evaluate(`
                const boxes = (uid) => [...__t.ent(uid).querySelectorAll('label')]
                    .filter((l) => l.querySelector('input[type="checkbox"]'))
                    .map((l) => {
                        const i = l.querySelector('input').getBoundingClientRect();
                        const s = l.querySelector('span').getBoundingClientRect();
                        return { text: l.innerText.trim(), width: Math.round(i.width), beforeText: i.right <= s.left + 1 };
                    });
                const grid = boxes('visitData::__grid');
                const date = __t.ctl('visitData::__grid', 'input[type="date"]').getBoundingClientRect();
                const cell = __t.ctl('visitData::__grid', 'input[type="date"]').closest('.psy-vf__compact-grid-cell').getBoundingClientRect();
                return { grid, dateFillsCell: date.width > cell.width - 4 };`);
            assert.equal(r.grid.length, 8, 'osoby obecne: ' + r.grid.map((x) => x.text).join(', '));
            for (const x of r.grid) {
                assert.ok(x.width <= 22, x.text + ': pole wyboru ma ' + x.width + ' px szerokości');
                assert.equal(x.beforeText, true, x.text + ': pole wyboru nachodzi na podpis');
            }
            assert.equal(r.dateFillsCell, true, 'pola tekstowe nadal wypełniają komórkę');
            await b.screenshot(path.join(SHOTS, 'demo-11-dane-wizyty-edycja.png'));
            await b.key('Escape');
            await waitFor(b, `__t.mode('visitData::__grid') === 'read'`);
        });

        await step('mały ekran (1366×768): formularz do dołu okna, nagłówek w jednej linii, menu boczne z napisów', async () => {
            const r = await b.evaluate(`
                const box = (n) => { const x = n.getBoundingClientRect(); return { top: Math.round(x.top), bottom: Math.round(x.bottom), h: Math.round(x.height) }; };
                const main = document.getElementById('psy-new-main');
                return {
                    viewport: innerWidth + 'x' + innerHeight,
                    header: box(document.querySelector('.psy-visit-form-view .psy-new-view__header')),
                    subtitle: !!document.querySelector('.psy-visit-form-view .psy-new-view__subtitle'),
                    toolbar: box(document.querySelector('.psy-form-toolbar')),
                    scroll: [document.documentElement.scrollHeight - innerHeight, main.scrollHeight - main.clientHeight],
                    menu: [...document.querySelectorAll('.psy-new-sidebar__item')].map((li) => ({
                        shown: getComputedStyle(li, '::before').content.replace(/"/g, ''),
                        hint: li.dataset.label,
                        clipped: li.scrollWidth > li.clientWidth })) };`);
            assert.equal(r.viewport, '1366x768');
            assert.ok(r.header.h <= 40, 'nagłówek wizyty w jednej linii (wysokość ' + r.header.h + ' px)');
            assert.equal(r.subtitle, false, 'bez powtórzonego podtytułu');
            assert.ok(r.toolbar.h >= 650, 'lista pól i notatka dostają wysokość okna (' + r.toolbar.h + ' px)');
            assert.ok(768 - r.toolbar.bottom <= 16, 'formularz sięga dołu okna');
            assert.deepEqual(r.scroll, [0, 0], 'strona się nie przewija — przewijają się tylko lista pól i notatka');
            assert.deepEqual(r.menu.map((m) => m.shown), ['+ Wizyta', 'Historia', 'Kalendarz', 'Leki', 'Testy', 'Zalecenia',
                'Plan', 'Diagnozy', 'Parametry', 'Dokumenty'], 'wąskie menu: krótkie słowa zamiast ikon');
            assert.deepEqual(r.menu.filter((m) => m.clipped), [], 'żaden napis nie jest ucięty');
            assert.equal(r.menu[1].hint, 'Historia wizyt', 'pełna nazwa w podpowiedzi');
        });

        await step('lista pól: sekcje domyślnie rozwinięte, z licznikiem; „Zwiń do listy sekcji" mieści cały formularz na ekranie', async () => {
            const state = () => b.evaluate(`
                const nav = document.querySelector('.psy-form-toolbar__nav');
                const titles = [...nav.querySelectorAll('.psy-form-toolbar__group-title')];
                return {
                    toggle: nav.querySelector('[data-action="toggle-sections"]').innerText.trim(),
                    sections: titles.length,
                    fields: nav.querySelectorAll('.psy-form-toolbar__field').length,
                    counts: Object.fromEntries(titles.map((t) => [
                        t.querySelector('.psy-form-toolbar__group-name').textContent,
                        t.querySelector('.psy-form-toolbar__group-count').textContent])),
                    // sekcje z zieloną kropką (kolor faktycznie narysowany, nie sama klasa)
                    green: titles.filter((t) => getComputedStyle(t.querySelector('.psy-form-toolbar__group-dot')).backgroundColor === 'rgb(16, 185, 129)')
                        .map((t) => t.querySelector('.psy-form-toolbar__group-name').textContent),
                    fits: nav.scrollHeight <= nav.clientHeight };`);
            const open = await state();
            assert.match(open.toggle, /Zwiń do listy sekcji/);
            assert.equal(open.sections, 19);
            assert.equal(open.fields, 86, 'wszystkie pola widoczne od razu (wymaganie klientki)');
            assert.equal(open.counts['Wywiad — aktualne objawy'], '1/7');
            assert.equal(open.counts['Dane wizyty'], '1/1');
            assert.equal(open.counts['Status psychiczny'], '0/22');
            assert.equal(open.fits, false);
            // kropka przy sekcji: zielona dokładnie tam, gdzie coś wpisano
            const withContent = Object.entries(open.counts).filter(([, c]) => !c.startsWith('0/')).map(([name]) => name);
            assert.deepEqual(open.green, withContent);
            assert.equal(open.green.length, 10);
            assert.ok(open.green.includes('Wywiad — aktualne objawy') && !open.green.includes('Status psychiczny'));

            // kropka sekcji zapala się od razu po wpisaniu pierwszego pola i gaśnie po jego wyczyszczeniu
            await b.click(`__t.nav('kontekst::czasWolny')`);
            await b.click(`__t.ctl('kontekst::czasWolny', 'input[type="checkbox"]')`);
            let live = await state();
            assert.ok(live.green.includes('Tło / kontekst funkcjonowania'), 'kropka sekcji po pierwszym wpisie');
            assert.equal(live.counts['Tło / kontekst funkcjonowania'], '1/7');
            await b.click(`__t.ctl('kontekst::czasWolny', 'input[type="checkbox"]')`);
            live = await state();
            assert.ok(!live.green.includes('Tło / kontekst funkcjonowania'), 'kropka sekcji gaśnie, gdy sekcja znów jest pusta');
            await b.key('Escape');

            await b.click('[data-action="toggle-sections"]');
            const closed = await state();
            assert.match(closed.toggle, /Rozwiń wszystkie sekcje/);
            assert.deepEqual([closed.sections, closed.fields], [19, 0]);
            assert.equal(closed.fits, true, 'cała lista sekcji mieści się bez przewijania');
            assert.deepEqual(closed.counts, open.counts);
            assert.deepEqual(closed.green, open.green, 'kropki widać także na zwiniętej liście sekcji');
            await b.screenshot(path.join(SHOTS, 'demo-07-lista-sekcji.png'));

            // jedna sekcja rozwinięta ręcznie, potem wszystko z powrotem
            await b.click(`[...document.querySelectorAll('.psy-form-toolbar__group-title')].find((t) => t.innerText.includes('ICD-10'))`);
            const one = await state();
            assert.equal(one.fields, 2, 'pola tylko klikniętej sekcji');
            assert.match(one.toggle, /Zwiń do listy sekcji/);
            await b.click('[data-action="toggle-sections"]');
            await b.click('[data-action="toggle-sections"]');
            assert.equal((await state()).fields, 86);
        });

        await step('„Szukaj tematu": nazwy pól, sekcji i opcji (bez polskich znaków); wybór otwiera pole i przywraca pełną listę', async () => {
            const INPUT = `document.querySelector('.psy-form-toolbar__nav-search')`;
            const results = () => b.evaluate(`return {
                query: ${INPUT}.value,
                fields: [...document.querySelectorAll('.psy-form-toolbar__nav .psy-form-toolbar__field')].map((li) =>
                    li.querySelector('.psy-form-toolbar__field-label').textContent
                    + (li.querySelector('.psy-form-toolbar__field-match') ? ' ' + li.querySelector('.psy-form-toolbar__field-match').textContent : '')),
                toggleShown: document.querySelector('[data-action="toggle-sections"]').style.display !== 'none',
                empty: (document.querySelector('.psy-form-toolbar__nav-empty') || {}).textContent || '' };`);
            const search = async (text) => {
                await b.click('.psy-form-toolbar__nav-search');
                await b.evaluate(`${INPUT}.value = ''; ${INPUT}.dispatchEvent(new Event('input', { bubbles: true }));`);
                await b.type(text);
                return results();
            };
            const before = await b.evaluate(`return JSON.stringify(PsyStore.getVisitById(${JSON.stringify(visitId)}));`);

            let r = await search('sen');
            assert.ok(r.fields.includes('Sen'), 'pole po nazwie: ' + r.fields.join(' | '));
            assert.ok(r.fields.length < 10);
            assert.equal(r.toggleShown, false, 'podczas wyszukiwania lista to same trafienia');

            r = await search('lek');
            assert.ok(r.fields.includes('Leki psychotropowe') && r.fields.includes('Lękowe'), '„lek" znajduje też „Lękowe": ' + r.fields.join(' | '));

            assert.deepEqual((await search('WAGA')).fields, ['Parametry somatyczne ↳ Waga'], 'pole wewnątrz okna z kilkoma polami');
            assert.deepEqual((await search('phq')).fields, ['Wyniki testów ↳ PHQ-9']);
            r = await search('panik');
            assert.ok(r.fields.some((f) => /^Lękowe ↳ .*panik/.test(f)), 'pole po opcji do wyboru: ' + r.fields.join(' | '));
            r = await search('farmakoterapia');
            assert.ok(r.fields.includes('Leki psychotropowe'), 'pola po nazwie sekcji: ' + r.fields.join(' | '));

            r = await search('qqxyz');
            assert.deepEqual(r.fields, []);
            assert.match(r.empty, /Brak tematów pasujących do „qqxyz"/);
            await b.screenshot(path.join(SHOTS, 'demo-08-szukaj-brak.png'));

            // Esc czyści wyszukiwanie
            await search('sen');
            await b.key('Escape');
            r = await results();
            assert.deepEqual([r.query, r.fields.length, r.toggleShown], ['', 86, true]);

            // Enter otwiera pierwsze trafienie; lista wraca do pełnej, a pole jest w niej widoczne
            await search('waga');
            await b.screenshot(path.join(SHOTS, 'demo-09-szukaj-waga.png'));
            await b.key('Enter');
            assert.equal(await b.evaluate(`return __t.mode('parametry::__grid');`), 'edit');
            r = await results();
            assert.deepEqual([r.query, r.fields.length], ['', 86]);
            const inView = await b.evaluate(`
                const nav = document.querySelector('.psy-form-toolbar__nav').getBoundingClientRect();
                const item = __t.nav('parametry::__grid');
                const box = item.getBoundingClientRect();
                return item.classList.contains('psy-form-toolbar__field--active') && box.top >= nav.top && box.bottom <= nav.bottom;`);
            assert.equal(inView, true, 'wybrane pole jest podświetlone i widoczne na liście');
            await b.key('Escape');

            // przy zwiniętej liście sekcji wybór trafienia rozwija sekcję wybranego pola
            await b.click('[data-action="toggle-sections"]');
            r = await search('ewaluacja');
            assert.deepEqual(r.fields, ['Ewaluacja']);
            await b.click(`document.querySelector('.psy-form-toolbar__nav .psy-form-toolbar__field')`);
            assert.equal(await b.evaluate(`return __t.mode('oddzialywania::ewaluacja');`), 'edit');
            r = await results();
            assert.ok(r.fields.includes('Ewaluacja') && r.fields.length < 10, 'rozwinięta tylko sekcja wybranego pola: ' + r.fields.join(' | '));
            await b.click('.psy-new-view__title');
            await b.click('[data-action="toggle-sections"]');
            if ((await results()).fields.length !== 86) await b.click('[data-action="toggle-sections"]');
            assert.equal((await results()).fields.length, 86);

            await sleep(600);
            assert.equal(await b.evaluate(`return JSON.stringify(PsyStore.getVisitById(${JSON.stringify(visitId)}));`), before,
                'samo szukanie i otwieranie pól niczego w wizycie nie zmienia');
        });

        await step('lista podpowiedzi (leki, ICD-10) jest widoczna w całości, także nisko w długiej notatce', async () => {
            // Część listy faktycznie widoczna na ekranie (sprawdzane punkt po punkcie).
            const visiblePercent = () => b.evaluate(`
                const p = document.querySelector('.psy-autocomplete__popover');
                const r = p.getBoundingClientRect();
                let seen = 0, all = 0;
                for (let y = r.top + 3; y < r.bottom - 1; y += 6) {
                    for (let x = r.left + 10; x < r.right - 10; x += 40) {
                        all++;
                        const hit = document.elementFromPoint(x, y);
                        if (hit && p.contains(hit)) seen++;
                    }
                }
                return all ? Math.round(100 * seen / all) : 0;`);
            for (const [uid, input, text] of [
                ['farmakoterapia::leki', '.psy-vf__inline-meds__add input', 'se'],
                ['rozpoznanie::diagnozy', '.psy-vf__inline-diagnoses__add input', 'F4'],
                ['ocenaKliniczna::hipoteza', '.psy-vf__tag-icd10__input', 'F3']]) {
                await b.click(`__t.nav('${uid}')`);
                // pole „dodaj…" (przy lekach kursor staje najpierw w dawce pierwszego leku)
                await b.click(`__t.ctl('${uid}', '${input}')`);
                await b.type(text);
                await waitFor(b, `__t.ctl('${uid}', '.psy-autocomplete__popover .psy-autocomplete__item')`, 4000, 'podpowiedzi w ' + uid);
                await sleep(150);
                assert.equal(await visiblePercent(), 100, uid + ': cała lista podpowiedzi na ekranie');
                if (uid === 'rozpoznanie::diagnozy') await b.screenshot(path.join(SHOTS, 'demo-10-podpowiedzi-icd10.png'));
                await b.key('Escape');      // zamyka listę podpowiedzi
                await b.key('Escape');      // zamyka akapit
            }
            await b.click('.psy-new-view__title');
        });

        await step('klik w akapit → edycja z zachowanymi wartościami; Esc → odczyt', async () => {
            await b.click(`__t.ent('somatyczne::sen')`);
            const r = await b.evaluate(`return {
                mode: __t.mode('somatyczne::sen'),
                checked: (__t.ctl('somatyczne::sen', 'input[type="radio"]:checked') || {}).value,
                notes: __t.ctl('somatyczne::sen', 'textarea').value,
                editing: document.querySelectorAll('.psy-form-toolbar__entry--edit').length };`);
            assert.deepEqual(r, { mode: 'edit', checked: 'wybudzenia nocne', notes: 'budzi się o 3:00', editing: 1 });
            await b.screenshot(path.join(SHOTS, 'demo-03-wizyta-edycja.png'));
            await b.key('Escape');
            assert.equal(await b.evaluate(`return __t.mode('somatyczne::sen');`), 'read');
        });

        await step('klik w inny akapit przenosi edycję (zawsze jeden naraz); Tab poza pole zamyka', async () => {
            await b.click(`__t.ent('oddzialywania::ustalenia')`);
            await b.click(`__t.ent('problemZdrowotny::__comment')`);
            const r = await b.evaluate(`return [__t.mode('oddzialywania::ustalenia'), __t.mode('problemZdrowotny::__comment')];`);
            assert.deepEqual(r, ['read', 'edit']);
            await b.type(' — dopisek');
            await b.key('Tab');
            await waitFor(b, `__t.mode('problemZdrowotny::__comment') === 'read'`, 2000, 'zamknięcie po Tab');
            assert.match(await b.evaluate(`return __t.ent('problemZdrowotny::__comment').innerText;`), /Trudności z koncentracją — dopisek/);
        });

        await step('puste pole otwarte z paska znika po kliknięciu obok; radio da się odznaczyć', async () => {
            await b.click(`__t.nav('kontekst::stanCywilny')`);
            assert.equal(await b.evaluate(`return __t.mode('kontekst::stanCywilny');`), 'edit');
            await b.click('.psy-new-view__title');
            assert.equal(await b.evaluate(`return __t.mode('kontekst::stanCywilny');`), 'absent');

            await b.click(`__t.nav('somatyczne::apetyt')`);
            await b.click(`__t.ctl('somatyczne::apetyt', 'input[type="radio"][value="obniżony"]')`);
            assert.equal(await b.evaluate(`return __t.nav('somatyczne::apetyt').classList.contains('psy-form-toolbar__field--filled');`), true);
            await b.click(`__t.ctl('somatyczne::apetyt', 'input[type="radio"][value="obniżony"]')`);
            await b.click('.psy-new-view__title');
            assert.equal(await b.evaluate(`return __t.mode('somatyczne::apetyt');`), 'absent');
            await sleep(600);
            const raw = await b.evaluate(`return PsyStore.getVisitById(${JSON.stringify(visitId)}).data._raw;`);
            assert.equal(raw['somatyczne.apetyt'], '');
            assert.equal(raw['problemZdrowotny.__comment'], 'Trudności z koncentracją — dopisek');
        });

        await step('osie czasu (Leki, Diagnozy, Parametry, Plan leczenia) są wyciągiem z wizyty', async () => {
            const expectIn = async (hash, parts) => {
                await go(b, hash);
                await waitFor(b, `location.hash === '${hash}' && !document.querySelector('.psy-form-toolbar')`);
                const text = await b.evaluate(`return __t.main();`);
                for (const p of parts) assert.ok(text.includes(p), hash + ': brak „' + p + '"');
                assert.ok(!/Dodaj|Edytuj/.test(text), hash + ': widok ma być tylko do odczytu');
            };
            await expectIn('#/meds', ['Setal', 'Sertralina', '50 mg/d', '200 mg/d', '1sze spotkanie']);
            await expectIn('#/diagnoses', ['F41.1', '1 rozpoznanie']);
            await expectIn('#/parameters', ['170', '65', '22.5']);
            await expectIn('#/treatment-plan', ['CBT raz w tygodniu']);
            await b.screenshot(path.join(SHOTS, 'demo-04-plan-leczenia.png'));
        });

        /** Wyciąg: nagłówki tabeli i wiersze (z identyfikatorem wizyty, z której pochodzi rekord). */
        const extract = async (hash) => {
            await go(b, '#/settings');
            await go(b, hash);
            await waitFor(b, `location.hash === '${hash}' && document.querySelector('.psy-extract, .psy-new-empty')`, 6000, 'wyciąg ' + hash);
            return b.evaluate(`return {
                head: [...document.querySelectorAll('.psy-extract thead th')].map((x) => x.textContent),
                rows: [...document.querySelectorAll('.psy-extract tbody tr')].map((tr) => ({ visit: tr.dataset.visitId || '', text: tr.innerText })) };`);
        };
        const today = await b.evaluate(`const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');`);

        await step('zalecenia wpisuje się w wizycie; test uruchamia się z wizyty i wynik do niej wraca', async () => {
            await go(b, '#/visit/form/' + visitId);
            await waitFor(b, `__t.nav('zalecenia::tresc')`);
            await b.click(`__t.nav('zalecenia::tresc')`);
            await b.type('Spacer 30 minut dziennie');

            await b.click(`__t.nav('testy::wyniki')`);
            await waitFor(b, `__t.ctl('testy::wyniki', '[data-test-code="PHQ-9"]')`);
            await b.screenshot(path.join(SHOTS, 'demo-05-testy-w-wizycie.png'));
            await b.click(`__t.ctl('testy::wyniki', '[data-test-code="PHQ-9"]')`);
            await waitFor(b, `location.hash === '#/tests/run/PHQ-9?visit=${visitId}' && document.querySelector('.psy-test-runner input[type="radio"]')`, 6000, 'ekran testu');
            // 8 × „2" + ostatnie pytanie „1" = 17 pkt, z czerwoną flagą (pytanie 9)
            await b.evaluate(`document.querySelectorAll('.psy-test-runner__q').forEach((q, i, all) => {
                q.querySelector('input[value="' + (i === all.length - 1 ? '1' : '2') + '"]').click(); });`);
            await b.click(`[...document.querySelectorAll('.psy-test-runner .btn')].find((x) => x.innerText.includes('Pokaż wynik'))`);
            await waitFor(b, `document.querySelector('.psy-test-runner__result')`);
            await b.click(`[...document.querySelectorAll('.psy-test-runner__result .btn')].find((x) => x.innerText.includes('Zapisz wynik'))`);
            await waitFor(b, `location.hash.startsWith('#/visit/form/${visitId}') && __t.ent('testy::wyniki')`, 6000, 'powrót do wizyty');

            const entry = await b.evaluate(`return __t.ent('testy::wyniki').innerText;`);
            assert.match(entry, /PHQ-9 — wynik 17/);
            const v = await b.evaluate(`return PsyStore.getVisitById(${JSON.stringify(visitId)});`);
            assert.equal(v.data._raw['zalecenia.tresc'], 'Spacer 30 minut dziennie');
            assert.equal(v.data.tests.length, 1);
            assert.deepEqual([v.data.tests[0].code, v.data.tests[0].score, v.data.tests[0].redFlag], ['PHQ-9', 17, true]);
            assert.equal(v.data.meds.length, 1, 'reszta wizyty nietknięta');
            assert.equal(await b.evaluate(`return PsyStore.getStandaloneTests('P004').length;`), 0, 'wynik nie jest osobnym rekordem');
        });

        await step('siedem zakładek to wyciągi: data i rodzaj wizyty w każdym wierszu, klik otwiera tę wizytę', async () => {
            const expected = {
                '#/meds': ['Setal'], '#/tests': ['PHQ-9', '17'], '#/recommendations': ['Spacer 30 minut dziennie'],
                '#/treatment-plan': ['CBT raz w tygodniu'], '#/diagnoses': ['F41.1'], '#/parameters': ['22.5']
            };
            for (const [hash, parts] of Object.entries(expected)) {
                const r = await extract(hash);
                assert.deepEqual(r.head.slice(0, 2), ['Data wizyty', 'Rodzaj wizyty'], hash);
                assert.equal(r.rows.length, 1, hash + ': jeden rekord');
                assert.equal(r.rows[0].visit, visitId, hash + ': rekord wskazuje wizytę');
                for (const p of [today, '1sze spotkanie', ...parts]) assert.ok(r.rows[0].text.includes(p), hash + ': brak „' + p + '"');
            }
            await b.screenshot(path.join(SHOTS, 'demo-06-wyciag-zalecenia.png'));
            await b.click(`.psy-extract tbody tr[data-visit-id="${visitId}"]`);
            await waitFor(b, `location.hash === '#/visit/form/${visitId}' && __t.ent('testy::wyniki')`, 6000, 'wizyta po kliknięciu rekordu');
            // dokumenty w trybie demo: nie ma gdzie trzymać plików
            const docs = await extract('#/documents');
            assert.equal(docs.rows.length, 0);
        });

        await step('usunięcie wizyty usuwa wszystko, co w niej wpisano — także z wyciągów', async () => {
            await go(b, '#/visit/form/' + visitId);
            await waitFor(b, `document.querySelector('.psy-visit-form-view .btn--danger')`);
            await b.click('.psy-visit-form-view .btn--danger');
            await waitFor(b, `document.querySelector('.psy-modal__footer .btn--danger')`);
            await b.click('.psy-modal__footer .btn--danger');
            await waitFor(b, `location.hash === '#/history'`);
            const r = await b.evaluate(`return { visits: PsyStore.getVisits('P004').length, meds: PsyStore.getMedsTimeline('P004').length,
                dx: PsyStore.getDiagnosesTimeline('P004').length, tests: PsyStore.getTestsTimeline('P004').length,
                rec: PsyStore.getRecommendationsTimeline('P004').length };`);
            assert.deepEqual(r, { visits: 0, meds: 0, dx: 0, tests: 0, rec: 0 });
        });

        await step('test nie uruchomi się poza wizytą; w nowej wizycie zakłada ją w chwili uruchomienia', async () => {
            await go(b, '#/tests/run/PHQ-9');
            await waitFor(b, `__t.main().includes('Test uruchamia się z wizyty')`, 4000, 'informacja zamiast testu');
            await go(b, '#/visit/form/new/phone_contact');
            await waitFor(b, `location.hash.endsWith('phone_contact') && __t.nav('testy::wyniki')`);
            assert.equal(await b.evaluate(`return PsyStore.getVisits('P004').length;`), 0, 'pusta nowa wizyta jeszcze nie istnieje');
            await b.click(`__t.nav('testy::wyniki')`);
            await b.click(`__t.ctl('testy::wyniki', '[data-test-code="GAD-7"]')`);
            await waitFor(b, `location.hash.startsWith('#/tests/run/GAD-7?visit=') && document.querySelector('.psy-test-runner input[type="radio"]')`, 6000, 'ekran testu');
            const r = await b.evaluate(`const v = PsyStore.getVisits('P004'); return { n: v.length, type: v[0] && v[0].type, id: v[0] && v[0].id, hash: location.hash };`);
            assert.equal(r.n, 1);
            assert.equal(r.type, 'phone_contact');
            assert.equal(r.hash, '#/tests/run/GAD-7?visit=' + r.id);
            await b.click(`[...document.querySelectorAll('.psy-test-runner .btn')].find((x) => x.innerText.includes('Wróć do wizyty'))`);
            await waitFor(b, `location.hash.startsWith('#/visit/form/${r.id}')`, 4000, 'powrót bez zapisu wyniku');
            assert.equal(await b.evaluate(`return PsyStore.getTestsTimeline('P004').length;`), 0);
        });

        await step('dawne rekordy „bez wizyty" (testy, zalecenia) są w wyciągach i dają się usunąć', async () => {
            await b.evaluate(`
                PsyStore.selectPatient('P005');
                PsyStore.state.tests.push({ id: 'TL1', patientId: 'P005', code: 'GAD-7', name: 'GAD-7', date: '2025-01-05', score: 7, interpretation: 'dawny wynik' });
                PsyStore.state.recommendations.push({ id: 'RL1', patientId: 'P005', title: 'Dawne zalecenie', content: 'ruch', createdAt: '2025-01-06' });`);
            for (const [hash, part, left] of [['#/tests', 'dawny wynik', `PsyStore.getStandaloneTests('P005').length`],
                ['#/recommendations', 'Dawne zalecenie', `PsyStore.getStandaloneRecommendations('P005').length`]]) {
                const r = await extract(hash);
                assert.equal(r.rows.length, 1, hash);
                assert.equal(r.rows[0].visit, '', hash + ': rekord nie prowadzi do wizyty');
                assert.ok(r.rows[0].text.includes('bez wizyty') && r.rows[0].text.includes(part), hash + ': ' + r.rows[0].text);
                await b.click('.psy-extract__row--loose .btn--danger');
                await waitFor(b, `document.querySelector('.psy-modal__footer .btn--danger')`);
                await b.click('.psy-modal__footer .btn--danger');
                await waitFor(b, `${left} === 0 && document.querySelector('.psy-new-empty')`, 4000, hash + ': rekord usunięty');
            }
        });

        await step('menu boczne: same wyciągi z wizyt; dane identyfikacyjne otwiera nazwisko na górnym pasku', async () => {
            const labels = await b.evaluate(`return [...document.querySelectorAll('.psy-new-sidebar__label')].map((x) => x.textContent.trim());`);
            assert.deepEqual(labels, ['+ Nowa wizyta', 'Historia wizyt', 'Kalendarz', 'Leki', 'Testy', 'Zalecenia',
                'Plan leczenia', 'Diagnozy', 'Parametry', 'Dokumenty']);
            await go(b, '#/history');
            await b.click('.psy-new-patient-tag__name');
            await waitFor(b, `location.hash === '#/patient-data' && __t.main().includes('Dane kontaktowe')`, 4000, 'dane identyfikacyjne');
            assert.match(await b.evaluate(`return __t.main();`), /Lewandowska/);
        });

        await step('dane przykładowe: pozostałe widoki działają', async () => {
            await b.evaluate(`PsyStore.selectPatient('P001');`);
            for (const [hash, part] of [['#/history', 'Epizod depresyjny umiarkowany'], ['#/tests', 'PHQ-9'],
                ['#/recommendations', 'Higiena snu'], ['#/patient-data', 'Dane kontaktowe'], ['#/documents', 'wymagają podłączonego magazynu'],
                ['#/settings', 'Tryb demo'], ['#/patients', 'Lewandowska']]) {
                await go(b, hash);
                await waitFor(b, `__t.main().includes(${JSON.stringify(part)})`, 4000, hash + ' → „' + part + '"');
            }
        });

        await step('brak błędów w konsoli', async () => noPageProblems(b));
    } finally {
        await b.close();
    }
}

/* ==========================================================================
   SCENARIUSZ: kalendarz (tryb demo — terminy w przeglądarce)
   ========================================================================== */
async function scenarioCalendar(origin) {
    console.log('\nKalendarz');
    const b = (activeBrowser = await launchBrowser());
    const day = nextWeekWednesday();
    const visitEvent = `[...document.querySelectorAll('.psy-cal-ev--unpaid, .psy-cal-ev--paid')].find((x) => x.innerText.includes('Anna Nowak'))`;
    try {
        await b.onNewDocument(`try { localStorage.setItem('psy-new:devMode', '1'); } catch (e) {} ${PAGE_HELPERS}`);
        await b.navigate(origin + '/index.html');
        await waitFor(b, `window.PsyStore && document.querySelector('.psy-cal__host .fc-timegrid')`, 10000, 'kalendarz jako strona główna');

        await step('strona główna to kalendarz; lista pacjentów jest w zakładce obok', async () => {
            const r = await b.evaluate(`return { hash: location.hash, tabs: [...document.querySelectorAll('.psy-home-tabs__tab')].map((t) => t.innerText.trim()) };`);
            assert.equal(r.hash, '#/calendar');
            assert.equal(r.tabs.length, 2);
            await b.click(`document.querySelectorAll('.psy-home-tabs__tab')[1]`);
            await waitFor(b, `location.hash === '#/patients' && document.querySelector('.psy-new-table') && document.querySelector('.psy-home-tabs__tab--active').innerText.includes('Pacjenci')`);
            await b.click('#btn-home');
            await waitFor(b, `location.hash === '#/calendar' && document.querySelector('.psy-cal__host .fc-timegrid')`);
        });

        await openCalendar(b, '#/calendar', day);

        await step('umówienie wizyty: pacjent z wyszukiwarki, rodzaj, data, godzina', async () => {
            await b.click('[data-action="book"]');
            await waitFor(b, `document.querySelector('input[name="cal-patient-search"]')`);
            await b.click('input[name="cal-patient-search"]');
            await b.type('now');
            await waitFor(b, `document.querySelectorAll('.psy-cal__patient-option').length === 1`);
            await b.click('.psy-cal__patient-option[data-patient-id="P003"]');
            // pacjentka ma już wizytę w historii → domyślnie „Kolejne spotkanie"
            assert.equal(await b.evaluate(`return document.querySelector('select[name="cal-visitType"]').value;`), 'next_meeting');
            await b.evaluate(`__t.setInput('input[name="cal-date"]', '${day}'); __t.setInput('input[name="cal-time"]', '10:00');`);
            await b.click('[data-action="save"]');
            await waitFor(b, visitEvent, 6000, 'termin na kalendarzu');
            const r = await b.evaluate(`const e = ${visitEvent}; return { text: e.innerText, tip: e.title, unpaid: e.classList.contains('psy-cal-ev--unpaid') };`);
            assert.match(r.text, /10:00/);
            assert.match(r.text, /nie zapł\./);
            assert.equal(r.tip, 'Anna Nowak · Kolejne spotkanie · tel. +48 600 200 300 · nie zapłacono');
            assert.equal(r.unpaid, true);
            await b.screenshot(path.join(SHOTS, 'kalendarz-01-tydzien.png'));
        });

        await step('klik w godzinę: czas i 50 minut ustawione; pacjent bez wizyt → „1sze spotkanie"', async () => {
            // górna połowa wiersza 12:00 → 12:00 (dolna dałaby 12:15)
            const slot = await b.evaluate(`
                const r = document.querySelector('.psy-cal__host td.fc-timegrid-slot-lane[data-time="12:00:00"]').getBoundingClientRect();
                return { x: r.left + 60, y: r.top + 3 };`);
            await b.clickAt(slot);
            await waitFor(b, `document.querySelector('input[name="cal-time"]')`);
            const r = await b.evaluate(`return { time: document.querySelector('input[name="cal-time"]').value, minutes: document.querySelector('input[name="cal-minutes"]').value };`);
            assert.deepEqual(r, { time: '12:00', minutes: '50' });
            await b.click('input[name="cal-patient-search"]');
            await b.type('lewand');
            await b.click('.psy-cal__patient-option[data-patient-id="P005"]');
            assert.equal(await b.evaluate(`return document.querySelector('select[name="cal-visitType"]').value;`), 'first_meeting');
            await b.screenshot(path.join(SHOTS, 'kalendarz-02-panel.png'));
            await b.click('.psy-cal__panel-actions .btn--secondary');
            assert.equal(await b.evaluate(`return document.querySelector('.psy-cal__panel').style.display;`), 'none');
            assert.equal((await b.evaluate(`return (await __t.appointments()).length;`)), 1, 'anulowanie niczego nie zapisuje');
        });

        await step('przeciągnięcie terminu na 14:00 zapisuje nową godzinę (długość bez zmian)', async () => {
            const pts = await b.evaluate(`
                const e = ${visitEvent}.getBoundingClientRect();
                const row = document.querySelector('.psy-cal__host td.fc-timegrid-slot-lane[data-time="14:00:00"]').getBoundingClientRect();
                return { from: { x: e.left + e.width / 2, y: e.top + 6 }, to: { x: e.left + e.width / 2, y: row.top + 3 } };`);
            await b.drag(pts.from, pts.to);
            await waitFor(b, `(await __t.appointments())[0].start.includes('T') && new Date((await __t.appointments())[0].start).getHours() === 14`, 6000, 'termin o 14:00');
            const a = (await b.evaluate(`return await __t.appointments();`))[0];
            assert.equal((new Date(a.end) - new Date(a.start)) / 60000, 50);
        });

        await step('święto jest opisane; wpis całodniowy (urlop) da się dodać', async () => {
            await b.evaluate(`__t.cal().changeView('dayGridMonth', '2026-11-11');`);
            await waitFor(b, `[...document.querySelectorAll('.psy-cal-holiday')].some((x) => x.innerText.includes('Święto Niepodległości'))`, 4000, 'święto 11 listopada');
            await b.evaluate(`__t.cal().changeView('timeGridWeek', '${day}');`);
            await b.click('[data-action="book"]');
            await b.click('.psy-cal__kind[data-kind="other"]');
            await b.click('input[name="cal-title"]');
            await b.type('Urlop');
            await b.click('input[name="cal-allDay"]');
            await b.evaluate(`__t.setInput('input[name="cal-date"]', '${day}'); __t.setInput('input[name="cal-lastDay"]', '${day}');`);
            await b.click('[data-action="save"]');
            await waitFor(b, `[...document.querySelectorAll('.psy-cal-ev--other')].some((x) => x.innerText.includes('Urlop'))`, 6000, 'urlop na kalendarzu');
        });

        let visitId = '';
        await step('z terminu do notatki: data, godzina i rodzaj przeniesione; termin dostaje znaczek 📝', async () => {
            await b.click(visitEvent);
            await waitFor(b, `document.querySelector('[data-action="note"]')`);
            await b.click('[data-action="note"]');
            await waitFor(b, `document.querySelector('.psy-visit-form-view') && __t.ent('visitData::__grid')`);
            const r = await b.evaluate(`return { title: document.querySelector('.psy-new-view__title').innerText, grid: __t.ent('visitData::__grid').innerText, patient: PsyStore.state.currentPatient.id };`);
            assert.match(r.title, /Kolejne spotkanie/);
            assert.ok(r.grid.includes(day), 'data wizyty z terminu');
            assert.equal(r.patient, 'P003');
            await b.click(`__t.nav('oddzialywania::ustalenia')`);
            await b.type('Plan po wizycie z kalendarza');
            await openCalendar(b, '#/calendar', day);
            await waitFor(b, `${visitEvent} && ${visitEvent}.innerText.includes('📝')`, 6000, 'znaczek notatki na terminie');
            const v = await b.evaluate(`return PsyStore.getVisits('P003')[0];`);
            const a = (await b.evaluate(`return await __t.appointments();`)).find((x) => x.kind === 'visit');
            visitId = v.id;
            assert.deepEqual([v.date, v.time, v.type, v.calendarEventId], [day, '14:00', 'next_meeting', a.id]);
            assert.equal(a.visitId, v.id);
        });

        await step('płatność: zmiana w historii zmienia termin, zmiana przy terminie zmienia notatkę', async () => {
            await go(b, '#/history');
            await waitFor(b, `document.querySelector('.psy-history-paragraph .psy-new-badge--clickable')`);
            await b.click('.psy-history-paragraph .psy-new-badge--clickable');
            await waitFor(b, `(await __t.appointments()).find((x) => x.kind === 'visit').paid === true`, 6000, 'termin oznaczony jako zapłacony');
            await openCalendar(b, '#/calendar', day);
            await waitFor(b, `document.querySelector('.psy-cal-ev--paid')`);
            await b.click('.psy-cal-ev--paid');
            await waitFor(b, `document.querySelector('input[name="cal-paid"]')`);
            assert.equal(await b.evaluate(`return document.querySelector('input[name="cal-paid"]').checked;`), true);
            await b.click('input[name="cal-paid"]');
            await b.click('[data-action="save"]');
            await waitFor(b, `PsyStore.getVisitById('${visitId}').paid === false && document.querySelector('.psy-cal-ev--unpaid')`, 6000, 'notatka znów niezapłacona');
        });

        await step('kalendarz pacjenta: na liście tylko jego terminy; u innego pacjenta ten czas to „zajęte"', async () => {
            await openCalendar(b, '#/patient-calendar', day, 'listHalf');
            await waitFor(b, `document.querySelector('.psy-cal__host .fc-list')`);
            const mine = await b.evaluate(`return { list: document.querySelector('.psy-cal__host .fc-list').innerText, subtitle: document.querySelector('.psy-new-view__subtitle').innerText };`);
            assert.match(mine.list, /Anna Nowak/);
            assert.ok(!/Urlop|Wigilia|Wszystkich/.test(mine.list), 'na liście pacjenta nie ma urlopów ani świąt');
            await waitFor(b, `document.querySelector('.psy-new-view__subtitle').innerText.includes('najbliższy termin: ${day} 14:00')`, 5000, 'najbliższy termin w podtytule');
            await b.screenshot(path.join(SHOTS, 'kalendarz-03-pacjent.png'));

            await b.evaluate(`PsyStore.selectPatient('P001');`);
            await openCalendar(b, '#/patient-calendar', day);
            await waitFor(b, `document.querySelector('.psy-cal__host .psy-cal-busy')`, 6000, 'blok „zajęte"');
            const other = await b.evaluate(`return document.querySelector('.psy-cal__host').innerText;`);
            assert.ok(!other.includes('Anna Nowak'), 'u innego pacjenta nie widać cudzego nazwiska');
            assert.match(other, /zajęte/);
        });

        await step('usunięcie terminu nie usuwa notatki', async () => {
            await openCalendar(b, '#/calendar', day);
            await waitFor(b, visitEvent);
            await b.click(visitEvent);
            await waitFor(b, `document.querySelector('[data-action="delete"]')`);
            await b.click('[data-action="delete"]');
            await waitFor(b, `document.querySelector('.psy-modal__footer .btn--danger')`);
            await b.click('.psy-modal__footer .btn--danger');
            await waitFor(b, `!(await __t.appointments()).some((x) => x.kind === 'visit')`, 6000, 'termin usunięty');
            assert.equal(await b.evaluate(`return !!PsyStore.getVisitById('${visitId}');`), true);
        });

        await step('brak błędów w konsoli', async () => noPageProblems(b));
    } finally {
        await b.close();
    }
}

/* ==========================================================================
   SCENARIUSZ: Dysk Google (na atrapie API)
   ========================================================================== */
async function scenarioGDrive(origin, mock) {
    console.log('\nDysk Google (atrapa API)');
    const b = (activeBrowser = await launchBrowser());
    const sheet = () => mock.spreadsheets()[0];
    const idle = `window.PsyStore && !PsyStore.hasUnsavedChanges() && PsyStore.state.saveStatus !== 'saving'`;
    try {
        await b.onNewDocument(`${GOOGLE_ACCOUNT_MODEL} ${PAGE_HELPERS}`);
        await b.navigate(origin + '/index.html');
        await waitFor(b, `document.querySelector('.psy-folder-gate__btn--primary')`, 8000, 'ekran startowy');
        const asked = () => b.evaluate(`return window.__PSY_TEST_GDRIVE__.asked;`);
        const lastAsked = async () => (await asked()).slice(-1)[0];

        await step('ekran startowy → połączenie; na Dysku powstaje folder „pacjenci"', async () => {
            assert.match(await b.evaluate(`return document.querySelector('.psy-folder-gate__btn--primary').innerText;`), /Połącz z Dyskiem Google/);
            await b.screenshot(path.join(SHOTS, 'gdrive-01-start.png'));
            await b.click('.psy-folder-gate__btn--primary');
            // Po Dysku ten sam ekran proponuje od razu Kalendarz Google. Tu go odkładamy
            // (ścieżkę „włącz na ekranie startowym" sprawdza krok na końcu scenariusza).
            await waitFor(b, `PsyStore.state.storageConnected && document.querySelector('[data-action="gate-enable-calendar"]')`, 8000, 'krok 2: kalendarz');
            assert.equal(await b.evaluate(`return !!document.querySelector('.psy-cal-view, .psy-new-table');`), false,
                'aplikacja nie rysuje się pod ekranem startowym');
            await b.click('[data-action="gate-skip-calendar"]');
            await waitFor(b, `!document.querySelector('.psy-folder-gate')`);
            const roots = mock.find((f) => f.mimeType === FOLDER_MIME && f.appProperties.psyKind === 'root');
            assert.equal(roots.length, 1);
            assert.equal(roots[0].name, 'pacjenci');
            await go(b, '#/patients');
            await waitFor(b, `location.hash === '#/patients' && document.querySelector('.psy-new-empty')`);
            const r = await b.evaluate(`return { badge: document.getElementById('btn-storage').innerText, main: __t.main(), n: PsyStore.state.patients.length };`);
            assert.match(r.badge, /Dysk Google/);
            assert.equal(r.n, 0, 'po połączeniu nie ma danych demo');
            assert.match(r.main, /Dodaj pierwszego pacjenta/);
            assert.deepEqual(await asked(), [{ requested: [SCOPE.drive], consent: false }],
                'przy łączeniu Google pyta o jedną zgodę: Dysk');
        });

        await step('nowy pacjent → jeden folder i jeden arkusz z czytelnymi zakładkami', async () => {
            await go(b, '#/patients/new');
            await waitFor(b, `document.querySelector('input[name="imie"]')`);
            await b.click('input[name="imie"]');
            await b.type('Anna');
            await b.click('input[name="nazwisko"]');
            await b.type('Kowalska');
            await b.click('input[name="ulica"]');
            await b.type('Wiejska 4');
            await waitFor(b, `PsyStore.state.patients.length === 1 && ${idle}`, 15000, 'zapis pacjenta');
            assert.equal(mock.spreadsheets().length, 1, 'dokładnie jeden arkusz (bez duplikatów przy autozapisie)');
            const s = sheet();
            assert.equal(s.name, 'P001_Kowalska_Anna');
            const folder = mock.files.get(s.parents[0]);
            assert.equal(folder.name, 'P001_Kowalska_Anna');
            assert.equal(mock.files.get(folder.parents[0]).appProperties.psyKind, 'root');
            assert.deepEqual(mock.tabTitles(s.id),
                ['Pacjent', 'Wizyty', 'Leki', 'Diagnozy', 'Parametry', 'Plan leczenia', 'Zalecenia', 'Testy', 'Dokumenty', '_dane']);
            assert.equal(s.appProperties.nazwisko, 'Kowalska');
            const pacjent = mock.tab(s.id, 'Pacjent').map((r) => r.join(' | '));
            assert.ok(pacjent.includes('Kontakt | Ulica | Wiejska 4'), 'adres w zakładce Pacjent: ' + pacjent.join(' ; '));
        });

        let before = null;
        await step('wizyta z lekiem → arkusz zawiera to samo co aplikacja', async () => {
            await b.evaluate(`PsyStore.selectPatient('P001');`);
            await go(b, '#/visit/form/new/next_meeting');
            await waitFor(b, `__t.nav('oddzialywania::ustalenia')`);
            await b.click(`__t.nav('oddzialywania::ustalenia')`);
            await b.type('Kontrola za 2 tygodnie =SUMA(A1) 🙂');
            await b.click(`__t.nav('farmakoterapia::leki')`);
            await b.type('setal');
            await waitFor(b, `__t.ctl('farmakoterapia::leki', '.psy-autocomplete__item')`);
            await b.click(`__t.ctl('farmakoterapia::leki', '.psy-autocomplete__item')`);
            await waitFor(b, `document.activeElement && document.activeElement.classList.contains('psy-vf__inline-meds__dose-input')`, 2000);
            await b.type('100');
            await go(b, '#/history');
            await waitFor(b, `PsyStore.getVisits('P001').length === 1 && ${idle}`, 15000, 'zapis wizyty');

            before = JSON.parse(await b.evaluate(`
                const m = await import('/js/views/_patient-doc.js');
                return JSON.stringify(m.buildPatientDoc(PsyStore.state, 'P001'));`));
            const stored = mock.doc(sheet().id);
            delete before.savedAt; delete stored.savedAt;
            assert.deepEqual(stored, before, 'zakładka _dane = stan aplikacji');

            const wizyty = mock.tab(sheet().id, 'Wizyty');
            assert.deepEqual(wizyty[0].slice(0, 6), ['Data', 'Godzina', 'Typ wizyty', 'Sekcja', 'Pole', 'Wartość']);
            assert.ok(wizyty.some((r) => r[2] === 'Kolejne spotkanie' && r[4] === 'Ustalenia i plan leczenia' && r[5] === 'Kontrola za 2 tygodnie =SUMA(A1) 🙂'));
            const leki = mock.tab(sheet().id, 'Leki');
            assert.equal(leki.length, 2);
            assert.match(leki[1].join(' | '), /Setal.* \| Sertralina \| .* \| 100 mg\/d \| 200 mg\/d \| Kolejne spotkanie/);
            assert.equal(sheet().appProperties.n, '1');
        });

        const day = nextWeekWednesday();
        const at = (h) => new Date(day + 'T' + String(h).padStart(2, '0') + ':00:00');
        const noticeText = `(document.querySelector('.psy-cal__notice').style.display === 'none' ? '' : document.querySelector('.psy-cal__notice').innerText)`;
        const panelOpen = `document.querySelector('.psy-cal__panel').style.display !== 'none'`;

        await step('Kalendarz Google włącza się osobnym kliknięciem (jedna zgoda); odmowa w okienku Google niczego nie psuje', async () => {
            await openCalendar(b, '#/calendar', day);
            await waitFor(b, `${noticeText}.includes('nie jest jeszcze włączony')`, 6000, 'zachęta do włączenia kalendarza');
            assert.ok(!mock.calls.some((c) => c.includes('/calendar/')), 'bez zgody aplikacja nie woła API kalendarza');
            await b.screenshot(path.join(SHOTS, 'gdrive-05-wlacz-kalendarz.png'));

            await b.click('[data-action="book"]');
            await sleep(300);
            assert.equal(await b.evaluate(`return ${panelOpen};`), false, 'bez kalendarza nie da się umawiać');

            // użytkownik zamyka okienko Google bez zgody
            await b.evaluate(`window.__PSY_TEST_GDRIVE__.deny = [${JSON.stringify(SCOPE.calendar)}];`);
            await b.click('[data-action="enable-calendar"]');
            await waitFor(b, `${noticeText}.includes('Google nie przyznał zgody')`, 6000, 'informacja o odmowie');
            assert.deepEqual(await lastAsked(), { requested: [SCOPE.calendar], consent: false }, 'prośba tylko o kalendarz');
            assert.equal(mock.calendars.size, 0);
            assert.equal(await b.evaluate(`return PsyStore.state.storageStatus;`), 'connected', 'Dysk działa dalej');

            // druga próba: aplikacja wymusza ekran zgody; tym razem użytkownik się zgadza
            await b.evaluate(`window.__PSY_TEST_GDRIVE__.deny = [];`);
            await b.click('[data-action="enable-calendar"]');
            await waitFor(b, `${noticeText} === ''`, 8000, 'zachęta znika po włączeniu');
            assert.deepEqual(await lastAsked(), { requested: [SCOPE.calendar], consent: true });
            await waitFor(b, `document.querySelector('[data-action="enable-busy"]')`, 6000, 'propozycja pokazania „zajętych"');
            // kalendarz zakłada się przy pierwszym wczytaniu terminów — czekamy, aż aplikacja zapisze jego identyfikator
            const root = () => mock.find((f) => f.appProperties.psyKind === 'root')[0];
            for (let i = 0; i < 60 && !root().appProperties.cfg_calendarId; i++) await sleep(100);
            assert.equal(mock.calendars.size, 1, 'jeden kalendarz aplikacji');
            const cal = Array.from(mock.calendars.values())[0];
            assert.equal(cal.summary, 'PsychoApp — wizyty');
            assert.equal(root().appProperties.cfg_calendarId, cal.id, 'identyfikator kalendarza zapamiętany na Dysku');
        });

        await step('„zajęte" z głównego kalendarza to osobna, nieobowiązkowa zgoda', async () => {
            mock.setPrimaryBusy([{ start: at(16).toISOString(), end: at(17).toISOString() }]);
            await openCalendar(b, '#/calendar', day);
            await waitFor(b, `document.querySelector('[data-action="enable-busy"]')`, 6000, 'link do włączenia „zajętych"');
            assert.ok(!mock.calls.some((c) => c.includes('/freeBusy')), 'bez zgody aplikacja nie pyta o zajętość');
            assert.equal(await b.evaluate(`return document.querySelectorAll('.psy-cal__host .psy-cal-busy').length;`), 0);

            await b.click('[data-action="enable-busy"]');
            await waitFor(b, `document.querySelector('.psy-cal__host .psy-cal-busy')`, 6000, 'prywatny termin jako „zajęte"');
            assert.deepEqual(await lastAsked(), { requested: [SCOPE.busy], consent: false }, 'prośba tylko o zajętość');
            assert.equal(await b.evaluate(`return !!document.querySelector('[data-action="enable-busy"]');`), false, 'link znika');
            assert.equal(await b.evaluate(`return localStorage.getItem('psy-new:googleExtras');`), SCOPE.calendar + ' ' + SCOPE.busy,
                'przeglądarka pamięta włączone zgody (same nazwy, bez tokenu)');
        });

        await step('Kalendarz Google: termin z danymi pacjenta w osobnym kalendarzu aplikacji', async () => {
            await openCalendar(b, '#/calendar', day);
            await b.click('[data-action="book"]');
            await b.click('input[name="cal-patient-search"]');
            await b.type('kowal');
            await b.click('.psy-cal__patient-option[data-patient-id="P001"]');
            await b.evaluate(`__t.setInput('input[name="cal-date"]', '${day}'); __t.setInput('input[name="cal-time"]', '10:00');`);
            await b.click('[data-action="save"]');
            await waitFor(b, `document.querySelector('.psy-cal-ev--unpaid')`, 8000, 'termin na kalendarzu');
            const events = mock.events();
            assert.equal(events.length, 1);
            assert.equal(events[0].summary, 'Anna Kowalska · Kolejne spotkanie · nie zapłacono');
            assert.equal(new Date(events[0].start.dateTime).getTime(), at(10).getTime());
            assert.equal((new Date(events[0].end.dateTime) - new Date(events[0].start.dateTime)) / 60000, 50);
            const p = events[0].extendedProperties.private;
            assert.deepEqual([p.psy, p.kind, p.patientId, p.visitType, p.paid], ['1', 'visit', 'P001', 'next_meeting', '0']);
            await b.screenshot(path.join(SHOTS, 'gdrive-04-kalendarz.png'));
        });

        await step('zgoda na kalendarz cofnięta w koncie Google: reszta działa, kalendarz prosi o włączenie; token tylko na nową zgodę też wystarcza', async () => {
            // Konto nie ma już zgody na kalendarz, a przy logowaniu użytkownik jej nie przywraca.
            await b.evaluate(`
                const g = window.__PSY_TEST_GDRIVE__;
                g.revoke(${JSON.stringify(SCOPE.calendar)});
                g.deny = [${JSON.stringify(SCOPE.calendar)}];
                await PsyStore.reconnectStorage();`);
            assert.deepEqual((await lastAsked()).requested, [SCOPE.drive, SCOPE.calendar, SCOPE.busy], 'logowanie prosi o zapamiętane zgody');
            await openCalendar(b, '#/calendar', day);
            await waitFor(b, `${noticeText}.includes('nie jest jeszcze włączony')`, 6000, 'zachęta do włączenia');
            assert.equal(await b.evaluate(`return document.querySelectorAll('.psy-cal-ev--unpaid').length;`), 0);
            assert.equal(await b.evaluate(`return localStorage.getItem('psy-new:googleExtras');`), SCOPE.busy,
                'o cofniętą zgodę aplikacja nie prosi już przy każdym logowaniu');
            assert.equal(await b.evaluate(`return PsyStore.state.storageStatus;`), 'connected');

            // Google odpowiada tokenem tylko na nową zgodę → aplikacja sama dobiera pełny.
            await b.evaluate(`const g = window.__PSY_TEST_GDRIVE__; g.deny = []; g.incremental = false;`);
            await b.click('[data-action="enable-calendar"]');
            await waitFor(b, `document.querySelector('.psy-cal-ev--unpaid')`, 8000, 'terminy po włączeniu');
            assert.deepEqual((await asked()).slice(-2).map((a) => a.requested),
                [[SCOPE.calendar], [SCOPE.drive, SCOPE.calendar, SCOPE.busy]]);
            await b.evaluate(`window.__PSY_TEST_GDRIVE__.incremental = true;`);
            assert.equal(mock.calendars.size, 1, 'ten sam kalendarz aplikacji (bez duplikatu)');
        });

        await step('token bez zgody, o której aplikacja myśli, że ją ma (403 z Google) → prośba o włączenie zamiast błędu', async () => {
            await b.evaluate(`
                const g = window.__PSY_TEST_GDRIVE__;
                g.hideFromToken = [${JSON.stringify(SCOPE.calendar)}];
                await PsyStore.reconnectStorage();`);
            await openCalendar(b, '#/calendar', day);
            await waitFor(b, `${noticeText}.includes('Google nie udzielił aplikacji zgody na kalendarz')`, 8000, 'zachęta z wyjaśnieniem');
            assert.equal(await b.evaluate(`return document.querySelectorAll('.psy-cal-ev--unpaid').length;`), 0);
            await b.evaluate(`window.__PSY_TEST_GDRIVE__.hideFromToken = [];`);
            await b.click('[data-action="enable-calendar"]');
            await waitFor(b, `document.querySelector('.psy-cal-ev--unpaid') && ${noticeText} === ''`, 8000, 'terminy po włączeniu');
            assert.equal(mock.calendars.size, 1);
        });

        await step('dane pacjentów nie są kopiowane do pamięci przeglądarki', async () => {
            const dump = await b.evaluate(`return JSON.stringify([Object.assign({}, localStorage), Object.assign({}, sessionStorage)]);`);
            assert.ok(!/Kowalska|Kontrola za 2 tygodnie/.test(dump), dump.slice(0, 200));
        });

        await step('odświeżenie strony (F5): bez logowania; lista z indeksu, arkusz wczytany dopiero po otwarciu pacjenta', async () => {
            await go(b, '#/patients');
            const callsBefore = mock.calls.length;
            await b.reload();
            await waitFor(b, `window.PsyStore && document.querySelector('tr[data-patient-id="P001"]')`, 8000, 'lista pacjentów bez logowania');
            assert.equal(await b.evaluate(`return !!document.querySelector('.psy-folder-gate');`), false, 'bez ekranu startowego');
            assert.deepEqual(await asked(), [], 'po odświeżeniu aplikacja o nic nie prosi Google');
            const row = await b.evaluate(`return { text: document.querySelector('tr[data-patient-id="P001"]').innerText, loaded: PsyStore.isPatientLoaded('P001') };`);
            assert.match(row.text, /Anna Kowalska/);
            assert.match(row.text, /\d{4}-\d{2}-\d{2}/, 'data ostatniej wizyty z indeksu');
            assert.equal(row.loaded, false);
            assert.ok(!mock.calls.slice(callsBefore).some((c) => c.includes('/v4/spreadsheets')), 'lista nie otwiera arkuszy');

            await b.click('tr[data-patient-id="P001"] .btn--primary');
            await waitFor(b, `document.querySelector('.psy-history-paragraph')`, 8000, 'historia po wczytaniu');
            const after = JSON.parse(await b.evaluate(`
                const m = await import('/js/views/_patient-doc.js');
                return JSON.stringify(m.buildPatientDoc(PsyStore.state, 'P001'));`));
            delete after.savedAt;
            assert.deepEqual(after, before, 'po odświeżeniu dane identyczne');
            assert.match(await b.evaluate(`return document.querySelector('.psy-history-paragraph').innerText;`), /Setal.*100 mg\/d/s);
            await b.screenshot(path.join(SHOTS, 'gdrive-02-historia-po-odswiezeniu.png'));

            // kalendarz po odświeżeniu: włączony od razu, ten sam (bez duplikatu), termin nadal jest
            await openCalendar(b, '#/calendar', day);
            await waitFor(b, `document.querySelector('.psy-cal-ev--unpaid')`, 8000, 'termin po odświeżeniu');
            assert.equal(await b.evaluate(`return ${noticeText};`), '');
            await waitFor(b, `document.querySelector('.psy-cal__host .psy-cal-busy')`, 6000, '„zajęte" po odświeżeniu');
            assert.equal(mock.calendars.size, 1, 'nadal jeden kalendarz aplikacji');
            assert.deepEqual(await asked(), [], 'nadal bez okienka Google');
        });

        await step('sesja odrzucona przez Google albo przeterminowana: ekran startowy z jednym przyciskiem, bez okienka', async () => {
            const KEY = 'psy-new:googleSession';
            const gateButton = `document.querySelector('.psy-folder-gate__btn--primary')`;
            await go(b, '#/patients');

            // token, którego Google już nie przyjmuje (np. dostęp cofnięty w koncie)
            await b.evaluate(`
                const s = JSON.parse(sessionStorage.getItem('${KEY}'));
                s.token = 'niewazny';
                sessionStorage.setItem('${KEY}', JSON.stringify(s));`);
            await b.reload();
            await waitFor(b, gateButton, 8000, 'ekran startowy');
            assert.match(await b.evaluate(`return ${gateButton}.innerText;`), /Kontynuuj z Dyskiem Google \(terapeuta@example\.com\)/);
            assert.deepEqual(await asked(), [], 'bez kliknięcia aplikacja nie otwiera okienka Google');
            assert.equal(await b.evaluate(`return sessionStorage.getItem('${KEY}');`), null, 'odrzucony token nie zostaje w karcie');

            // token przeterminowany: aplikacja nawet nie próbuje go użyć
            await b.evaluate(`sessionStorage.setItem('${KEY}', JSON.stringify(
                { token: 'test-token:drive.file', expiresAt: Date.now() - 1000, scopes: [${JSON.stringify(SCOPE.drive)}] }));`);
            const callsBefore = mock.calls.length;
            await b.reload();
            await waitFor(b, gateButton, 8000, 'ekran startowy');
            assert.equal(mock.calls.length, callsBefore, 'żadnych wywołań API z przeterminowanym tokenem');

            // jedno kliknięcie: jedno logowanie obejmuje Dysk i zgody włączone wcześniej; bez kroku z kalendarzem
            await b.click('.psy-folder-gate__btn--primary');
            await waitFor(b, `!document.querySelector('.psy-folder-gate') && document.querySelector('tr[data-patient-id="P001"]')`, 8000, 'aplikacja po kliknięciu');
            assert.deepEqual(await asked(), [{ requested: [SCOPE.drive, SCOPE.calendar, SCOPE.busy], consent: false }]);
            await b.evaluate(`PsyStore.selectPatient('P001'); await PsyStore.ensurePatientLoaded('P001');`);
        });

        await step('zmiana nazwiska zmienia nazwę folderu i arkusza (bez duplikatu)', async () => {
            await b.evaluate(`PsyStore.updatePatient('P001', { nazwisko: 'Kowalska-Nowak' });`);
            await waitFor(b, idle, 15000, 'zapis po zmianie nazwiska');
            assert.equal(mock.spreadsheets().length, 1);
            assert.equal(sheet().name, 'P001_Kowalska-Nowak_Anna');
            assert.equal(mock.files.get(sheet().parents[0]).name, 'P001_Kowalska-Nowak_Anna');
            assert.equal(sheet().appProperties.nazwisko, 'Kowalska-Nowak');
        });

        const visitId = () => b.evaluate(`return PsyStore.getVisits('P001')[0].id;`);
        const paidInSheet = () => mock.doc(sheet().id).visits[0].paid;

        await step('chwilowy błąd serwera i wygasły token: zapis ponawia się sam', async () => {
            const id = await visitId();
            mock.failNext(500, 401);
            await b.evaluate(`PsyStore.togglePaid(${JSON.stringify(id)});`);
            await waitFor(b, idle, 20000, 'zapis mimo błędów 500 i 401');
            assert.equal(paidInSheet(), true);
        });

        await step('sesja Google wymaga kliknięcia: zmiany czekają, potem się zapisują', async () => {
            const id = await visitId();
            await b.evaluate(`window.__PSY_TEST_GDRIVE__.authFail = true;`);
            mock.failNext(401);
            await b.evaluate(`PsyStore.togglePaid(${JSON.stringify(id)});`);
            await waitFor(b, `PsyStore.state.storageStatus === 'needs-auth'`, 15000, 'stan „połącz ponownie"');
            const r = await b.evaluate(`return { unsaved: PsyStore.hasUnsavedChanges(), badge: document.getElementById('btn-storage').innerText, save: document.getElementById('save-indicator').innerText };`);
            assert.equal(r.unsaved, true);
            assert.match(r.badge, /Połącz ponownie/);
            assert.match(r.save, /Niezapisane/);
            assert.equal(paidInSheet(), true, 'arkusz jeszcze nie zmieniony');
            await b.screenshot(path.join(SHOTS, 'gdrive-03-polacz-ponownie.png'));

            await b.evaluate(`window.__PSY_TEST_GDRIVE__.authFail = false;`);
            await b.click('#btn-storage');
            await waitFor(b, `PsyStore.state.storageStatus === 'connected' && ${idle}`, 15000, 'zapis po ponownym połączeniu');
            assert.equal(paidInSheet(), false);
        });

        await step('brak sieci: zmiana czeka i zapisuje się po powrocie połączenia', async () => {
            const id = await visitId();
            mock.setOffline(true);
            await b.evaluate(`PsyStore.togglePaid(${JSON.stringify(id)});`);
            await waitFor(b, `PsyStore.state.saveStatus === 'error'`, 15000, 'sygnał błędu zapisu');
            assert.equal(await b.evaluate(`return PsyStore.hasUnsavedChanges();`), true);
            mock.setOffline(false);
            await waitFor(b, idle, 30000, 'zapis po powrocie sieci');
            assert.equal(paidInSheet(), true);
        });

        const docsInVisit = async (id) => mock.doc(sheet().id).visits.find((v) => v.id === id).data.docs;
        const docRows = async () => {
            await go(b, '#/settings');
            await go(b, '#/documents');
            // wiersze z wizyt są od razu; lista plików z Dysku dochodzi po chwili
            await waitFor(b, `location.hash === '#/documents' && document.querySelector('.psy-extract__note') && document.querySelector('.psy-extract__note').textContent === ''
                && document.querySelector('.psy-extract, .psy-new-empty')`, 8000, 'wyciąg Dokumenty');
            return b.evaluate(`return [...document.querySelectorAll('.psy-extract tbody tr')].map((tr) => ({ visit: tr.dataset.visitId || '', text: tr.innerText }));`);
        };
        let uploaded = null;

        await step('dokument dołącza się w wizycie: plik w folderze „dokumenty", a wizyta i arkusz wiedzą, że jest jej', async () => {
            const id = await visitId();
            await go(b, '#/visit/form/' + id);
            await waitFor(b, `__t.nav('dokumenty::pliki')`);
            await b.click(`__t.nav('dokumenty::pliki')`);
            await waitFor(b, `__t.ctl('dokumenty::pliki', 'input[type="file"]')`);
            await b.evaluate(`
                const input = __t.ctl('dokumenty::pliki', 'input[type="file"]');
                const dt = new DataTransfer();
                dt.items.add(new File(['treść skierowania ąę'], 'skierowanie.txt', { type: 'text/plain' }));
                input.files = dt.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));`);
            await waitFor(b, `__t.ctl('dokumenty::pliki', '.psy-vf__inline-docs__link')`, 8000, 'plik na liście w wizycie');
            await b.screenshot(path.join(SHOTS, 'gdrive-07-dokument-w-wizycie.png'));
            assert.equal(await b.evaluate(`return PsyStore.getVisitById(${JSON.stringify(id)}).data.docs.length;`), 1,
                'wizyta zapisuje plik od razu po wgraniu (bez czekania na autozapis)');
            await waitFor(b, idle, 15000, 'zapis wizyty z plikiem');

            const docsFolder = mock.find((f) => f.name === 'dokumenty')[0];
            assert.equal(docsFolder.parents[0], sheet().parents[0], 'folder dokumenty w folderze pacjenta');
            uploaded = mock.find((f) => f.name === 'skierowanie.txt')[0];
            assert.equal(uploaded.parents[0], docsFolder.id);
            assert.equal(uploaded.content.toString('utf8'), 'treść skierowania ąę');
            assert.deepEqual(await docsInVisit(id), [{ id: uploaded.id, name: 'skierowanie.txt', size: uploaded.content.length }],
                'wizyta wskazuje plik po identyfikatorze z Dysku');
            const tab = mock.tab(sheet().id, 'Dokumenty');
            assert.deepEqual(tab[0].slice(0, 3), ['Data wizyty', 'Typ wizyty', 'Plik (folder „dokumenty")']);
            assert.deepEqual(tab[1].slice(1, 3), ['Kolejne spotkanie', 'skierowanie.txt']);
            assert.ok(mock.tab(sheet().id, 'Wizyty').some((r) => r[4] === 'Dokumenty' && r[5] === 'skierowanie.txt'), 'plik także w zakładce Wizyty');
        });

        await step('wyciąg „Dokumenty": plik z datą swojej wizyty; plik spoza wizyt jako „bez wizyty" i da się go usunąć', async () => {
            const id = await visitId();
            // skan wrzucony prosto na Dysk (poza aplikacją) — żadna wizyta go nie wskazuje
            const docsFolder = mock.find((f) => f.name === 'dokumenty')[0];
            mock.files.set('file_reczny', {
                id: 'file_reczny', name: 'skan z Dysku.pdf', mimeType: 'application/pdf', parents: [docsFolder.id],
                appProperties: {}, trashed: false, createdTime: '2026-09-01T10:00:00.000Z', modifiedTime: '2026-09-01T10:00:00.000Z',
                content: Buffer.from('%PDF-1.4')
            });
            let rows = await docRows();
            assert.equal(rows.length, 2);
            assert.equal(rows[0].visit, id, 'plik z wizyty prowadzi do tej wizyty');
            assert.ok(rows[0].text.includes('skierowanie.txt') && rows[0].text.includes('Kolejne spotkanie'), rows[0].text);
            assert.equal(rows[1].visit, '');
            assert.ok(rows[1].text.includes('skan z Dysku.pdf') && rows[1].text.includes('bez wizyty') && rows[1].text.includes('2026-09-01'), rows[1].text);
            await b.screenshot(path.join(SHOTS, 'gdrive-08-wyciag-dokumenty.png'));

            await b.click('.psy-extract__row--loose .btn--danger');
            await waitFor(b, `document.querySelector('.psy-modal__footer .btn--danger')`);
            await b.click('.psy-modal__footer .btn--danger');
            await waitFor(b, `document.querySelectorAll('.psy-extract tbody tr').length === 1`, 8000, 'plik „bez wizyty" usunięty');
            assert.equal(mock.files.get('file_reczny').trashed, true, 'plik trafił do kosza Dysku');
            assert.equal(uploaded.trashed, false, 'plik z wizyty nietknięty');

            await b.click(`.psy-extract tbody tr[data-visit-id="${id}"]`);
            await waitFor(b, `location.hash === '#/visit/form/${id}'`, 4000, 'klik w rekord otwiera wizytę');
        });

        await step('usunięcie pliku w wizycie: znika z wizyty i wyciągu, na Dysku trafia do Kosza', async () => {
            const id = await visitId();
            await waitFor(b, `__t.ent('dokumenty::pliki')`);
            await b.click(`__t.ent('dokumenty::pliki')`);
            await waitFor(b, `__t.ctl('dokumenty::pliki', '.psy-vf__inline-meds__remove')`);
            await b.click(`__t.ctl('dokumenty::pliki', '.psy-vf__inline-meds__remove')`);
            await waitFor(b, `document.querySelector('.psy-modal__footer .btn--danger')`);
            await b.click('.psy-modal__footer .btn--danger');
            await waitFor(b, `PsyStore.getVisitById(${JSON.stringify(id)}).data.docs.length === 0`, 8000, 'plik zniknął z wizyty');
            await waitFor(b, idle, 15000, 'zapis wizyty bez pliku');
            assert.equal(uploaded.trashed, true, 'plik trafił do kosza Dysku');
            assert.deepEqual(await docsInVisit(id), []);
            assert.equal(mock.tab(sheet().id, 'Dokumenty').length, 1, 'w zakładce Dokumenty został sam nagłówek');
            assert.deepEqual(await docRows(), []);
        });

        await step('odłączenie: aplikacja wraca do ekranu startowego, dane zostają na Dysku', async () => {
            await b.evaluate(`await PsyStore.disconnectStorage(); location.hash = '#/patients';`);
            assert.equal(await b.evaluate(`return PsyStore.state.patients.length;`), 0);
            assert.equal(mock.spreadsheets().length, 1);
            assert.equal(mock.doc(sheet().id).patient.nazwisko, 'Kowalska-Nowak');
            const left = await b.evaluate(`return [sessionStorage.getItem('psy-new:googleSession'), localStorage.getItem('psy-new:googleExtras'), localStorage.getItem('psy-new:googleDeclined')];`);
            assert.deepEqual(left, [null, null, null], 'po odłączeniu w przeglądarce nie zostaje token ani lista zgód');
        });

        await step('łączenie od zera: po Dysku ten sam ekran włącza Kalendarz Google (drugie okienko, jedna zgoda)', async () => {
            // odłączenie cofa w Google wszystkie zgody aplikacji
            await b.evaluate(`sessionStorage.removeItem('__psy_test_google_account');`);
            await b.reload();
            await waitFor(b, `document.querySelector('.psy-folder-gate__btn--primary')`, 8000, 'ekran startowy');
            assert.match(await b.evaluate(`return document.querySelector('.psy-folder-gate__btn--primary').innerText;`), /Połącz z Dyskiem Google/);
            await b.click('.psy-folder-gate__btn--primary');
            await waitFor(b, `document.querySelector('[data-action="gate-enable-calendar"]')`, 8000, 'krok 2: kalendarz');
            await b.screenshot(path.join(SHOTS, 'gdrive-06-krok-kalendarz.png'));

            // odmowa w okienku Google → komunikat na tym samym ekranie
            await b.evaluate(`window.__PSY_TEST_GDRIVE__.deny = [${JSON.stringify(SCOPE.calendar)}];`);
            await b.click('[data-action="gate-enable-calendar"]');
            await waitFor(b, `document.querySelector('.psy-folder-gate__notice--error')`, 6000, 'informacja o odmowie');
            assert.match(await b.evaluate(`return document.querySelector('.psy-folder-gate__notice--error').innerText;`), /Google nie przyznał zgody na kalendarz/);

            // zgoda → kalendarz gotowy, zanim aplikacja się pokaże (ten sam, bez duplikatu)
            await b.evaluate(`window.__PSY_TEST_GDRIVE__.deny = [];`);
            const callsBefore = mock.calls.length;
            await b.click('[data-action="gate-enable-calendar"]');
            await waitFor(b, `!document.querySelector('.psy-folder-gate') && document.querySelector('.psy-cal-view, .psy-new-table')`, 8000, 'aplikacja po kroku 2');
            assert.deepEqual((await asked()).map((a) => a.requested), [[SCOPE.drive], [SCOPE.calendar], [SCOPE.calendar]],
                'dwa okienka, w każdym jedna zgoda');
            assert.ok(mock.calls.slice(callsBefore).some((c) => c.startsWith('GET /calendar/v3/calendars/')), 'kalendarz sprawdzony już przy łączeniu');
            assert.equal(mock.calendars.size, 1);
            await openCalendar(b, '#/calendar', day);
            await waitFor(b, `document.querySelector('.psy-cal-ev--unpaid')`, 8000, 'terminy od razu, bez przycisku włączania');
            assert.equal(await b.evaluate(`return ${noticeText};`), '');
        });

        await step('brak błędów w konsoli (poza wymuszonymi awariami sieci)', async () => {
            const real = b.problems.filter((p) => !/Failed to load resource|net::ERR/.test(p));
            assert.deepEqual(real, [], real.join(' || '));
        });
    } finally {
        await b.close();
    }
}

/* ==========================================================================
   SCENARIUSZ: folder lokalny (prywatny system plików przeglądarki jako folder)
   ========================================================================== */
async function scenarioLocal(origin) {
    console.log('\nFolder lokalny (pacjent.xlsx)');
    const b = (activeBrowser = await launchBrowser());
    const idle = `window.PsyStore && !PsyStore.hasUnsavedChanges() && PsyStore.state.saveStatus !== 'saving'`;
    try {
        // Okno wyboru folderu wymaga człowieka — w teście podstawiamy folder z OPFS.
        await b.onNewDocument(`
            window.showDirectoryPicker = async () =>
                (await navigator.storage.getDirectory()).getDirectoryHandle('pacjenci-test', { create: true });
            ${PAGE_HELPERS}`);
        await b.navigate(origin + '/index.html');
        await waitFor(b, `document.querySelector('.psy-folder-gate__btn')`, 8000, 'ekran startowy');

        await step('połączenie z folderem, pacjent i wizyta zapisane do pacjent.xlsx', async () => {
            await b.click(`[...document.querySelectorAll('.psy-folder-gate__btn')].find((x) => x.innerText.includes('Folder na tym komputerze'))`);
            try {
                await waitFor(b, `PsyStore.state.storageConnected && PsyStore.state.storageKind === 'local'`);
            } catch (e) {
                const gate = await b.evaluate(`const g = document.querySelector('.psy-folder-gate'); return g ? g.innerText.replace(/\\s+/g, ' ') : '(ekran startowy zamknięty)';`);
                throw new Error(e.message + '\nEkran startowy: ' + gate + '\nKonsola: ' + JSON.stringify(b.problems));
            }
            await b.evaluate(`
                const p = PsyStore.addPatient({ imie: 'Jan', nazwisko: 'Żółć', pesel: '44051401359', miasto: 'Łódź' });
                PsyStore.selectPatient(p.id);
                PsyStore.addVisit({ patientId: p.id, type: 'first_meeting', date: '2026-10-06',
                    data: { _raw: { 'visitData.data': '2026-10-06', 'wywiad.depresyjne': ['anhedonia'], 'wywiad.depresyjne.__notes': 'od miesiąca',
                                    'problemZdrowotny.__comment': 'opis problemu' },
                            meds: [{ name: 'Setaloft', substance: 'Sertralina', dose: '50', unit: 'mg/d', maxDose: '200 mg/d' }],
                            diagnoses: [{ code: 'F32.1', description: 'Epizod depresyjny umiarkowany' }] } });`);
            await waitFor(b, idle, 10000, 'zapis do folderu');
            const files = await b.evaluate(`
                const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('pacjenci-test');
                const out = [];
                for await (const [name, h] of root.entries()) {
                    const inner = [];
                    for await (const [n] of h.entries()) inner.push(n);
                    out.push(name + '/' + inner.join(','));
                }
                return out;`);
            assert.deepEqual(files, ['P001_Zolc_Jan/pacjent.xlsx']);
        });

        await step('odświeżenie strony: folder wraca sam, dane identyczne', async () => {
            const before = await b.evaluate(`
                const m = await import('/js/views/_patient-doc.js');
                const d = m.buildPatientDoc(PsyStore.state, 'P001'); delete d.savedAt; return JSON.stringify(d);`);
            await b.reload();
            await waitFor(b, `window.PsyStore && PsyStore.state.storageConnected && PsyStore.state.patients.length === 1`, 10000, 'automatyczne przywrócenie folderu');
            assert.equal(await b.evaluate(`return !!document.querySelector('.psy-folder-gate');`), false, 'bez ekranu startowego');
            const after = await b.evaluate(`
                const m = await import('/js/views/_patient-doc.js');
                const d = m.buildPatientDoc(PsyStore.state, 'P001'); delete d.savedAt; return JSON.stringify(d);`);
            assert.equal(after, before);
            await b.evaluate(`PsyStore.selectPatient('P001'); location.hash = '#/history';`);
            await waitFor(b, `document.querySelector('.psy-history-paragraph')`);
            const text = await b.evaluate(`return document.querySelector('.psy-history-paragraph').innerText;`);
            for (const s of ['anhedonia', 'od miesiąca', 'opis problemu', 'Setaloft', 'F32.1']) assert.ok(text.includes(s), 'brak: ' + s);
        });

        await step('zmiana nazwiska przenosi folder pacjenta', async () => {
            await b.evaluate(`PsyStore.updatePatient('P001', { nazwisko: 'Nowak' });`);
            await waitFor(b, idle, 10000, 'zapis po zmianie nazwiska');
            const names = await b.evaluate(`
                const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('pacjenci-test');
                const out = []; for await (const [name] of root.entries()) out.push(name); return out;`);
            assert.deepEqual(names, ['P001_Nowak_Jan']);
        });

        await step('brak błędów w konsoli', async () => noPageProblems(b));
    } finally {
        await b.close();
    }
}

/* ==========================================================================
   SCENARIUSZ: aktualne pliki po wdrożeniu (znaczniki wersji — tools/stamp.mjs)
   ========================================================================== */

/**
 * Miniaturowa „aplikacja" zbudowana tak jak prawdziwa: strona ładuje moduł wejściowy,
 * a ten STATYCZNIE importuje drugi moduł. Pliki są serwowane jak na GitHub Pages:
 * przeglądarce wolno trzymać je 10 minut bez pytania serwera (`max-age=600`).
 *   /__probe/plain.html    — import bez wersji w adresie (tak było przed znacznikami),
 *   /__probe/stamped.html  — z mapą importów, która dopisuje do adresu modułu jego wersję
 *                            (tak robi index.html po `tools/stamp.mjs`).
 * `deploy()` = wdrożenie nowej wersji importowanego modułu.
 */
function createDeployProbe() {
    let version = 1;
    const page = (head) => '<!doctype html><meta charset="utf-8"><title>probe</title>' + head
        + '<script type="module" src="entry.js?v=1"></script>';
    const files = {
        '/__probe/plain.html': () => ['text/html; charset=utf-8', page('')],
        '/__probe/stamped.html': () => ['text/html; charset=utf-8', page(
            '<script type="importmap">' + JSON.stringify({ imports: { './module.js': './module.js?v=' + version } }) + '</script>')],
        '/__probe/entry.js': () => ['text/javascript', 'import { version } from "./module.js"; window.__probeVersion = version;'],
        '/__probe/module.js': () => ['text/javascript', 'export const version = ' + version + ';']
    };
    return {
        deploy() { version++; },
        routes(req, res) {
            const file = files[req.url.split('?')[0]];
            if (!file) return false;
            const [type, body] = file();
            const headers = { 'Cache-Control': 'max-age=600', ETag: '"' + body.length + '-' + version + '"' };
            if (req.headers['if-none-match'] === headers.ETag) {
                res.writeHead(304, headers);
                res.end();
            } else {
                res.writeHead(200, Object.assign({ 'Content-Type': type }, headers));
                res.end(body);
            }
            return true;
        }
    };
}

async function scenarioFresh(origin, probe) {
    console.log('\nAktualne pliki po wdrożeniu');
    const b = (activeBrowser = await launchBrowser());
    const version = async (page) => {
        await waitFor(b, `location.pathname === '/__probe/${page}' && window.__probeVersion`, 8000, 'strona próbna ' + page);
        return b.evaluate(`return window.__probeVersion;`);
    };
    try {
        await step('bez znaczników: po wdrożeniu zwykłe odświeżenie (F5) nadal daje stary moduł', async () => {
            await b.navigate(origin + '/__probe/plain.html');
            assert.equal(await version('plain.html'), 1);
            probe.deploy();
            await b.reload({ hard: false });
            assert.equal(await version('plain.html'), 1,
                'F5 sprawdza tylko dokument — importowany moduł przeglądarka bierze z pamięci (stąd „nowy wygląd bez nowego pola")');
        });

        await step('ze znacznikami (mapa importów): to samo F5 daje nowy moduł od razu', async () => {
            await b.navigate(origin + '/__probe/stamped.html');
            assert.equal(await version('stamped.html'), 2);
            probe.deploy();
            await b.reload({ hard: false });
            assert.equal(await version('stamped.html'), 3, 'po F5 strona ma wersję z wdrożenia');
            await b.reload({ hard: false });
            assert.equal(await version('stamped.html'), 3, 'bez wdrożenia nic się nie zmienia');
        });

        await step('aplikacja: każdy moduł jest ładowany z odciskiem treści w adresie', async () => {
            await b.onNewDocument(`try { localStorage.setItem('psy-new:devMode', '1'); } catch (e) {} ${PAGE_HELPERS}`);
            await b.navigate(origin + '/index.html#/patients');
            await waitFor(b, `window.PsyStore && document.querySelector('.psy-new-table tbody tr')`, 10000, 'lista pacjentów');
            // widok kalendarza i formularz wizyty dociągają resztę modułów
            await b.evaluate(`PsyStore.selectPatient('P001'); location.hash = '#/visit/form/new/next_meeting';`);
            await waitFor(b, `document.querySelector('.psy-form-toolbar__nav')`, 8000, 'formularz wizyty');
            const r = await b.evaluate(`
                const urls = performance.getEntriesByType('resource').map((e) => e.name);
                const app = (re) => urls.filter((u) => u.startsWith(location.origin) && re.test(new URL(u).pathname));
                const map = JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports;
                return {
                    modules: app(/^\\/js\\/.+\\.js$/),
                    styles: app(/^\\/css\\/.+\\.css$/),
                    mapped: Object.values(map).map((v) => new URL(v, location.href).href),
                    // moduł pobrany „z boku" (jak w testach) to ta sama instancja co w aplikacji
                    sameStore: (await import('/js/views/_store.js')).Store === window.PsyStore };`);
            const unstamped = [...r.modules, ...r.styles].filter((u) => !/\?v=[0-9a-f]{10}$/.test(u));
            assert.deepEqual(unstamped, [], 'pliki bez znacznika wersji');
            assert.ok(r.modules.length >= 30 && r.styles.length === 9, 'wczytane moduły: ' + r.modules.length + ', style: ' + r.styles.length);
            assert.deepEqual(r.modules.filter((u) => !r.mapped.includes(u)), [], 'adresy modułów pochodzą z mapy importów');
            assert.equal(r.sameStore, true);
        });

        await step('brak błędów w konsoli', async () => noPageProblems(b));
    } finally {
        await b.close();
    }
}

/* ========================================================================== */

const mock = createGoogleMock();
const probe = createDeployProbe();
const { server, origin } = await startServer(ROOT, (req, res) => probe.routes(req, res) || mock.routes(req, res));
try {
    // Przed każdym przebiegiem: wydanie z nieaktualnymi znacznikami zostawiłoby u użytkowników stare pliki.
    console.log('\nWydanie');
    await step('znaczniki wersji plików w index.html są aktualne (inaczej: node tools/stamp.mjs)', async () => {
        assert.equal(checkStamp().current, true, 'index.html ma nieaktualne znaczniki wersji — uruchom: node tools/stamp.mjs');
    });
    if (!only || only === 'demo') await scenarioDemo(origin);
    if (!only || only === 'calendar') await scenarioCalendar(origin);
    if (!only || only === 'gdrive') await scenarioGDrive(origin, mock);
    if (!only || only === 'local') await scenarioLocal(origin);
    if (!only || only === 'fresh') await scenarioFresh(origin, probe);
} finally {
    server.close();
}

console.log('\n' + (failed ? '❌ Nieudane kroki: ' + failed + ' (udane: ' + passed + ')' : '✅ Wszystkie kroki przeszły (' + passed + ').'));
process.exit(failed ? 1 : 0);
