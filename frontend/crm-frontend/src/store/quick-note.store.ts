import { create } from 'zustand';
import type { PersonalNote } from '@/types/personal-notes';

interface QuickNoteState {
  open: boolean;
  editingNote: PersonalNote | null;
  openPad: (note?: PersonalNote | null) => void;
  closePad: () => void;
  togglePad: () => void;
}

export const useQuickNoteStore = create<QuickNoteState>((set, get) => ({
  open: false,
  editingNote: null,
  openPad: (note = null) => set({ open: true, editingNote: note }),
  closePad: () => set({ open: false, editingNote: null }),
  togglePad: () => {
    const { open } = get();
    if (open) set({ open: false, editingNote: null });
    else set({ open: true, editingNote: null });
  },
}));
