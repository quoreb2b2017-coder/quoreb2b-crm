/** Placeholder pasted when non-admin copies spreadsheet / XL data */
export const SPREADSHEET_COPY_BLOCKED = '++++++';

export const SPREADSHEET_GUARD_ATTR = 'data-spreadsheet-guard';

export const SPREADSHEET_GUARD_SELECTOR = `[${SPREADSHEET_GUARD_ATTR}]`;

/** Spread on XL / spreadsheet root elements */
export const spreadsheetGuardProps = { [SPREADSHEET_GUARD_ATTR]: '' } as const;

export type SpreadsheetExportPanel = 'admin' | 'db_admin' | 'employee' | null | undefined;

/** Only Super Admin / Admin on the CRM admin portal may copy or download XL data. */
export function canExportSpreadsheet(
  roles?: string[] | null,
  panel?: SpreadsheetExportPanel,
): boolean {
  if (panel != null && panel !== 'admin') return false;
  if (!roles?.length) return false;
  return roles.some((r) => r === 'super_admin' || r === 'admin');
}

/** Replace copied cell values with ++++++ while keeping row/column shape (tabs/newlines). */
export function buildObfuscatedClipboardPayload(raw: string): string {
  if (!raw?.trim()) return SPREADSHEET_COPY_BLOCKED;
  return raw
    .split(/\r?\n/)
    .map((line) =>
      line.includes('\t')
        ? line.split('\t').map(() => SPREADSHEET_COPY_BLOCKED).join('\t')
        : SPREADSHEET_COPY_BLOCKED,
    )
    .join('\n');
}

export function nodeInSpreadsheetGuardZone(node: Node | null | undefined): boolean {
  if (!node) return false;
  const el = node instanceof Element ? node : node.parentElement;
  return el?.closest(SPREADSHEET_GUARD_SELECTOR) != null;
}

export function findSpreadsheetGuardFromNode(node: Node | null | undefined): Element | null {
  if (!node) return null;
  const el = node instanceof Element ? node : node.parentElement;
  return el?.closest(SPREADSHEET_GUARD_SELECTOR) ?? null;
}

function rangeIntersectsGuard(range: Range, guard: Element): boolean {
  if (guard.contains(range.commonAncestorContainer)) return true;

  try {
    const guardRange = document.createRange();
    guardRange.selectNodeContents(guard);
    return (
      range.compareBoundaryPoints(Range.END_TO_START, guardRange) >= 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, guardRange) <= 0
    );
  } catch {
    return nodeInSpreadsheetGuardZone(range.commonAncestorContainer);
  }
}

/** True when the current text selection overlaps any marked XL zone (incl. Ctrl+A). */
export function selectionIntersectsSpreadsheetGuard(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;

  const guards = document.querySelectorAll(SPREADSHEET_GUARD_SELECTOR);
  if (guards.length === 0) return false;

  for (let i = 0; i < sel.rangeCount; i++) {
    const range = sel.getRangeAt(i);
    for (const guard of Array.from(guards)) {
      if (rangeIntersectsGuard(range, guard)) return true;
    }
  }

  return (
    nodeInSpreadsheetGuardZone(sel.anchorNode) || nodeInSpreadsheetGuardZone(sel.focusNode)
  );
}

export function shouldBlockSpreadsheetCopy(target?: EventTarget | null): boolean {
  if (selectionIntersectsSpreadsheetGuard()) return true;
  if (target instanceof Node && nodeInSpreadsheetGuardZone(target)) return true;
  if (nodeInSpreadsheetGuardZone(document.activeElement)) return true;
  return false;
}

export function obfuscatedClipboardText(): string {
  const text = window.getSelection()?.toString() ?? '';
  return buildObfuscatedClipboardPayload(text);
}

export function writeObfuscatedClipboard(e: ClipboardEvent): void {
  e.preventDefault();
  e.stopImmediatePropagation();
  const payload = obfuscatedClipboardText();
  e.clipboardData?.clearData();
  e.clipboardData?.setData('text/plain', payload);
  e.clipboardData?.setData('text/html', `<span>${SPREADSHEET_COPY_BLOCKED}</span>`);
}
