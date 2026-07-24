'use client';

import type { MasterUploadActivityMeta } from '@/lib/constants/activity-labels';

/** Plain line-by-line upload summary — matches activity log row style (no cards). */
export function MasterUploadActivityDetail({ meta }: { meta: MasterUploadActivityMeta }) {
  return (
    <div className="min-w-[240px] text-[13px] leading-snug text-slate-600">
      <p className="font-semibold text-slate-900">{meta.fileName}</p>
      <p>
        Added{' '}
        <span className="font-semibold tabular-nums text-[#1e5a9e]">
          {meta.addedRows.toLocaleString('en-US')}
        </span>
        {' · '}
        Duplicates{' '}
        <span className="font-semibold tabular-nums text-amber-800">
          {meta.duplicateCount.toLocaleString('en-US')}
        </span>
        {' · '}
        Missing{' '}
        <span className="font-semibold tabular-nums text-rose-800">
          {meta.missingCount.toLocaleString('en-US')}
        </span>
        {meta.fileRowCount > 0 && (
          <>
            {' · '}
            File rows{' '}
            <span className="font-semibold tabular-nums text-slate-800">
              {meta.fileRowCount.toLocaleString('en-US')}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
