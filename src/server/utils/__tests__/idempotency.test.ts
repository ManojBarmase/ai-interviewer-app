import { kv } from '@vercel/kv';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  checkAndLockIdempotencyKey,
  storeIdempotentResponse,
  releaseIdempotencyKey,
  resetMemoryIdempotencyStore,
} from '@/server/utils/idempotency';

vi.mock('@vercel/kv', () => ({
  kv: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

describe('Idempotency Utility', () => {
  const originalKvUrl = process.env.KV_REST_API_URL;
  const originalKvToken = process.env.KV_REST_API_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMemoryIdempotencyStore();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.KV_URL;
  });

  afterEach(() => {
    process.env.KV_REST_API_URL = originalKvUrl;
    process.env.KV_REST_API_TOKEN = originalKvToken;
    resetMemoryIdempotencyStore();
  });

  describe('In-Memory Fallback Mode (No KV credentials)', () => {
    it('returns inProgress: false when key is seen for the first time', async () => {
      const res = await checkAndLockIdempotencyKey('key-123');
      expect(res).toEqual({ inProgress: false });
    });

    it('returns inProgress: true when the same key is checked while processing', async () => {
      await checkAndLockIdempotencyKey('key-123');
      const secondCheck = await checkAndLockIdempotencyKey('key-123');
      expect(secondCheck).toEqual({ inProgress: true });
    });

    it('returns cachedResponse once response is stored', async () => {
      await checkAndLockIdempotencyKey('key-123');
      const mockPayload = { evaluationId: 'eval-999', score: 90 };

      await storeIdempotentResponse('key-123', mockPayload);

      const checkAfterStore = await checkAndLockIdempotencyKey('key-123');
      expect(checkAfterStore).toEqual({ cachedResponse: mockPayload });
    });

    it('allows re-locking after releaseIdempotencyKey is called', async () => {
      await checkAndLockIdempotencyKey('key-123');
      await releaseIdempotencyKey('key-123');

      const reCheck = await checkAndLockIdempotencyKey('key-123');
      expect(reCheck).toEqual({ inProgress: false });
    });

    it('safely handles empty or whitespace keys without locking', async () => {
      expect(await checkAndLockIdempotencyKey('')).toEqual({
        inProgress: false,
      });
      expect(await checkAndLockIdempotencyKey('   ')).toEqual({
        inProgress: false,
      });
      await storeIdempotentResponse('', { foo: 'bar' });
      await releaseIdempotencyKey('');
    });
  });

  describe('Distributed Upstash KV Mode', () => {
    beforeEach(() => {
      process.env.KV_REST_API_URL = 'https://mock-redis.upstash.io';
      process.env.KV_REST_API_TOKEN = 'mock-token';
    });

    it('returns inProgress: false when lock is acquired atomically via SET NX', async () => {
      vi.mocked(kv.set).mockResolvedValueOnce('OK' as never);

      const res = await checkAndLockIdempotencyKey('req-abc', 60);

      expect(res).toEqual({ inProgress: false });
      expect(kv.set).toHaveBeenCalledWith(
        'idempotency:req-abc',
        expect.objectContaining({ status: 'IN_PROGRESS' }),
        { ex: 60, nx: true },
      );
    });

    it('returns inProgress: true when key exists in KV and status is IN_PROGRESS', async () => {
      vi.mocked(kv.set).mockResolvedValueOnce(null as never);
      vi.mocked(kv.get).mockResolvedValueOnce({
        status: 'IN_PROGRESS',
        createdAt: Date.now(),
      } as never);

      const res = await checkAndLockIdempotencyKey('req-abc');

      expect(res).toEqual({ inProgress: true });
      expect(kv.get).toHaveBeenCalledWith('idempotency:req-abc');
    });

    it('returns cachedResponse when key exists in KV and status is COMPLETED', async () => {
      const cached = { result: 'all good' };
      vi.mocked(kv.set).mockResolvedValueOnce(null as never);
      vi.mocked(kv.get).mockResolvedValueOnce({
        status: 'COMPLETED',
        createdAt: Date.now(),
        completedAt: Date.now(),
        data: cached,
      } as never);

      const res = await checkAndLockIdempotencyKey('req-abc');

      expect(res).toEqual({ cachedResponse: cached });
    });

    it('stores completed response in KV with specified TTL', async () => {
      vi.mocked(kv.set).mockResolvedValueOnce('OK' as never);

      await storeIdempotentResponse('req-abc', { success: true }, 1800);

      expect(kv.set).toHaveBeenCalledWith(
        'idempotency:req-abc',
        expect.objectContaining({
          status: 'COMPLETED',
          data: { success: true },
        }),
        { ex: 1800 },
      );
    });

    it('calls kv.del on releaseIdempotencyKey', async () => {
      vi.mocked(kv.del).mockResolvedValueOnce(1 as never);

      await releaseIdempotencyKey('req-abc');

      expect(kv.del).toHaveBeenCalledWith('idempotency:req-abc');
    });

    it('gracefully degrades to in-memory fallback if KV throws an error', async () => {
      vi.mocked(kv.set).mockRejectedValueOnce(
        new Error('Redis connection timeout'),
      );

      const res = await checkAndLockIdempotencyKey('req-fallback');
      expect(res).toEqual({ inProgress: false });

      // Second check should now see the in-memory lock
      vi.mocked(kv.set).mockRejectedValueOnce(
        new Error('Redis connection timeout'),
      );
      const secondRes = await checkAndLockIdempotencyKey('req-fallback');
      expect(secondRes).toEqual({ inProgress: true });
    });
  });
});
