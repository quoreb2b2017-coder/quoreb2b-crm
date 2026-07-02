export const MASTER_DATA_TEMPLATE_PATH = '/templates/master-data-template.xlsx';
export const MASTER_DATA_TEMPLATE_FILENAME = 'master-data-template.xlsx';

/** Download the official QuoreB2B master data template (static XLSX). */
export function downloadMasterDataTemplate(): void {
  if (typeof window === 'undefined') return;
  const link = document.createElement('a');
  link.href = MASTER_DATA_TEMPLATE_PATH;
  link.download = MASTER_DATA_TEMPLATE_FILENAME;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
