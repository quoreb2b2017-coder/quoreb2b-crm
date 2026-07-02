import { parentPort, workerData } from 'worker_threads';
import { parseSpreadsheetBuffer } from './master-data-import.util';

interface WorkerInput {
  buffer: Buffer;
  fileName: string;
}

try {
  const { buffer, fileName } = workerData as WorkerInput;
  const result = parseSpreadsheetBuffer(buffer, fileName);
  parentPort?.postMessage({ ok: true as const, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false as const,
    error: error instanceof Error ? error.message : String(error),
  });
}
