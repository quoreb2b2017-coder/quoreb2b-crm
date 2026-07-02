import { parentPort, workerData } from 'worker_threads';
import { parseSpreadsheetBuffer } from './master-data-import.util';

interface WorkerInput {
  buffer: ArrayBuffer;
  fileName: string;
}

try {
  const { buffer: arrayBuffer, fileName } = workerData as WorkerInput;
  const buffer = Buffer.from(arrayBuffer);
  const result = parseSpreadsheetBuffer(buffer, fileName);
  parentPort?.postMessage({ ok: true as const, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false as const,
    error: error instanceof Error ? error.message : String(error),
  });
}
