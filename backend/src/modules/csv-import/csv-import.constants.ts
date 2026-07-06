/** BullMQ queue for orchestrating a full CSV import (stream + batch dispatch). */
export const CSV_IMPORT_QUEUE = 'csv-import';

/** BullMQ queue for parallel MongoDB batch writes (horizontal scale). */
export const CSV_IMPORT_BATCH_QUEUE = 'csv-import-batch';

export const CSV_IMPORT_JOB_COLLECTION = 'csv_import_jobs';
export const CSV_IMPORT_FAILED_ROW_COLLECTION = 'csv_import_failed_rows';

export const DEFAULT_CSV_IMPORT_BATCH_SIZE = 1000;
export const MIN_CSV_IMPORT_BATCH_SIZE = 500;
export const MAX_CSV_IMPORT_BATCH_SIZE = 2000;

export const DEFAULT_CSV_IMPORT_MAX_RETRIES = 3;
export const CSV_IMPORT_PROGRESS_REDIS_PREFIX = 'csv-import:progress:';
export const CSV_IMPORT_ACTIVE_LOCK_KEY = 'csv-import:active:master';
