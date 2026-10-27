import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HiringRecommendation,
  InterviewType,
  Prisma,
  prisma,
} from '@/server/db/prisma';
import {
  normalizeInterviewType,
  normalizeRecommendation,
  scorecardRepository,
} from '@/server/repositories/scorecard.repository';
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

describe('ScorecardRepository and Normalization Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeRecommendation enum mapping', () => {
    it('correctly maps valid recommendation strings to HiringRecommendation enums', () => {
      expect(normalizeRecommendation('STRONG_YES')).toBe(
        HiringRecommendation.STRONG_YES,
      );
      expect(normalizeRecommendation('YES')).toBe(HiringRecommendation.YES);
      expect(normalizeRecommendation('NEUTRAL')).toBe(
        HiringRecommendation.NEUTRAL,
      );
      expect(normalizeRecommendation('NO')).toBe(HiringRecommendation.NO);
      expect(normalizeRecommendation('STRONG_NO')).toBe(
        HiringRecommendation.STRONG_NO,
      );
    });

    it('falls back to NEUTRAL for undefined, null, or unknown values', () => {
      expect(normalizeRecommendation(undefined)).toBe(
        HiringRecommendation.NEUTRAL,
      );
      expect(normalizeRecommendation(null)).toBe(HiringRecommendation.NEUTRAL);
      expect(normalizeRecommendation('MAYBE')).toBe(
        HiringRecommendation.NEUTRAL,
      );
      expect(normalizeRecommendation('')).toBe(HiringRecommendation.NEUTRAL);
      expect(normalizeRecommendation('HIRE')).toBe(
        HiringRecommendation.NEUTRAL,
      );
    });
  });

  describe('normalizeInterviewType enum mapping', () => {
    it('correctly maps variations of interview types', () => {
      expect(normalizeInterviewType('BEHAVIORAL')).toBe(
        InterviewType.BEHAVIOURAL,
      );
      expect(normalizeInterviewType('BEHAVIOURAL')).toBe(
        InterviewType.BEHAVIOURAL,
      );
      expect(normalizeInterviewType(' behavioral ')).toBe(
        InterviewType.BEHAVIOURAL,
      );

      expect(normalizeInterviewType('SYSTEM_DESIGN')).toBe(
        InterviewType.SYSTEM_DESIGN,
      );
      expect(normalizeInterviewType('system-design')).toBe(
        InterviewType.SYSTEM_DESIGN,
      );
      expect(normalizeInterviewType('SYSTEMDESIGN')).toBe(
        InterviewType.SYSTEM_DESIGN,
      );

      expect(normalizeInterviewType('HR')).toBe(InterviewType.HR);
      expect(normalizeInterviewType('HUMAN_RESOURCES')).toBe(InterviewType.HR);
      expect(normalizeInterviewType('human-resources')).toBe(InterviewType.HR);

      expect(normalizeInterviewType('FULL_LOOP')).toBe(InterviewType.MIXED);
      expect(normalizeInterviewType('FULLLOOP')).toBe(InterviewType.MIXED);
      expect(normalizeInterviewType('MIXED')).toBe(InterviewType.MIXED);
      expect(normalizeInterviewType('full-loop')).toBe(InterviewType.MIXED);

      expect(normalizeInterviewType('CODING')).toBe(InterviewType.TECHNICAL);
      expect(normalizeInterviewType('TECHNICAL')).toBe(InterviewType.TECHNICAL);
      expect(normalizeInterviewType('technical')).toBe(InterviewType.TECHNICAL);
    });

    it('falls back to TECHNICAL for null, undefined, empty, or unknown strings', () => {
      expect(normalizeInterviewType(null)).toBe(InterviewType.TECHNICAL);
      expect(normalizeInterviewType(undefined)).toBe(InterviewType.TECHNICAL);
      expect(normalizeInterviewType('' as any)).toBe(InterviewType.TECHNICAL);
      expect(normalizeInterviewType(123 as any)).toBe(InterviewType.TECHNICAL);
      expect(normalizeInterviewType('UNKNOWN_DOMAIN')).toBe(
        InterviewType.TECHNICAL,
      );
    });
  });

  describe('saveEvaluation transactional upsert', () => {
    it('atomically upserts user, session, and scorecard with all score dimensions', async () => {
      const userUpsertMock = vi.fn().mockResolvedValue({});
      const sessionUpsertMock = vi.fn().mockResolvedValue({});
      const scorecardUpsertMock = vi.fn().mockResolvedValue({});

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (callback: any) => {
          const tx = {
            user: { upsert: userUpsertMock },
            session: { upsert: sessionUpsertMock },
            scorecard: { upsert: scorecardUpsertMock },
          };
          return callback(tx);
        },
      );

      const startedAt = new Date('2026-10-27T10:00:00Z');
      const endedAt = new Date('2026-10-27T10:45:00Z');
      const mockQuestions = [
        {
          id: 'q1',
          question: 'Explain React Server Components',
          score: 9,
          feedback: 'Comprehensive understanding',
        },
      ];

      await scorecardRepository.saveEvaluation({
        userId: 'usr-42',
        userEmail: 'dev@company.com',
        userFirstName: 'Jordan',
        sessionId: 'sess-99',
        sessionTitle: 'Senior Systems Architect Interview',
        interviewType: InterviewType.SYSTEM_DESIGN,
        sessionStartedAt: startedAt,
        sessionEndedAt: endedAt,
        calculatedDuration: 2700,
        technicalScore: 9.2,
        communicationScore: 8.8,
        problemSolvingScore: 9.5,
        cultureFitScore: 8.5,
        overallScore: 9.0,
        strengths: ['Deep distributed systems knowledge', 'Clear communicator'],
        weaknesses: ['Could elaborate more on observability metrics'],
        actionableFeedback: 'Solid hire for the infrastructure team.',
        recommendation: 'STRONG_YES',
        questions: mockQuestions,
      });

      // 1. Validate User Upsert
      expect(userUpsertMock).toHaveBeenCalledWith({
        where: { id: 'usr-42' },
        update: {},
        create: {
          id: 'usr-42',
          email: 'dev@company.com',
          name: 'Jordan',
        },
      });

      // 2. Validate Session Upsert
      expect(sessionUpsertMock).toHaveBeenCalledWith({
        where: { id: 'sess-99' },
        update: {
          status: 'COMPLETED',
          title: 'Senior Systems Architect Interview',
          interviewType: InterviewType.SYSTEM_DESIGN,
          startedAt,
          endedAt,
          durationSeconds: 2700,
        },
        create: {
          id: 'sess-99',
          userId: 'usr-42',
          title: 'Senior Systems Architect Interview',
          interviewType: InterviewType.SYSTEM_DESIGN,
          status: 'COMPLETED',
          startedAt,
          endedAt,
          durationSeconds: 2700,
        },
      });

      // 3. Validate Scorecard Upsert
      expect(scorecardUpsertMock).toHaveBeenCalledTimes(1);
      const scorecardArgs = scorecardUpsertMock.mock.calls[0]?.[0];
      expect(scorecardArgs).toBeDefined();

      expect(scorecardArgs.where).toEqual({ sessionId: 'sess-99' });

      // Check create and update properties
      expect(scorecardArgs.create.userId).toBe('usr-42');
      expect(scorecardArgs.create.sessionId).toBe('sess-99');
      expect(scorecardArgs.create.technicalScore).toBe(9.2);
      expect(scorecardArgs.create.communicationScore).toBe(8.8);
      expect(scorecardArgs.create.problemSolvingScore).toBe(9.5);
      expect(scorecardArgs.create.cultureFitScore).toBe(8.5);
      expect(scorecardArgs.create.overallScore).toBe(9.0);
      expect(scorecardArgs.create.recommendation).toBe(
        HiringRecommendation.STRONG_YES,
      );
      expect(scorecardArgs.create.dimensionBreakdown).toBe(
        JSON.stringify(mockQuestions),
      );

      // Verify AES-256-GCM encryption of sensitive narrative fields
      expect(decryptText(scorecardArgs.create.strengths)).toBe(
        'Deep distributed systems knowledge\n- Clear communicator',
      );
      expect(decryptText(scorecardArgs.create.weaknesses)).toBe(
        'Could elaborate more on observability metrics',
      );
      expect(decryptText(scorecardArgs.create.detailedFeedback)).toBe(
        'Solid hire for the infrastructure team.',
      );
    });

    it('sets dimensionBreakdown to JsonNull when questions parameter is omitted', async () => {
      let capturedArgs: any = null;

      vi.mocked(prisma.$transaction).mockImplementationOnce(
        async (callback: any) => {
          const tx = {
            user: { upsert: vi.fn() },
            session: { upsert: vi.fn() },
            scorecard: {
              upsert: vi.fn().mockImplementation((args) => {
                capturedArgs = args;
                return Promise.resolve(args);
              }),
            },
          };
          return callback(tx);
        },
      );

      await scorecardRepository.saveEvaluation({
        userId: 'usr-1',
        userEmail: 'user@example.com',
        userFirstName: 'Sam',
        sessionId: 'sess-1',
        sessionTitle: 'General Interview',
        interviewType: InterviewType.TECHNICAL,
        sessionStartedAt: new Date(),
        sessionEndedAt: new Date(),
        calculatedDuration: 1800,
        technicalScore: 7,
        communicationScore: 7,
        problemSolvingScore: 7,
        cultureFitScore: 7,
        overallScore: 7,
        strengths: ['Quick learner'],
        weaknesses: ['Needs more testing practice'],
        actionableFeedback: 'Progressing well.',
        recommendation: 'NEUTRAL',
        // questions omitted
      });

      expect(capturedArgs).not.toBeNull();
      expect(capturedArgs.create.dimensionBreakdown).toBe(Prisma.JsonNull);
      expect(capturedArgs.update.dimensionBreakdown).toBe(Prisma.JsonNull);
      expect(capturedArgs.create.recommendation).toBe(
        HiringRecommendation.NEUTRAL,
      );
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

    it('returns null when scorecard is not found by sessionId', async () => {
      vi.mocked(prisma.scorecard.findUnique).mockResolvedValueOnce(null);

      const result =
        await scorecardRepository.findBySessionId('non-existent-sess');
      expect(result).toBeNull();
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

    it('returns null when scorecard is not found by id', async () => {
      vi.mocked(prisma.scorecard.findUnique).mockResolvedValueOnce(null);

      const result = await scorecardRepository.findById('non-existent-id');
      expect(result).toBeNull();
    });
  });
});
