import { NextResponse } from 'next/server';

import { probeCache, probeDatabase } from '@/server/services/health.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Kubernetes Readiness Probe Endpoint (/api/health/ready)
 *
 * Verifies that critical stateful dependencies (PostgreSQL database and Redis cache)
 * are healthy so Kubernetes ingress / load balancers know the pod can safely
 * accept and handle user traffic.
 *
 * Status code behavior:
 * - 200 OK: Both Database and Cache are operational. Pod is ready.
 * - 503 Service Unavailable: Either Database or Cache is unreachable. Pod is not ready.
 */
export async function GET() {
  const [database, cache] = await Promise.all([
    probeDatabase(2000),
    probeCache(2000),
  ]);

  const isReady = database.status === 'ok' && cache.status === 'ok';

  return NextResponse.json(
    {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      services: {
        database,
        cache,
        redis: cache,
      },
    },
    {
      status: isReady ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
