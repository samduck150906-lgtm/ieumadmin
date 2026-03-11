import { useState, useEffect, useCallback } from 'react';

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number
): (...args: A) => void {
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  const debounced = useCallback(
    (...args: A) => {
      if (timeoutId) clearTimeout(timeoutId);
      setTimeoutId(setTimeout(() => { fn(...args); setTimeoutId(null); }, delayMs));
    },
    [delayMs, fn, timeoutId]
  );

  useEffect(() => () => { if (timeoutId) clearTimeout(timeoutId); }, [timeoutId]);

  return debounced;
}
