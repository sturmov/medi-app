# PsychoApp

Clinical documentation app for one therapist (psychologist / psychiatrist). Static site, no backend, no build step. Deployed from `main` to GitHub Pages (`https://sturmov.github.io/medi-app/`), so **pushing `main` is a release**.

UI text and code comments are Polish. Requirements come from the client through the product owner; the source notes are in `docs/` (`REQUIREMENTS_*.md`, `VISIT_FORM_SPEC.md`, `PAcjent.txt`, `notatki.txt`). Older plans and the previous tool's rules are in `docs/archive/` and describe an architecture that no longer exists.

## Run and test

```bash
node tools/serve.mjs            # http://localhost:8123  (no Python on the dev machine)
node tools/test-patient-doc.mjs # data layer: every form field survives save → load
node tools/smoke-test.mjs       # real browser: demo | gdrive | local scenarios
```

`node --check` is not evidence that anything works; it has passed on files the browser refused to parse. A change is done when `tools/smoke-test.mjs` passes and, for UI work, you have looked at the screenshots it writes to `tools/.smoke/`. The smoke test needs Chrome or Edge (override with `CHROME_PATH`) and no npm packages.

The `gdrive` scenario runs against a local stand-in for Google's APIs (`tools/lib/google-mock.mjs`). It proves the app's logic, not Google's behaviour. Request shapes were checked against Google's discovery documents, but anything touching `_storage-gdrive.js` should also be tried once against a real account.

## Architecture

Vanilla ES modules and DOM (`el()` from `js/views/_dom.js`). Lit is used only by the toast component.

| File | Role |
|---|---|
| `js/app-new.js` | Hash router, shell (topbar, sidebar), list views |
| `js/views/_store.js` | State, save queue, storage connection, lazy patient loading |
| `js/views/_visit-form-schema.js` | Visit form definition: sections and fields |
| `js/views/_visit-describe.js` | The one place that knows how to read visit data (filled?, readable text, timelines) |
| `js/views/view-visit-form.js`, `_form-toolbar.js` | Visit form: field list on the left, journal of entries on the right |
| `js/views/_patient-doc.js` | The patient document (what gets saved) |
| `js/views/_sheet-model.js` | Spreadsheet layout shared by Google Sheets and XLSX |
| `js/views/_storage-gdrive.js`, `_storage-local.js` | Storage backends with the same contract |

### Data model

The visit is the single source of truth. Meds and diagnoses live inside the visit (`visit.data.meds`, `visit.data.diagnoses`); field values live in `visit.data._raw` keyed `section.field` (`…__notes` for field notes, `section.__comment` for the section comment). Leki, Diagnozy, Parametry and Plan leczenia are read-only timelines computed from visits. Deleting a visit therefore removes everything entered in it.

Adding a field type means touching three places: the schema, `_visit-describe.js` (filled / text), and the editor + read renderer in `view-visit-form.js`. `tools/test-patient-doc.mjs` fills every schema field and fails if one is not described.

### Visit form state

`raw` and `data` in `renderVisitForm` are the form's state. Every `input`/`change` copies control values into `raw` synchronously; the screen always renders from `raw`; the Store write is delayed. Do not go back to scraping the DOM on a timer: that caused four separate "value disappears" bugs. Views with `data-live="true"` are not re-rendered on Store changes and get `psyTeardown()` before they leave the screen.

### Storage

One patient = one document (`buildPatientDoc`). In storage it is a spreadsheet with readable tabs (Pacjent, Wizyty, Leki, Diagnozy, Parametry, Plan leczenia, Zalecenia, Testy) plus a hidden `_dane` tab holding the document as JSON in chunks. The app only ever reads `_dane`; readable tabs are regenerated on every save and exist so the therapist keeps usable data without the app. Never parse the readable tabs back.

- **Google Drive (the product):** `pacjenci/` → one folder per patient → Google Sheet + `dokumenty/`. Scope is `drive.file` only (the app sees just the files it created). The patient list comes from Drive file `appProperties` in a single request; a patient's sheet is read on first open. A save is one atomic `spreadsheets.batchUpdate`.
- **Local folder:** same layout with `pacjent.xlsx`; Chrome/Edge desktop only. Kept for testing and offline use.
- **Demo mode:** sample data in `localStorage`. Once storage is connected, patient data is not copied to the browser.

Unsaved patients stay queued on any failure and are retried; expired Google sessions need a user click ("Połącz ponownie"). A patient whose document is not loaded is never written.

## Google setup (owner's Google Cloud project)

The OAuth client ID is in `js/views/_config.js` and can be overridden in Settings. It is public by nature. `client_secret_*.json` is not used by the app and must never be committed or referenced from the front end.

1. Enable **Google Drive API** and **Google Sheets API** in the project.
2. OAuth client (type "Web application") → **Authorized JavaScript origins**: `https://sturmov.github.io` and, for local testing, `http://localhost:8123`.
3. OAuth consent screen: scope `…/auth/drive.file`. While the app is in "Testing", each therapist's Google account must be added under Test users.

## Product decisions in force

- Sidebar: 10 items in the client's order, text only (icons only when the sidebar narrows in the visit form).
- Six visit types; only `first_meeting` opens the full interview form.
- No "Save" buttons; autosave everywhere. Modals only for confirmations.
- Visit form: filled fields read as a finished note; click to edit; one entry in edit at a time; leaving returns it to read mode. Section headings stay visually quiet.
- Meds are entered fresh on every visit (no carry-over from the previous one). Brand name without brackets; substance, group and max dose read-only from the dictionary; dose is a number in the max dose's unit.
- Diagnosis is one `code — description` field; date and author come from the visit.
- Compact layout is the default (`theme--compact`), target 1366×768.
- Patients are archived, never deleted from the UI.

## Not done yet

- **Zalecenia:** the page still lists standalone records and nothing in the visit form creates them. Waiting for a product decision on where they come from.
- **ICD-10:** dictionary has about 80 codes; the client wants all of them. `extendIcd10Dict()` exists; a full list still has to be sourced and loaded.
- **Deferred by the client:** closing a visit and required fields; marking fields as more / less important.
- **Not started:** practitioner profile (auto-fill "Lekarz prowadzący" / "Placówka"), document generation (zaświadczenie, skierowanie), more test questionnaires, calendar integration.
- Large uploads to Drive use a single multipart request; very large files may need resumable upload.
