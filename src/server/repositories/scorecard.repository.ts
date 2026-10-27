import 'server-only';

import {
  prisma,
  Prisma,
  InterviewType,
  HiringRecommendation,
} from '@/server/db/prisma';
import { encryptText, safeDecryptText } from '@/server/utils/crypto';

export interface SaveEvaluationParams {
  userId: string;
  userEmail: string;
  userFirstName: string;
  sessionId: string;
  sessionTitle: string;
  interviewType: InterviewType;
  sessionStartedAt: Date;
  sessionEndedAt: Date;
  calculatedDuration: number;
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  cultureFitScore: number;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  actionableFeedback: string;
  recommendation: string;
  questions?: unknown;
}

/**
 * Normalizes recommendation string to Prisma HiringRecommendation enum
 */
export function normalizeRecommendation(
  rec?: string | null,
): HiringRecommendation {
  switch (rec) {
    case 'STRONG_YES':
      return HiringRecommendation.STRONG_YES;
    case 'YES':
      return HiringRecommendation.YES;
    case 'NEUTRAL':
      return HiringRecommendation.NEUTRAL;
    case 'NO':
      return HiringRecommendation.NO;
    case 'STRONG_NO':
      return HiringRecommendation.STRONG_NO;
    default:
      return HiringRecommendation.NEUTRAL;
  }
}

/**
 * Normalizes user-provided or client-side interview type strings
 * into the strictly-typed PostgreSQL / Prisma `InterviewType` enum value.
 */
export function normalizeInterviewType(rawType?: string | null): InterviewType {
  if (!rawType || typeof rawType !== 'string') {
    return InterviewType.TECHNICAL;
  }

  const clean = rawType
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  switch (clean) {
    case 'BEHAVIORAL':
    case 'BEHAVIOURAL':
      return InterviewType.BEHAVIOURAL;

    case 'SYSTEM_DESIGN':
    case 'SYSTEMDESIGN':
      return InterviewType.SYSTEM_DESIGN;

    case 'HR':
    case 'HUMAN_RESOURCES':
      return InterviewType.HR;

    case 'FULL_LOOP':
    case 'FULLLOOP':
    case 'MIXED':
      return InterviewType.MIXED;

    case 'CODING':
    case 'TECHNICAL':
    default:
      return InterviewType.TECHNICAL;
  }
}

export class ScorecardRepository {
  /**
   * Decrypts sensitive narrative feedback fields on a Scorecard record.
   * If a field is already unencrypted plaintext (legacy records), it safely preserves the text.
   */
  decryptScorecard<
    T extends {
      strengths?: string | null;
      weaknesses?: string | null;
      detailedFeedback?: string | null;
    },
  >(scorecard: T): T {
    return {
      ...scorecard,
      strengths: safeDecryptText(scorecard.strengths),
      weaknesses: safeDecryptText(scorecard.weaknesses),
      detailedFeedback: safeDecryptText(scorecard.detailedFeedback),
    };
  }

  /**
   * Persists the evaluation results transactionally:
   * 1. Guarantees User record exists (satisfying foreign keys)
   * 2. Upserts the Session with COMPLETED status and metadata
   * 3. Upserts the Scorecard with all 5 competency dimensions and AES-256-GCM encrypted PII fields
   */
  async saveEvaluation(params: SaveEvaluationParams): Promise<void> {
    const {
      userId,
      userEmail,
      userFirstName,
      sessionId,
      sessionTitle,
      interviewType,
      sessionStartedAt,
      sessionEndedAt,
      calculatedDuration,
      technicalScore,
      communicationScore,
      problemSolvingScore,
      cultureFitScore,
      overallScore,
      strengths,
      weaknesses,
      actionableFeedback,
      recommendation,
      questions,
    } = params;

    const dimensionBreakdown = questions
      ? JSON.stringify(questions)
      : Prisma.JsonNull;
    const formattedStrengths = strengths.join('\n- ');
    const formattedWeaknesses = weaknesses.join('\n- ');

    // Encrypt sensitive PII narrative fields at rest using AES-256-GCM
    const encryptedStrengths = encryptText(formattedStrengths);
    const encryptedWeaknesses = encryptText(formattedWeaknesses);
    const encryptedDetailedFeedback = encryptText(actionableFeedback);

    await prisma.$transaction(async (tx) => {
      // 1. Ensure User exists
      await tx.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          email: userEmail,
          name: userFirstName,
        },
      });

      // 2. Ensure Session exists and is marked COMPLETED
      await tx.session.upsert({
        where: { id: sessionId },
        update: {
          status: 'COMPLETED',
          title: sessionTitle,
          interviewType,
          startedAt: sessionStartedAt,
          endedAt: sessionEndedAt,
          durationSeconds: calculatedDuration,
        },
        create: {
          id: sessionId,
          userId,
          title: sessionTitle,
          interviewType,
          status: 'COMPLETED',
          startedAt: sessionStartedAt,
          endedAt: sessionEndedAt,
          durationSeconds: calculatedDuration,
        },
      });

      const normalizedRecommendation = normalizeRecommendation(recommendation);

      // 3. Upsert Scorecard record with encrypted PII narrative feedback
      await tx.scorecard.upsert({
        where: { sessionId },
        update: {
          technicalScore,
          communicationScore,
          problemSolvingScore,
          cultureFitScore,
          overallScore,
          strengths: encryptedStrengths,
          weaknesses: encryptedWeaknesses,
          detailedFeedback: encryptedDetailedFeedback,
          recommendation: normalizedRecommendation,
          dimensionBreakdown,
        },
        create: {
          sessionId,
          userId,
          technicalScore,
          communicationScore,
          problemSolvingScore,
          cultureFitScore,
          overallScore,
          strengths: encryptedStrengths,
          weaknesses: encryptedWeaknesses,
          detailedFeedback: encryptedDetailedFeedback,
          recommendation: normalizedRecommendation,
          dimensionBreakdown,
        },
      });
    });
  }

  async findBySessionId(sessionId: string) {
    const scorecard = await prisma.scorecard.findUnique({
      where: { sessionId },
      include: { session: true },
    });
    return scorecard ? this.decryptScorecard(scorecard) : null;
  }

  async findById(id: string) {
    const scorecard = await prisma.scorecard.findUnique({
      where: { id },
      include: { session: true },
    });
    return scorecard ? this.decryptScorecard(scorecard) : null;
  }
}

export const scorecardRepository = new ScorecardRepository();
