import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HiringRecommendation,
  InterviewType,
  prisma,
} from '@/server/db/prisma';
import { scorecardRepository } from '@/server/repositories/scorecard.repository';
import { decryptText, encryptText } from '@/server/utils/crypto';

vi.mock('@/server/db/prisma', async (importOriginal) => {
  const actual = (await importOriginal()) as {
    prisma: Record<string, unknown>;
    [key: string]: unknown;
  };

  const mockTx = {
    user: {
      upsert: vi.fn(),
    },
    session: {
      upsert: vi.fn(),
    },
    scorecard: {
      upsert: vi.fn(),
    },
  };

  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      $transaction: vi.fn(async (cb: (tx: typeof mockTx) => Promise<unknown>) =>
        cb(mockTx),
      ),
      scorecard: {
        findUnique: vi.fn(),
      },
    },
    mockTx,
  };
});

describe('ScorecardRepository with PII Encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveEvaluation', () => {
    it('encrypts narrative feedback fields before persisting to database', async () => {
      let capturedScorecardPayload: Record<string, unknown> | null = null;

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (callback: any) => {
          const tx = {
            user: { upsert: vi.fn() },
            session: { upsert: vi.fn() },
            scorecard: {
              upsert: vi.fn().mockImplementation(({ create }) => {
                capturedScorecardPayload = create;
                return Promise.resolve(create);
              }),
            },
          };
          return callback(tx);
        },
      );

      const rawStrengths = [
        'Deep understanding of React 19 RSC',
        'Great INP diagnosis',
      ];
      const rawWeaknesses = ['Edge caching details were light'];
      const rawDetailedFeedback =
        'Candidate performed at senior level in frontend architecture.';

      await scorecardRepository.saveEvaluation({
        userId: 'user-123',
        userEmail: 'candidate@example.com',
        userFirstName: 'Alex',
        sessionId: 'session-456',
        sessionTitle: 'Frontend Technical Interview',
        interviewType: InterviewType.TECHNICAL,
        sessionStartedAt: new Date(),
        sessionEndedAt: new Date(),
        calculatedDuration: 2700,
        technicalScore: 9,
        communicationScore: 8.5,
        problemSolvingScore: 9,
        cultureFitScore: 8.5,
        overallScore: 8.8,
        strengths: rawStrengths,
        weaknesses: rawWeaknesses,
        actionableFeedback: rawDetailedFeedback,
        recommendation: 'STRONG_YES',
      });

      expect(capturedScorecardPayload).not.toBeNull();
      const payload = capturedScorecardPayload as any;

      // Ensure fields are NOT saved as plaintext
      expect(payload.strengths).not.toBe(rawStrengths.join('\n- '));
      expect(payload.weaknesses).not.toBe(rawWeaknesses.join('\n- '));
      expect(payload.detailedFeedback).not.toBe(rawDetailedFeedback);

      // Verify that the saved strings are valid AES-256-GCM ciphertexts and decrypt cleanly
      expect(decryptText(payload.strengths)).toBe(rawStrengths.join('\n- '));
      expect(decryptText(payload.weaknesses)).toBe(rawWeaknesses.join('\n- '));
      expect(decryptText(payload.detailedFeedback)).toBe(rawDetailedFeedback);
    });
  });

  describe('findBySessionId and findById decryption on read', () => {
    it('decrypts encrypted narrative fields when retrieving a scorecard by sessionId', async () => {
      const rawStrengths = 'Excellent modular design';
      const rawWeaknesses = 'Could improve concurrency handling';
      const rawFeedback = 'Solid candidate with good technical instincts.';

      const encryptedScorecard = {
        id: 'sc-1',
        sessionId: 'sess-1',
        userId: 'u-1',
        overallScore: 8.5,
        strengths: encryptText(rawStrengths),
        weaknesses: encryptText(rawWeaknesses),
        detailedFeedback: encryptText(rawFeedback),
        recommendation: HiringRecommendation.YES,
      };

      vi.mocked(prisma.scorecard.findUnique).mockResolvedValueOnce(
        encryptedScorecard as never,
      );

      const result = await scorecardRepository.findBySessionId('sess-1');

      expect(result).not.toBeNull();
      expect(result?.strengths).toBe(rawStrengths);
      expect(result?.weaknesses).toBe(rawWeaknesses);
      expect(result?.detailedFeedback).toBe(rawFeedback);
    });

    it('gracefully handles legacy unencrypted plaintext records on read', async () => {
      const legacyScorecard = {
        id: 'sc-legacy',
        sessionId: 'sess-legacy',
        userId: 'u-legacy',
        overallScore: 7.0,
        strengths: 'Legacy unencrypted strengths',
        weaknesses: 'Legacy unencrypted weaknesses',
        detailedFeedback: 'Legacy unencrypted feedback',
        recommendation: HiringRecommendation.NEUTRAL,
      };

      vi.mocked(prisma.scorecard.findUnique).mockResolvedValueOnce(
        legacyScorecard as never,
      );

      const result = await scorecardRepository.findBySessionId('sess-legacy');

      expect(result).not.toBeNull();
      expect(result?.strengths).toBe('Legacy unencrypted strengths');
      expect(result?.weaknesses).toBe('Legacy unencrypted weaknesses');
      expect(result?.detailedFeedback).toBe('Legacy unencrypted feedback');
    });

    it('decrypts fields when retrieving a scorecard by id', async () => {
      const plainStrengths = 'Strong STAR communication';
      const encryptedScorecard = {
        id: 'sc-by-id',
        sessionId: 'sess-2',
        strengths: encryptText(plainStrengths),
        weaknesses: null,
        detailedFeedback: null,
      };

      vi.mocked(prisma.scorecard.findUnique).mockResolvedValueOnce(
        encryptedScorecard as never,
      );

      const result = await scorecardRepository.findById('sc-by-id');

      expect(result).not.toBeNull();
      expect(result?.strengths).toBe(plainStrengths);
      expect(result?.weaknesses).toBeNull();
      expect(result?.detailedFeedback).toBeNull();
    });
  });
});
