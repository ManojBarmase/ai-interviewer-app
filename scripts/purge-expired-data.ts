/**
 * @file scripts/purge-expired-data.ts
 * @description GDPR 30-Day Retention Policy Automated Purge Utility (CAT-4 & CAT-12)
 *
 * Hard-deletes soft-deleted records (`isDeleted: true` and `deletedAt < NOW() - 30 days`)
 * to comply with GDPR Right-to-Erasure and SOC2 storage retention mandates.
 *
 * Execution:
 *   npx tsx scripts/purge-expired-data.ts
 *   npm run db:purge-expired
 */

import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';

// Ensure environment variables from .env and .env.local are loaded in standalone execution
loadEnvConfig(process.cwd());

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

export interface PurgeResult {
  retentionDays: number;
  cutoffDate: string;
  transcriptsCount: number;
  scorecardsCount: number;
  sessionsCount: number;
  totalCount: number;
}

/**
 * Permanently removes soft-deleted interview transcripts, scorecards, and sessions
 * exceeding the data retention threshold in a safe batch transaction.
 *
 * @param retentionDays - Days after soft-deletion before records are permanently erased (default: 30)
 * @param db - Prisma client instance
 */
export async function purgeExpiredData(
  retentionDays = 30,
  db: PrismaClient = prisma,
): Promise<PurgeResult> {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  return await db.$transaction(async (tx) => {
    // 1. Identify all soft-deleted sessions exceeding the retention threshold
    const expiredSessions = await tx.session.findMany({
      where: {
        isDeleted: true,
        deletedAt: { lt: cutoffDate },
      },
      select: { id: true },
    });
    const expiredSessionIds = expiredSessions.map((s) => s.id);

    // 2. Permanently delete matching transcript records
    //    (either soft-deleted individually older than cutoff OR belonging to expired sessions)
    const deletedTranscripts = await tx.interviewTranscript.deleteMany({
      where: {
        OR: [
          { isDeleted: true, deletedAt: { lt: cutoffDate } },
          ...(expiredSessionIds.length > 0
            ? [{ sessionId: { in: expiredSessionIds } }]
            : []),
        ],
      },
    });

    // 3. Permanently delete matching scorecard records
    //    (either soft-deleted individually older than cutoff OR belonging to expired sessions)
    const deletedScorecards = await tx.scorecard.deleteMany({
      where: {
        OR: [
          { isDeleted: true, deletedAt: { lt: cutoffDate } },
          ...(expiredSessionIds.length > 0
            ? [{ sessionId: { in: expiredSessionIds } }]
            : []),
        ],
      },
    });

    // 4. Permanently delete expired sessions
    const deletedSessions = await tx.session.deleteMany({
      where: {
        isDeleted: true,
        deletedAt: { lt: cutoffDate },
      },
    });

    return {
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      transcriptsCount: deletedTranscripts.count,
      scorecardsCount: deletedScorecards.count,
      sessionsCount: deletedSessions.count,
      totalCount:
        deletedTranscripts.count +
        deletedScorecards.count +
        deletedSessions.count,
    };
  });
}

/**
 * CLI execution entrypoint
 */
async function main() {
  logger.info(
    { retentionDays: 30 },
    'Starting GDPR 30-day retention purge routine...',
  );

  try {
    const result = await purgeExpiredData(30, prisma);

    logger.info(
      {
        retentionDays: result.retentionDays,
        cutoffDate: result.cutoffDate,
        transcriptsPurged: result.transcriptsCount,
        scorecardsPurged: result.scorecardsCount,
        sessionsPurged: result.sessionsCount,
        totalPurged: result.totalCount,
      },
      `GDPR retention purge routine completed successfully. Permanently purged ${result.totalCount} records.`,
    );
  } catch (error) {
    logger.error(
      { err: error },
      'GDPR retention purge routine failed with unexpected error',
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Automatically invoke when executed directly via Node / tsx
if (
  process.argv[1]?.includes('purge-expired-data.ts') ||
  process.argv[1]?.includes('purge-expired-data.js')
) {
  void main();
}
