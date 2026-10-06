// ============================================================================
// tools/smoke-test.mjs — test aplikacji w prawdziwej przeglądarce (headless).
//
//   node tools/smoke-test.mjs            (wszystkie scenariusze)
//   node tools/smoke-test.mjs demo       (tylko wybrany: demo | gdrive | local)
//
// Klika i pisze jak użytkownik (zdarzenia myszy i klawiatury przez DevTools),
// po czym sprawdza stan aplikacji i zawartość magazynu.
//
//   demo   — formularz wizyty: każdy typ pola, szybkie przełączanie pól,
//            tryb odczyt/edycja, historia, osie czasu, usuwanie wizyty.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tools', '.smoke');
const only = process.argv[2] || '';

let passed = 0;
let failed = 0;

async function step(name, fn) {
    try {
        await fn();
        passed++;
        console.log('  ✓ ' + name);
    } catch (e) {
        failed++;
        console.error('  ✗ ' + name + '\n      ' + String(e && e.message || e).split('\n').slice(0, 3).join('\n      '));
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
    main: () => document.getElementById('psy-new-main').innerText
};`;

function noPageProblems(b) {
    assert.deepEqual(b.problems, [], 'błędy w konsoli strony');
}

/* ==========================================================================
   SCENARIUSZ: tryb demo — formularz wizyty i projekcje
   ========================================================================== */
async function scenarioDemo(origin) {
    console.log('\nTryb demo — formularz wizyty');
    const b = await launchBrowser();
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

        await step('usunięcie wizyty usuwa też jej leki i rozpoznania z osi czasu', async () => {
            await go(b, '#/visit/form/' + visitId);
            await waitFor(b, `document.querySelector('.psy-visit-form-view .btn--danger')`);
            await b.click('.psy-visit-form-view .btn--danger');
            await waitFor(b, `document.querySelector('.psy-modal__footer .btn--danger')`);
            await b.click('.psy-modal__footer .btn--danger');
            await waitFor(b, `location.hash === '#/history'`);
            const r = await b.evaluate(`return { visits: PsyStore.getVisits('P004').length, meds: PsyStore.getMedsTimeline('P004').length, dx: PsyStore.getDiagnosesTimeline('P004').length };`);
            assert.deepEqual(r, { visits: 0, meds: 0, dx: 0 });
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
   SCENARIUSZ: Dysk Google (na atrapie API)
   ========================================================================== */
async function scenarioGDrive(origin, mock) {
    console.log('\nDysk Google (atrapa API)');
    const b = await launchBrowser();
    const sheet = () => mock.spreadsheets()[0];
    const idle = `window.PsyStore && !PsyStore.hasUnsavedChanges() && PsyStore.state.saveStatus !== 'saving'`;
    try {
        await b.onNewDocument(`window.__PSY_TEST_GDRIVE__ = { base: location.origin + '/__gapi', token: 'test-token' }; ${PAGE_HELPERS}`);
        await b.navigate(origin + '/index.html');
        await waitFor(b, `document.querySelector('.psy-folder-gate__btn--primary')`, 8000, 'ekran startowy');

        await step('ekran startowy → połączenie; na Dysku powstaje folder „pacjenci"', async () => {
            assert.match(await b.evaluate(`return document.querySelector('.psy-folder-gate__btn--primary').innerText;`), /Połącz z Dyskiem Google/);
            await b.screenshot(path.join(SHOTS, 'gdrive-01-start.png'));
            await b.click('.psy-folder-gate__btn--primary');
            await waitFor(b, `PsyStore.state.storageConnected && !document.querySelector('.psy-folder-gate')`);
            const roots = mock.find((f) => f.mimeType === FOLDER_MIME && f.appProperties.psyKind === 'root');
            assert.equal(roots.length, 1);
            assert.equal(roots[0].name, 'pacjenci');
            const r = await b.evaluate(`return { badge: document.getElementById('btn-storage').innerText, main: __t.main(), n: PsyStore.state.patients.length };`);
            assert.match(r.badge, /Dysk Google/);
            assert.equal(r.n, 0, 'po połączeniu nie ma danych demo');
            assert.match(r.main, /Dodaj pierwszego pacjenta/);
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
                ['Pacjent', 'Wizyty', 'Leki', 'Diagnozy', 'Parametry', 'Plan leczenia', 'Zalecenia', 'Testy', '_dane']);
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

        await step('dane pacjentów nie są kopiowane do pamięci przeglądarki', async () => {
            const dump = await b.evaluate(`return JSON.stringify(Object.assign({}, localStorage));`);
            assert.ok(!/Kowalska|Kontrola za 2 tygodnie/.test(dump), dump.slice(0, 200));
        });

        await step('odświeżenie strony: lista z indeksu, arkusz wczytany dopiero po otwarciu pacjenta', async () => {
            await go(b, '#/patients');
            await b.reload();
            await waitFor(b, `document.querySelector('.psy-folder-gate__btn--primary')`, 8000, 'ekran startowy po odświeżeniu');
            assert.match(await b.evaluate(`return document.querySelector('.psy-folder-gate__btn--primary').innerText;`),
                /Kontynuuj z Dyskiem Google \(terapeuta@example\.com\)/);
            const callsBefore = mock.calls.length;
            await b.click('.psy-folder-gate__btn--primary');
            await waitFor(b, `document.querySelector('tr[data-patient-id="P001"]')`);
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

        await step('załączniki: wgranie, lista, zmiana nazwy i usunięcie w folderze „dokumenty"', async () => {
            await go(b, '#/documents');
            await waitFor(b, `document.querySelector('.psy-docs__uploader input[type="file"]')`);
            await b.evaluate(`
                const input = document.querySelector('.psy-docs__uploader input[type="file"]');
                const dt = new DataTransfer();
                dt.items.add(new File(['treść skierowania ąę'], 'skierowanie.txt', { type: 'text/plain' }));
                input.files = dt.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));`);
            await waitFor(b, `document.querySelector('.psy-docs__row')`, 8000, 'plik na liście');
            const docsFolder = mock.find((f) => f.name === 'dokumenty')[0];
            assert.equal(docsFolder.parents[0], sheet().parents[0], 'folder dokumenty w folderze pacjenta');
            const uploaded = mock.find((f) => f.name === 'skierowanie.txt')[0];
            assert.equal(uploaded.parents[0], docsFolder.id);
            assert.equal(uploaded.content.toString('utf8'), 'treść skierowania ąę');

            await b.click('.psy-docs__row .btn--danger');
            await waitFor(b, `document.querySelector('.psy-modal__footer .btn--danger')`);
            await b.click('.psy-modal__footer .btn--danger');
            await waitFor(b, `!document.querySelector('.psy-docs__row')`, 8000, 'plik zniknął z listy');
            assert.equal(mock.files.get(uploaded.id).trashed, true, 'plik trafił do kosza Dysku');
        });

        await step('odłączenie: aplikacja wraca do ekranu startowego, dane zostają na Dysku', async () => {
            await b.evaluate(`await PsyStore.disconnectStorage(); location.hash = '#/patients';`);
            assert.equal(await b.evaluate(`return PsyStore.state.patients.length;`), 0);
            assert.equal(mock.spreadsheets().length, 1);
            assert.equal(mock.doc(sheet().id).patient.nazwisko, 'Kowalska-Nowak');
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
    const b = await launchBrowser();
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
            await waitFor(b, `PsyStore.state.storageConnected && PsyStore.state.storageKind === 'local'`);
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

/* ========================================================================== */

const mock = createGoogleMock();
const { server, origin } = await startServer(ROOT, (req, res) => mock.routes(req, res));
try {
    if (!only || only === 'demo') await scenarioDemo(origin);
    if (!only || only === 'gdrive') await scenarioGDrive(origin, mock);
    if (!only || only === 'local') await scenarioLocal(origin);
} finally {
    server.close();
}

console.log('\n' + (failed ? '❌ Nieudane kroki: ' + failed + ' (udane: ' + passed + ')' : '✅ Wszystkie kroki przeszły (' + passed + ').'));
process.exit(failed ? 1 : 0);
