import { parentPort, workerData } from 'worker_threads';
import { readFileSync } from 'fs';
import { parseSpreadsheetBuffer } from './master-data-import.util';

interface WorkerInput {
  fileName: string;
  filePath?: string;
  buffer?: ArrayBuffer;
}

try {
  const { filePath, buffer: arrayBuffer, fileName } = workerData as WorkerInput;
  const buffer = filePath
    ? readFileSync(filePath)
    : Buffer.from(arrayBuffer as ArrayBuffer);
  const result = parseSpreadsheetBuffer(buffer, fileName);
  parentPort?.postMessage({ ok: true as const, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false as const,
    error: error instanceof Error ? error.message : String(error),
  });
}
