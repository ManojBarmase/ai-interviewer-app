/**
 * @file useAbortableEffect
 * @description A useEffect wrapper that automatically creates and passes an
 * AbortController signal to the callback, and aborts on cleanup.
 * Prevents async memory leaks and race conditions.
 *
 * @example
 * useAbortableEffect(async (signal) => {
 *   const result = await apiClient.get<Data>('/data', { signal });
 *   setData(result.data);
 * }, []);
 */
'use client';

import { type DependencyList, useEffect } from 'react';

type AbortableCallback = (signal: AbortSignal) => Promise<void> | void;

export function useAbortableEffect(
  callback: AbortableCallback,
  deps: DependencyList,
): void {
  useEffect(() => {
    const controller = new AbortController();

    void callback(controller.signal);

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
