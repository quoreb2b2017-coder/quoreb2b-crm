'use client';

import { useEffect, useState, useCallback } from 'react';
import { deduplicatedFetch } from '@/lib/api/cache';

interface UseFetchOptions {
  skip?: boolean;
  onError?: (error: Error) => void;
}

export function useFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: UseFetchOptions,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!options?.skip);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (options?.skip) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await deduplicatedFetch(key, fetcher);
      setData(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, options]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
