import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
export interface SpreadsheetData {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: string[][];
}

function cellToString(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    return value.toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE,  dateStyle: 'short', timeStyle: 'short' });
  }
  return String(value).trim();
}

function normalizeMatrix(raw: unknown[][]): { headers: string[]; rows: string[][] } {
  if (!raw.length) {
    return { headers: [], rows: [] };
  }

  const first = raw[0] ?? [];
  const headerRow = first.map(cellToString);
  const hasHeader = headerRow.some((h) => h.length > 0);
  const headers = hasHeader
    ? headerRow.map((h, i) => h || `Column ${i + 1}`)
    : first.map((_, i) => `Column ${i + 1}`);

  const dataRows = (hasHeader ? raw.slice(1) : raw).map((row) => {
    const cells = headers.map((_, i) => cellToString(row[i]));
    return cells;
  });

  const nonEmpty = dataRows.filter((row) => row.some((c) => c.length > 0));
  return { headers, rows: nonEmpty };
}

export async function parseSpreadsheetFile(file: File): Promise<SpreadsheetData> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    throw new Error('Only .csv, .xlsx, and .xls files are supported');
  }

  const buffer = await file.arrayBuffer();
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    raw: false,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('No sheets found in the file');
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  const { headers, rows } = normalizeMatrix(matrix);

  if (!headers.length) {
    throw new Error('File has no columns. Add a header row and data.');
  }

  return {
    fileName: file.name,
    sheetName,
    headers,
    rows,
  };
}

export function getSampleMasterData(): SpreadsheetData {
  const headers = [
    'Company Name',
    'Contact Name',
    'Email',
    'Phone',
    'Industry',
    'Country',
    'Status',
    'Notes',
  ];
  const rows = [
    ['Acme Corp', 'Jane Doe', 'jane@acme.com', '+91 98765 43210', 'Technology', 'India', 'Active', 'Key account'],
    ['Globex Ltd', 'John Smith', 'john@globex.com', '+1 555 0100', 'Manufacturing', 'USA', 'Lead', 'Follow up Q2'],
  ];
  return {
    fileName: 'master-data-template.xlsx',
    sheetName: 'Master Data',
    headers,
    rows,
  };
}
