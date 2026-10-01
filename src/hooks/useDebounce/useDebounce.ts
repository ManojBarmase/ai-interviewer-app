/**
 * @file useDebounce
 * @description Debounces a value change by delaying its update.
 * Clears the timeout on cleanup to prevent memory leaks.
 *
 * @example
 * const debouncedQuery = useDebounce(searchQuery, 300);
 */
'use client';

import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    // Cleanup: cancel the pending timeout on value/delay change or unmount
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debouncedValue;
}
