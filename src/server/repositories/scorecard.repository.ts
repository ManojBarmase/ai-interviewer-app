import 'server-only';

import {
  prisma,
  Prisma,
  InterviewType,
  HiringRecommendation,
} from '@/server/db/prisma';

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
   * Persists the evaluation results transactionally:
   * 1. Guarantees User record exists (satisfying foreign keys)
   * 2. Upserts the Session with COMPLETED status and metadata
   * 3. Upserts the Scorecard with all 5 competency dimensions
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

      // 3. Upsert Scorecard record
      await tx.scorecard.upsert({
        where: { sessionId },
        update: {
          technicalScore,
          communicationScore,
          problemSolvingScore,
          cultureFitScore,
          overallScore,
          strengths: formattedStrengths,
          weaknesses: formattedWeaknesses,
          detailedFeedback: actionableFeedback,
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
          strengths: formattedStrengths,
          weaknesses: formattedWeaknesses,
          detailedFeedback: actionableFeedback,
          recommendation: normalizedRecommendation,
          dimensionBreakdown,
        },
      });
    });
  }

  async findBySessionId(sessionId: string) {
    return prisma.scorecard.findUnique({
      where: { sessionId },
      include: { session: true },
    });
  }
}

export const scorecardRepository = new ScorecardRepository();
