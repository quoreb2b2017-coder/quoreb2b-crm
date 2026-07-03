import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import type { Request } from 'express';

/** Max upload size — matches nginx client_max_body_size (500MB). */
export const MASTER_IMPORT_MAX_BYTES = 500 * 1024 * 1024;

export const MASTER_DATA_IMPORT_UPLOAD_DIR = join(
  process.cwd(),
  'uploads',
  'master-data-imports',
);

const ALLOWED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls']);

export type MasterDataUploadRequest = Request & {
  masterDataUploadStartedAt?: number;
};

export function ensureMasterDataImportUploadDir(): string {
  mkdirSync(MASTER_DATA_IMPORT_UPLOAD_DIR, { recursive: true });
  return MASTER_DATA_IMPORT_UPLOAD_DIR;
}

/** Stream uploads to disk — avoids holding the full file in RAM (memoryStorage). */
export function masterDataImportDiskStorage() {
  return diskStorage({
    destination: (req, _file, cb) => {
      (req as MasterDataUploadRequest).masterDataUploadStartedAt = Date.now();
      cb(null, ensureMasterDataImportUploadDir());
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : '.xlsx';
      cb(null, `${randomUUID()}${safeExt}`);
    },
  });
}

export function masterDataImportMulterOptions() {
  return {
    storage: masterDataImportDiskStorage(),
    limits: { fileSize: MASTER_IMPORT_MAX_BYTES, files: 1, fieldSize: 64 * 1024 },
    fileFilter: (
      _req: Request,
      file: Express.Multer.File,
      cb: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      const ext = extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        cb(new BadRequestException('Only .csv, .xlsx, and .xls files are supported'), false);
        return;
      }
      cb(null, true);
    },
  };
}
