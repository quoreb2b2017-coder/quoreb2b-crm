/** Identify a lead row from spreadsheet headers + cells */

const KEY_HEADER_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'email', pattern: /^(e-?mail|email\s*address|mail)$/i },
  { key: 'phone', pattern: /^(phone|mobile|contact|tel|telephone|cell)$/i },
  { key: 'leadId', pattern: /^(lead\s*id|record\s*id|id|lead\s*#)$/i },
  { key: 'name', pattern: /^(name|full\s*name|contact\s*name|first\s*name|lead\s*name)$/i },
  { key: 'company', pattern: /^(company|organization|account|business)$/i },
];

function normCell(v: string | undefined): string {
  return (v ?? '').trim();
}

function findColumnIndex(headers: string[], pattern: RegExp): number {
  return headers.findIndex((h) => pattern.test(h.trim()));
}

export interface LeadFingerprint {
  leadKey: string;
  leadLabel: string;
  rowIndex: number;
}

export function fingerprintLeadRow(
  headers: string[],
  row: string[],
  rowIndex: number,
): LeadFingerprint {
  const parts: string[] = [];
  const labelParts: string[] = [];

  for (const { key, pattern } of KEY_HEADER_PATTERNS) {
    const col = findColumnIndex(headers, pattern);
    if (col < 0) continue;
    const val = normCell(row[col]);
    if (!val) continue;
    parts.push(`${key}:${val.toLowerCase()}`);
    if (labelParts.length < 2) labelParts.push(val);
  }

  const leadKey =
    parts.length > 0 ? parts.join('|') : `row:${rowIndex}`;
  const leadLabel =
    labelParts.length > 0
      ? labelParts.join(' · ')
      : row.find((c) => normCell(c))
        ? normCell(row.find((c) => normCell(c)))
        : `Row ${rowIndex + 1}`;

  return { leadKey, leadLabel, rowIndex };
}

export function leadResourceId(batchId: string, leadKey: string): string {
  return `${batchId}:${leadKey}`;
}
