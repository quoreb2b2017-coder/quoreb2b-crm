/** Rows per upload part — 10L rows → 20 parts of 50k each. */
export const MASTER_DATA_UPLOAD_PART_ROWS = 50_000;

async function* iterateFileLines(file: File): AsyncGenerator<string> {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIdx = buffer.indexOf('\n');
    while (newlineIdx >= 0) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.length > 0 || newlineIdx === 0) {
        yield line;
      }
      newlineIdx = buffer.indexOf('\n');
    }
  }

  if (buffer.length > 0) {
    yield buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
  }
}

/**
 * Stream-split a CSV into ~50k-row part files without loading the full file in RAM.
 */
export async function splitCsvFileIntoParts(
  file: File,
  rowsPerPart = MASTER_DATA_UPLOAD_PART_ROWS,
): Promise<File[]> {
  const baseName = file.name.replace(/\.csv$/i, '');
  const estimatedTotalParts = estimatePartsFromFileSize(file);
  const parts: File[] = [];
  let headerLine = '';
  let dataRowCount = 0;
  let partIndex = 0;
  let partRows: string[] = [];

  const flushPart = () => {
    if (!partRows.length) return;
    partIndex += 1;
    const blob = new Blob([[headerLine, ...partRows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    parts.push(
      new File(
        [blob],
        `${baseName}-part-${partIndex}-of-${estimatedTotalParts}.csv`,
        { type: 'text/csv' },
      ),
    );
    partRows = [];
  };

  for await (const line of iterateFileLines(file)) {
    if (!headerLine) {
      headerLine = line;
      continue;
    }
    dataRowCount += 1;
    partRows.push(line);
    if (partRows.length >= rowsPerPart) {
      flushPart();
    }
  }

  flushPart();

  if (parts.length <= 1) {
    return [file];
  }

  return parts.map((part, idx) => {
    const correctedName = `${baseName}-part-${idx + 1}-of-${parts.length}.csv`;
    return new File([part], correctedName, { type: 'text/csv' });
  });
}

export function shouldSplitCsvForUpload(file: File): boolean {
  return file.name.toLowerCase().endsWith('.csv') && file.size > 512 * 1024;
}

export function estimateUploadParts(rowCount: number): number {
  return Math.max(1, Math.ceil(rowCount / MASTER_DATA_UPLOAD_PART_ROWS));
}

export function estimatePartsFromFileSize(file: File): number {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const bytesPerRow = ext === 'csv' ? 120 : 200;
  const approxRows = Math.max(1, Math.floor(file.size / bytesPerRow));
  return estimateUploadParts(approxRows);
}

export function formatPartMessage(partIndex: number, totalParts: number, detail: string): string {
  return `Part ${partIndex}/${totalParts} · ${detail}`;
}
