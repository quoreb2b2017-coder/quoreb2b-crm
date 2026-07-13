import { parentPort, workerData } from 'worker_threads';
import { createReadStream, readFileSync } from 'fs';
import { createInterface } from 'readline';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

const PARSE_BATCH_SIZE = 5_000;

interface WorkerInput {
  filePath: string;
  fileName: string;
}

function cellToString(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) {
    if ('text' in value && (value as { text?: unknown }).text != null) {
      return cellToString((value as { text: unknown }).text);
    }
    if ('result' in value && (value as { result?: unknown }).result != null) {
      return cellToString((value as { result: unknown }).result);
    }
  }
  return String(value).trim();
}

function trimTrailingEmptyHeaders(headerRow: string[]): string[] {
  let last = headerRow.length - 1;
  while (last >= 0 && !headerRow[last]?.trim()) {
    last -= 1;
  }
  return headerRow.slice(0, last + 1).map((h, i) => {
    const trimmed = cellToString(h);
    return trimmed || `Column ${i + 1}`;
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function flushBatch(batch: string[][], processed: number) {
  if (batch.length) {
    parentPort?.postMessage({ type: 'batch', rows: batch, processed });
    batch.length = 0;
  }
}

/** Stream-parse .xlsx from disk — avoids loading 10L+ rows into RAM (SheetJS buffer path OOMs). */
async function streamXlsxRows(filePath: string, fileName: string) {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
  });

  let processed = 0;
  let batch: string[][] = [];
  let headers: string[] = [];
  let sheetName = fileName.replace(/\.[^.]+$/, '') || 'Sheet1';
  let metaSent = false;

  for await (const worksheetReader of workbookReader) {
    const wsName =
      (worksheetReader as ExcelJS.stream.xlsx.WorksheetReader & { name?: string }).name ||
      sheetName;
    sheetName = wsName;
    let rowIndex = 0;

    for await (const row of worksheetReader) {
      const values = row.values as unknown[] | undefined;
      const cols = (values ?? []).slice(1).map((v) => cellToString(v));

      if (rowIndex === 0) {
        const hasHeader = cols.some((h) => h.length > 0);
        headers = hasHeader
          ? trimTrailingEmptyHeaders(cols)
          : cols.map((_, i) => `Column ${i + 1}`);
        parentPort?.postMessage({ type: 'meta', sheetName, headers });
        metaSent = true;
        if (hasHeader) {
          rowIndex += 1;
          continue;
        }
      }

      const aligned = headers.map((_, i) => cellToString(cols[i]));
      if (!aligned.some((c) => c.length > 0)) {
        rowIndex += 1;
        continue;
      }
      batch.push(aligned);
      processed += 1;
      rowIndex += 1;

      if (batch.length >= PARSE_BATCH_SIZE) {
        flushBatch(batch, processed);
      }
      if (processed % 50_000 === 0) {
        parentPort?.postMessage({ type: 'progress', processed });
      }
    }
    break;
  }

  if (!metaSent) {
    throw new Error('Worksheet is empty — add a header row and data rows');
  }

  flushBatch(batch, processed);
  parentPort?.postMessage({ type: 'done', totalRows: processed, sheetName, headers });
}

/** Legacy .xls only — small files; try every sheet until one has data. */
function streamXlsRows(filePath: string, fileName: string) {
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: false,
    cellNF: false,
    cellStyles: false,
    sheetStubs: true,
  });

  let sheetName = '';
  let sheet: XLSX.WorkSheet | undefined;
  for (const name of workbook.SheetNames) {
    const candidate = workbook.Sheets[name];
    if (candidate?.['!ref']) {
      sheetName = name;
      sheet = candidate;
      break;
    }
  }
  if (!sheet || !sheetName) {
    throw new Error('No worksheets with data found in the file');
  }

  const ref = sheet['!ref']!;
  let processed = 0;
  let batch: string[][] = [];

  const range = XLSX.utils.decode_range(ref);
  const headerRow: string[] = [];
  for (let C = range.s.c; C <= range.e.c; C += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
    headerRow.push(cell ? cellToString(cell.w ?? cell.v) : '');
  }
  const hasHeader = headerRow.some((h) => h.length > 0);
  const headers = hasHeader
    ? trimTrailingEmptyHeaders(headerRow)
    : headerRow.map((_, i) => `Column ${i + 1}`);
  parentPort?.postMessage({ type: 'meta', sheetName, headers });

  const startRow = hasHeader ? range.s.r + 1 : range.s.r;
  for (let R = startRow; R <= range.e.r; R += 1) {
    const row = headers.map((_, i) => {
      const C = range.s.c + i;
      if (C > range.e.c) return '';
      const cell = sheet![XLSX.utils.encode_cell({ r: R, c: C })];
      return cell ? cellToString(cell.w ?? cell.v) : '';
    });
    if (!row.some((c) => c.length > 0)) continue;
    batch.push(row);
    processed += 1;
    if (batch.length >= PARSE_BATCH_SIZE) {
      flushBatch(batch, processed);
    }
    if (processed % 50_000 === 0) {
      parentPort?.postMessage({ type: 'progress', processed });
    }
  }
  flushBatch(batch, processed);
  parentPort?.postMessage({ type: 'done', totalRows: processed, sheetName, headers });
}

async function streamCsvRows(filePath: string, fileName: string) {
  const rl = createInterface({
    input: createReadStream(filePath, { highWaterMark: 1024 * 1024 }),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let headers: string[] = [];
  let processed = 0;
  let batch: string[][] = [];
  const sheetName = fileName.replace(/\.[^.]+$/, '') || 'Sheet1';

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (lineNum === 0) {
      const hasHeader = cols.some((h) => h.length > 0);
      headers = hasHeader
        ? trimTrailingEmptyHeaders(cols)
        : cols.map((_, i) => `Column ${i + 1}`);
      parentPort?.postMessage({ type: 'meta', sheetName, headers });
      if (hasHeader) {
        lineNum += 1;
        continue;
      }
    }
    const row = headers.map((_, i) => cellToString(cols[i]));
    if (!row.some((c) => c.length > 0)) continue;
    batch.push(row);
    processed += 1;
    lineNum += 1;
    if (batch.length >= PARSE_BATCH_SIZE) {
      flushBatch(batch, processed);
    }
    if (processed % 50_000 === 0) {
      parentPort?.postMessage({ type: 'progress', processed });
    }
  }

  flushBatch(batch, processed);
  parentPort?.postMessage({ type: 'done', totalRows: processed, sheetName, headers });
}

try {
  const { filePath, fileName } = workerData as WorkerInput;
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'csv') {
    void streamCsvRows(filePath, fileName).catch((err) => {
      parentPort?.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    });
  } else if (ext === 'xlsx') {
    void streamXlsxRows(filePath, fileName).catch((err) => {
      parentPort?.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    });
  } else if (ext === 'xls') {
    try {
      streamXlsRows(filePath, fileName);
    } catch (err) {
      parentPort?.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    throw new Error('Only .csv, .xlsx, and .xls files are supported');
  }
} catch (error) {
  parentPort?.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
  });
}
