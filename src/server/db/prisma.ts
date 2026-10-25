import 'server-only';

/**
 * Prisma Client — Enterprise Singleton for Server-Side Workloads
 *
 * Singleton Pattern:
 * In development (with Next.js Hot Module Replacement / Turbopack) and serverless environments,
 * re-instantiating PrismaClient on every module re-evaluation creates runaway database connection
 * exhaustion. By storing the instance on `globalThis.__prisma`, a single long-lived PrismaClient
 * instance is preserved and reused.
 *
 * Supabase PgBouncer & Connection Pooling:
 * For serverless deployments (such as Vercel), DATABASE_URL should point to the Supabase PgBouncer
 * transaction pooler (port 6543) with query parameters: `?pgbouncer=true&connection_limit=1`.
 * In serverless architectures, each function invocation handles requests concurrently in isolated
 * micro-containers; enforcing `connection_limit=1` prevents individual container instances from
 * consuming more than a single connection, avoiding Postgres pool exhaustion under high concurrency.
 */

import { PrismaClient } from '@prisma/client';

import type { Prisma } from '@prisma/client';

export {
  Prisma,
  InterviewType,
  HiringRecommendation,
  SessionStatus,
  UserRole,
} from '@prisma/client';

// -- Type augmentation for globalThis -----------------------------------------
declare global {
  var __prisma: PrismaClient | undefined;
}

// -- Log configuration ---------------------------------------------------------
const isDev = process.env.NODE_ENV === 'development';

const logConfig: Prisma.LogLevel[] = isDev
  ? ['query', 'warn', 'error']
  : ['error'];

// -- Client factory ------------------------------------------------------------
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: logConfig,
    errorFormat: isDev ? 'pretty' : 'colorless',
    datasources: {
      db: {
        url: process.env.DATABASE_URL ?? '',
      },
    },
  });
}

// -- Singleton export ----------------------------------------------------------
export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (isDev) {
  globalThis.__prisma = prisma;
}

// Graceful shutdown handler for non-serverless environments
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}
