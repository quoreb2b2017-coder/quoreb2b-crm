/** Format Node.js memory usage for upload/import logs. */
export function formatMemoryUsage(): string {
  const m = process.memoryUsage();
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `rss=${mb(m.rss)} heap=${mb(m.heapUsed)}/${mb(m.heapTotal)} external=${mb(m.external)}`;
}

export interface MasterDataUploadMetrics {
  fileName: string;
  fileSizeBytes: number;
  diskSaveMs: number;
  handlerMs: number;
  memory: string;
}

export function logMasterDataUploadSaved(
  logger: { log: (message: string) => void },
  metrics: MasterDataUploadMetrics,
): void {
  const sizeMb = (metrics.fileSizeBytes / 1024 / 1024).toFixed(2);
  logger.log(
    `[master-data upload] saved file="${metrics.fileName}" size=${sizeMb}MB ` +
      `diskSaveMs=${metrics.diskSaveMs} handlerMs=${metrics.handlerMs} ${metrics.memory}`,
  );
}
