function messageFromUnknown(msg: unknown): string | null {
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (Array.isArray(msg)) {
    const parts = msg.map(String).filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }
  if (msg && typeof msg === 'object') {
    const o = msg as Record<string, unknown>;
    const nested = messageFromUnknown(o.message);
    if (nested) return nested;
    if (typeof o.error === 'string' && o.error.trim()) return o.error;
  }
  return null;
}

/** Turn API/axios errors into a safe string for UI (never returns an object). */
export function extractApiError(err: unknown, fallback = 'Request failed'): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;

  if (data) {
    const fromMessage = messageFromUnknown(data.message);
    if (fromMessage) return fromMessage;
    if (typeof data.error === 'string' && data.error.trim()) return data.error;
  }

  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
