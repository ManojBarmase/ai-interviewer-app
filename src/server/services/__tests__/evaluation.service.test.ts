import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { EvaluationType } from '@/lib/validations/evaluation';
import { BadRequestError, ValidationError } from '@/server/errors/AppError';
import { generateEvaluationCompletion } from '@/server/integrations/ai/groq.client';
import { type ScorecardRepository } from '@/server/repositories/scorecard.repository';
import { EvaluationService } from '@/server/services/evaluation.service';

// Mock groq completion
vi.mock('@/server/integrations/ai/groq.client', () => ({
  generateEvaluationCompletion: vi.fn(),
}));

describe('EvaluationService', () => {
  let mockRepository: ScorecardRepository;
  let service: EvaluationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepository = {
      saveEvaluation: vi.fn().mockResolvedValue(undefined),
      findBySessionId: vi.fn(),
    } as unknown as ScorecardRepository;
    service = new EvaluationService(mockRepository);
  });

  describe('extractStructuredTurns', () => {
    it('extracts turns from structured turn array', () => {
      const turns = [
        { question: 'What is React?', rawTranscript: 'It is a UI library.' },
        { question: 'What is useEffect?', answer: 'It is a lifecycle hook.' },
        { question: '', rawTranscript: 'Invalid question without text' },
      ];

      const result = service.extractStructuredTurns(turns);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        question: 'What is React?',
        rawTranscript: 'It is a UI library.',
      });
      expect(result[1]).toEqual({
        question: 'What is useEffect?',
        rawTranscript: 'It is a lifecycle hook.',
      });
    });

    it('extracts turns from raw text transcript with Interviewer and Candidate blocks', () => {
      const transcript = `
Interviewer: Tell me about yourself.
Candidate: I am a full-stack engineer.

Interviewer: How do you handle cache invalidation?
Candidate: We use Redis with TTL.
`;
      const result = service.extractStructuredTurns(undefined, transcript);
      expect(result).toHaveLength(2);
      expect(result[0]?.question).toBe('Tell me about yourself.');
      expect(result[0]?.rawTranscript).toBe('I am a full-stack engineer.');
      expect(result[1]?.question).toBe('How do you handle cache invalidation?');
      expect(result[1]?.rawTranscript).toBe('We use Redis with TTL.');
    });

    it('returns empty array when neither valid turns nor transcript are provided', () => {
      expect(service.extractStructuredTurns(undefined, '')).toEqual([]);
    });
  });

  describe('sanitizeAndParseAiJson', () => {
    it('parses valid json wrapped in markdown codeblocks', () => {
      const rawText =
        '```json\n{"technicalScore": 8, "communicationScore": 9}\n```';
      const parsed = service.sanitizeAndParseAiJson(rawText) as Record<
        string,
        number
      >;
      expect(parsed.technicalScore).toBe(8);
      expect(parsed.communicationScore).toBe(9);
    });

    it('throws ValidationError when json is malformed', () => {
      const invalidJson = '```json\n{ invalid json content }\n```';
      expect(() => service.sanitizeAndParseAiJson(invalidJson)).toThrow(
        ValidationError,
      );
    });
  });

  describe('reconcileTurns', () => {
    it('reconciles and preserves verbatim questions and matches existing AI questions', () => {
      const structuredTurns = [
        {
          question: 'Explain TCP vs UDP.',
          rawTranscript: 'TCP is connection oriented.',
        },
        {
          question: 'What is optimistic locking?',
          rawTranscript: 'Using version columns.',
        },
      ];

      const aiQuestions = [
        {
          title: 'Explain TCP vs UDP',
          answer: 'TCP is connection oriented.',
          score: 85,
          type: 'Technical',
          difficulty: 'medium',
          metrics: { content: 80, clarity: 85, delivery: 90, time: '01:00' },
          conceptsCovered: ['Handshake', 'Reliability'],
          conceptsMissed: [],
          modelAnswer: 'TCP provides reliable, ordered transmission.',
        },
      ];

      const reconciled = service.reconcileTurns(aiQuestions, structuredTurns);
      expect(reconciled).toHaveLength(2);
      expect(reconciled[0]?.title).toBe('Explain TCP vs UDP.');
      expect(reconciled[0]?.score).toBe(85);

      // Second turn was omitted by AI, fallback generated
      expect(reconciled[1]?.title).toBe('What is optimistic locking?');
      expect(reconciled[1]?.answer).toBe('Using version columns.');
      expect(Number(reconciled[1]?.score)).toBeGreaterThan(0);
      expect(reconciled[1]?.type).toBe('Technical');
    });

    it('handles introduction questions in fallback with Behavioral type', () => {
      const structuredTurns = [
        {
          question: 'Please introduce yourself and your background.',
          rawTranscript: 'Hi I am John.',
        },
      ];

      const reconciled = service.reconcileTurns([], structuredTurns);
      expect(reconciled[0]?.type).toBe('Behavioral');
      const concepts = (reconciled[0]?.conceptsCovered as string[]) || [];
      expect(concepts).toContain('Self-introduction');
    });
  });

  describe('calculateCompetencyScores (5-Dimension Weighted Algorithm)', () => {
    it('computes 5-dimension scores dynamically when sub-scores are not provided', () => {
      const evaluation: EvaluationType = {
        technicalScore: 8,
        communicationScore: 6,
        strongAreas: ['System Architecture'],
        weakAreas: ['Edge case handling'],
        actionableFeedback: 'Great technical depth.',
        recommendation: 'YES',
        questions: [
          {
            title: 'Q1',
            score: 70,
            metrics: { content: 70, clarity: 60, delivery: 80, time: '00:45' },
          },
          {
            title: 'Q2',
            score: 90,
            metrics: { content: 90, clarity: 70, delivery: 80, time: '00:45' },
          },
        ],
      };

      const scored = service.calculateCompetencyScores(evaluation);

      // questionDeliveryAvg = (80 + 80) / 2 = 80 => finalDeliveryScore = 8.0
      expect(scored.deliveryScore).toBe(8);

      // questionScoreAvg = (70 + 90) / 2 = 80
      // finalProblemSolvingScore = round(((8.0 * 0.7) + (8.0 * 0.3)) * 10) / 10 = 8.0
      expect(scored.problemSolvingScore).toBe(8);

      // finalCultureFitScore = round(((6 * 0.6) + (8 * 0.4)) * 10) / 10 = 6.8
      expect(scored.cultureFitScore).toBe(6.8);

      // overallScore = round((8*0.3 + 8*0.25 + 6*0.2 + 8*0.15 + 6.8*0.1) * 10) / 10
      // = (2.4 + 2.0 + 1.2 + 1.2 + 0.68) = 7.48 => 7.5
      expect(scored.overallScore).toBe(7.5);
    });

    it('respects explicit sub-scores when provided by the LLM', () => {
      const evaluation: EvaluationType = {
        technicalScore: 9,
        communicationScore: 8,
        problemSolvingScore: 8.5,
        deliveryScore: 9.0,
        cultureFitScore: 8.0,
        strongAreas: ['Algorithms'],
        weakAreas: [],
        actionableFeedback: 'Excellent candidate.',
        recommendation: 'STRONG_YES',
        questions: [],
      };

      const scored = service.calculateCompetencyScores(evaluation);

      expect(scored.problemSolvingScore).toBe(8.5);
      expect(scored.deliveryScore).toBe(9.0);
      expect(scored.cultureFitScore).toBe(8.0);
      // overall = 9*0.3 (2.7) + 8.5*0.25 (2.125) + 8*0.2 (1.6) + 9*0.15 (1.35) + 8*0.1 (0.8) = 8.575 => 8.6
      expect(scored.overallScore).toBe(8.6);
    });
  });

  describe('evaluateInterview', () => {
    it('throws BadRequestError when transcript is invalid or empty', async () => {
      await expect(
        service.evaluateInterview({ transcript: '' }, { id: 'user-1' }),
      ).rejects.toThrow(BadRequestError);
    });

    it('orchestrates end-to-end evaluation and persists to database', async () => {
      const aiResponseJson = JSON.stringify({
        technicalScore: 8.5,
        communicationScore: 7.5,
        strongAreas: ['Distributed Systems'],
        weakAreas: ['Testing Depth'],
        actionableFeedback: 'Solid responses overall.',
        recommendation: 'YES',
        questions: [
          {
            title: 'Design an LRU Cache',
            answer: 'Use hashmap with doubly linked list.',
            score: 85,
            metrics: { content: 85, clarity: 80, delivery: 80, time: '00:45' },
          },
        ],
      });

      vi.mocked(generateEvaluationCompletion).mockResolvedValueOnce(
        aiResponseJson,
      );

      const result = await service.evaluateInterview(
        {
          sessionId: 'session-123',
          transcript:
            'Interviewer: Design an LRU Cache\n\nCandidate: Use hashmap with doubly linked list.',
          candidateContext: {
            role: 'Senior Backend Engineer',
            level: 'Senior',
            interviewType: 'System Design',
          },
        },
        {
          id: 'user-456',
          email: 'candidate@company.com',
          firstName: 'Candidate',
        },
      );

      expect(result.technicalScore).toBe(8.5);
      expect(result.communicationScore).toBe(7.5);
      expect(result.overallScore).toBeDefined();
      expect(mockRepository.saveEvaluation).toHaveBeenCalledTimes(1);
    });

    it('does not throw when database persistence fails', async () => {
      const aiResponseJson = JSON.stringify({
        technicalScore: 7,
        communicationScore: 7,
        strongAreas: ['Problem solving'],
        weakAreas: [],
        actionableFeedback: 'Good job.',
        recommendation: 'YES',
        questions: [],
      });

      vi.mocked(generateEvaluationCompletion).mockResolvedValueOnce(
        aiResponseJson,
      );
      vi.mocked(mockRepository.saveEvaluation).mockRejectedValueOnce(
        new Error('DB Connection Timeout'),
      );

      const result = await service.evaluateInterview(
        {
          sessionId: 'session-999',
          transcript: 'Some valid transcript content.',
        },
        {
          id: 'user-789',
        },
      );

      expect(result.technicalScore).toBe(7);
      expect(mockRepository.saveEvaluation).toHaveBeenCalled();
    });
  });
});
