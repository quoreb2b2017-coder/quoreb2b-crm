'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  COMPANY_PRODUCTS,
  getCompanyProduct,
  type CompanyProductId,
} from '@/lib/constants/company-products';
import { useAdminProductStore } from '@/store/admin-product.store';
import { toast } from '@/stores/toast.store';

export function CompanyProductPicker() {
  const router = useRouter();
  const selectProduct = useAdminProductStore((s) => s.selectProduct);
  const [hovered, setHovered] = useState<CompanyProductId | null>(null);
  const [picking, setPicking] = useState<CompanyProductId | null>(null);

  const handleSelect = (id: CompanyProductId) => {
    const product = getCompanyProduct(id);
    if (!product) return;

    setPicking(id);
    setTimeout(() => {
      selectProduct(id);
      toast.success('Opening workspace', product.name);

      if (product.external) {
        window.location.href = product.homePath;
        return;
      }

      router.push(product.homePath);
      setPicking(null);
    }, 280);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="company-picker-title"
    >
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-md" />

      <div className="relative w-full max-w-4xl animate-settings-panel">
        <div className="rounded-2xl border border-white/20 bg-white shadow-2xl shadow-slate-900/20 overflow-hidden">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/80 px-6 py-5 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2e7ad1] text-white shadow-lg shadow-indigo-200">
                <LayoutGrid className="h-5 w-5" />
              </span>
              <div>
                <h2
                  id="company-picker-title"
                  className="text-lg font-semibold text-slate-900 sm:text-xl"
                >
                  Choose your workspace
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Select a Quore company product — you will be taken to its dashboard
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
              {COMPANY_PRODUCTS.map((product) => {
                const isHovered = hovered === product.id;
                const isPicking = picking === product.id;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelect(product.id)}
                    onMouseEnter={() => setHovered(product.id)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                      'tap-smooth group relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 p-4 text-center transition-all duration-300 ease-out',
                      isPicking
                        ? 'scale-95 border-indigo-500 bg-indigo-50 ring-4 ring-indigo-200/60'
                        : isHovered
                          ? 'scale-[1.03] border-indigo-300 bg-white shadow-lg shadow-indigo-100/80'
                          : 'border-slate-200 bg-slate-50/80 hover:border-slate-300',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-14 w-14 items-center justify-center rounded-xl text-sm font-bold text-white shadow-md transition-transform duration-300',
                        product.iconBg,
                        isHovered && 'scale-110',
                      )}
                    >
                      {product.iconLetter}
                    </span>
                    <span className="mt-3 text-xs font-semibold leading-tight text-slate-900 sm:text-sm">
                      {product.name}
                    </span>
                    <span className="mt-1 line-clamp-2 text-[10px] text-slate-500 sm:text-xs">
                      {product.tagline}
                    </span>
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-x-3 bottom-3 h-1 rounded-full bg-gradient-to-r opacity-0 transition-opacity duration-300',
                        product.accent,
                        (isHovered || isPicking) && 'opacity-100',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
