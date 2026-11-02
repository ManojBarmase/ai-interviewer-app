import { kv } from '@vercel/kv';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getLive } from '@/app/api/health/live/route';
import { GET as getReady } from '@/app/api/health/ready/route';
import { GET as getHealth } from '@/app/api/health/route';
import { prisma } from '@/server/db/prisma';
import { groq } from '@/server/integrations/ai/groq.client';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@vercel/kv', () => ({
  kv: {
    ping: vi.fn(),
  },
}));

vi.mock('@/server/integrations/ai/groq.client', () => ({
  groq: {
    models: {
      list: vi.fn(),
    },
  },
}));

describe('Health and Telemetry API Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GROQ_API_KEY = 'gsk_valid_mock_groq_api_key_1234567890';
    process.env.KV_REST_API_URL = 'https://test-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'test-token';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://valid-test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'valid-anon-key';

    // Default healthy mock behaviors
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '?column?': 1 }]);
    vi.mocked(kv.ping).mockResolvedValue('PONG');
    vi.mocked(groq.models.list).mockResolvedValue({
      data: [{ id: 'qwen/qwen3.8-27b' }],
    } as never);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: 'v2.197.0', name: 'GoTrue' }),
    } as Response);
  });

  describe('GET /api/health (Deep Health & Live Telemetry)', () => {
    it('returns HTTP 200 with status "ok" and full telemetry when all services are healthy', async () => {
      const response = await getHealth();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.version).toBeDefined();
      expect(data.environment).toBeDefined();
      expect(typeof data.uptime).toBe('number');
      expect(data.timestamp).toBeDefined();

      // System telemetry
      expect(data.system).toBeDefined();
      expect(data.system.uptime).toBeGreaterThanOrEqual(0);
      expect(data.system.memory).toBeDefined();
      expect(data.system.memory.heapUsed).toBeGreaterThan(0);
      expect(data.system.nodeVersion).toBeDefined();

      // Services status breakdown
      expect(data.services.database.status).toBe('ok');
      expect(typeof data.services.database.latencyMs).toBe('number');

      expect(data.services.cache.status).toBe('ok');
      expect(typeof data.services.cache.latencyMs).toBe('number');
      expect(data.services.redis.status).toBe('ok');

      expect(data.services.groq.status).toBe('ok');
      expect(data.services.groq.keyConfigured).toBe(true);

      expect(data.services.auth.status).toBe('ok');

      // Verify no-store cache control headers
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    });

    it('returns HTTP 503 with status "error" when the database is unreachable', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
        new Error('Connection terminated unexpectedly'),
      );

      const response = await getHealth();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('error');
      expect(data.services.database.status).toBe('error');
      expect(data.services.database.error).toContain(
        'Connection terminated unexpectedly',
      );
      // Cache was healthy
      expect(data.services.cache.status).toBe('ok');
    });

    it('returns HTTP 503 with status "error" when Redis cache is unreachable', async () => {
      vi.mocked(kv.ping).mockRejectedValueOnce(
        new Error('Upstash cluster timeout'),
      );

      const response = await getHealth();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('error');
      expect(data.services.cache.status).toBe('error');
      expect(data.services.cache.error).toContain('Upstash cluster timeout');
      // Database was healthy
      expect(data.services.database.status).toBe('ok');
    });

    it('returns HTTP 503 when both Database and Redis are down', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
        new Error('DB connection refused'),
      );
      vi.mocked(kv.ping).mockRejectedValueOnce(
        new Error('Redis connection refused'),
      );

      const response = await getHealth();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('error');
      expect(data.services.database.status).toBe('error');
      expect(data.services.cache.status).toBe('error');
    });

    it('returns HTTP 200 with status "degraded" when Groq AI is unavailable but critical services are healthy', async () => {
      vi.mocked(groq.models.list).mockRejectedValueOnce(
        new Error('Groq 429 Rate limit exceeded'),
      );

      const response = await getHealth();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('degraded');
      expect(data.services.groq.status).toBe('error');
      expect(data.services.groq.error).toContain(
        'Groq 429 Rate limit exceeded',
      );
      expect(data.services.database.status).toBe('ok');
      expect(data.services.cache.status).toBe('ok');
    });

    it('returns HTTP 200 with status "degraded" when Groq API key is unconfigured', async () => {
      delete process.env.GROQ_API_KEY;

      const response = await getHealth();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('degraded');
      expect(data.services.groq.status).toBe('missing');
      expect(data.services.groq.keyConfigured).toBe(false);
    });

    it('returns HTTP 200 with status "degraded" when Groq API key has invalid format', async () => {
      process.env.GROQ_API_KEY = 'invalid-prefix-key';
      // Temporarily set NODE_ENV to production to test strict key format checking
      vi.stubEnv('NODE_ENV', 'production');

      try {
        const response = await getHealth();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.status).toBe('degraded');
        expect(data.services.groq.status).toBe('error');
        expect(data.services.groq.error).toContain(
          'Invalid GROQ_API_KEY format',
        );
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('returns HTTP 200 with status "degraded" when Supabase Auth returns an HTTP error', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 502,
      } as Response);

      const response = await getHealth();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('degraded');
      expect(data.services.auth.status).toBe('error');
      expect(data.services.auth.error).toContain('HTTP 502');
      expect(data.services.database.status).toBe('ok');
      expect(data.services.cache.status).toBe('ok');
    });

    it('returns HTTP 200 with status "degraded" when Supabase Auth network fails', async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('ENOTFOUND test.supabase.co'));

      const response = await getHealth();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('degraded');
      expect(data.services.auth.status).toBe('error');
      expect(data.services.auth.error).toContain('ENOTFOUND test.supabase.co');
    });

    it('reports missing Supabase Auth when credentials are unconfigured', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      const response = await getHealth();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('degraded');
      expect(data.services.auth.status).toBe('missing');
      expect(data.services.auth.error).toContain('not configured');
    });
  });

  describe('GET /api/health/live (Kubernetes Liveness Probe)', () => {
    it('returns HTTP 200 with status "ok" and process uptime without invoking external services', async () => {
      const response = await getLive();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toBeDefined();

      // Zero external calls should occur during liveness check
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(kv.ping).not.toHaveBeenCalled();
      expect(groq.models.list).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/health/ready (Kubernetes Readiness Probe)', () => {
    it('returns HTTP 200 with status "ready" when both Database and Redis are healthy', async () => {
      const response = await getReady();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ready');
      expect(data.services.database.status).toBe('ok');
      expect(data.services.cache.status).toBe('ok');
      expect(data.services.redis.status).toBe('ok');
      expect(data.timestamp).toBeDefined();
    });

    it('returns HTTP 503 with status "not_ready" when Database is down', async () => {
      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
        new Error('Postgres connection pool exhausted'),
      );

      const response = await getReady();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('not_ready');
      expect(data.services.database.status).toBe('error');
      expect(data.services.database.error).toContain(
        'Postgres connection pool exhausted',
      );
      expect(data.services.cache.status).toBe('ok');
    });

    it('returns HTTP 503 with status "not_ready" when Redis is down', async () => {
      vi.mocked(kv.ping).mockRejectedValueOnce(
        new Error('Redis connection timed out'),
      );

      const response = await getReady();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('not_ready');
      expect(data.services.cache.status).toBe('error');
      expect(data.services.database.status).toBe('ok');
    });

    it('returns HTTP 503 when Redis credentials are not configured', async () => {
      delete process.env.KV_REST_API_URL;
      delete process.env.KV_REST_API_TOKEN;
      delete process.env.KV_URL;

      const response = await getReady();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('not_ready');
      expect(data.services.cache.status).toBe('error');
      expect(data.services.cache.error).toContain('not configured');
    });
  });
});
