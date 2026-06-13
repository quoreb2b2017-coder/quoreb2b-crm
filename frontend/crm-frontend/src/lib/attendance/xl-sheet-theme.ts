import { cn } from '@/lib/utils/cn';

/** Excel-style palette used across attendance / leave sheets */
export const XL = {
  green: '#217346',
  greenDark: '#1a5c38',
  shell: '#e6e6e6',
  toolbar: '#f3f3f3',
  headerBg: '#f2f2f2',
  border: '#e0e0e0',
  borderDark: '#c6c6c6',
  rowAlt: '#fafafa',
  active: '#e7f3ff',
  present: '#e2efda',
  violetHeader: '#5b21b6',
} as const;

export const xlScrollClass = 'xl-scroll';

export function xlCellClass(opts?: {
  active?: boolean;
  align?: 'left' | 'center';
  sticky?: boolean;
  className?: string;
}) {
  return cn(
    'border border-[#e0e0e0] p-0 text-[13px] text-slate-900 outline-none cursor-default',
    'transition-[background-color,box-shadow] duration-150 ease-out',
    opts?.align === 'center' && 'text-center',
    opts?.sticky && 'sticky left-0 z-10 bg-[#f2f2f2]',
    opts?.active && 'relative z-[1] bg-[#e7f3ff] ring-2 ring-inset ring-[#217346]',
    !opts?.active && 'hover:bg-[#e7f3ff]/55',
    opts?.className,
  );
}

export function xlHeaderClass(variant: 'green' | 'violet' = 'green') {
  return variant === 'violet'
    ? 'bg-gradient-to-r from-violet-700 to-purple-800'
    : 'bg-[#217346]';
}
