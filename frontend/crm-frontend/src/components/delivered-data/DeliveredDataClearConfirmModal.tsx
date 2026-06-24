'use client';

interface DeliveredDataClearConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  clearing?: boolean;
}

/** Reuses master clear UX with delivered-specific copy via wrapper. */
export function DeliveredDataClearConfirmModal(props: DeliveredDataClearConfirmModalProps) {
  if (!props.open) return null;
  return (
    <div className="relative">
      <div
        className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none"
        aria-hidden={!props.open}
      >
        <div className="pointer-events-auto w-full max-w-[348px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
          <h2 className="text-[15px] font-semibold text-slate-900">Clear delivered file?</h2>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            All delivered contacts and every delivered batch (including duplicate files) will be permanently removed.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={props.onClose}
              disabled={props.clearing}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={props.onConfirm}
              disabled={props.clearing}
              className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {props.clearing ? 'Clearing…' : 'Delete all'}
            </button>
          </div>
        </div>
      </div>
      <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm" onClick={props.clearing ? undefined : props.onClose} />
    </div>
  );
}
