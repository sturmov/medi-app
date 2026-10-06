// ============================================================================
// _xlsx-codec.js — dokument pacjenta ⇄ plik `pacjent.xlsx`.
//
// Układ pliku jest IDENTYCZNY z arkuszem Google (patrz `_sheet-model.js`):
// zakładki czytelne dla człowieka + ukryta zakładka `_dane` z kompletnym
// dokumentem. Odczyt korzysta wyłącznie z `_dane`, więc zapis → odczyt jest
// bezstratny.
//
// Używane przez tryb folderu lokalnego oraz przycisk „Pobierz kopię".
// Wymaga globalnego `XLSX` (lib/xlsx-js-style.min.js).
// ============================================================================

import { buildTabs, chunksToDoc, DATA_TAB } from './_sheet-model.js';
import { patientFolderName } from './_patient-doc.js';

function xlsx() {
    if (typeof globalThis.XLSX === 'undefined') {
        throw new Error('Biblioteka XLSX nie jest załadowana (lib/xlsx-js-style.min.js).');
    }
    return globalThis.XLSX;
}

const BORDER = ['top', 'bottom', 'left', 'right'].reduce((acc, side) => {
    acc[side] = { style: 'thin', color: { rgb: 'D1D5DB' } };
    return acc;
}, {});

const STYLE_HEADER = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { fgColor: { rgb: '1F4E78' } },
    alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
    border: BORDER
};
const STYLE_CELL = {
    font: { color: { rgb: '0F172A' } },
    alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
    border: BORDER
};

/** @returns {ArrayBuffer} zawartość pliku .xlsx */
export function writePatientWorkbook(doc) {
    const XLSX = xlsx();
    const wb = XLSX.utils.book_new();
    const sheetProps = [];

    for (const tab of buildTabs(doc)) {
        const header = tab.columns.map((c) => c.label);
        const ws = XLSX.utils.aoa_to_sheet([header, ...tab.rows]);
        ws['!cols'] = tab.columns.map((c) => ({ wch: c.width }));

        if (!tab.hidden) {
            const lastCol = tab.columns.length - 1;
            const lastRow = tab.rows.length;
            for (let r = 0; r <= lastRow; r++) {
                for (let c = 0; c <= lastCol; c++) {
                    const addr = XLSX.utils.encode_cell({ r, c });
                    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
                    ws[addr].s = r === 0 ? STYLE_HEADER : STYLE_CELL;
                }
            }
            ws['!autofilter'] = {
                ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } })
            };
            ws['!views'] = [{ state: 'frozen', ySplit: 1 }];
        }
        XLSX.utils.book_append_sheet(wb, ws, tab.title);
        sheetProps.push({ Hidden: tab.hidden ? 1 : 0 });
    }

    wb.Workbook = { Sheets: sheetProps };
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

/** @returns {object} dokument pacjenta (rzuca, gdy plik nie ma zakładki `_dane`). */
export function readPatientWorkbook(arrayBuffer) {
    const XLSX = xlsx();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const ws = wb.Sheets[DATA_TAB];
    if (!ws) {
        throw new Error('Plik nie zawiera zakładki „' + DATA_TAB + '" — to nie jest arkusz pacjenta PsychoApp '
            + '(albo pochodzi ze starej wersji aplikacji).');
    }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    return chunksToDoc(rows.slice(1).map((r) => r[0]));
}

/** Pobranie pliku w przeglądarce (przycisk „Pobierz kopię"). */
export function downloadPatientWorkbook(doc, fileName) {
    const blob = new Blob([writePatientWorkbook(doc)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || (patientFolderName(doc.patient) + '.xlsx');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
