'use client';

import { memo, useCallback, useEffect, useRef } from 'react';

import { updateSessionTranscript } from '../../services/audioService';
import { useTypewriter } from '../../hooks/useTypewriter';
import { useInterviewStore } from '../../store/useInterviewStore';

export interface CandidateAnswerBoxProps {
  /** True while the interview is in LISTENING phase (ready for candidate response) */
  isListening: boolean;
  /** True while submitting answer and awaiting AI generation of next question */
  isSubmitting: boolean;
  /** True when mic is muted so we show a keyboard-friendly placeholder */
  isMicMuted: boolean;
  /** Optional telemetry or typing activity hook */
  onTypingActivity?: () => void;
  /**
   * Optional ref that the parent (ActiveInterviewRoom) can call to instantly
   * flush all pending typewriter animation before reading the committed transcript.
   * Invariant 6: Instant Flush on Submit.
   */
  flushRef?: React.MutableRefObject<(() => string) | null>;
}

/**
 * Render-Isolated Candidate Answer Workspace
 *
 * Enterprise Manual Submission Model:
 * Auto-submit on silence is intentionally removed. Turn progression is 100%
 * candidate-driven via the "Submit answer" button. The textarea remains fully
 * editable while the candidate speaks and types, and is disabled only when the
 * candidate explicitly submits (isSubmitting) or when the AI interviewer is speaking.
 *
 * Render isolation: subscribes directly to `liveTranscript` via fine-grained Zustand selector.
 * Prevents interim speech token bursts (10-20 tokens/sec) from re-rendering the whole room.
 *
 * Strategy A — Progressive Typewriter Streaming:
 * When Whisper returns a transcript chunk via `liveTranscript`, words are revealed
 * progressively at ~80ms/word (human speech cadence) rather than dumped as a sudden block.
 * Manual keystrokes are always instant and never interrupted by the animation.
 */
export const CandidateAnswerBox = memo(function CandidateAnswerBox({
  isListening,
  isSubmitting,
  isMicMuted,
  onTypingActivity,
  flushRef,
}: CandidateAnswerBoxProps) {
  const liveTranscript = useInterviewStore((s) => s.liveTranscript);
  const setLiveTranscript = useInterviewStore((s) => s.setLiveTranscript);

  const { displayedText, updateTarget, onManualEdit, flushNow, reset } =
    useTypewriter();

  // Expose flushNow to parent via ref so handleSubmitAnswer can call it before
  // reading the store transcript (Invariant 6: Instant Flush on Submit).
  useEffect(() => {
    if (flushRef) {
      flushRef.current = flushNow;
    }
    return () => {
      if (flushRef) {
        flushRef.current = null;
      }
    };
  }, [flushRef, flushNow]);

  // Strategy A: When the STT pipeline delivers a new liveTranscript chunk,
  // animate the delta words rather than dumping the full string at once.
  // Manual edits bypass this (onManualEdit path handles them separately).
  const prevLiveTranscriptRef = useRef('');
  useEffect(() => {
    if (liveTranscript === prevLiveTranscriptRef.current) return;
    prevLiveTranscriptRef.current = liveTranscript;

    if (!liveTranscript) {
      // New question turn reset — clear typewriter state instantly.
      reset();
      return;
    }

    updateTarget(liveTranscript);
  }, [liveTranscript, updateTarget, reset]);

  // Sync displayedText → Zustand store on every typewriter animation tick so
  // that liveTranscript in the store always reflects what the candidate sees.
  //
  // ⚠️  DO NOT call updateSessionTranscript() here.
  //
  //     updateSessionTranscript() writes into SileroVADProvider.sessionAccumulatedTranscript,
  //     which is the PREFIX used by dispatchAudioChunk() to build the cumulative transcript:
  //
  //       const updated = prefix ? `${prefix} ${whisperText}` : whisperText;
  //
  //     The typewriter reveals words one at a time (e.g. "Hello" → "Hello my" → …).
  //     If we call updateSessionTranscript("Hello") during animation, we REGRESS the
  //     accumulated transcript from "Hello my name is John" back to "Hello".
  //     When the next Whisper chunk arrives ("and I work at Google"), it appends
  //     to the regressed prefix → "Hello and I work at Google", permanently
  //     dropping "my name is John" from the session transcript.
  //
  //     updateSessionTranscript() is correctly called ONLY from handleChange()
  //     (manual candidate edits), where it acts as an intentional cursor reset
  //     so subsequent speech appends cleanly after the edit point.
  const prevDisplayedRef = useRef('');
  useEffect(() => {
    if (displayedText === prevDisplayedRef.current) return;
    prevDisplayedRef.current = displayedText;

    // Only sync upward during active listening (avoid spurious writes post-submit).
    if (isListening && !isSubmitting) {
      setLiveTranscript(displayedText);
      // ← updateSessionTranscript intentionally omitted. See comment block above.
    }
  }, [displayedText, isListening, isSubmitting, setLiveTranscript]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      // Invariant 5: Manual typing is 100% instant. onManualEdit cancels any pending
      // animation and syncs displayedText to the keystroke value immediately.
      onManualEdit(text);
      setLiveTranscript(text);
      updateSessionTranscript(text);
      onTypingActivity?.();
    },
    [onManualEdit, setLiveTranscript, onTypingActivity],
  );

  const wordCount = displayedText.split(/\s+/).filter(Boolean).length;

  const placeholder = isSubmitting
    ? 'Submitting answer — generating next question...'
    : isMicMuted
      ? 'Microphone is muted. You can type your answer here, or click unmute below to speak.'
      : isListening
        ? 'Speak your answer. It appears here live. You can also type or edit. Click "Submit answer" when finished.'
        : 'Waiting for the interviewer...';

  const isDisabled = !isListening || isSubmitting;

  return (
    <div
      className={`w-full bg-[#11131a] border rounded-xl p-4 min-h-[120px] relative flex flex-col shadow-inner shadow-black/20 transition-all ${
        isDisabled
          ? 'border-white/10 opacity-60 cursor-not-allowed'
          : 'border-indigo-500/30 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400'
      }`}
    >
      <textarea
        className="w-full flex-1 bg-transparent border-none text-sm text-white/80 leading-relaxed resize-none focus:outline-none placeholder:text-white/40 custom-scrollbar disabled:cursor-not-allowed"
        placeholder={placeholder}
        value={displayedText}
        onChange={handleChange}
        disabled={isDisabled}
        aria-label="Your answer"
        aria-disabled={isDisabled}
      />
      <div className="self-end mt-2 text-[10px] text-white/40 font-medium">
        {wordCount} words
      </div>
    </div>
  );
});
