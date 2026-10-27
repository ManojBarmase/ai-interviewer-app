import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purgeExpiredData } from '../../../scripts/purge-expired-data';

describe('purgeExpiredData utility (GDPR 30-Day Retention)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('permanently deletes soft-deleted records older than 30 days in a transaction', async () => {
    const mockTx = {
      session: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'expired-sess-1' },
            { id: 'expired-sess-2' },
          ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      interviewTranscript: {
        deleteMany: vi.fn().mockResolvedValue({ count: 8 }),
      },
      scorecard: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };

    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) =>
        callback(mockTx),
      ),
    } as any;

    const result = await purgeExpiredData(30, mockPrisma);

    expect(result.retentionDays).toBe(30);
    expect(result.transcriptsCount).toBe(8);
    expect(result.scorecardsCount).toBe(2);
    expect(result.sessionsCount).toBe(2);
    expect(result.totalCount).toBe(12);

    expect(mockTx.session.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: true,
        deletedAt: { lt: expect.any(Date) },
      },
      select: { id: true },
    });

    expect(mockTx.interviewTranscript.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { isDeleted: true, deletedAt: { lt: expect.any(Date) } },
          { sessionId: { in: ['expired-sess-1', 'expired-sess-2'] } },
        ],
      },
    });

    expect(mockTx.scorecard.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { isDeleted: true, deletedAt: { lt: expect.any(Date) } },
          { sessionId: { in: ['expired-sess-1', 'expired-sess-2'] } },
        ],
      },
    });

    expect(mockTx.session.deleteMany).toHaveBeenCalledWith({
      where: {
        isDeleted: true,
        deletedAt: { lt: expect.any(Date) },
      },
    });
  });

  it('handles empty results when no records are expired', async () => {
    const mockTx = {
      session: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      interviewTranscript: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      scorecard: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const mockPrisma = {
      $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) =>
        callback(mockTx),
      ),
    } as any;

    const result = await purgeExpiredData(30, mockPrisma);

    expect(result.transcriptsCount).toBe(0);
    expect(result.scorecardsCount).toBe(0);
    expect(result.sessionsCount).toBe(0);
    expect(result.totalCount).toBe(0);
  });
});
