import { describe, it, expect, beforeEach } from 'vitest';

import {
  useInterviewStore,
  InterviewPhase,
  selectPhase,
  selectPreviousPhase,
  selectSession,
  selectCurrentQuestion,
  selectCurrentTurnIndex,
  selectTurns,
  selectLiveTranscript,
  selectLastConfidenceScore,
  selectError,
  selectIsListening,
  selectIsProcessing,
  selectIsSpeaking,
  selectIsIdle,
  selectHasError,
  selectProgress,
} from '../useInterviewStore';

describe('useInterviewStore State Machine Unit Tests', () => {
  beforeEach(() => {
    // Reset store to pristine initial state before each test
    useInterviewStore.getState().reset();
  });

  describe('Initial State', () => {
    it('initializes with IDLE phase and empty values', () => {
      const state = useInterviewStore.getState();
      expect(state.phase).toBe(InterviewPhase.IDLE);
      expect(state.previousPhase).toBeNull();
      expect(state.session).toBeNull();
      expect(state.candidateContext).toBeNull();
      expect(state.currentTurnIndex).toBe(0);
      expect(state.currentQuestion).toBeNull();
      expect(state.turns).toEqual([]);
      expect(state.liveTranscript).toBe('');
      expect(state.lastConfidenceScore).toBeNull();
      expect(state.error).toBeNull();

      expect(selectIsIdle(state)).toBe(true);
      expect(selectHasError(state)).toBe(false);
      expect(selectProgress(state)).toBe(0);
    });
  });

  describe('FSM Phase Transitions', () => {
    it('allows valid transitions according to state machine table', () => {
      const { transitionTo } = useInterviewStore.getState();

      // IDLE -> SPEAKING (valid)
      expect(transitionTo(InterviewPhase.SPEAKING)).toBe(true);
      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.SPEAKING);
      expect(useInterviewStore.getState().previousPhase).toBe(
        InterviewPhase.IDLE,
      );

      // SPEAKING -> LISTENING (valid)
      expect(transitionTo(InterviewPhase.LISTENING)).toBe(true);
      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.LISTENING);

      // LISTENING -> PROCESSING (valid)
      expect(transitionTo(InterviewPhase.PROCESSING)).toBe(true);
      expect(useInterviewStore.getState().phase).toBe(
        InterviewPhase.PROCESSING,
      );

      // PROCESSING -> SPEAKING (valid)
      expect(transitionTo(InterviewPhase.SPEAKING)).toBe(true);
      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.SPEAKING);

      // SPEAKING -> EVALUATING (valid)
      expect(transitionTo(InterviewPhase.EVALUATING)).toBe(true);
      expect(useInterviewStore.getState().phase).toBe(
        InterviewPhase.EVALUATING,
      );

      // EVALUATING -> IDLE (valid)
      expect(transitionTo(InterviewPhase.IDLE)).toBe(true);
      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.IDLE);
    });

    it('allows transition from LISTENING to SPEAKING when repeating AI question', () => {
      const { transitionTo } = useInterviewStore.getState();
      transitionTo(InterviewPhase.SPEAKING);
      transitionTo(InterviewPhase.LISTENING);
      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.LISTENING);

      // Repeat AI question: LISTENING -> SPEAKING (valid)
      expect(transitionTo(InterviewPhase.SPEAKING)).toBe(true);
      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.SPEAKING);
    });

    it('rejects invalid transitions and preserves current state', () => {
      const { transitionTo } = useInterviewStore.getState();

      // IDLE -> LISTENING is invalid (must go through SPEAKING first)
      expect(transitionTo(InterviewPhase.LISTENING)).toBe(false);
      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.IDLE);

      // IDLE -> PROCESSING is invalid
      expect(transitionTo(InterviewPhase.PROCESSING)).toBe(false);
      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.IDLE);
    });
  });

  describe('Session Lifecycle Actions', () => {
    it('starts session cleanly with startSession', () => {
      const session = {
        sessionId: 'test-session-uuid',
        totalQuestions: 3,
        startedAt: new Date().toISOString(),
      };
      const firstQuestion = 'Tell me about yourself and your tech stack.';

      useInterviewStore.getState().startSession(session, firstQuestion);

      const state = useInterviewStore.getState();
      expect(state.phase).toBe(InterviewPhase.SPEAKING);
      expect(state.session).toEqual(session);
      expect(state.currentQuestion).toBe(firstQuestion);
      expect(state.currentTurnIndex).toBe(0);
      expect(selectIsSpeaking(state)).toBe(true);
    });

    it('manages live and committed transcripts', () => {
      useInterviewStore.getState().setLiveTranscript('I have five years of');
      expect(useInterviewStore.getState().liveTranscript).toBe(
        'I have five years of',
      );

      useInterviewStore
        .getState()
        .commitTranscript('I have five years of experience with React.', 0.98);
      expect(useInterviewStore.getState().liveTranscript).toBe(
        'I have five years of experience with React.',
      );
      expect(useInterviewStore.getState().lastConfidenceScore).toBe(0.98);
    });

    it('advances turns with completeTurn and transitions back to SPEAKING', () => {
      const session = {
        sessionId: 'test-session-uuid',
        totalQuestions: 3,
        startedAt: new Date().toISOString(),
      };
      useInterviewStore.getState().startSession(session, 'Question 1');
      useInterviewStore.getState().transitionTo(InterviewPhase.LISTENING);
      useInterviewStore.getState().transitionTo(InterviewPhase.PROCESSING);

      const turnPayload = {
        question: 'Question 1',
        rawTranscript: 'My answer to question 1',
        wordCount: 5,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      useInterviewStore.getState().completeTurn(turnPayload, 'Question 2');

      const state = useInterviewStore.getState();
      expect(state.phase).toBe(InterviewPhase.SPEAKING);
      expect(state.currentTurnIndex).toBe(1);
      expect(state.currentQuestion).toBe('Question 2');
      expect(state.turns).toHaveLength(1);
      expect(state.turns[0]?.question).toBe('Question 1');
      expect(state.turns[0]?.turnIndex).toBe(0);
      expect(selectProgress(state)).toBeCloseTo(1 / 3, 2);
    });

    it('automatically transitions to EVALUATING when all questions are answered', () => {
      const session = {
        sessionId: 'test-session-uuid',
        totalQuestions: 1, // Only 1 question configured
        startedAt: new Date().toISOString(),
      };
      useInterviewStore.getState().startSession(session, 'Only Question');
      useInterviewStore.getState().transitionTo(InterviewPhase.LISTENING);
      useInterviewStore.getState().transitionTo(InterviewPhase.PROCESSING);

      const turnPayload = {
        question: 'Only Question',
        rawTranscript: 'Done answer',
        wordCount: 2,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      useInterviewStore.getState().completeTurn(turnPayload);

      const state = useInterviewStore.getState();
      expect(state.phase).toBe(InterviewPhase.EVALUATING);
      expect(state.turns).toHaveLength(1);
      expect(selectProgress(state)).toBe(1);
    });

    it('ignores completeTurn when not in PROCESSING phase', () => {
      useInterviewStore.getState().completeTurn({
        question: 'Q',
        rawTranscript: 'A',
        wordCount: 1,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      expect(useInterviewStore.getState().turns).toHaveLength(0);
    });

    it('handles manual endInterview transition to EVALUATING', () => {
      useInterviewStore
        .getState()
        .startSession(
          { sessionId: 's1', startedAt: new Date().toISOString() },
          'Q1',
        );
      useInterviewStore.getState().endInterview();
      expect(useInterviewStore.getState().phase).toBe(
        InterviewPhase.EVALUATING,
      );
    });

    it('blocks duplicate completeTurn calls for the same turnIndex (turn mutex lock)', () => {
      const session = {
        sessionId: 'test-session-uuid',
        totalQuestions: 5,
        startedAt: new Date().toISOString(),
      };
      useInterviewStore.getState().startSession(session, 'Question 1');
      useInterviewStore.getState().transitionTo(InterviewPhase.LISTENING);
      useInterviewStore.getState().transitionTo(InterviewPhase.PROCESSING);

      const turnPayload = {
        question: 'Question 1',
        rawTranscript: 'First answer',
        wordCount: 2,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      // First completion succeeds
      useInterviewStore.getState().completeTurn(turnPayload, 'Question 2');
      expect(useInterviewStore.getState().turns).toHaveLength(1);
      expect(useInterviewStore.getState().currentTurnIndex).toBe(1);

      // Attempting duplicate completion with same payload/index while not in processing or for already completed turn
      useInterviewStore
        .getState()
        .completeTurn(turnPayload, 'Question 2 duplicate');
      expect(useInterviewStore.getState().turns).toHaveLength(1);
      expect(useInterviewStore.getState().currentQuestion).toBe('Question 2');
    });

    it('cleanly resets liveTranscript and confidence on completeTurn', () => {
      const session = {
        sessionId: 'test-session-uuid',
        totalQuestions: 3,
        startedAt: new Date().toISOString(),
      };
      useInterviewStore.getState().startSession(session, 'Question 1');
      useInterviewStore.getState().transitionTo(InterviewPhase.LISTENING);

      useInterviewStore
        .getState()
        .setLiveTranscript('Residual candidate draft text');
      useInterviewStore
        .getState()
        .commitTranscript('Residual candidate draft text', 0.95);
      expect(useInterviewStore.getState().liveTranscript).toBe(
        'Residual candidate draft text',
      );
      expect(useInterviewStore.getState().lastConfidenceScore).toBe(0.95);

      useInterviewStore.getState().transitionTo(InterviewPhase.PROCESSING);
      useInterviewStore.getState().completeTurn(
        {
          question: 'Question 1',
          rawTranscript: 'Residual candidate draft text',
          wordCount: 4,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
        'Question 2',
      );

      const state = useInterviewStore.getState();
      expect(state.phase).toBe(InterviewPhase.SPEAKING);
      expect(state.liveTranscript).toBe('');
      expect(state.lastConfidenceScore).toBeNull();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('sets error from any phase and transitions to ERROR', () => {
      useInterviewStore.getState().setError({
        code: 'MIC_PERMISSION_DENIED',
        message: 'Microphone was denied',
        retryable: true,
      });

      const state = useInterviewStore.getState();
      expect(state.phase).toBe(InterviewPhase.ERROR);
      expect(state.error?.code).toBe('MIC_PERMISSION_DENIED');
      expect(state.error?.retryable).toBe(true);
      expect(selectHasError(state)).toBe(true);
    });

    it('acknowledges error and cleanly transitions back to IDLE', () => {
      useInterviewStore.getState().setError({
        code: 'STT_FAILED',
        message: 'Speech recognition failed',
        retryable: true,
      });

      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.ERROR);

      useInterviewStore.getState().acknowledgeError();

      const state = useInterviewStore.getState();
      expect(state.phase).toBe(InterviewPhase.IDLE);
      expect(state.error).toBeNull();
      expect(selectHasError(state)).toBe(false);
    });

    it('safely ignores acknowledgeError when not in ERROR phase', () => {
      useInterviewStore.getState().acknowledgeError();
      expect(useInterviewStore.getState().phase).toBe(InterviewPhase.IDLE);
    });
  });

  describe('Candidate Context & Selectors', () => {
    it('sets and stores candidate context', () => {
      const candidateContext = {
        role: 'Full Stack Engineer',
        experience: 'Senior',
        techStack: ['Next.js', 'PostgreSQL', 'TypeScript'],
        numQuestions: 5,
      };

      useInterviewStore.getState().setCandidateContext(candidateContext);
      expect(useInterviewStore.getState().candidateContext).toEqual(
        candidateContext,
      );
    });

    it('verifies all selector outputs match state', () => {
      const state = useInterviewStore.getState();
      expect(selectPhase(state)).toBe(InterviewPhase.IDLE);
      expect(selectPreviousPhase(state)).toBeNull();
      expect(selectSession(state)).toBeNull();
      expect(selectCurrentQuestion(state)).toBeNull();
      expect(selectCurrentTurnIndex(state)).toBe(0);
      expect(selectTurns(state)).toEqual([]);
      expect(selectLiveTranscript(state)).toBe('');
      expect(selectLastConfidenceScore(state)).toBeNull();
      expect(selectError(state)).toBeNull();
      expect(selectIsListening(state)).toBe(false);
      expect(selectIsProcessing(state)).toBe(false);
      expect(selectIsSpeaking(state)).toBe(false);
    });
  });
});
