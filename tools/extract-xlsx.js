/**
 * tools/extract-xlsx.js
 *
 * Analizator plików źródłowych `.xlsx` (Excel) używanych jako spec formularza wizyty.
 * Wypluwa:
 *   - listę arkuszy,
 *   - CSV każdego arkusza (pełny),
 *   - listę data-validation / pick-list (klasyczne <dataValidation> + nowsze <x14:dataValidation>),
 *   - rozwiązane (resolved) wartości list (gdy formula1 = "A,B,C" lub referencja typu Sheet!A1:A20).
 *
 * Uruchamianie: `node tools/extract-xlsx.js [out]`
 *   - brak `out`  → zrzuca wszystko na stdout,
 *   - z `out` (np. `docs/VISIT_FORM_SPEC_RAW.md`) → zapisuje do pliku.
 *
 * Biblioteka: używa istniejącej `lib/xlsx.full.min.js` (SheetJS). `.xlsx` to ZIP z XML-em,
 * dlatego do wyciągnięcia `dataValidations` czytam raw XML arkusza przez CFB (SheetJS umie
 * otworzyć ZIP OOXML i udostępnić zawartość FileIndex).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require(path.resolve(__dirname, '..', 'lib', 'xlsx.full.min.js'));
XLSX.set_fs(fs);

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'docs/DIAGNOZA.xlsx',
  'docs/Dokumentacja.xlsx',
  'docs/Formularz próba.xlsx',
];

/* ----------------------------------------------------------------------------------- */
/* Utils                                                                                */
/* ----------------------------------------------------------------------------------- */

function decodeContent(content) {
  if (!content) return '';
  if (Buffer.isBuffer(content)) return content.toString('utf8');
  if (Array.isArray(content)) return Buffer.from(content).toString('utf8');
  return String(content);
}

function readZipEntries(filePath) {
  const buf = fs.readFileSync(filePath);
  // SheetJS.CFB can also read ZIP OOXML containers
  const cfb = XLSX.CFB.read(buf, { type: 'buffer' });
  const entries = [];
  const paths = cfb.FullPaths || [];
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i].replace(/^Root Entry[\\/]/, '');
    const fi = cfb.FileIndex[i];
    if (!fi || !fi.content || fi.type !== 2) continue;
    entries.push({ path: p, text: decodeContent(fi.content) });
  }
  return entries;
}

function parseClassicDV(xml) {
  const out = [];
  const re = /<dataValidation([^>]*?)(?:\/>|>([\s\S]*?)<\/dataValidation>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1] || '';
    const inner = m[2] || '';
    const type = (attrs.match(/type="([^"]*)"/) || [])[1] || '';
    const sqref = (attrs.match(/sqref="([^"]*)"/) || [])[1] || '';
    const f1m = inner.match(/<formula1[^>]*>([\s\S]*?)<\/formula1>/);
    const f1 = f1m ? f1m[1].trim() : '';
    out.push({ kind: 'classic', type, sqref, formula1: f1 });
  }
  return out;
}

function parseX14DV(xml) {
  const out = [];
  const re = /<x14:dataValidation([^>]*?)>([\s\S]*?)<\/x14:dataValidation>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1] || '';
    const inner = m[2] || '';
    const type = (attrs.match(/type="([^"]*)"/) || [])[1] || '';
    const sqref = (inner.match(/<xm:sqref>([\s\S]*?)<\/xm:sqref>/) || [])[1]?.trim() || '';
    let f1raw = (inner.match(/<x14:formula1[^>]*>([\s\S]*?)<\/x14:formula1>/) || [])[1] || '';
    const unwrap = f1raw.match(/<xm:f>([\s\S]*?)<\/xm:f>/);
    if (unwrap) f1raw = unwrap[1];
    out.push({ kind: 'x14', type, sqref, formula1: f1raw.trim() });
  }
  return out;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const inner = m[1];
    // concat all <t>...</t>
    let text = '';
    const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tRe.exec(inner))) text += tm[1];
    out.push(text);
  }
  return out;
}

/** Resolve formula1 value.
 *  - "\"Tak,Nie,Może\""  → ["Tak","Nie","Może"]
 *  - Sheet1!$A$2:$A$10   → read cells from workbook
 *  - Named range         → (rzadko, nie wspieramy — zwracamy jako raw)
 */
function resolveList(formula1, wb) {
  if (!formula1) return { kind: 'empty', values: [] };
  const raw = formula1.trim();
  // Quoted list
  if (/^"/.test(raw) && /"$/.test(raw)) {
    const inner = raw.slice(1, -1);
    // Excel uses ; or , depending on locale; most PL files use ;
    const parts = inner.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    return { kind: 'inline', values: parts };
  }
  // Range reference, e.g. Słowniki!$A$2:$A$20 or 'Arkusz 2'!$A$2:$A$20
  const rangeMatch = raw.match(/^(?:'([^']+)'|([^!]+))!([^!]+)$/);
  if (rangeMatch) {
    const sheetName = rangeMatch[1] || rangeMatch[2];
    const range = rangeMatch[3].replace(/\$/g, '');
    if (!wb.SheetNames.includes(sheetName)) {
      return { kind: 'ref-missing', ref: raw, values: [] };
    }
    const ws = wb.Sheets[sheetName];
    const decoded = XLSX.utils.decode_range(range);
    const values = [];
    for (let r = decoded.s.r; r <= decoded.e.r; r++) {
      for (let c = decoded.s.c; c <= decoded.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && cell.v !== undefined && cell.v !== '') values.push(String(cell.v));
      }
    }
    return { kind: 'range', ref: raw, sheet: sheetName, range, values };
  }
  return { kind: 'raw', ref: raw, values: [] };
}

/* ----------------------------------------------------------------------------------- */
/* Main                                                                                  */
/* ----------------------------------------------------------------------------------- */

function analyzeFile(relPath, outLines) {
  const full = path.resolve(ROOT, relPath);
  outLines.push('');
  outLines.push('============================================================================');
  outLines.push('# FILE: ' + relPath);
  outLines.push('============================================================================');
  let wb;
  try {
    wb = XLSX.readFile(full, { cellStyles: true });
  } catch (e) {
    outLines.push('ERROR readFile: ' + e.message);
    return;
  }
  outLines.push('Sheets: ' + JSON.stringify(wb.SheetNames));

  // 1. Dump each sheet as CSV (with row/col hints)
  for (const sName of wb.SheetNames) {
    const ws = wb.Sheets[sName];
    outLines.push('');
    outLines.push('----------------------------------------------------------------------------');
    outLines.push('## SHEET: ' + sName + '  (range=' + (ws['!ref'] || '?') + ')');
    outLines.push('----------------------------------------------------------------------------');
    outLines.push('```csv');
    outLines.push(XLSX.utils.sheet_to_csv(ws, { blankrows: true }).replace(/\s+$/, ''));
    outLines.push('```');
  }

  // 2. Read raw ZIP entries for dataValidations
  let entries;
  try {
    entries = readZipEntries(full);
  } catch (e) {
    outLines.push('ERROR readZipEntries: ' + e.message);
    return;
  }

  // Build sheet# -> sheet-name map via workbook.xml
  const workbookEntry = entries.find((e) => /(^|\/)xl\/workbook\.xml$/i.test(e.path));
  const sheetIdToName = {};
  if (workbookEntry) {
    const sheetRe = /<sheet\s+([^>]*)\/>/g;
    let m;
    while ((m = sheetRe.exec(workbookEntry.text))) {
      const attrs = m[1];
      const name = (attrs.match(/name="([^"]*)"/) || [])[1];
      const sheetId = (attrs.match(/sheetId="([^"]*)"/) || [])[1];
      if (name && sheetId) sheetIdToName[sheetId] = name;
    }
  }

  outLines.push('');
  outLines.push('## DATA VALIDATIONS (pick-listy)');
  let anyDV = false;
  for (const e of entries) {
    const mm = e.path.match(/xl\/worksheets\/sheet(\d+)\.xml$/i);
    if (!mm) continue;
    const sheetNum = mm[1];
    const classic = parseClassicDV(e.text);
    const x14 = parseX14DV(e.text);
    const all = classic.concat(x14);
    if (all.length === 0) continue;
    anyDV = true;
    const sheetName = sheetIdToName[sheetNum] || '(sheet' + sheetNum + ')';
    outLines.push('');
    outLines.push('### ' + e.path + '  →  "' + sheetName + '"');
    for (const dv of all) {
      const res = resolveList(dv.formula1, wb);
      outLines.push('- **' + dv.sqref + '** `type=' + dv.type + '` `kind=' + dv.kind + '`');
      outLines.push('  - formula1: `' + dv.formula1 + '`');
      outLines.push('  - resolved (' + res.kind + '): ' + JSON.stringify(res.values));
    }
  }
  if (!anyDV) outLines.push('_(brak data-validation w pliku)_');
}

function main() {
  const outArg = process.argv[2];
  const lines = [];
  lines.push('# VISIT_FORM_SPEC_RAW');
  lines.push('');
  lines.push('Automatyczny zrzut arkuszy + pick-list z plików źródłowych (Faza 0).');
  lines.push('Generator: `tools/extract-xlsx.js`. Data: ' + new Date().toISOString());

  for (const rel of FILES) analyzeFile(rel, lines);

  const text = lines.join('\n') + '\n';
  if (outArg) {
    const out = path.resolve(ROOT, outArg);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text, 'utf8');
    // eslint-disable-next-line no-console
    console.log('Wrote ' + out + ' (' + text.length + ' chars)');
  } else {
    // eslint-disable-next-line no-console
    process.stdout.write(text);
  }
}

main();
