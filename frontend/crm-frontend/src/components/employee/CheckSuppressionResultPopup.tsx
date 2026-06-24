'use client';

import { useEffect } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';

export function CheckSuppressionResultPopup({
  open,
  duplicateCount,
  duplicateFileName,
  duplicateSourceRole = 'employee',
  removedFromSourceCount = 0,
  onDone,
}: {
  open: boolean;
  duplicateCount: number;
  duplicateFileName?: string | null;
  duplicateSourceRole?: 'employee' | 'db_admin';
  removedFromSourceCount?: number;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onDone, 3000);
    return () => window.clearTimeout(timer);
  }, [open, onDone]);

  if (!open) return null;

  const hasDuplicates = duplicateCount > 0;
  const saveDestination =
    duplicateSourceRole === 'db_admin' ? 'DB Admin Data' : 'My Data';

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm animate-in fade-in" />
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`pointer-events-auto w-[min(380px,92vw)] scale-100 rounded-3xl p-8 text-center shadow-2xl ring-1 animate-in zoom-in-95 ${
            hasDuplicates
              ? 'bg-gradient-to-b from-amber-50 to-white ring-amber-200'
              : 'bg-gradient-to-b from-emerald-50 to-white ring-emerald-200'
          }`}
        >
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              hasDuplicates
                ? 'bg-amber-100 text-amber-700 ring-4 ring-amber-50'
                : 'bg-emerald-100 text-emerald-700 ring-4 ring-emerald-50'
            }`}
          >
            {hasDuplicates ? (
              <ShieldAlert className="h-8 w-8" />
            ) : (
              <CheckCircle2 className="h-8 w-8" />
            )}
          </div>
          {hasDuplicates ? (
            <>
              <p className="text-4xl font-black tabular-nums text-amber-900">{duplicateCount}</p>
              <p className="mt-1 text-base font-semibold text-amber-800">duplicate(s) found</p>
              {duplicateFileName && (
                <p className="mt-4 rounded-2xl bg-amber-100/60 px-4 py-2 text-xs text-amber-900">
                  Saved as <strong className="font-semibold">{duplicateFileName}</strong> in{' '}
                  {saveDestination}
                </p>
              )}
              {removedFromSourceCount > 0 && (
                <p className="mt-2 text-xs text-amber-800">
                  Removed {removedFromSourceCount} duplicate row
                  {removedFromSourceCount === 1 ? '' : 's'} from your source file
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-emerald-900">All clear!</p>
              <p className="mt-2 text-sm text-emerald-700">No matches in the suppression list</p>
            </>
          )}
          <p className="mt-4 text-[11px] text-slate-400">Closing in 3 seconds…</p>
        </div>
      </div>
    </>
  );
}
