// ============================================================================
// _xlsx-codec.js — Read/Write pliku `pacjent.xlsx` w formacie PsychoApp v1.
//
// Paczka K1 (2026-05-11):
//   Konwersja FullPatient ↔ ArrayBuffer XLSX z PEŁNĄ stylizacją:
//   merged cells, kolory (granat header, niebieski section, jasny label),
//   ramki, autofiltry, freeze panes, szerokości kolumn.
//
// Bazuje na globalnym `XLSX` z `lib/xlsx-js-style.min.js` (załadowany jako
// klasyczny <script> w index.html — z forka SheetJS z pełnym wsparciem styli).
//
// Czyste funkcje — bez I/O, bez Store. Wszystkie operacje na pliku
// (download / save do folderu) są w `_local-folder-store.js` (paczka K2).
//
// Eksportuje:
//   writePatientWorkbook(fullPatient) → ArrayBuffer
//   downloadPatientWorkbook(fullPatient, fileName) — wygodne dla testów K1
//   buildFullPatient(patient, visits, meds, diagnoses, recs, tests) → FullPatient
//
// Architektura:
//   _styles               — paleta styli (header, section, label, cell, altCell, ...)
//   _styleCell(ws, addr)  — przypisz styl do komórki
//   _styleRange(ws, ...)  — przypisz styl do prostokątnego zakresu
//   _addMerge(ws, ...)    — dodaj merged-cell range
//   _buildPacjentSheet    — 7 sekcji w 1 zakładce (KV + 1 tabela)
//   _buildWizytySheet     — akapity drzewkowe (1 wizyta = 1 blok)
//   _buildTableSheet      — generic table builder (Leki/Diagnozy/Zalecenia/...)
//   _buildPlanSheet       — tabela hierarchiczna (cele + zadania)
// ============================================================================

import {
    PATIENT_SECTIONS,
    VISIT_SHEET,
    VISIT_FIELD_LABELS,
    MEDS_SHEET,
    DIAGNOSES_SHEET,
    RECOMMENDATIONS_SHEET,
    TESTS_SHEET,
    PARAMETERS_SHEET,
    TREATMENT_PLAN_SHEET,
    STORAGE_FORMAT
} from './_storage-format.js';

// ---- helpers globalne ------------------------------------------------------

function _xlsx() {
    if (typeof globalThis.XLSX === 'undefined') {
        throw new Error('XLSX library not loaded. Add <script src="lib/xlsx-js-style.min.js"></script> before app-new.js.');
    }
    return globalThis.XLSX;
}

function _cellAddr(r, c) {
    return _xlsx().utils.encode_cell({ r, c });
}

function _decodeRef(ref) {
    return _xlsx().utils.decode_range(ref);
}

// =============================================================================
// PALETA STYLI (skopiowana z xlsx-handler.js + nowy "section" dla mergedów)
// =============================================================================

const COLORS = {
    headerBg:        '1F4E78',  // granat (nagłówek całej zakładki)
    headerFg:        'FFFFFF',
    sectionBg:       '2E75B6',  // niebieski (nagłówki sekcji w `Pacjent`)
    sectionFg:       'FFFFFF',
    visitHeaderBg:   '3B82F6',  // jasnoniebieski (header bloku wizyty, zapłaconej)
    visitHeaderFg:   'FFFFFF',
    visitUnpaidBg:   'F59E0B',  // pomarańczowy (header bloku wizyty, niezapłaconej)
    subsectionBg:    'E8EEF7',  // jasnoszary z błękitem (podsekcja w wizycie)
    labelBg:         'E8EEF7',  // jasnoniebieski tło dla kolumny etykiet w KV
    labelFg:         '1F2937',
    cellBg:          'FFFFFF',
    altCellBg:       'F9FAFB',
    borderColor:     'D1D5DB'
};

const _border = {
    top:    { style: 'thin', color: { rgb: COLORS.borderColor } },
    bottom: { style: 'thin', color: { rgb: COLORS.borderColor } },
    left:   { style: 'thin', color: { rgb: COLORS.borderColor } },
    right:  { style: 'thin', color: { rgb: COLORS.borderColor } }
};

const _STYLES = {
    header: {
        font: { bold: true, color: { rgb: COLORS.headerFg }, sz: 12 },
        fill: { fgColor: { rgb: COLORS.headerBg } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: _border
    },
    section: {
        font: { bold: true, color: { rgb: COLORS.sectionFg }, sz: 11 },
        fill: { fgColor: { rgb: COLORS.sectionBg } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: _border
    },
    subsection: {
        font: { bold: true, color: { rgb: COLORS.labelFg }, sz: 11 },
        fill: { fgColor: { rgb: COLORS.subsectionBg } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: _border
    },
    visitHeader: {
        font: { bold: true, color: { rgb: COLORS.visitHeaderFg }, sz: 12 },
        fill: { fgColor: { rgb: COLORS.visitHeaderBg } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: _border
    },
    visitHeaderUnpaid: {
        font: { bold: true, color: { rgb: '7C2D12' }, sz: 12 },
        fill: { fgColor: { rgb: 'FEF3C7' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: _border
    },
    label: {
        font: { bold: true, color: { rgb: COLORS.labelFg } },
        fill: { fgColor: { rgb: COLORS.labelBg } },
        alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
        border: _border
    },
    cell: {
        font: { color: { rgb: '0F172A' } },
        alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
        border: _border
    },
    altCell: {
        font: { color: { rgb: '0F172A' } },
        fill: { fgColor: { rgb: COLORS.altCellBg } },
        alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
        border: _border
    },
    boolTrue: {
        font: { bold: true, color: { rgb: '065F46' } },
        fill: { fgColor: { rgb: 'D1FAE5' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: _border
    },
    boolFalse: {
        font: { color: { rgb: '6B7280' } },
        fill: { fgColor: { rgb: 'F3F4F6' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: _border
    },
    empty: {
        font: { italic: true, color: { rgb: '9CA3AF' } },
        alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
        border: _border
    }
};

// =============================================================================
// HELPERY DO STYLOWANIA
// =============================================================================

function _ensureCell(ws, addr) {
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    return ws[addr];
}

function _styleCell(ws, addr, style) {
    const c = _ensureCell(ws, addr);
    c.s = style;
}

function _styleRange(ws, r1, c1, r2, c2, style) {
    for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
            _styleCell(ws, _cellAddr(r, c), style);
        }
    }
}

function _addMerge(ws, r1, c1, r2, c2) {
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
}

function _setCols(ws, widths) {
    ws['!cols'] = widths.map((w) => ({ wch: w }));
}

function _setRowHeight(ws, r, hpt) {
    if (!ws['!rows']) ws['!rows'] = [];
    ws['!rows'][r] = { hpt };
}

function _setFreezeTopRow(ws) {
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
    // xlsx-js-style nie zawsze respektuje `!freeze`; alternatywnie:
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'][0] = { state: 'frozen', ySplit: 1 };
}

// =============================================================================
// KONWERSJA WARTOŚCI → KOMÓRKA
// =============================================================================

function _toCellValue(val, type) {
    if (val == null || val === '') return '';
    if (type === 'boolean' || typeof val === 'boolean') {
        return val === true || val === 'true' ? 'TAK' : 'NIE';
    }
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object') {
        try { return JSON.stringify(val); } catch (_) { return ''; }
    }
    return String(val);
}

function _isEmpty(val) {
    if (val == null || val === '') return true;
    if (Array.isArray(val) && val.length === 0) return true;
    return false;
}

// =============================================================================
// BUILDER: zakładka „Pacjent" (7 sekcji w 1 zakładce)
// =============================================================================

function _buildPacjentSheet(patient) {
    const XLSX = _xlsx();
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Szerokości kolumn: A=40 (etykieta) B=60 (wartość lub start tabeli)
    // Dla tabeli OsobyUpoważnione potrzebujemy 4 kolumn → A=22, B=32, C=20, D=30
    _setCols(ws, [40, 32, 20, 30]);

    let row = 0;

    // === TYTUŁ ZAKŁADKI ===
    const fullName = [patient.imie, patient.drugieImie, patient.nazwisko]
        .filter(Boolean).join(' ').trim() || 'Pacjent bez nazwiska';
    XLSX.utils.sheet_add_aoa(ws, [[`KARTA PACJENTA — ${fullName}`]], { origin: _cellAddr(row, 0) });
    _addMerge(ws, row, 0, row, 3);
    _styleRange(ws, row, 0, row, 3, _STYLES.header);
    _setRowHeight(ws, row, 26);
    row++;

    // === Sekcje (z PATIENT_SECTIONS) ===
    for (const section of PATIENT_SECTIONS) {
        // pusta linia separator
        row++;

        // nagłówek sekcji (merged A:D)
        XLSX.utils.sheet_add_aoa(ws, [[section.title]], { origin: _cellAddr(row, 0) });
        _addMerge(ws, row, 0, row, 3);
        _styleRange(ws, row, 0, row, 3, _STYLES.section);
        _setRowHeight(ws, row, 22);
        row++;

        if (section.format === 'kv') {
            for (const f of section.fields) {
                const val = patient ? patient[f.key] : '';
                XLSX.utils.sheet_add_aoa(ws, [[f.label, _toCellValue(val, f.type)]], { origin: _cellAddr(row, 0) });
                // Merge wartości przez kolumny B:D, żeby długie textarea się rozciągały
                _addMerge(ws, row, 1, row, 3);
                _styleCell(ws, _cellAddr(row, 0), _STYLES.label);

                // Dla boolean — kolorowanie wartości
                if (f.type === 'boolean') {
                    _styleRange(ws, row, 1, row, 3, val === true ? _STYLES.boolTrue : _STYLES.boolFalse);
                } else if (_isEmpty(val)) {
                    _styleRange(ws, row, 1, row, 3, _STYLES.empty);
                    // dla pustych pól wstaw placeholder
                    _ensureCell(ws, _cellAddr(row, 1)).v = '—';
                } else {
                    _styleRange(ws, row, 1, row, 3, _STYLES.cell);
                }

                // Dla textarea — wyższy wiersz
                if (f.type === 'textarea' && !_isEmpty(val)) {
                    _setRowHeight(ws, row, 40);
                }
                row++;
            }
        }

        if (section.format === 'table-from-fields') {
            // Header tabeli
            const headers = section.columns.map((c) => c.label);
            XLSX.utils.sheet_add_aoa(ws, [headers], { origin: _cellAddr(row, 0) });
            _styleRange(ws, row, 0, row, headers.length - 1, _STYLES.header);
            _setRowHeight(ws, row, 22);
            row++;

            // Wiersze tabeli — generowane z pól patient.matka*/ojciec*/kontaktNagly*
            for (let i = 0; i < section.rows.length; i++) {
                const def = section.rows[i];
                const fullName = patient[def.imieField] || '';
                const tel = patient[def.telefonField] || '';
                const fourth = patient[def.emailField || def.relacjaField] || '';

                XLSX.utils.sheet_add_aoa(ws, [[def.relacja, fullName, tel, fourth]],
                    { origin: _cellAddr(row, 0) });

                const styleRow = i % 2 === 0 ? _STYLES.cell : _STYLES.altCell;
                _styleCell(ws, _cellAddr(row, 0), _STYLES.label);
                _styleRange(ws, row, 1, row, 3, styleRow);
                row++;
            }
        }
    }

    // Update !ref (na wypadek gdyby sheet_add_aoa pominął)
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row - 1, c: 3 } });

    _setFreezeTopRow(ws);
    return ws;
}

// =============================================================================
// BUILDER: zakładka „Wizyty" — akapity drzewkowe
// =============================================================================

function _buildWizytySheet(visits, patient) {
    const XLSX = _xlsx();
    const ws = XLSX.utils.aoa_to_sheet([]);

    _setCols(ws, [40, 60]);   // A=etykieta, B=wartość (merged B:C dla long values)

    let row = 0;

    // Tytuł zakładki
    const fullName = [patient.imie, patient.nazwisko].filter(Boolean).join(' ');
    const visitCount = visits.length;
    XLSX.utils.sheet_add_aoa(ws, [[`HISTORIA WIZYT — ${fullName} (${visitCount} ${visitCount === 1 ? 'wizyta' : 'wizyt'})`]],
        { origin: _cellAddr(row, 0) });
    _addMerge(ws, row, 0, row, 1);
    _styleRange(ws, row, 0, row, 1, _STYLES.header);
    _setRowHeight(ws, row, 26);
    row++;

    if (visits.length === 0) {
        row++;
        XLSX.utils.sheet_add_aoa(ws, [['(brak wizyt)']], { origin: _cellAddr(row, 0) });
        _addMerge(ws, row, 0, row, 1);
        _styleRange(ws, row, 0, row, 1, _STYLES.empty);
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 1 } });
        _setFreezeTopRow(ws);
        return ws;
    }

    // Sortowanie od najnowszej do najstarszej (jak w UI)
    const sorted = [...visits].sort((a, b) =>
        ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || ''))
    );

    for (const v of sorted) {
        row++; // separator (pusty wiersz)

        // === HEADER BLOKU WIZYTY ===
        const headerStyle = v.paid ? _STYLES.visitHeader : _STYLES.visitHeaderUnpaid;
        const paidLabel = v.paid ? '✓ ZAPŁACONO' : '☐ NIE ZAPŁACONO';
        const blockHeader = `${v.id} · ${v.type} · ${v.date || '—'}${v.time ? ' ' + v.time : ''}` +
            ` · ${v.duration || '—'} min · ${paidLabel}`;
        XLSX.utils.sheet_add_aoa(ws, [[blockHeader]], { origin: _cellAddr(row, 0) });
        _addMerge(ws, row, 0, row, 1);
        _styleRange(ws, row, 0, row, 1, headerStyle);
        _setRowHeight(ws, row, 24);
        row++;

        // === SEKCJA: Dane wizyty ===
        XLSX.utils.sheet_add_aoa(ws, [['Dane wizyty']], { origin: _cellAddr(row, 0) });
        _addMerge(ws, row, 0, row, 1);
        _styleRange(ws, row, 0, row, 1, _STYLES.subsection);
        row++;

        const metaPairs = [
            ['ID wizyty', v.id],
            ['Typ wizyty', v.type || ''],
            ['Data', v.date || ''],
            ['Godzina rozpoczęcia', v.time || ''],
            ['Czas trwania (min)', v.duration || ''],
            ['Zapłacono', v.paid === true],
            ['Podsumowanie (skrót)', v.summary || '']
        ];

        for (let i = 0; i < metaPairs.length; i++) {
            const [label, value] = metaPairs[i];
            const isBool = typeof value === 'boolean';
            XLSX.utils.sheet_add_aoa(ws, [[label, _toCellValue(value)]], { origin: _cellAddr(row, 0) });
            _styleCell(ws, _cellAddr(row, 0), _STYLES.label);
            if (isBool) {
                _styleCell(ws, _cellAddr(row, 1), value ? _STYLES.boolTrue : _STYLES.boolFalse);
            } else if (_isEmpty(value)) {
                _styleCell(ws, _cellAddr(row, 1), _STYLES.empty);
                _ensureCell(ws, _cellAddr(row, 1)).v = '—';
            } else {
                _styleCell(ws, _cellAddr(row, 1), i % 2 === 0 ? _STYLES.cell : _STYLES.altCell);
            }
            row++;
        }

        // === SEKCJA: Treść notatki (z visit.data._raw, dynamic) ===
        const raw = v.data && v.data._raw;
        const entries = _extractVisitRawEntries(raw);

        if (entries.length > 0) {
            XLSX.utils.sheet_add_aoa(ws, [['Treść notatki']], { origin: _cellAddr(row, 0) });
            _addMerge(ws, row, 0, row, 1);
            _styleRange(ws, row, 0, row, 1, _STYLES.subsection);
            row++;

            for (let i = 0; i < entries.length; i++) {
                const { label, value } = entries[i];
                XLSX.utils.sheet_add_aoa(ws, [[label, value]], { origin: _cellAddr(row, 0) });
                _styleCell(ws, _cellAddr(row, 0), _STYLES.label);
                _styleCell(ws, _cellAddr(row, 1), i % 2 === 0 ? _STYLES.cell : _STYLES.altCell);
                if (String(value).length > 60) _setRowHeight(ws, row, 40);
                row++;
            }
        }
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row - 1, c: 1 } });
    _setFreezeTopRow(ws);
    return ws;
}

/**
 * Spłaszcza `visit.data._raw` do listy {label, value} — pomija puste i techniczne.
 * Reuse logiki z `_extractVisitContent` w app-new.js (DRY TODO).
 */
function _extractVisitRawEntries(raw) {
    if (!raw || typeof raw !== 'object') return [];
    const out = [];
    for (const [k, v] of Object.entries(raw)) {
        if (k === '__comment' || k === '__notes') continue;
        if (k.endsWith('.__comment') || k.endsWith('.__notes')) continue;

        // Klucz po polsku (etykieta) — najpierw mapa, potem fallback
        let key = String(k).replace(/^[a-zA-Z]+\./, '');
        const label = VISIT_FIELD_LABELS[key] || _prettifyKey(key);
        if (!label) continue;

        if (v == null) continue;
        let display = '';
        if (Array.isArray(v)) {
            if (v.length === 0) continue;
            display = v.join(', ');
        } else if (typeof v === 'boolean') {
            display = v ? 'TAK' : 'NIE';
        } else {
            display = String(v).trim();
            if (!display) continue;
        }
        out.push({ label, value: display });
    }
    return out;
}

function _prettifyKey(key) {
    return key.replace(/([A-Z])/g, ' $1')
              .replace(/[_-]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .replace(/^\w/, (c) => c.toUpperCase());
}

// =============================================================================
// BUILDER: tabela generyczna (Leki/Diagnozy/Zalecenia/Testy/Parametry)
// =============================================================================

function _buildTableSheet(rows, schema, opts = {}) {
    const XLSX = _xlsx();
    const ws = XLSX.utils.aoa_to_sheet([]);
    const cols = schema.columns;

    _setCols(ws, cols.map((c) => c.width || 16));

    let r = 0;

    // Opcjonalny tytuł zakładki (merged)
    if (opts.titleLabel) {
        XLSX.utils.sheet_add_aoa(ws, [[opts.titleLabel]], { origin: _cellAddr(r, 0) });
        _addMerge(ws, r, 0, r, cols.length - 1);
        _styleRange(ws, r, 0, r, cols.length - 1, _STYLES.header);
        _setRowHeight(ws, r, 26);
        r++;
        r++; // separator
    }

    // Header tabeli
    const headerRowIdx = r;
    XLSX.utils.sheet_add_aoa(ws, [cols.map((c) => c.label)], { origin: _cellAddr(r, 0) });
    _styleRange(ws, r, 0, r, cols.length - 1, _STYLES.header);
    _setRowHeight(ws, r, 22);
    r++;

    if (!Array.isArray(rows) || rows.length === 0) {
        XLSX.utils.sheet_add_aoa(ws, [['(brak danych)']], { origin: _cellAddr(r, 0) });
        _addMerge(ws, r, 0, r, cols.length - 1);
        _styleRange(ws, r, 0, r, cols.length - 1, _STYLES.empty);
        r++;
    } else {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i] || {};
            const cells = cols.map((c) => _toCellValue(row[c.key]));
            XLSX.utils.sheet_add_aoa(ws, [cells], { origin: _cellAddr(r, 0) });
            const altRow = i % 2 === 1;
            _styleRange(ws, r, 0, r, cols.length - 1, altRow ? _STYLES.altCell : _STYLES.cell);
            r++;
        }
    }

    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: cols.length - 1 } });

    // Autofiltr na header row
    const startAddr = _cellAddr(headerRowIdx, 0);
    const endAddr = _cellAddr(Math.max(headerRowIdx, r - 1), cols.length - 1);
    ws['!autofilter'] = { ref: `${startAddr}:${endAddr}` };

    // Freeze: zamrażamy header
    if (!ws['!views']) ws['!views'] = [];
    ws['!views'][0] = { state: 'frozen', ySplit: headerRowIdx + 1 };

    return ws;
}

// =============================================================================
// BUILDER: zakładka „PlanLeczenia" — tabela hierarchiczna
// =============================================================================

function _buildPlanSheet(treatmentPlan) {
    // Spłaszczamy strukturę {goals: [{tasks: []}]} do listy wierszy z poziomem
    const flat = [];
    const goals = (treatmentPlan && Array.isArray(treatmentPlan.goals)) ? treatmentPlan.goals : [];
    for (const g of goals) {
        flat.push({
            poziom: 'CEL',
            id: g.id || '',
            parentId: '',
            tytul: g.title || g.tytul || '',
            priorytet: g.priority || g.priorytet || '',
            done: '',
            dueDate: '',
            komentarz: g.comment || g.komentarz || ''
        });
        const tasks = Array.isArray(g.tasks) ? g.tasks : [];
        for (const t of tasks) {
            flat.push({
                poziom: 'ZADANIE',
                id: t.id || '',
                parentId: g.id || '',
                tytul: '  → ' + (t.text || t.tytul || ''),
                priorytet: '',
                done: t.done === true,
                dueDate: t.dueDate || '',
                komentarz: t.comment || ''
            });
        }
    }
    return _buildTableSheet(flat, TREATMENT_PLAN_SHEET, {
        titleLabel: 'PLAN LECZENIA — drzewo celów i zadań'
    });
}


// =============================================================================
// MAIN — buildPatientWorkbook
// =============================================================================

/**
 * Buduje pełen workbook XLSX dla pacjenta.
 *
 * @param {object} fullPatient    — { patient, visits, meds, diagnoses, recommendations, tests }
 * @returns {ArrayBuffer}         — bajty pliku XLSX gotowe do zapisu
 */
export function writePatientWorkbook(fullPatient) {
    const XLSX = _xlsx();
    const wb = XLSX.utils.book_new();
    const {
        patient = {},
        visits = [],
        meds = [],
        diagnoses = [],
        recommendations = [],
        tests = [],
        parameters = [],
        treatmentPlan = null
    } = fullPatient || {};

    // Meta (Custom Properties — round-trip wersji formatu)
    wb.Props = {
        Title: 'Karta pacjenta — ' + (patient.imie || '') + ' ' + (patient.nazwisko || ''),
        Author: STORAGE_FORMAT.appName,
        CreatedDate: new Date()
    };
    wb.Custprops = {
        psyAppVersion: STORAGE_FORMAT.version,
        psyAppName: STORAGE_FORMAT.appName,
        patientCode: patient.id || patient.kodPacjenta || ''
    };

    // 1. Pacjent
    XLSX.utils.book_append_sheet(wb, _buildPacjentSheet(patient), 'Pacjent');

    // 2. Wizyty
    XLSX.utils.book_append_sheet(wb, _buildWizytySheet(visits, patient), 'Wizyty');

    // 3. Leki
    XLSX.utils.book_append_sheet(wb, _buildTableSheet(meds, MEDS_SHEET, {
        titleLabel: 'LEKI — lista przepisanych preparatów'
    }), 'Leki');

    // 4. Testy
    XLSX.utils.book_append_sheet(wb, _buildTableSheet(tests, TESTS_SHEET, {
        titleLabel: 'TESTY — wyniki kwestionariuszy (PHQ-9, GAD-7, ...)'
    }), 'Testy');

    // 5. Zalecenia
    XLSX.utils.book_append_sheet(wb, _buildTableSheet(recommendations, RECOMMENDATIONS_SHEET, {
        titleLabel: 'ZALECENIA — działania do wykonania przez pacjenta'
    }), 'Zalecenia');

    // 6. Plan leczenia
    XLSX.utils.book_append_sheet(wb, _buildPlanSheet(treatmentPlan), 'PlanLeczenia');

    // 7. Diagnozy
    XLSX.utils.book_append_sheet(wb, _buildTableSheet(diagnoses, DIAGNOSES_SHEET, {
        titleLabel: 'DIAGNOZY — rozpoznania ICD-10'
    }), 'Diagnozy');

    // 8. Parametry
    XLSX.utils.book_append_sheet(wb, _buildTableSheet(parameters, PARAMETERS_SHEET, {
        titleLabel: 'PARAMETRY — pomiary fizyczne i kliniczne'
    }), 'Parametry');

    return XLSX.write(wb, {
        bookType: 'xlsx',
        type: 'array',
        cellStyles: true,
        compression: true
    });
}


/**
 * Konstruuje FullPatient z aktualnego stanu Store dla danego pacjenta.
 */
export function buildFullPatient(store, patientId) {
    const patient = store.state.patients.find((p) => p.id === patientId) || null;
    if (!patient) return null;
    return {
        patient,
        visits:          store.getVisits(patientId),
        meds:            store.getMeds(patientId),
        diagnoses:       store.getDiagnoses(patientId),
        recommendations: store.getRecommendations(patientId),
        tests:           store.getTests(patientId),
        parameters:      (patient.parameters && Array.isArray(patient.parameters))
                            ? patient.parameters
                            : (patient.parameters ? [patient.parameters] : []),
        treatmentPlan:   patient.treatmentPlan || null
    };
}


/**
 * Wygodny test K1: generuje plik XLSX i triggeruje download w przeglądarce.
 *
 * @param {object} fullPatient
 * @param {string} [fileName='pacjent.xlsx']
 */
export function downloadPatientWorkbook(fullPatient, fileName) {
    const buf = writePatientWorkbook(fullPatient);
    const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || _defaultFileName(fullPatient);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function _defaultFileName(fullPatient) {
    const p = (fullPatient && fullPatient.patient) || {};
    const safe = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]/g, '_');
    return (p.id || 'P000') + '_' + (safe(p.nazwisko) || 'pacjent') + '_' + (safe(p.imie) || 'bez_imienia') + '.xlsx';
}


// ============================================================================
// READER — readPatientWorkbook(arrayBuffer) → FullPatient
//
// Parser round-trip dla formatu PsychoApp v1. Tolerant: gdy klient ręcznie
// edytuje XLSX i np. usunie wiersz, parser próbuje best-effort i ostrzega.
// ============================================================================

/**
 * Czyta pełen plik pacjent.xlsx i zwraca FullPatient.
 *
 * @param {ArrayBuffer|Uint8Array} arrayBuffer
 * @returns {object}  { patient, visits, meds, diagnoses, recommendations, tests, parameters, treatmentPlan }
 */
export function readPatientWorkbook(arrayBuffer) {
    const XLSX = _xlsx();
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: false });

    const full = {
        patient: {},
        visits: [],
        meds: [],
        diagnoses: [],
        recommendations: [],
        tests: [],
        parameters: [],
        treatmentPlan: { goals: [] }
    };

    // Odczyt metadanych pliku (Custprops)
    if (wb.Custprops) {
        const v = wb.Custprops.patientCode;
        if (v) full.patient.id = String(v);
    }

    // 1. Pacjent
    if (wb.Sheets.Pacjent) {
        full.patient = { ...full.patient, ..._parsePacjentSheet(wb.Sheets.Pacjent) };
    }

    // 2. Wizyty
    if (wb.Sheets.Wizyty) {
        full.visits = _parseWizytySheet(wb.Sheets.Wizyty, full.patient.id);
    }

    // 3-8. Tabele
    const parseTableInto = (sheetName, schema, target, patientId) => {
        if (!wb.Sheets[sheetName]) return;
        const rows = _parseTableSheet(wb.Sheets[sheetName], schema);
        // Dolep patientId do każdego rekordu
        for (const r of rows) {
            if (patientId) r.patientId = patientId;
            target.push(r);
        }
    };

    parseTableInto('Leki',       MEDS_SHEET,            full.meds,            full.patient.id);
    parseTableInto('Testy',      TESTS_SHEET,           full.tests,           full.patient.id);
    parseTableInto('Zalecenia',  RECOMMENDATIONS_SHEET, full.recommendations, full.patient.id);
    parseTableInto('Diagnozy',   DIAGNOSES_SHEET,       full.diagnoses,       full.patient.id);
    parseTableInto('Parametry',  PARAMETERS_SHEET,      full.parameters,      null);

    // 6. PlanLeczenia — tabela hierarchiczna, ale spłaszczona
    if (wb.Sheets.PlanLeczenia) {
        full.treatmentPlan = _parsePlanSheet(wb.Sheets.PlanLeczenia);
    }

    return full;
}

/** Konwersja: AOA → 2D-array stringów dla danego arkusza */
function _sheetToAoa(ws) {
    const XLSX = _xlsx();
    return XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        blankrows: false,
        raw: false   // wszystko jako string (łatwiej parsować TAK/NIE/daty)
    });
}

/** Skanuje listę wierszy [label, value, ...]; gdy label pasuje do mapy, zapisuje val. */
function _readKvPairsToObject(rows, labelToKey, startIdx, endIdx) {
    const out = {};
    for (let i = startIdx; i < endIdx; i++) {
        const row = rows[i] || [];
        const label = String(row[0] || '').trim();
        if (!label) continue;
        const key = labelToKey[label];
        if (key) {
            out[key] = _denormalizeCellValue(row[1]);
        }
    }
    return out;
}

function _denormalizeCellValue(val) {
    if (val == null) return '';
    let s = String(val).trim();
    if (s === '' || s === '—') return '';
    // Boolean detection
    if (s === 'TAK' || s === 'Tak' || s === 'tak') return true;
    if (s === 'NIE' || s === 'Nie' || s === 'nie') return false;
    return s;
}

/**
 * Parser zakładki `Pacjent` — przechodzi przez sekcje (rozpoznawane po
 * merged-cell header tytułów: OGÓLNE / DODATKOWE / KONTAKT / OSOBY UPOWAŻNIONE /
 * ZGODA NA PRZETWARZANIE DANYCH (RODO) / INNE INFORMACJE / OPIEKA MEDYCZNA…)
 */
function _parsePacjentSheet(ws) {
    const rows = _sheetToAoa(ws);
    const out = {};

    // Buduj reverse-map: labelInExcel → keyInData
    const labelToKey = {};
    for (const section of PATIENT_SECTIONS) {
        if (section.fields) {
            for (const f of section.fields) labelToKey[f.label] = f.key;
        }
    }

    // Buduj listę nagłówków sekcji (case-sensitive jak w zapisie)
    const sectionTitles = PATIENT_SECTIONS.map((s) => s.title);

    // Znajdź indeksy nagłówków sekcji
    const sectionIndices = [];
    for (let i = 0; i < rows.length; i++) {
        const cell0 = String((rows[i] && rows[i][0]) || '').trim();
        if (sectionTitles.includes(cell0)) {
            sectionIndices.push({ title: cell0, idx: i });
        }
    }

    // Dla każdej sekcji odczytaj rekordy między i+1 a początkiem następnej
    for (let s = 0; s < sectionIndices.length; s++) {
        const cur = sectionIndices[s];
        const nextIdx = (s + 1 < sectionIndices.length) ? sectionIndices[s + 1].idx : rows.length;
        const section = PATIENT_SECTIONS.find((sec) => sec.title === cur.title);

        if (!section) continue;

        if (section.format === 'kv') {
            const obj = _readKvPairsToObject(rows, labelToKey, cur.idx + 1, nextIdx);
            Object.assign(out, obj);
        } else if (section.format === 'table-from-fields') {
            // Osoby upoważnione: kolumny [Relacja, Imię i nazwisko, Telefon, E-mail/Doprecyzowanie]
            // header row = cur.idx + 1, dane od cur.idx + 2
            for (let i = cur.idx + 2; i < nextIdx; i++) {
                const row = rows[i] || [];
                const relacja = String(row[0] || '').trim();
                const def = section.rows.find((r) => r.relacja === relacja);
                if (!def) continue;
                out[def.imieField] = String(row[1] || '').trim();
                out[def.telefonField] = String(row[2] || '').trim();
                const fourth = String(row[3] || '').trim();
                if (def.emailField) out[def.emailField] = fourth;
                if (def.relacjaField) out[def.relacjaField] = fourth;
            }
        }
    }

    return out;
}

/**
 * Parser zakładki `Wizyty` (akapity drzewkowe).
 * Rozpoznaje header bloku po wzorcu: "{id} · {type} · {date}[ {time}] · …"
 * Następnie sekcja "Dane wizyty" (KV) + "Treść notatki" (KV dynamic).
 */
function _parseWizytySheet(ws, patientId) {
    const rows = _sheetToAoa(ws);
    const visits = [];

    // Wzorzec: "V001 · first_meeting · 2026-05-08 14:00 · 60 min · ZAPŁACONO"
    const headerRe = /^([A-Z]\d+)\s*·\s*([^·]+?)\s*·\s*([0-9]{4}-[0-9]{2}-[0-9]{2})(?:\s+([0-9]{1,2}:[0-9]{2}))?\s*·\s*(\d+)?\s*min\s*·\s*(.+)$/i;

    let i = 0;
    while (i < rows.length) {
        const row = rows[i] || [];
        const cell0 = String(row[0] || '').trim();
        const m = cell0.match(headerRe);

        if (m) {
            const visit = {
                id: m[1],
                patientId: patientId || '',
                type: m[2].trim(),
                date: m[3],
                time: m[4] || '',
                duration: parseInt(m[5], 10) || 0,
                paid: /ZAPŁACONO/i.test(m[6]) && !/NIE/i.test(m[6]),
                closed: false,
                summary: '',
                note: '',
                data: { _raw: {} }
            };
            i++; // przejdź do dalszych wierszy

            // Czytaj KV aż do następnego headera lub końca arkusza
            let currentSection = null; // 'meta' | 'content' | null
            const META_LABELS = {
                'ID wizyty': 'id',
                'Typ wizyty': 'type',
                'Data': 'date',
                'Godzina rozpoczęcia': 'time',
                'Czas trwania (min)': 'duration',
                'Zapłacono': 'paid',
                'Podsumowanie (skrót)': 'summary'
            };

            while (i < rows.length) {
                const r2 = rows[i] || [];
                const c0 = String(r2[0] || '').trim();

                if (!c0) { i++; continue; } // pusta linia = separator

                // Nowy blok wizyty?
                if (headerRe.test(c0)) break;

                // Subsection switch
                if (c0 === 'Dane wizyty') { currentSection = 'meta'; i++; continue; }
                if (c0 === 'Treść notatki') { currentSection = 'content'; i++; continue; }

                const value = _denormalizeCellValue(r2[1]);
                if (currentSection === 'meta') {
                    const key = META_LABELS[c0];
                    if (key) {
                        if (key === 'duration') visit.duration = parseInt(String(value), 10) || 0;
                        else if (key === 'paid') visit.paid = value === true;
                        else if (key === 'id') visit.id = String(value);
                        else if (key === 'summary') visit.summary = String(value);
                        else if (key === 'type') visit.type = String(value);
                        else if (key === 'date') visit.date = String(value);
                        else if (key === 'time') visit.time = String(value);
                    }
                } else if (currentSection === 'content') {
                    // Mapowanie etykieta → klucz (odwrotne do VISIT_FIELD_LABELS)
                    const rawKey = _findVisitContentKey(c0) || _slugify(c0);
                    if (rawKey) visit.data._raw[rawKey] = value;
                }
                i++;
            }

            visits.push(visit);
        } else {
            i++;
        }
    }

    return visits;
}

function _findVisitContentKey(label) {
    for (const [key, lbl] of Object.entries(VISIT_FIELD_LABELS)) {
        if (lbl === label) return key;
    }
    return null;
}

function _slugify(label) {
    return String(label || '')
        .replace(/^\w/, (c) => c.toLowerCase())
        .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Parser tabeli — szuka wiersza headera (zawiera label pierwszej kolumny ze schemy),
 * potem każdy następny wiersz to rekord.
 */
function _parseTableSheet(ws, schema) {
    const rows = _sheetToAoa(ws);
    const cols = schema.columns;
    if (!cols || cols.length === 0) return [];

    // Znajdź wiersz headera tabeli (zawiera label pierwszej kolumny)
    const firstHeader = cols[0].label;
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || [];
        if (String(row[0] || '').trim() === firstHeader) {
            headerIdx = i;
            break;
        }
    }
    if (headerIdx < 0) return [];

    // Każdy następny wiersz = rekord
    const records = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        // Pomijaj "(brak danych)" placeholder i puste wiersze
        const firstCell = String(row[0] || '').trim();
        if (!firstCell || firstCell.startsWith('(')) continue;
        const rec = {};
        let hasData = false;
        for (let c = 0; c < cols.length; c++) {
            const val = _denormalizeCellValue(row[c]);
            if (val !== '' && val !== null && val !== undefined) hasData = true;
            rec[cols[c].key] = val;
        }
        if (hasData) records.push(rec);
    }
    return records;
}

/**
 * Parser PlanLeczenia — tabela hierarchiczna (CEL / ZADANIE w kolumnie „Poziom").
 * Odbudowuje strukturę `{goals: [{id, title, priority, tasks: [{id, text, done, dueDate}]}]}`.
 */
function _parsePlanSheet(ws) {
    const flat = _parseTableSheet(ws, TREATMENT_PLAN_SHEET);
    const out = { goals: [] };
    const goalById = {};

    for (const row of flat) {
        if (row.poziom === 'CEL') {
            const g = {
                id: row.id,
                title: row.tytul || '',
                priority: row.priorytet || '',
                comment: row.komentarz || '',
                tasks: []
            };
            out.goals.push(g);
            goalById[g.id] = g;
        } else if (row.poziom === 'ZADANIE') {
            const parent = goalById[row.parentId];
            const t = {
                id: row.id,
                text: String(row.tytul || '').replace(/^\s*→\s*/, ''),  // strip "  → " prefix
                done: row.done === true,
                dueDate: row.dueDate || '',
                comment: row.komentarz || ''
            };
            if (parent) parent.tasks.push(t);
        }
    }

    return out;
}


