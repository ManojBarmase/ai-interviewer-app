/**
 * @file CLI Health Check & Diagnostics Runner
 * Usage:
 *   npm run health-check
 *   tsx scripts/health-check.ts
 */

import { loadEnvConfig } from '@next/env';

// Load .env and .env.local if running standalone outside of Next.js dev server
loadEnvConfig(process.cwd());

// Mock 'server-only' for standalone CLI execution
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    paths: [],
    children: [],
  } as unknown as NodeModule;
} catch {
  // Ignored if server-only cannot be resolved
}

async function main() {
  const url = process.env.HEALTH_CHECK_URL || 'http://localhost:3000/api/health';

  console.log(`[health-check] Probing ${url}...`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const body = await res.json();
    console.log(`[health-check] HTTP Status: ${res.status}`);
    console.log(JSON.stringify(body, null, 2));

    if (!res.ok) {
      console.error(`\n[health-check] FAILED: Service reported degraded or unhealthy status (HTTP ${res.status})`);
      process.exit(1);
    }

    console.log('\n[health-check] SUCCESS: All health checks passed.');
    process.exit(0);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.warn(`[health-check] Note: HTTP probe to ${url} not connected (${error.message}).`);
    console.log('[health-check] Executing in-process deep health probe...\n');

    // Run in-process probe
    try {
      const {
        probeDatabase,
        probeCache,
        probeGroqAi,
        probeSupabaseAuth,
        getSystemTelemetry,
      } = await import('../src/server/services/health.service');

      const [database, cache, groq, auth] = await Promise.all([
        probeDatabase(3000),
        probeCache(3000),
        probeGroqAi(3000),
        probeSupabaseAuth(3000),
      ]);

      const telemetry = getSystemTelemetry();
      const isCriticalOperational = database.status === 'ok' && cache.status === 'ok';
      const isDegraded = isCriticalOperational && (groq.status !== 'ok' || auth.status !== 'ok');
      const overallStatus = !isCriticalOperational ? 'error' : isDegraded ? 'degraded' : 'ok';

      const payload = {
        status: overallStatus,
        timestamp: telemetry.timestamp,
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
      };

      console.log(JSON.stringify(payload, null, 2));

      if (!isCriticalOperational) {
        console.error('\n[health-check] FAILED: Critical infrastructure (Database or Redis) is down.');
        process.exit(1);
      }

      console.log('\n[health-check] SUCCESS: Direct infrastructure probe operational.');
      process.exit(0);
    } catch (directErr) {
      console.error('[health-check] Critical error executing in-process probe:', directErr);
      process.exit(1);
    }
  }
}

main();
