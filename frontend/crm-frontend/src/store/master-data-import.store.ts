import { create } from 'zustand';
import type { MasterDataImportProgress, MasterDataSaveMode } from '@/lib/api/master-data.service';
import type { MasterDataUploadSummary } from '@/lib/master-data/master-data-upload-summary';
import { readPersistedUploadSummary } from '@/lib/master-data/master-data-upload-summary';

export type MasterDataImportUiPhase = 'idle' | 'active' | 'done' | 'failed';

interface MasterDataImportState {
  uiPhase: MasterDataImportUiPhase;
  jobId: string | null;
  fileName: string;
  mode: MasterDataSaveMode | null;
  progress: MasterDataImportProgress | null;
  uploadSummary: MasterDataUploadSummary | null;
  begin: (fileName: string, mode: MasterDataSaveMode) => void;
  setJobId: (jobId: string) => void;
  setProgress: (progress: MasterDataImportProgress) => void;
  setUploadSummary: (summary: MasterDataUploadSummary | null) => void;
  patchUploadSummary: (patch: Partial<MasterDataUploadSummary>) => void;
  markDone: () => void;
  markFailed: () => void;
  reset: () => void;
}

const idle = {
  uiPhase: 'idle' as const,
  jobId: null,
  fileName: '',
  mode: null,
  progress: null,
  uploadSummary: readPersistedUploadSummary(),
};

export const useMasterDataImportStore = create<MasterDataImportState>((set) => ({
  ...idle,
  begin: (fileName, mode) =>
    set({
      uiPhase: 'active',
      jobId: null,
      fileName,
      mode,
      progress: { percent: 0, phase: 'uploading', message: 'Starting upload…' },
      uploadSummary: {
        fileName,
        startedAt: new Date().toISOString(),
        status: 'uploading',
        fileRowCount: 0,
        addedRows: 0,
        duplicateCount: 0,
        missingCount: 0,
        duplicateFileSaved: false,
        importPercent: 0,
        importMessage: 'Starting upload…',
      },
    }),
  setJobId: (jobId) => set({ jobId }),
  setProgress: (progress) =>
    set((state) => ({
      progress,
      uploadSummary: state.uploadSummary
        ? {
            ...state.uploadSummary,
            status:
              progress.phase === 'uploading'
                ? 'uploading'
                : progress.phase === 'done'
                  ? 'done'
                  : progress.phase === 'failed'
                    ? 'failed'
                    : 'processing',
            importPercent: progress.percent,
            importMessage: progress.message,
            fileRowCount:
              progress.totalRows && progress.totalRows > 0
                ? progress.totalRows
                : state.uploadSummary.fileRowCount,
          }
        : state.uploadSummary,
    })),
  setUploadSummary: (uploadSummary) => set({ uploadSummary }),
  patchUploadSummary: (patch) =>
    set((state) => ({
      uploadSummary: state.uploadSummary
        ? { ...state.uploadSummary, ...patch }
        : ({ ...patch } as MasterDataUploadSummary),
    })),
  markDone: () => set({ uiPhase: 'done' }),
  markFailed: () =>
    set((state) => ({
      uiPhase: 'failed',
      uploadSummary: state.uploadSummary
        ? { ...state.uploadSummary, status: 'failed' }
        : state.uploadSummary,
    })),
  reset: () => set({ ...idle, uploadSummary: readPersistedUploadSummary() }),
}));
