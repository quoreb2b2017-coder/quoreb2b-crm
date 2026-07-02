import { BadRequestException } from '@nestjs/common';
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

  const dataRows = (hasHeader ? raw.slice(1) : raw).map((row) =>
    headers.map((_, i) => cellToString(row[i])),
  );
  const nonEmpty = dataRows.filter((row) => row.some((c) => c.length > 0));
  return { headers, rows: nonEmpty };
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
