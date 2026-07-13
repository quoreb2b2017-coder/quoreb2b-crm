import { Injectable } from '@nestjs/common';

/** In-process lock when Redis/BullMQ is disabled (local dev without Memurai). */
@Injectable()
export class CsvImportLockServiceNoop {
  private readonly held = new Map<string, string>();

  async acquire(masterKey: string, jobId: string): Promise<boolean> {
    const current = this.held.get(masterKey);
    if (current && current !== jobId) {
      return false;
    }
    this.held.set(masterKey, jobId);
    return true;
  }

  async release(masterKey: string, jobId: string): Promise<void> {
    if (this.held.get(masterKey) === jobId) {
      this.held.delete(masterKey);
    }
  }
}
