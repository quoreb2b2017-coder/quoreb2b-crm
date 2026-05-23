'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { isValidLibraryYear } from '@/lib/batches/month-structure';

export function BatchYearToolbar({
  year,
  years,
  totalInYear,
  onYearChange,
  onAddYear,
}: {
  year: number;
  years: number[];
  totalInYear: number;
  onYearChange: (y: number) => void;
  onAddYear: (y: number) => boolean;
}) {
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState('');

  const handleAdd = () => {
    const y = Number(draft.trim());
    if (!isValidLibraryYear(y)) {
      setAddError(`Enter year ${2000}–${2100}`);
      return;
    }
    if (years.includes(y)) {
      setAddError('Year already in list');
      onYearChange(y);
      return;
    }
    const ok = onAddYear(y);
    if (ok) {
      setDraft('');
      setAddError('');
      onYearChange(y);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 border border-white/30 bg-white/10 px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/80">
          Year
        </span>
        <select
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="min-w-[4.5rem] cursor-pointer bg-transparent text-sm font-bold text-white outline-none"
        >
          {years.map((y) => (
            <option key={y} value={y} className="text-slate-900">
              {y}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center border border-white/30 bg-white/10">
        <input
          type="number"
          min={2000}
          max={2100}
          placeholder="e.g. 2027"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setAddError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="w-20 bg-transparent px-2 py-1 text-xs text-white placeholder:text-white/40 outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1 border-l border-white/25 px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/15"
        >
          <Plus className="h-3 w-3" />
          Add year
        </button>
      </div>

      {addError && (
        <span className="text-[10px] text-amber-200">{addError}</span>
      )}

      <span className="border border-white/25 bg-white/10 px-2 py-1 text-[10px] text-white/90">
        12 folders · Jan–Dec
      </span>
      <span className="border border-white/25 bg-white/10 px-2.5 py-1 font-mono text-[11px]">
        {totalInYear} batch{totalInYear !== 1 ? 'es' : ''}
      </span>
    </div>
  );
}
