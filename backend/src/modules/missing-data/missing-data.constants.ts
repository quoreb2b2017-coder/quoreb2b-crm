/** Critical contact fields — any blank / "-" sends the row to Missing Data. */
export const MISSING_DATA_CRITICAL_HEADERS = [
  'First Name',
  'Last Name',
  'Domain',
  'Email ID',
  'Company Name',
  'Phone Number',
] as const;

export type MissingDataCriticalHeader =
  (typeof MISSING_DATA_CRITICAL_HEADERS)[number];

export type MissingDataSourceRole =
  | 'employee'
  | 'db_admin'
  | 'master'
  | 'admin'
  | 'super_admin';

export type MissingDataSourceType =
  | 'upload_request'
  | 'master_import'
  | 'master_backfill';
