import 'server-only';

import { kv } from '@vercel/kv';

import { createSessionLogger } from '@/lib/logger';

export type IdempotencyStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface IdempotencyRecord<T = unknown> {
  status: IdempotencyStatus;
  createdAt: number;
  completedAt?: number;
  data?: T;
}

export interface IdempotencyCheckResult<T = unknown> {
  inProgress?: boolean | undefined;
  cachedResponse?: T | undefined;
}

const IDEMPOTENCY_PREFIX = 'idempotency:';

interface MemoryEntry {
  record: IdempotencyRecord;
  expiresAt: number;
}

// In-memory fallback for environments without KV/Redis (e.g. testing, local dev, or outage)
const memoryStore = new Map<string, MemoryEntry>();

function isKvConfigured(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    process.env.KV_URL,
  );
}

/**
 * Checks if an idempotency key is already processing or completed,
 * or locks it with an in-progress status if new.
 *
 * @param key The idempotency key provided in the request
 * @param ttlSeconds Lock TTL in seconds (default: 120s)
 */
export async function checkAndLockIdempotencyKey<T = unknown>(
  key: string,
  ttlSeconds = 120,
): Promise<IdempotencyCheckResult<T>> {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    return { inProgress: false };
  }

  const cacheKey = `${IDEMPOTENCY_PREFIX}${key.trim()}`;

  if (isKvConfigured()) {
    try {
      // Atomic lock acquisition via SET ... NX EX
      const lockAcquired = await kv.set(
        cacheKey,
        { status: 'IN_PROGRESS', createdAt: Date.now() },
        { ex: ttlSeconds, nx: true },
      );

      if (lockAcquired === 'OK') {
        return { inProgress: false };
      }

      // Key already exists, inspect current state
      const existing = await kv.get<IdempotencyRecord<T>>(cacheKey);

      if (!existing) {
        return { inProgress: false };
      }

      if (existing.status === 'COMPLETED') {
        return { cachedResponse: existing.data };
      }

      return { inProgress: true };
    } catch (err) {
      const logger = createSessionLogger('idempotency', {
        route: 'idempotency-check',
      });
      logger.warn(
        { err, key },
        'KV cache unavailable during checkAndLockIdempotencyKey — falling back to memory store',
      );
    }
  }

  // In-memory fallback
  const now = Date.now();
  const entry = memoryStore.get(cacheKey);

  if (entry && now < entry.expiresAt) {
    if (entry.record.status === 'COMPLETED') {
      return { cachedResponse: entry.record.data as T };
    }
    return { inProgress: true };
  }

  // Acquire in-memory lock
  memoryStore.set(cacheKey, {
    record: {
      status: 'IN_PROGRESS',
      createdAt: now,
    },
    expiresAt: now + ttlSeconds * 1000,
  });

  return { inProgress: false };
}

/**
 * Caches the completed response for an idempotency key.
 *
 * @param key The idempotency key
 * @param responseData The response payload to cache
 * @param ttlSeconds TTL in seconds (default: 3600s / 1 hour)
 */
export async function storeIdempotentResponse<T = unknown>(
  key: string,
  responseData: T,
  ttlSeconds = 3600,
): Promise<void> {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    return;
  }

  const cacheKey = `${IDEMPOTENCY_PREFIX}${key.trim()}`;
  const now = Date.now();

  const record: IdempotencyRecord<T> = {
    status: 'COMPLETED',
    createdAt: now,
    completedAt: now,
    data: responseData,
  };

  if (isKvConfigured()) {
    try {
      await kv.set(cacheKey, record, { ex: ttlSeconds });
      return;
    } catch (err) {
      const logger = createSessionLogger('idempotency', {
        route: 'idempotency-store',
      });
      logger.warn(
        { err, key },
        'KV cache unavailable during storeIdempotentResponse — falling back to memory store',
      );
    }
  }

  memoryStore.set(cacheKey, {
    record: record as IdempotencyRecord,
    expiresAt: now + ttlSeconds * 1000,
  });
}

/**
 * Releases/clears an idempotency key (e.g. if request fails with an unhandled error).
 */
export async function releaseIdempotencyKey(key: string): Promise<void> {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    return;
  }

  const cacheKey = `${IDEMPOTENCY_PREFIX}${key.trim()}`;

  if (isKvConfigured()) {
    try {
      await kv.del(cacheKey);
      return;
    } catch {
      // Ignored on release
    }
  }

  memoryStore.delete(cacheKey);
}

/**
 * Helper to reset in-memory idempotency store (useful for testing).
 */
export function resetMemoryIdempotencyStore(): void {
  memoryStore.clear();
}
