import { create } from 'zustand';
import type { MasterDataImportProgress } from '@/lib/api/master-data.service';

export type EmployeeUploadImportUiPhase = 'idle' | 'active' | 'done' | 'failed';

interface EmployeeUploadImportState {
  uiPhase: EmployeeUploadImportUiPhase;
  jobId: string | null;
  fileName: string;
  progress: MasterDataImportProgress | null;
  begin: (fileName: string) => void;
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
  progress: null,
};

export const useEmployeeUploadImportStore = create<EmployeeUploadImportState>((set) => ({
  ...idle,
  begin: (fileName) =>
    set({
      uiPhase: 'active',
      jobId: null,
      fileName,
      progress: { percent: 0, phase: 'uploading', message: 'Starting upload…' },
    }),
  setJobId: (jobId) => set({ jobId }),
  setProgress: (progress) => set({ progress }),
  markDone: () => set({ uiPhase: 'done' }),
  markFailed: () => set({ uiPhase: 'failed' }),
  reset: () => set(idle),
}));
