import type { SpreadsheetData } from './parse-spreadsheet';
import { canExportSpreadsheet } from './spreadsheet-access';
import { useAuthStore } from '@/store/auth.store';

export async function downloadSpreadsheetXlsx(
  data: SpreadsheetData,
  downloadName?: string,
  options?: { allowMissingDataDownload?: boolean; allowDispositionDownload?: boolean },
): Promise<void> {
  const roles =
    typeof window !== 'undefined' ? useAuthStore.getState().user?.roles : undefined;
  const panel = typeof window !== 'undefined' ? useAuthStore.getState().panel : undefined;
  const missingDataAllowed =
    options?.allowMissingDataDownload &&
    Boolean(
      roles?.some(
        (r) =>
          r === 'super_admin' || r === 'admin' || r === 'db_admin' || r === 'employee',
      ),
    );
  const dispositionAllowed =
    options?.allowDispositionDownload &&
    Boolean(
      roles?.some((r) => r === 'super_admin' || r === 'admin' || r === 'db_admin'),
    );
  if (!missingDataAllowed && !dispositionAllowed && !canExportSpreadsheet(roles, panel)) {
    throw new Error('Download is restricted to Super Admin');
  }
  const XLSX = await import('xlsx');
  const aoa = [data.headers, ...data.rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const colWidths = data.headers.map((header, colIndex) => {
    const maxLen = Math.max(
      header.length,
      ...data.rows.map((row) => (row[colIndex] ?? '').length),
    );
    return { wch: Math.min(48, Math.max(12, maxLen + 2)) };
  });
  ws['!cols'] = colWidths;

  if (data.rows.length > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: data.rows.length, c: data.headers.length - 1 },
      }),
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, data.sheetName.slice(0, 31) || 'Master Data');

  const name =
    downloadName ??
    data.fileName.replace(/\.(csv|xlsx|xls)$/i, '') + '-formatted.xlsx';

  XLSX.writeFile(wb, name.endsWith('.xlsx') ? name : `${name}.xlsx`);
}
