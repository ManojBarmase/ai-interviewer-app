import 'server-only';

/**
 * Prisma Client — Enterprise Singleton for Server-Side Workloads
 *
 * Configured with connection pooling, structured query logging, and globalThis
 * caching across Next.js Turbopack / HMR re-evaluations.
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
  });
}

// -- Singleton export ----------------------------------------------------------
export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (isDev) {
  globalThis.__prisma = prisma;
}
