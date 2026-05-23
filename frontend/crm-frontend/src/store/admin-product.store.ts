'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CompanyProductId } from '@/lib/constants/company-products';

interface AdminProductState {
  selectedProductId: CompanyProductId | null;
  pickerOpen: boolean;
  selectProduct: (id: CompanyProductId) => void;
  syncFromPath: (id: CompanyProductId) => void;
  openPicker: () => void;
  openPickerAfterLogin: () => void;
  resetForLogout: () => void;
}

export const useAdminProductStore = create<AdminProductState>()(
  persist(
    (set) => ({
      selectedProductId: null,
      pickerOpen: false,
      selectProduct: (id) =>
        set({ selectedProductId: id, pickerOpen: false }),
      syncFromPath: (id) =>
        set({ selectedProductId: id, pickerOpen: false }),
      openPicker: () => set({ pickerOpen: true }),
      openPickerAfterLogin: () =>
        set({ selectedProductId: null, pickerOpen: true }),
      resetForLogout: () =>
        set({ selectedProductId: null, pickerOpen: false }),
    }),
    {
      name: 'crm-admin-product',
      partialize: (state) => ({ selectedProductId: state.selectedProductId }),
    },
  ),
);
