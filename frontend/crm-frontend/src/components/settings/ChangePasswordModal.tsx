'use client';

import { X } from 'lucide-react';
import { ChangePasswordForm } from './ChangePasswordForm';

interface ChangePasswordModalProps {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <div
          className="pointer-events-auto flex max-h-[min(92dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
          role="dialog"
          aria-labelledby="change-password-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden"
            aria-hidden
          />
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0 pr-2">
              <h2 id="change-password-title" className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                Change password
              </h2>
              <p className="text-xs text-slate-500">All sessions will be signed out</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <ChangePasswordForm variant="modal" onClose={onClose} />
        </div>
      </div>
    </>
  );
}
