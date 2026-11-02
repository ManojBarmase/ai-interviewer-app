import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Kubernetes Liveness Probe Endpoint (/api/health/live)
 *
 * Lightweight liveness probe to verify that the Node.js server process
 * is responsive and has not deadlocked. Does not make external network
 * or database calls so downstream outages do not trigger container restarts.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}
