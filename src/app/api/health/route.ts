import { NextResponse } from 'next/server';

import {
  getSystemTelemetry,
  probeCache,
  probeDatabase,
  probeGroqAi,
  probeSupabaseAuth,
} from '@/server/services/health.service';

import packageJson from '../../../../package.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Enterprise Deep Health Probe & Live Telemetry Endpoint
 *
 * Parallel probe:
 * - Database: PostgreSQL connection via Prisma query
 * - Cache / Rate Limiter: Upstash Redis / Vercel KV ping with 2-second timeout
 * - Groq AI: API key format validation and remote model listing connectivity
 * - Supabase Auth: GoTrue health endpoint probe
 * - System: process uptime, Node.js memory metrics (RSS, heap, buffers), platform info
 *
 * Status code behavior:
 * - 200 OK: Critical services (Database & Cache) are operational. Status is 'ok'
 *   or 'degraded' (if optional Groq or Supabase Auth is impaired).
 * - 503 Service Unavailable: Database or Cache is unreachable/unhealthy.
 */
export async function GET() {
  const [database, cache, groq, auth] = await Promise.all([
    probeDatabase(2000),
    probeCache(2000),
    probeGroqAi(2000),
    probeSupabaseAuth(2000),
  ]);

  const telemetry = getSystemTelemetry();

  // Database and Cache/Rate-Limiter are critical services for traffic handling
  const isCriticalOperational =
    database.status === 'ok' && cache.status === 'ok';

  // Degradation occurs when critical services work, but auxiliary AI or Auth probes fail
  const isDegraded =
    isCriticalOperational && (groq.status !== 'ok' || auth.status !== 'ok');

  const overallStatus: 'ok' | 'degraded' | 'error' = !isCriticalOperational
    ? 'error'
    : isDegraded
      ? 'degraded'
      : 'ok';

  const httpStatusCode = isCriticalOperational ? 200 : 503;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: telemetry.timestamp,
      version: packageJson.version,
      environment: process.env.NODE_ENV || 'development',
      uptime: telemetry.uptime,
      system: telemetry,
      services: {
        database,
        cache,
        redis: cache,
        groq,
        ai: groq,
        auth,
      },
    },
    {
      status: httpStatusCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
