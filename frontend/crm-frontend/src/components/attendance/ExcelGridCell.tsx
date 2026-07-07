'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils/cn';
import { xlCellClass } from '@/lib/attendance/xl-sheet-theme';

interface ExcelGridCellProps {
  row: number;
  col: number;
  active: boolean;
  align?: 'left' | 'center';
  className?: string;
  sticky?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}

export const ExcelGridCell = memo(function ExcelGridCell({
  row,
  col,
  active,
  align = 'left',
  className,
  sticky,
  onActivate,
  children,
}: ExcelGridCellProps) {
  return (
    <td
      data-grid-row={row}
      data-grid-col={col}
      tabIndex={active ? 0 : -1}
      onFocus={onActivate}
      onClick={onActivate}
      className={xlCellClass({ active, align, sticky, className })}
    >
      <div className={cn('px-2 py-1 truncate', align === 'center' && 'flex justify-center')}>
        {children}
      </div>
    </td>
  );
});
