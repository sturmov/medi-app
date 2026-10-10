# PsychoApp

Clinical documentation app for one therapist (psychologist / psychiatrist). Static site, no backend, no build step. Deployed from `main` to GitHub Pages (`https://sturmov.github.io/medi-app/`), so **pushing `main` is a release**.

UI text and code comments are Polish. Requirements come from the client through the product owner; the source notes are in `docs/` (`REQUIREMENTS_*.md`, `VISIT_FORM_SPEC.md`, `PAcjent.txt`, `notatki.txt`). Older plans and the previous tool's rules are in `docs/archive/` and describe an architecture that no longer exists.

## Run and test

```bash
node tools/serve.mjs            # http://localhost:8123  (no Python on the dev machine)
node tools/test-patient-doc.mjs # data layer: every form field survives save → load; holidays
node tools/smoke-test.mjs       # real browser: demo | calendar | gdrive | local scenarios
```

`node --check` is not evidence that anything works; it has passed on files the browser refused to parse. A change is done when `tools/smoke-test.mjs` passes and, for UI work, you have looked at the screenshots it writes to `tools/.smoke/`. The smoke test needs Chrome or Edge (override with `CHROME_PATH`) and no npm packages.

The `gdrive` scenario runs against a local stand-in for Google's APIs (`tools/lib/google-mock.mjs`: Drive, Sheets, Calendar). It proves the app's logic, not Google's behaviour. Request shapes were checked against Google's discovery documents, but anything touching `_storage-gdrive.js` or `_calendar-api.js` should also be tried once against a real account.

## Architecture

Vanilla ES modules and DOM (`el()` from `js/views/_dom.js`). Lit is used only by the toast component. The calendar grid is FullCalendar (MIT), vendored in `lib/fullcalendar/` and loaded on first use.

| File | Role |
|---|---|
| `js/app-new.js` | Hash router, shell (topbar, sidebar), list views |
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

The visit is the single source of truth. Meds and diagnoses live inside the visit (`visit.data.meds`, `visit.data.diagnoses`); field values live in `visit.data._raw` keyed `section.field` (`…__notes` for field notes, `section.__comment` for the section comment). Leki, Diagnozy, Parametry and Plan leczenia are read-only timelines computed from visits. Deleting a visit therefore removes everything entered in it.

Adding a field type means touching three places: the schema, `_visit-describe.js` (filled / text), and the editor + read renderer in `view-visit-form.js`. `tools/test-patient-doc.mjs` fills every schema field and fails if one is not described.

### Visit form state

`raw` and `data` in `renderVisitForm` are the form's state. Every `input`/`change` copies control values into `raw` synchronously; the screen always renders from `raw`; the Store write is delayed. Do not go back to scraping the DOM on a timer: that caused four separate "value disappears" bugs. Views with `data-live="true"` are not re-rendered on Store changes and get `psyTeardown()` before they leave the screen.

### Storage

One patient = one document (`buildPatientDoc`). In storage it is a spreadsheet with readable tabs (Pacjent, Wizyty, Leki, Diagnozy, Parametry, Plan leczenia, Zalecenia, Testy) plus a hidden `_dane` tab holding the document as JSON in chunks. The app only ever reads `_dane`; readable tabs are regenerated on every save and exist so the therapist keeps usable data without the app. Never parse the readable tabs back.

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
- Sidebar: the client's 10 items in her order, text only (icons only when the sidebar narrows in the visit form), plus "Kalendarz" for the selected patient.
- Six visit types; only `first_meeting` opens the full interview form.
- No "Save" buttons; autosave everywhere. Modals only for confirmations. The one exception is booking: an appointment is created by an explicit "Umów wizytę".
- Visit form: filled fields read as a finished note; click to edit; one entry in edit at a time; leaving returns it to read mode. Section headings stay visually quiet.
- Meds are entered fresh on every visit (no carry-over from the previous one). Brand name without brackets; substance, group and max dose read-only from the dictionary; dose is a number in the max dose's unit.
- Diagnosis is one `code — description` field; date and author come from the visit.
- Appointments show full name, visit type, phone and paid / not paid (owner's choice). No email invitations to patients.
- Compact layout is the default (`theme--compact`), target 1366×768; tablets are supported in both orientations (`css/responsive.css`).
- Patients are archived, never deleted from the UI.

## Not done yet

- **Zalecenia:** the page still lists standalone records and nothing in the visit form creates them. Waiting for a product decision on where they come from.
- **ICD-10:** dictionary has about 80 codes; the client wants all of them. `extendIcd10Dict()` exists; a full list still has to be sourced and loaded.
- **Calendar:** Google Meet links for online sessions (wanted later); recurring appointments.
- **Deferred by the client:** closing a visit and required fields; marking fields as more / less important.
- **Not started:** practitioner profile (auto-fill "Lekarz prowadzący" / "Placówka"), document generation (zaświadczenie, skierowanie), more test questionnaires.
- Large uploads to Drive use a single multipart request; very large files may need resumable upload.
