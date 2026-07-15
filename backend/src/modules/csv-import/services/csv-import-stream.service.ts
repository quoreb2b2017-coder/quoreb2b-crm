import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import { createInterface } from 'readline';

export interface CsvStreamMeta {
  headers: string[];
  sheetName: string;
}

export interface CsvStreamBatch {
  rows: string[][];
  rowNumbers: number[];
  processed: number;
}

@Injectable()
export class CsvImportStreamService {
  parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  private trimTrailingEmptyHeaders(headerRow: string[]): string[] {
    let last = headerRow.length - 1;
    while (last >= 0 && !headerRow[last]?.trim()) {
      last -= 1;
    }
    return headerRow.slice(0, last + 1).map((h, i) => {
      const trimmed = String(h ?? '')
        .replace(/^\uFEFF/, '')
        .trim();
      return trimmed || `Column ${i + 1}`;
    });
  }

  /**
   * Stream-parse CSV from any Readable source without loading the file into memory.
   * Supports resume by skipping rows until startAfterRowNumber.
   */
  async *streamCsv(
    source: Readable,
    options: {
      batchSize: number;
      startAfterRowNumber?: number;
      onMeta?: (meta: CsvStreamMeta) => void;
    },
  ): AsyncGenerator<CsvStreamBatch> {
    const rl = createInterface({ input: source, crlfDelay: Infinity });
    let headerLine = '';
    let headers: string[] = [];
    let dataRowNumber = 0;
    let batch: string[][] = [];
    let rowNumbers: number[] = [];
    const skipUntil = options.startAfterRowNumber ?? 0;

    for await (const line of rl) {
      if (!headerLine) {
        headerLine = line;
        headers = this.trimTrailingEmptyHeaders(this.parseCsvLine(headerLine));
        options.onMeta?.({ headers, sheetName: 'CSV' });
        continue;
      }

      dataRowNumber += 1;
      if (dataRowNumber <= skipUntil) {
        continue;
      }

      const row = this.parseCsvLine(line);
      batch.push(row);
      rowNumbers.push(dataRowNumber);

      if (batch.length >= options.batchSize) {
        yield { rows: batch, rowNumbers, processed: dataRowNumber };
        batch = [];
        rowNumbers = [];
      }
    }

    if (batch.length) {
      yield { rows: batch, rowNumbers, processed: dataRowNumber };
    }
  }
}
