import 'server-only';

import { kv } from '@vercel/kv';

import { prisma } from '@/server/db/prisma';
import { groq } from '@/server/integrations/ai/groq.client';

export type ServiceStatus = 'ok' | 'error' | 'missing' | 'degraded';

export interface ServiceProbeResult {
  status: ServiceStatus;
  latencyMs: number;
  error?: string | undefined;
}

export interface GroqProbeResult extends ServiceProbeResult {
  keyConfigured: boolean;
}

export interface SystemTelemetry {
  uptime: number;
  memory: NodeJS.MemoryUsage;
  nodeVersion: string;
  platform: string;
  timestamp: string;
}

/**
 * Executes a promise with an enforced timeout threshold.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Deep probe for PostgreSQL primary database via Prisma
 */
export async function probeDatabase(
  timeoutMs = 2000,
): Promise<ServiceProbeResult> {
  const start = performance.now();
  try {
    await withTimeout(
      prisma.$queryRaw`SELECT 1`,
      timeoutMs,
      `Database query timed out after ${timeoutMs}ms`,
    );

    return {
      status: 'ok',
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Deep probe for Upstash Redis / Vercel KV distributed cache and rate limiter
 */
export async function probeCache(
  timeoutMs = 2000,
): Promise<ServiceProbeResult> {
  const start = performance.now();
  try {
    const isConfigured = Boolean(
      (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      process.env.KV_URL,
    );

    if (!isConfigured) {
      return {
        status: 'error',
        latencyMs: 0,
        error: 'Redis/KV credentials are not configured',
      };
    }

    const pong = await withTimeout(
      kv.ping(),
      timeoutMs,
      `Redis ping timed out after ${timeoutMs}ms`,
    );

    if (pong === 'PONG' || typeof pong === 'string') {
      return {
        status: 'ok',
        latencyMs: Math.round(performance.now() - start),
      };
    }

    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: `Unexpected Redis response: ${String(pong)}`,
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Deep probe for Groq AI inference API: validates key format and connectivity
 */
export async function probeGroqAi(timeoutMs = 2000): Promise<GroqProbeResult> {
  const start = performance.now();
  const apiKey = process.env.GROQ_API_KEY;

  const isConfigured = Boolean(
    apiKey &&
    apiKey.trim().length > 0 &&
    apiKey !== 'your-groq-api-key-here' &&
    !apiKey.includes('your_groq_api_key'),
  );

  if (!isConfigured || !apiKey) {
    return {
      status: 'missing',
      latencyMs: 0,
      keyConfigured: false,
      error: 'GROQ_API_KEY is not configured',
    };
  }

  // Verify key format: starts with 'gsk_' or mock in test mode
  const isValidFormat =
    apiKey.startsWith('gsk_') ||
    apiKey.startsWith('mock-') ||
    process.env.NODE_ENV === 'test';

  if (!isValidFormat) {
    return {
      status: 'error',
      latencyMs: 0,
      keyConfigured: false,
      error: 'Invalid GROQ_API_KEY format (expected gsk_...)',
    };
  }

  try {
    await withTimeout(
      groq.models.list(),
      timeoutMs,
      `Groq API connectivity timed out after ${timeoutMs}ms`,
    );

    return {
      status: 'ok',
      latencyMs: Math.round(performance.now() - start),
      keyConfigured: true,
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      keyConfigured: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Deep probe for Supabase Auth (GoTrue) service connectivity
 */
export async function probeSupabaseAuth(
  timeoutMs = 2000,
): Promise<ServiceProbeResult> {
  const start = performance.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isConfigured = Boolean(
    supabaseUrl &&
    anonKey &&
    !supabaseUrl.includes('your-project-ref') &&
    !anonKey.includes('your-anon-key'),
  );

  if (!isConfigured || !supabaseUrl || !anonKey) {
    return {
      status: 'missing',
      latencyMs: 0,
      error: 'Supabase URL or Anon Key is not configured',
    };
  }

  try {
    const healthUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(healthUrl, {
      method: 'GET',
      headers: { apikey: anonKey },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (res.ok) {
      return {
        status: 'ok',
        latencyMs: Math.round(performance.now() - start),
      };
    }

    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: `Supabase Auth responded with HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Collects runtime node process metrics and memory usage
 */
export function getSystemTelemetry(): SystemTelemetry {
  return {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version,
    platform: process.platform,
    timestamp: new Date().toISOString(),
  };
}
