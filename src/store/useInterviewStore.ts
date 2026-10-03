"use client";

/**
 * useInterviewStore — AI Interviewer Session State Machine
 *
 * ─── Architecture ─────────────────────────────────────────────────────────────
 * This store models the interview session as an explicit finite state machine
 * (FSM). Only the transitions defined in VALID_TRANSITIONS are permitted;
 * all others are silently rejected, preventing impossible states.
 *
 * ─── State phases ─────────────────────────────────────────────────────────────
 *  IDLE        → Session not started. Safe initial / terminal state.
 *  LISTENING   → Microphone open, recording candidate's answer.
 *  PROCESSING  → Audio sent to STT / AI pipeline. Awaiting response.
 *  SPEAKING    → AI reading the next question aloud (TTS playback).
 *  ERROR       → Unrecoverable error. User must acknowledge before retrying.
 *
 * ─── Performance (render isolation) ──────────────────────────────────────────
 * Zustand's selector pattern means a component that reads only `phase` will
 * NOT re-render when `transcript` or `error` changes. Always use a selector:
 *
 *   const phase    = useInterviewStore(s => s.phase);       // ✅ fine-grained
 *   const store    = useInterviewStore();                    // ❌ full-store sub
 *
 * ─── Zustand v5 API notes ─────────────────────────────────────────────────────
 * • `create` from "zustand" in v5 is the React-bound hook factory.
 * • `devtools` wraps the initializer; enabled only in development so Redux
 *   DevTools has zero overhead in production bundles.
 * • `subscribeWithSelector` is NOT used here — we rely on Zustand's built-in
 *   selector memoisation instead, which is sufficient for component render
 *   isolation. Use `useInterviewStore.subscribe(selector, cb)` externally
 *   if you need imperative subscriptions (e.g. in a custom hook or service).
 *
 * ─── References ───────────────────────────────────────────────────────────────
 * • Zustand v5 docs: https://zustand.docs.pmnd.rs/
 * • Verified API surface: node_modules/zustand/react.d.ts
 *                         node_modules/zustand/middleware/devtools.d.ts
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";

// ── Phase enum ────────────────────────────────────────────────────────────────

/**
 * All possible phases of the interview session.
 * Using a const enum-like object (not TS enum) so values are plain strings —
 * serialisable to JSON, visible in Redux DevTools, and safe to log.
 */
export const InterviewPhase = {
  IDLE: "IDLE",
  LISTENING: "LISTENING",
  PROCESSING: "PROCESSING",
  SPEAKING: "SPEAKING",
  ERROR: "ERROR",
  EVALUATING: "EVALUATING",
} as const;

export type InterviewPhase = (typeof InterviewPhase)[keyof typeof InterviewPhase];

// ── Finite state machine transition table ─────────────────────────────────────

/**
 * Allowed phase transitions. Any transition NOT listed here is invalid and
 * will be rejected by `transitionTo`.
 *
 * Visualised:
 *   IDLE ──────────────────────────────────────► SPEAKING (first question)
 *   SPEAKING ──────────────────────────────────► LISTENING
 *   LISTENING ─────────────────────────────────► PROCESSING
 *   PROCESSING ────────────────────────────────► SPEAKING (next question)
 *   PROCESSING ────────────────────────────────► IDLE     (last question done)
 *   * (any) ────────────────────────────────────► ERROR
 *   ERROR ──────────────────────────────────────► IDLE     (after acknowledge)
 */
const VALID_TRANSITIONS: Readonly<
  Record<InterviewPhase, readonly InterviewPhase[]>
> = {
  [InterviewPhase.IDLE]: [InterviewPhase.SPEAKING],
  [InterviewPhase.SPEAKING]: [InterviewPhase.LISTENING, InterviewPhase.ERROR, InterviewPhase.EVALUATING],
  [InterviewPhase.LISTENING]: [InterviewPhase.PROCESSING, InterviewPhase.ERROR, InterviewPhase.EVALUATING],
  [InterviewPhase.PROCESSING]: [
    InterviewPhase.SPEAKING,
    InterviewPhase.IDLE,
    InterviewPhase.ERROR,
    InterviewPhase.EVALUATING,
  ],
  [InterviewPhase.ERROR]: [InterviewPhase.IDLE],
  [InterviewPhase.EVALUATING]: [InterviewPhase.IDLE, InterviewPhase.ERROR],
} as const;

function isValidTransition(
  from: InterviewPhase,
  to: InterviewPhase
): boolean {
  return (VALID_TRANSITIONS[from] as readonly InterviewPhase[]).includes(to);
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** A single turn in the interview (question + candidate answer). */
export interface InterviewTurn {
  /** Zero-based index of this turn in the session. */
  readonly turnIndex: number;
  /** The question text spoken by the AI. */
  readonly question: string;
  /** Raw transcript produced by the STT pipeline. Null while PROCESSING. */
  readonly rawTranscript: string | null;
  /** Word count of the candidate's answer once transcribed. */
  readonly wordCount: number | null;
  /** ISO-8601 timestamp when the AI started speaking this question. */
  readonly startedAt: string;
  /** ISO-8601 timestamp when processing of the answer completed. Null until done. */
  readonly completedAt: string | null;
}

/** Metadata about the active interview session. */
export interface InterviewSession {
  /** Supabase session UUID from the `sessions` table. */
  readonly sessionId: string;
  /** Total number of questions in this session. Optional if dynamic. */
  readonly totalQuestions?: number;
  /** ISO-8601 timestamp when the session was started. */
  readonly startedAt: string;
}

/** Structured error payload — never a raw Error object (not serialisable). */
export interface InterviewError {
  /** Machine-readable error code for programmatic handling. */
  readonly code:
    | "MIC_PERMISSION_DENIED"
    | "MIC_NOT_FOUND"
    | "STT_TIMEOUT"
    | "STT_FAILED"
    | "TTS_FAILED"
    | "AI_RESPONSE_FAILED"
    | "NETWORK_ERROR"
    | "SESSION_EXPIRED"
    | "UNKNOWN";
  /** Human-readable message safe to display in the UI. */
  readonly message: string;
  /** ISO-8601 timestamp of when the error occurred. */
  readonly occurredAt: string;
  /** Whether a retry is meaningful for this error code. */
  readonly retryable: boolean;
}

// ── Store shape ───────────────────────────────────────────────────────────────

/** All state held by the interview store. */
export interface InterviewState {
  // ── Phase ────────────────────────────────────────────────────────────────
  /** Current phase of the FSM. */
  readonly phase: InterviewPhase;
  /** Previous phase — useful for animations and conditional UI. */
  readonly previousPhase: InterviewPhase | null;

  // ── Session ──────────────────────────────────────────────────────────────
  /** Metadata for the active session. Null when IDLE. */
  readonly session: InterviewSession | null;

  // ── Turn ─────────────────────────────────────────────────────────────────
  /** Index of the question currently being asked (0-based). */
  readonly currentTurnIndex: number;
  /** The question text the AI is currently speaking or has just spoken. */
  readonly currentQuestion: string | null;
  /** Completed turns accumulated so far in this session. */
  readonly turns: readonly InterviewTurn[];

  // ── Audio / transcript ───────────────────────────────────────────────────
  /** Live partial transcript while LISTENING (from real-time STT). */
  readonly liveTranscript: string;
  /** Confidence score of the last completed STT result (0–1). */
  readonly lastConfidenceScore: number | null;

  // ── Error ────────────────────────────────────────────────────────────────
  /** Structured error. Non-null only when phase === ERROR. */
  readonly error: InterviewError | null;
}

/** All actions that can mutate the interview store. */
export interface InterviewActions {
  /**
   * Attempt a phase transition.
   * Silently rejected (with a dev-mode console warning) if the transition
   * is not listed in VALID_TRANSITIONS.
   *
   * @returns `true` if the transition was applied, `false` if rejected.
   */
  transitionTo(phase: InterviewPhase): boolean;

  /**
   * Start a new interview session. Transitions IDLE → SPEAKING.
   * Sets up session metadata and the first question.
   */
  startSession(session: InterviewSession, firstQuestion: string): void;

  /**
   * Record a completed turn and advance to the next question (SPEAKING),
   * or end the session (IDLE) if all questions are answered.
   * Can only be called from PROCESSING phase.
   */
  completeTurn(turn: Omit<InterviewTurn, "turnIndex">): void;

  /**
   * Update the `liveTranscript` with the current full text.
   * Prevents duplication caused by appending interim results.
   */
  setLiveTranscript(text: string): void;

  /**
   * Replace `liveTranscript` with the final committed text.
   * Called once STT pipeline returns a final result.
   */
  commitTranscript(finalText: string, confidenceScore: number): void;

  /**
   * Transition to ERROR phase with a structured error payload.
   * Valid from any phase.
   */
  setError(error: Omit<InterviewError, "occurredAt">): void;

  /**
   * Acknowledge the current error and return to IDLE.
   * Clears the error payload. Only valid from ERROR phase.
   */
  acknowledgeError(): void;

  /**
   * End the interview early or when AI decides.
   * Transitions to EVALUATING phase.
   */
  endInterview(): void;

  /**
   * Hard reset — returns every slice to its initial value.
   * Use to cleanly unmount an interview session.
   */
  reset(): void;
}

export type InterviewStore = InterviewState & InterviewActions;

// ── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_STATE: InterviewState = {
  phase: InterviewPhase.IDLE,
  previousPhase: null,
  session: null,
  currentTurnIndex: 0,
  currentQuestion: null,
  turns: [],
  liveTranscript: "",
  lastConfidenceScore: null,
  error: null,
};

// ── Store creation ────────────────────────────────────────────────────────────

export const useInterviewStore = create<InterviewStore>()(
  devtools(
    (set, get) => ({
      // ── Initial state spread ─────────────────────────────────────────────
      ...INITIAL_STATE,

      // ── transitionTo ─────────────────────────────────────────────────────
      transitionTo(nextPhase) {
        const { phase } = get();

        if (!isValidTransition(phase, nextPhase)) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              `[InterviewStore] Invalid transition: ${phase} → ${nextPhase}. ` +
                `Allowed from ${phase}: [${VALID_TRANSITIONS[phase].join(", ")}]`
            );
          }
          return false;
        }

        set(
          (state) => ({ previousPhase: state.phase, phase: nextPhase }),
          false,
          { type: `interview/transitionTo`, payload: nextPhase }
        );
        return true;
      },

      // ── startSession ──────────────────────────────────────────────────────
      startSession(session, firstQuestion) {
        const { transitionTo } = get();
        const ok = transitionTo(InterviewPhase.SPEAKING);
        if (!ok) return;

        set(
          () => ({
            session,
            currentTurnIndex: 0,
            currentQuestion: firstQuestion,
            turns: [],
            liveTranscript: "",
            lastConfidenceScore: null,
            error: null,
          }),
          false,
          { type: "interview/startSession", payload: { session, firstQuestion } }
        );
      },

      // ── completeTurn ──────────────────────────────────────────────────────
      completeTurn(turnData) {
        const state = get();

        if (state.phase !== InterviewPhase.PROCESSING) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              `[InterviewStore] completeTurn called from phase "${state.phase}". ` +
                `Expected PROCESSING.`
            );
          }
          return;
        }

        const completedTurn: InterviewTurn = {
          ...turnData,
          turnIndex: state.currentTurnIndex,
        };

        const updatedTurns = [...state.turns, completedTurn] as const;

        // Advance to next turn — AI starts speaking the next question.
        // The hardcoded totalQuestions limit is removed. The interview now ends dynamically
        // when the caller invokes `endInterview()` based on AI response or user action.
        set(
          () => ({
            previousPhase: InterviewPhase.PROCESSING,
            phase: InterviewPhase.SPEAKING,
            turns: updatedTurns,
            currentTurnIndex: state.currentTurnIndex + 1,
            currentQuestion: turnData.question,
            liveTranscript: "",
          }),
          false,
          {
            type: "interview/completeTurn",
            payload: { turnIndex: state.currentTurnIndex },
          }
        );
      },

      // ── endInterview ──────────────────────────────────────────────────────
      endInterview() {
        const { transitionTo } = get();
        transitionTo(InterviewPhase.EVALUATING);
      },

      // ── setLiveTranscript ──────────────────────────────────────────────
      setLiveTranscript(text) {
        set(
          () => ({ liveTranscript: text }),
          false,
          { type: "interview/setLiveTranscript" }
        );
      },

      // ── commitTranscript ──────────────────────────────────────────────────
      commitTranscript(finalText, confidenceScore) {
        set(
          () => ({
            liveTranscript: finalText,
            lastConfidenceScore: confidenceScore,
          }),
          false,
          {
            type: "interview/commitTranscript",
            payload: { length: finalText.length, confidenceScore },
          }
        );
      },

      // ── setError ──────────────────────────────────────────────────────────
      setError(errorInput) {
        const { phase } = get();
        const error: InterviewError = {
          ...errorInput,
          occurredAt: new Date().toISOString(),
        };

        set(
          () => ({
            previousPhase: phase,
            phase: InterviewPhase.ERROR,
            error,
          }),
          false,
          { type: "interview/setError", payload: error.code }
        );
      },

      // ── acknowledgeError ──────────────────────────────────────────────────
      acknowledgeError() {
        const { phase } = get();

        if (phase !== InterviewPhase.ERROR) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              `[InterviewStore] acknowledgeError called from phase "${phase}". ` +
                `Expected ERROR.`
            );
          }
          return;
        }

        set(
          () => ({
            previousPhase: InterviewPhase.ERROR,
            phase: InterviewPhase.IDLE,
            error: null,
          }),
          false,
          { type: "interview/acknowledgeError" }
        );
      },

      // ── reset ─────────────────────────────────────────────────────────────
      reset() {
        set(() => INITIAL_STATE, false, { type: "interview/reset" });
      },
    }),
    {
      // Store name shown in Redux DevTools browser extension.
      name: "InterviewStore",
      // Disable devtools middleware entirely in production —
      // zero serialisation overhead, no state exposed to browser extensions.
      enabled: process.env.NODE_ENV === "development",
    }
  )
);

// ── Pre-built selectors ───────────────────────────────────────────────────────
// Export stable selector functions so consumers don't define inline arrows
// (inline arrows create new function references on every render, which can
// cause subtle re-render issues when passed as dependencies to useEffect/useMemo).

/** Select the current FSM phase. */
export const selectPhase = (s: InterviewStore): InterviewPhase => s.phase;

/** Select the previous FSM phase (for transition animations). */
export const selectPreviousPhase = (s: InterviewStore): InterviewPhase | null =>
  s.previousPhase;

/** Select the active session metadata. */
export const selectSession = (s: InterviewStore): InterviewSession | null =>
  s.session;

/** Select the question currently being spoken. */
export const selectCurrentQuestion = (s: InterviewStore): string | null =>
  s.currentQuestion;

/** Select the current turn index. */
export const selectCurrentTurnIndex = (s: InterviewStore): number =>
  s.currentTurnIndex;

/** Select all completed turns. */
export const selectTurns = (
  s: InterviewStore
): readonly InterviewTurn[] => s.turns;

/** Select the live (partial) transcript during LISTENING phase. */
export const selectLiveTranscript = (s: InterviewStore): string =>
  s.liveTranscript;

/** Select the last STT confidence score. */
export const selectLastConfidenceScore = (
  s: InterviewStore
): number | null => s.lastConfidenceScore;

/** Select the structured error (non-null only in ERROR phase). */
export const selectError = (s: InterviewStore): InterviewError | null =>
  s.error;

/** Derived: true while audio is being recorded. */
export const selectIsListening = (s: InterviewStore): boolean =>
  s.phase === InterviewPhase.LISTENING;

/** Derived: true while the AI pipeline is running. */
export const selectIsProcessing = (s: InterviewStore): boolean =>
  s.phase === InterviewPhase.PROCESSING;

/** Derived: true while the AI is reading the question aloud. */
export const selectIsSpeaking = (s: InterviewStore): boolean =>
  s.phase === InterviewPhase.SPEAKING;

/** Derived: true when the session is not active. */
export const selectIsIdle = (s: InterviewStore): boolean =>
  s.phase === InterviewPhase.IDLE;

/** Derived: true when an unrecoverable error has occurred. */
export const selectHasError = (s: InterviewStore): boolean =>
  s.phase === InterviewPhase.ERROR;

/** Derived: progress fraction 0–1. Returns 0 if no session loaded. */
export const selectProgress = (s: InterviewStore): number => {
  if (!s.session || s.session.totalQuestions === 0) return 0;
  return s.turns.length / s.session.totalQuestions;
};
