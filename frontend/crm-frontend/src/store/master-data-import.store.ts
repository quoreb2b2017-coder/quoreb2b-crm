import { create } from 'zustand';
import type { MasterDataImportProgress, MasterDataSaveMode } from '@/lib/api/master-data.service';

export type MasterDataImportUiPhase = 'idle' | 'active' | 'done' | 'failed';

interface MasterDataImportState {
  uiPhase: MasterDataImportUiPhase;
  jobId: string | null;
  fileName: string;
  mode: MasterDataSaveMode | null;
  progress: MasterDataImportProgress | null;
  begin: (fileName: string, mode: MasterDataSaveMode) => void;
  setJobId: (jobId: string) => void;
  setProgress: (progress: MasterDataImportProgress) => void;
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
    }),
  setJobId: (jobId) => set({ jobId }),
  setProgress: (progress) => set({ progress }),
  markDone: () => set({ uiPhase: 'done' }),
  markFailed: () => set({ uiPhase: 'failed' }),
  reset: () => set(idle),
}));
