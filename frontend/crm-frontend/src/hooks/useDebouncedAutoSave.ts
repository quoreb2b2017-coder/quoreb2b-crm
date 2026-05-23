'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useDebouncedAutoSave(
  enabled: boolean,
  trigger: unknown,
  save: () => Promise<void>,
  delayMs = 1200,
) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);
  const hasPendingRef = useRef(false);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const markDirty = useCallback(() => {
    if (!enabledRef.current) return;
    hasPendingRef.current = true;
    setStatus('pending');
  }, []);

  useEffect(() => {
    if (!enabled || !hasPendingRef.current) return;

    const timer = setTimeout(async () => {
      if (!hasPendingRef.current) return;
      setStatus('saving');
      try {
        await saveRef.current();
        hasPendingRef.current = false;
        setStatus('saved');
      } catch {
        setStatus('error');
      }
    }, delayMs);

    return () => clearTimeout(timer);
  }, [trigger, enabled, delayMs]);

  const flush = useCallback(async () => {
    if (!hasPendingRef.current) return;
    setStatus('saving');
    try {
      await saveRef.current();
      hasPendingRef.current = false;
      setStatus('saved');
    } catch {
      setStatus('error');
      throw new Error('Save failed');
    }
  }, []);

  const clearStatus = useCallback(() => {
    hasPendingRef.current = false;
    setStatus('idle');
  }, []);

  return { status, markDirty, flush, clearStatus };
}
