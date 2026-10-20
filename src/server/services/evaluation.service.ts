import 'server-only';

import { createSessionLogger } from '@/lib/logger';
import {
  evaluationSchema,
  type EvaluationType,
} from '@/lib/validations/evaluation';
import { BadRequestError, ValidationError } from '@/server/errors/AppError';
import {
  buildPromptWithSchema,
  buildUserPromptContent,
  type CandidateContext,
  type StructuredTurn,
} from '@/server/integrations/ai/evaluation.prompt';
import { generateEvaluationCompletion } from '@/server/integrations/ai/groq.client';
import {
  type ScorecardRepository,
  scorecardRepository,
  normalizeInterviewType,
} from '@/server/repositories/scorecard.repository';

export interface EvaluationRequest {
  sessionId?: string;
  transcript: string;
  candidateContext?: CandidateContext;
  turns?: unknown[];
  startedAt?: string | Date;
  endedAt?: string | Date;
  durationSeconds?: number;
}

export interface EvaluationAuthUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
}

export class EvaluationService {
  constructor(
    private readonly repository: ScorecardRepository = scorecardRepository,
  ) {}

  /**
   * Extracts structured question-answer turns from array input or transcript text
   */
  extractStructuredTurns(
    turns?: unknown[],
    transcript?: string,
  ): StructuredTurn[] {
    let structuredTurns: StructuredTurn[] = [];

    if (Array.isArray(turns) && turns.length > 0) {
      structuredTurns = turns
        .map((t) => {
          const item = (t && typeof t === 'object' ? t : {}) as Record<
            string,
            unknown
          >;
          return {
            question:
              typeof item.question === 'string' ? item.question.trim() : '',
            rawTranscript:
              typeof item.rawTranscript === 'string'
                ? item.rawTranscript.trim()
                : typeof item.answer === 'string'
                  ? item.answer.trim()
                  : null,
          };
        })
        .filter((t) => t.question.length > 0);
    } else if (transcript && typeof transcript === 'string') {
      const lines = transcript
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let currentQ = '';
      let currentA = '';

      for (const line of lines) {
        if (/^Interviewer:\s*/i.test(line)) {
          if (currentQ) {
            structuredTurns.push({
              question: currentQ,
              rawTranscript: currentA || null,
            });
            currentA = '';
          }
          currentQ = line.replace(/^Interviewer:\s*/i, '').trim();
        } else if (/^Candidate:\s*/i.test(line)) {
          const candidateText = line.replace(/^Candidate:\s*/i, '').trim();
          currentA = currentA ? `${currentA} ${candidateText}` : candidateText;
        } else if (currentA) {
          currentA = `${currentA} ${line}`;
        } else if (currentQ) {
          currentQ = `${currentQ} ${line}`;
        }
      }

      if (currentQ) {
        structuredTurns.push({
          question: currentQ,
          rawTranscript: currentA || null,
        });
      }
    }

    return structuredTurns;
  }

  /**
   * Cleans and parses raw JSON output from the LLM
   */
  sanitizeAndParseAiJson(rawText: string): unknown {
    try {
      const cleanJson = rawText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      return JSON.parse(cleanJson);
    } catch (e: unknown) {
      throw new ValidationError('AI returned malformed JSON', {
        rawOutput: rawText,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * Reconciles questions returned by the AI with the exact chronological turns recorded
   */
  reconcileTurns(
    parsedQuestions: Array<Record<string, unknown>> | null | undefined,
    structuredTurns: StructuredTurn[],
  ): Array<Record<string, unknown>> {
    if (structuredTurns.length === 0) {
      return parsedQuestions || [];
    }

    const questionsList = Array.isArray(parsedQuestions)
      ? [...parsedQuestions]
      : [];

    return structuredTurns.map((turn, idx) => {
      // Find matching question by index or title similarity
      const match =
        questionsList[idx] ||
        questionsList.find((pq) => {
          const pqTitle = typeof pq?.title === 'string' ? pq.title : '';
          return (
            pqTitle &&
            turn.question &&
            (pqTitle.toLowerCase().trim() ===
              turn.question.toLowerCase().trim() ||
              pqTitle
                .toLowerCase()
                .includes(turn.question.toLowerCase().slice(0, 30)) ||
              turn.question
                .toLowerCase()
                .includes(pqTitle.toLowerCase().slice(0, 30)))
          );
        });

      if (match) {
        const metrics = (
          match.metrics && typeof match.metrics === 'object'
            ? match.metrics
            : {}
        ) as Record<string, unknown>;
        return {
          ...match,
          title: turn.question,
          answer:
            turn.rawTranscript ||
            (typeof match.answer === 'string' ? match.answer : null) ||
            '(Silence)',
          score: typeof match.score === 'number' ? match.score : 50,
          type:
            typeof match.type === 'string'
              ? match.type
              : idx === 0 && turn.question.toLowerCase().includes('introduce')
                ? 'Behavioral'
                : 'Technical',
          difficulty:
            typeof match.difficulty === 'string' ? match.difficulty : 'medium',
          metrics: {
            content: typeof metrics.content === 'number' ? metrics.content : 50,
            clarity: typeof metrics.clarity === 'number' ? metrics.clarity : 50,
            delivery:
              typeof metrics.delivery === 'number' ? metrics.delivery : 50,
            time: typeof metrics.time === 'string' ? metrics.time : '00:45',
          },
          conceptsCovered: Array.isArray(match.conceptsCovered)
            ? match.conceptsCovered
            : ['Core concepts'],
          conceptsMissed: Array.isArray(match.conceptsMissed)
            ? match.conceptsMissed
            : [],
          modelAnswer:
            typeof match.modelAnswer === 'string'
              ? match.modelAnswer
              : 'Ideal response covering standard industry best practices.',
        };
      }

      // Fallback for any turn skipped or dropped by the LLM
      const isIntro =
        idx === 0 && turn.question.toLowerCase().includes('introduce');
      const wordCount = (turn.rawTranscript || '')
        .split(/\s+/)
        .filter(Boolean).length;
      const answerScore =
        turn.rawTranscript && turn.rawTranscript !== '(Silence)'
          ? Math.min(85, Math.max(30, wordCount * 3))
          : 0;

      return {
        title: turn.question,
        answer: turn.rawTranscript || '(Silence)',
        followUp: null,
        score: answerScore,
        type: isIntro ? 'Behavioral' : 'Technical',
        difficulty: 'easy',
        metrics: {
          content: answerScore,
          clarity: Math.min(100, Math.max(30, answerScore + 10)),
          delivery: Math.min(100, Math.max(30, answerScore + 5)),
          time: '00:45',
        },
        conceptsCovered: isIntro
          ? ['Self-introduction', 'Background']
          : ['Core workflow'],
        conceptsMissed: isIntro
          ? ['Specific metrics', 'Key achievements']
          : ['Deep architecture details'],
        modelAnswer: isIntro
          ? 'A strong introduction clearly describes your recent engineering experience, key projects, and core technical proficiencies.'
          : 'A thorough response detailing technical architecture, CI/CD pipeline configuration, and secret management.',
      };
    });
  }

  /**
   * Computes the 5-dimension competency scores and overall weighted score
   */
  calculateCompetencyScores(
    evaluation: EvaluationType,
  ): EvaluationType & { overallScore: number } {
    const techScore = evaluation.technicalScore;
    const commScore = evaluation.communicationScore;
    const questions = evaluation.questions || [];

    // Dynamic Delivery Score
    const questionDeliveryAvg =
      questions.length > 0
        ? questions.reduce(
            (acc, q) => acc + (q?.metrics?.delivery ?? commScore * 10),
            0,
          ) / questions.length
        : commScore * 10;

    const finalDeliveryScore =
      evaluation.deliveryScore != null
        ? evaluation.deliveryScore
        : Math.min(
            10,
            Math.max(1, Math.round((questionDeliveryAvg / 10) * 10) / 10),
          );

    // Dynamic Problem Solving Score
    const questionScoreAvg =
      questions.length > 0
        ? questions.reduce((acc, q) => acc + (q?.score ?? techScore * 10), 0) /
          questions.length
        : techScore * 10;

    const finalProblemSolvingScore =
      evaluation.problemSolvingScore != null
        ? evaluation.problemSolvingScore
        : Math.min(
            10,
            Math.max(
              1,
              Math.round(
                ((questionScoreAvg / 10) * 0.7 + techScore * 0.3) * 10,
              ) / 10,
            ),
          );

    // Dynamic Culture Fit / Impact Score
    const finalCultureFitScore =
      evaluation.cultureFitScore != null
        ? evaluation.cultureFitScore
        : Math.min(
            10,
            Math.max(
              1,
              Math.round((commScore * 0.6 + techScore * 0.4) * 10) / 10,
            ),
          );

    // Weighted Overall Score (1.0 to 10.0 scale)
    const overallScore =
      Math.round(
        (techScore * 0.3 +
          finalProblemSolvingScore * 0.25 +
          commScore * 0.2 +
          finalDeliveryScore * 0.15 +
          finalCultureFitScore * 0.1) *
          10,
      ) / 10;

    evaluation.problemSolvingScore = finalProblemSolvingScore;
    evaluation.deliveryScore = finalDeliveryScore;
    evaluation.cultureFitScore = finalCultureFitScore;
    evaluation.overallScore = overallScore;

    return {
      ...evaluation,
      problemSolvingScore: finalProblemSolvingScore,
      deliveryScore: finalDeliveryScore,
      cultureFitScore: finalCultureFitScore,
      overallScore,
    };
  }

  /**
   * Main evaluation pipeline orchestrating AI prompting, validation, scoring, and persistence
   */
  async evaluateInterview(
    data: EvaluationRequest,
    authUser: EvaluationAuthUser,
  ): Promise<EvaluationType & { overallScore: number }> {
    const {
      sessionId,
      transcript,
      candidateContext,
      turns,
      startedAt,
      endedAt,
      durationSeconds,
    } = data;

    const sessionLogger = createSessionLogger(sessionId, {
      service: 'EvaluationService',
      userId: authUser.id,
    });

    if (!transcript || typeof transcript !== 'string') {
      throw new BadRequestError('A valid transcript string is required');
    }

    // 1. Extract and reconcile turns
    const structuredTurns = this.extractStructuredTurns(turns, transcript);
    const totalTurnsCount = structuredTurns.length;

    // 2. Build prompts
    const promptWithSchema = buildPromptWithSchema(
      candidateContext,
      totalTurnsCount,
    );
    const userPromptContent = buildUserPromptContent(
      structuredTurns,
      transcript,
    );

    // 3. Request LLM completion
    const rawAiResponse = await generateEvaluationCompletion(
      promptWithSchema,
      userPromptContent,
    );

    // 4. Parse & Validate
    const parsedRawJson = this.sanitizeAndParseAiJson(rawAiResponse);
    const validatedEvaluation = evaluationSchema.parse(parsedRawJson);

    // 5. Reconcile questions
    if (totalTurnsCount > 0) {
      validatedEvaluation.questions = this.reconcileTurns(
        validatedEvaluation.questions,
        structuredTurns,
      );
    }

    // 6. Compute 5-dimension scores
    const scoredEvaluation =
      this.calculateCompetencyScores(validatedEvaluation);

    // 7. Persist to database if sessionId is present
    if (sessionId && authUser.id) {
      try {
        const role = candidateContext?.role || 'Software Engineer';
        const rawType =
          candidateContext?.interviewType ||
          candidateContext?.type ||
          'Technical';
        const level =
          candidateContext?.experience ||
          candidateContext?.level ||
          'Mid-Level';
        const sessionTitle = candidateContext
          ? `${role} - ${rawType} - ${level}`
          : 'AI Mock Interview';

        const interviewType = normalizeInterviewType(rawType);
        const sessionStartedAt = startedAt ? new Date(startedAt) : new Date();
        const sessionEndedAt = endedAt ? new Date(endedAt) : new Date();
        const calculatedDuration =
          typeof durationSeconds === 'number' && durationSeconds > 0
            ? durationSeconds
            : Math.max(
                60,
                Math.round(
                  (sessionEndedAt.getTime() - sessionStartedAt.getTime()) /
                    1000,
                ),
              );

        await this.repository.saveEvaluation({
          userId: authUser.id,
          userEmail: authUser.email || 'demo-candidate@ai-interviewer.internal',
          userFirstName: authUser.firstName || 'Demo Candidate',
          sessionId,
          sessionTitle,
          interviewType,
          sessionStartedAt,
          sessionEndedAt,
          calculatedDuration,
          technicalScore: scoredEvaluation.technicalScore,
          communicationScore: scoredEvaluation.communicationScore,
          problemSolvingScore: scoredEvaluation.problemSolvingScore ?? 5,
          cultureFitScore: scoredEvaluation.cultureFitScore ?? 5,
          overallScore: scoredEvaluation.overallScore,
          strengths: scoredEvaluation.strongAreas,
          weaknesses: scoredEvaluation.weakAreas,
          actionableFeedback: scoredEvaluation.actionableFeedback,
          recommendation: scoredEvaluation.recommendation,
          questions: scoredEvaluation.questions,
        });
      } catch (dbError: unknown) {
        sessionLogger.error(
          {
            userId: authUser.id,
            err: dbError,
          },
          'Failed to save scorecard to database',
        );
      }
    }

    return scoredEvaluation;
  }
}

export const evaluationService = new EvaluationService();
