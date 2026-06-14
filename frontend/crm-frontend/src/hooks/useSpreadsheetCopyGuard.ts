'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth.store';
import {
  canExportSpreadsheet,
  findSpreadsheetGuardFromNode,
  nodeInSpreadsheetGuardZone,
  obfuscatedClipboardText,
  shouldBlockSpreadsheetCopy,
  writeObfuscatedClipboard,
} from '@/lib/spreadsheet/spreadsheet-access';

export function useCanExportSpreadsheet(): boolean {
  const roles = useAuthStore((s) => s.user?.roles);
  const panel = useAuthStore((s) => s.panel);
  return canExportSpreadsheet(roles, panel);
}

/** Restriction banner in XL UI — employees only (not DB Admin). */
export function useShowSpreadsheetRestrictionHint(): boolean {
  const panel = useAuthStore((s) => s.panel);
  return panel === 'employee';
}

function isEditableField(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable;
}

/**
 * Document-level copy/cut block for non-admin users.
 * Mount once in DashboardLayout; mark XL roots with spreadsheetGuardProps.
 */
export function useGlobalSpreadsheetCopyGuard() {
  const canExport = useCanExportSpreadsheet();

  useEffect(() => {
    if (canExport || typeof document === 'undefined') return;

    const onCopyOrCut = (e: ClipboardEvent) => {
      if (isEditableField(e.target)) return;
      if (!shouldBlockSpreadsheetCopy(e.target)) return;
      writeObfuscatedClipboard(e);
    };

    const onSelectStart = (e: Event) => {
      if (isEditableField(e.target)) return;
      if (nodeInSpreadsheetGuardZone(e.target as Node)) {
        e.preventDefault();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();

      if (key === 'a') {
        if (isEditableField(e.target)) return;
        const guard = findSpreadsheetGuardFromNode(e.target as Node);
        if (!guard) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(guard);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }

      if (key !== 'c' && key !== 'x') return;
      if (!shouldBlockSpreadsheetCopy(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const payload = obfuscatedClipboardText();
      void navigator.clipboard.writeText(payload).catch(() => {});
    };

    document.addEventListener('copy', onCopyOrCut, true);
    document.addEventListener('cut', onCopyOrCut, true);
    document.addEventListener('selectstart', onSelectStart, true);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('copy', onCopyOrCut, true);
      document.removeEventListener('cut', onCopyOrCut, true);
      document.removeEventListener('selectstart', onSelectStart, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [canExport]);
}
