/** api = HTTP only, worker = BullMQ only, all = both (default). */
export type ProcessRole = 'api' | 'worker' | 'all';

export function readProcessRole(): ProcessRole {
  const raw = (process.env.PROCESS_ROLE || 'all').toLowerCase();
  if (raw === 'api' || raw === 'worker') return raw;
  return 'all';
}

export function shouldRunHttp(role: ProcessRole = readProcessRole()): boolean {
  return role === 'all' || role === 'api';
}

export function shouldRunWorkers(role: ProcessRole = readProcessRole()): boolean {
  return role === 'all' || role === 'worker';
}
