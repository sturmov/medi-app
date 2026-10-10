# PsychoApp

Clinical documentation app for one therapist (psychologist / psychiatrist). Static site, no backend, no build step. Deployed from `main` to GitHub Pages (`https://sturmov.github.io/medi-app/`), so **pushing `main` is a release**.

UI text and code comments are Polish. Requirements come from the client through the product owner; the source notes are in `docs/` (`REQUIREMENTS_*.md`, `VISIT_FORM_SPEC.md`, `PAcjent.txt`, `notatki.txt`). Older plans and the previous tool's rules are in `docs/archive/` and describe an architecture that no longer exists.

## Run and test

```bash
node tools/serve.mjs            # http://localhost:8123  (no Python on the dev machine)
node tools/stamp.mjs            # after any change in js/ or css/: refresh file fingerprints in index.html
node tools/test-patient-doc.mjs # data layer: every form field survives save → load; holidays
node tools/smoke-test.mjs       # real browser: demo | calendar | gdrive | local | fresh scenarios
```

### File fingerprints (run `tools/stamp.mjs` before every commit that touches `js/` or `css/`)

GitHub Pages lets a browser keep each file for 10 minutes without asking the server, and a normal refresh (F5) rechecks only `index.html`. Without fingerprints a release left browsers running new and old files together, for example new CSS with an old JS module. `tools/stamp.mjs` writes a hash of each file's content into `index.html`: as `?v=…` on the stylesheets and scripts listed there, and as an import map (between the `stamp:importmap` markers) that rewrites every module import to its fingerprinted address. A changed file therefore has a new address that no cache can answer from.

- The smoke test starts with a stamp check and fails if `index.html` is out of date. Never edit the stamps by hand.
- The `fresh` scenario reproduces the stale-module problem on a page without stamps and shows the same F5 picking up the new module with them. It also asserts that every module the app loads carries a fingerprint.
- A service worker that forces revalidation was tried and does not work for this: on F5 Chrome reuses statically imported modules and stylesheets from memory without asking the service worker.
- Scripts loaded by path at run time (`lib/fullcalendar/…`) are not stamped. If such a library is ever replaced, give it a new file name.

`node --check` is not evidence that anything works; it has passed on files the browser refused to parse. A change is done when `tools/smoke-test.mjs` passes and, for UI work, you have looked at the screenshots it writes to `tools/.smoke/`. The smoke test needs Chrome or Edge (override with `CHROME_PATH`) and no npm packages.

Run the smoke test several times before trusting a pass: two timing bugs once hid behind single green runs. When a step fails it saves the screen as `tools/.smoke/BLAD-<time>-<n>.png`, and a click that lands on a covered element prints a `⚠` line. Look at those before changing a wait.

The `gdrive` scenario runs against a local stand-in for Google's APIs (`tools/lib/google-mock.mjs`: Drive, Sheets, Calendar). It proves the app's logic, not Google's behaviour. Request shapes were checked against Google's discovery documents, but anything touching `_storage-gdrive.js` or `_calendar-api.js` should also be tried once against a real account.

## Architecture

Vanilla ES modules and DOM (`el()` from `js/views/_dom.js`). Lit is used only by the toast components (`js/components/`). They render into the normal DOM, where `<slot>` does nothing, so the container positions itself and each toast moves its own content into its frame. The calendar grid is FullCalendar (MIT), vendored in `lib/fullcalendar/` and loaded on first use.

| File | Role |
|---|---|
| `js/app-new.js` | Hash router, shell (topbar, sidebar), patient list, visit history, settings |
| `js/views/view-extracts.js` | The seven read-only sidebar pages built from visits |
| `js/views/_attachments.js` | Patient files: upload, list, preview, download, remove |
| `js/views/_store.js` | State, save queue, storage connection, lazy patient loading |
| `js/views/_visit-form-schema.js` | Visit form definition: sections and fields |
| `js/views/_visit-describe.js` | The one place that knows how to read visit data (filled?, readable text, timelines) |
| `js/views/view-visit-form.js`, `_form-toolbar.js` | Visit form: field list on the left, journal of entries on the right |
| `js/views/_patient-doc.js` | The patient document (what gets saved) |
| `js/views/_sheet-model.js` | Spreadsheet layout shared by Google Sheets and XLSX |
| `js/views/_google-auth.js` | One Google sign-in for Drive and Calendar, plus the shared API call helper |
| `js/views/_storage-gdrive.js`, `_storage-local.js` | Storage backends with the same contract |
| `js/views/_calendar-api.js` | Appointments: Google Calendar backend and a browser-only one |
| `js/views/view-calendar.js` | Calendar page (home and per patient) with the booking panel |
| `js/views/_holidays-pl.js` | Polish public holidays, computed locally |

### Data model

The visit is the single source of truth. Everything clinical is entered in a visit and stored inside it:

- `visit.data._raw`: field values keyed `section.field` (`…__notes` for field notes, `section.__comment` for the section comment). Recommendations are the field `zalecenia.tresc`.
- `visit.data.meds`, `visit.data.diagnoses`.
- `visit.data.tests`: results of questionnaires run from that visit.
- `visit.data.docs`: `[{ id, name, size }]`, the files attached in that visit. The files themselves sit in the patient's `dokumenty/` folder; `id` is the Drive file ID (the file name in a local folder).

Leki, Testy, Zalecenia, Plan leczenia, Diagnozy, Parametry and Dokumenty are read-only extracts computed from visits (`*Timeline` in `_visit-describe.js`, rendered by `view-extracts.js`). Every row starts with the visit's date and type, and clicking it opens that visit. Deleting a visit removes everything entered in it; attached files stay in the folder and show up in Dokumenty as "bez wizyty".

"Bez wizyty" also covers test results and recommendations saved before they moved into visits (`doc.tests`, `doc.recommendations`). Nothing creates such records any more; the extracts list them last and let the therapist delete them.

A questionnaire runs on its own screen (`#/tests/run/:code?visit=:id`) and writes its result into the visit with `Store.addVisitTest`. Starting one from a brand-new visit creates that visit first.

Adding a field type means touching three places: the schema, `_visit-describe.js` (filled / text), and the editor + read renderer in `view-visit-form.js`. `tools/test-patient-doc.mjs` fills every schema field and fails if one is not described.

### Visit form state

`raw` and `data` in `renderVisitForm` are the form's state. Every `input`/`change` copies control values into `raw` synchronously; the screen always renders from `raw`; the Store write is delayed. Do not go back to scraping the DOM on a timer: that caused four separate "value disappears" bugs. Views with `data-live="true"` are not re-rendered on Store changes and get `psyTeardown()` before they leave the screen.

### Storage

One patient = one document (`buildPatientDoc`). In storage it is a spreadsheet with readable tabs (Pacjent, Wizyty, Leki, Diagnozy, Parametry, Plan leczenia, Zalecenia, Testy, Dokumenty) plus a hidden `_dane` tab holding the document as JSON in chunks. The app only ever reads `_dane`; readable tabs are regenerated on every save and exist so the therapist keeps usable data without the app. Never parse the readable tabs back.

- **Google Drive (the product):** `pacjenci/` → one folder per patient → Google Sheet + `dokumenty/`. The patient list comes from Drive file `appProperties` in a single request; a patient's sheet is read on first open. A save is one atomic `spreadsheets.batchUpdate`. Small app settings (such as the calendar ID) live in the root folder's `appProperties`, so they follow the therapist across devices.
- **Local folder:** same layout with `pacjent.xlsx`; Chrome/Edge desktop only. Kept for testing and offline use.
- **Demo mode:** sample data in `localStorage`. Once storage is connected, patient data is not copied to the browser.

Unsaved patients stay queued on any failure and are retried; expired Google sessions need a user click ("Połącz ponownie"). A patient whose document is not loaded is never written.

### Calendar

An appointment is not a visit note. The calendar holds the schedule (who, when, visit type, paid or not); the note is still the visit in the patient's sheet. They are linked both ways: the event stores `visitId`, the visit stores `calendarEventId`. "Napisz notatkę" on an appointment opens the visit form with date, time and type filled in. Payment status is kept in step in both directions.

- **With Google Drive connected:** appointments are events in a separate Google calendar, "PsychoApp — wizyty", created by the app. App data sits in the event's `extendedProperties.private`; the event title carries name, visit type, phone and payment so it reads well on a phone. Events added or moved in Google Calendar itself show up in the app.
- **Demo / local folder:** appointments are kept in this browser only.
- **Busy blocks:** the therapist's main calendar is queried for free/busy only, never titles. This is a separate, optional permission, switched on from a link above the calendar or in Settings.
- **Holidays** are computed in code, not read from Google.
- On a patient's calendar, everything except that patient's appointments is drawn as background, so the list view shows only their appointments.

The `events` function given to FullCalendar must not be `async`: FullCalendar treats a returned promise as a second result and throws if the view was closed mid-load.

## Google setup (owner's Google Cloud project "Test Google Drive")

The OAuth client ID is in `js/views/_config.js` and can be overridden in Settings. It is public by nature. `client_secret_*.json` is not used by the app and must never be committed or referenced from the front end.

1. Enable **Google Drive API**, **Google Sheets API** and **Google Calendar API**.
2. OAuth client (type "Web application") → **Authorized JavaScript origins**: `https://sturmov.github.io` and, for local testing, `http://localhost:8123`.
3. Data access (scopes). Only the first is required for the app to work:
   - `…/auth/drive.file`: only files the app created.
   - `…/auth/calendar.app.created`: only the calendar the app created (Google lists it as non-sensitive).
   - `…/auth/calendar.freebusy`: busy/free times of the main calendar.
4. The consent screen is in production. With these scopes no Google review has been needed.

### Permissions are asked for one at a time

When several scopes are requested together, Google shows a checkbox per scope and leaves them unticked, so a therapist who just clicks "Continue" ends up without the calendar. `_google-auth.js` therefore never asks for two new permissions in one popup:

- Connecting asks for Drive only. If the calendar is not enabled yet, the start screen stays up and offers it as step 2 ("Włącz Kalendarz Google", or "Pomiń"); enabling there also creates the app's calendar, so an API problem shows up during setup.
- "Włącz Kalendarz Google" (start screen, above the calendar, or in Settings) asks for `calendar.app.created` only; the free/busy link asks for `calendar.freebusy` only. The token Google returns also covers what was granted earlier (`include_granted_scopes`).
- The names of granted optional scopes are remembered in `localStorage` (`psy-new:googleExtras`, no token), so later sign-ins request them together and Google has nothing left to ask. On a new device the first Drive token already carries them.
- A 403 "insufficient scopes" from the Calendar API brings back the enable button instead of an error. A 403 "API not enabled" is reported in plain words.

Settings shows which permissions the current token has. That, and the `[google] zgody: …` line in the browser console, are the first things to check when a therapist reports that the calendar does not work.

### Reloading the page

The access token (valid about an hour) is kept in the tab's `sessionStorage` (`psy-new:googleSession`), so F5 returns straight to the app: `Store.restoreStorage()` → `backend.resume()` checks the token with one Drive call and never opens a popup. A new tab, a closed tab or an expired token still needs one click on the start screen, because a browser only allows the Google popup after a click and an app without a server cannot renew a token any other way. The token is never written to `localStorage`, and disconnecting removes it.

## Product decisions in force

- Home page is the calendar; the patient list is the tab next to it. The topbar 📅 button returns home.
- Sidebar, text only: "+ Nowa wizyta", Historia wizyt, Kalendarz, then the seven visit extracts in the client's order. The extracts are read-only: data is entered only in a visit (owner's decision, October 2026).
- In the visit form the sidebar narrows to short whole words in small type (`short` in `_menu.js`), with the full name as a tooltip. No icons: the client rejected abbreviations ("HW", "Zal") as unreadable in May 2026, and the owner rejected the emoji icons that replaced them as too loud in October 2026.
- "Dane identyfikacyjne" is not in the sidebar. Clicking the patient's name on the top bar opens it (`#/patient-data`).
- Tests and files always belong to a visit. Something that arrives between appointments (a scan by email) goes into a "Kontakt mailowy" or "Notatka administracyjna" visit.
- Notifications appear bottom-right, so they never cover the top bar.
- Six visit types; only `first_meeting` opens the full interview form.
- No "Save" buttons; autosave everywhere. Modals only for confirmations. The one exception is booking: an appointment is created by an explicit "Umów wizytę".
- Visit form: filled fields read as a finished note; click to edit; one entry in edit at a time; leaving returns it to read mode. Section headings stay visually quiet.
- Visit form on a small screen: the header is one line and the form fills the window to the bottom (flex layout under `.psy-new-shell--form-mode`, no pixel offsets). In the field list all sections are expanded by default (the client's requirement). Each section title carries the same dot as a field (green as soon as any field in the section is filled; the client asked for it) and a filled / total count. "Zwiń do listy sekcji" collapses the list on demand so all 19 sections of a first visit fit on 1366×768. The smoke test asserts all of this.
- "Szukaj tematu…" above the field list narrows it to fields whose name, section, pick-list options or `keywords` start a word with the typed text, ignoring case and Polish diacritics ("waga" finds Waga, not "uwaga"). A hit found through an option shows which one. Enter or a click opens the field and restores the full list. It searches the form's structure, not what was typed into the note.
- A suggestion list (meds, ICD-10) may extend past its entry card: the entry in edit mode has `overflow: visible` and the note scrolls the list into view. Do not put `overflow: hidden` back on it.
- Meds are entered fresh on every visit (no carry-over from the previous one). Brand name without brackets; substance, group and max dose read-only from the dictionary; dose is a number in the max dose's unit.
- Diagnosis is one `code — description` field; date and author come from the visit.
- Appointments show full name, visit type, phone and paid / not paid (owner's choice). No email invitations to patients.
- Compact layout is the default (`theme--compact`), target 1366×768; tablets are supported in both orientations (`css/responsive.css`).
- Patients are archived, never deleted from the UI.

## Not done yet

- **Attachments:** files can be added and removed in a visit but not renamed, and a file "bez wizyty" cannot be assigned to a visit afterwards.
- **ICD-10:** dictionary has about 80 codes; the client wants all of them. `extendIcd10Dict()` exists; a full list still has to be sourced and loaded.
- **Calendar:** Google Meet links for online sessions (wanted later); recurring appointments.
- **Deferred by the client:** closing a visit and required fields; marking fields as more / less important.
- **Not started:** practitioner profile (auto-fill "Lekarz prowadzący" / "Placówka"), document generation (zaświadczenie, skierowanie), more test questionnaires.
- Large uploads to Drive use a single multipart request; very large files may need resumable upload.
