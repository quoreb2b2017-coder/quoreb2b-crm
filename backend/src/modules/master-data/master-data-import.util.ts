import { BadRequestException } from '@nestjs/common';
import { join } from 'path';
import { Worker } from 'worker_threads';
import * as XLSX from 'xlsx';

export interface ParsedSpreadsheet {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
}

function cellToString(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function normalizeMatrix(raw: unknown[][]): { headers: string[]; rows: string[][] } {
  if (!raw.length) return { headers: [], rows: [] };

  const first = raw[0] ?? [];
  const headerRow = first.map(cellToString);
  const hasHeader = headerRow.some((h) => h.length > 0);
  const headers = hasHeader
    ? headerRow.map((h, i) => h || `Column ${i + 1}`)
    : first.map((_, i) => `Column ${i + 1}`);

  const rows: string[][] = [];
  const dataStart = hasHeader ? 1 : 0;
  for (let r = dataStart; r < raw.length; r += 1) {
    const row = raw[r] ?? [];
    const normalized = headers.map((_, i) => cellToString(row[i]));
    if (normalized.some((c) => c.length > 0)) {
      rows.push(normalized);
    }
  }

  return { headers, rows };
}

export function parseSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string,
): ParsedSpreadsheet {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    throw new BadRequestException('Only .csv, .xlsx, and .xls files are supported');
  }

  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new BadRequestException('No sheets found in the file');
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  const { headers, rows } = normalizeMatrix(matrix);
  if (!headers.length) {
    throw new BadRequestException('File has no columns. Add a header row and data.');
  }

  return { fileName, sheetName, headers, rows };
}

/** Parse in a worker thread so large XLSX files do not block login and other API calls. */
export function parseSpreadsheetBufferAsync(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedSpreadsheet> {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(join(__dirname, 'master-data-parse.worker.js'), {
      workerData: { fileName, buffer: arrayBuffer },
      transferList: [arrayBuffer],
    });

    worker.once('message', (msg: { ok: boolean; result?: ParsedSpreadsheet; error?: string }) => {
      settled = true;
      if (msg.ok && msg.result) {
        resolve(msg.result);
        return;
      }
      reject(new BadRequestException(msg.error ?? 'Failed to parse spreadsheet'));
    });

    worker.once('error', (err: Error) => {
      settled = true;
      reject(err);
    });

    worker.once('exit', (code: number) => {
      if (!settled && code !== 0) {
        reject(new Error(`Spreadsheet parse worker exited with code ${code}`));
      }
    });
  });
}
