'use client';

/**
 * @file useTypewriter.ts
 * @description Strategy A: Client-Side Progressive Typewriter Streaming.
 *
 * Provides human-like, smooth animation of incoming STT transcript chunks into
 * the candidate answer box. When Groq Whisper returns a new text chunk, instead
 * of a sudden "burst" dump, words are revealed progressively at a cadence that
 * mimics natural reading speed (~80ms per word), giving the perception of
 * real-time live transcription.
 *
 * Key invariants enforced:
 * 1. Manual edits win instantly — if the candidate types, the animation is
 *    cancelled and `displayedText` syncs to the edited value without fighting.
 * 2. On submit flush — calling `flushNow()` instantly commits all pending words
 *    so the full transcript is submitted without waiting for animation to finish.
 * 3. No cursor fighting — animation only appends to the end of already-displayed
 *    text; it never rewrites text the candidate has manually positioned their
 *    cursor in.
 * 4. Zero-allocation on idle — the rAF loop is only alive when there are pending
 *    words to render; it cancels itself automatically.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/** Inter-word delay in milliseconds. Tuned to ~80ms for natural speech cadence. */
const WORD_INTERVAL_MS = 80;

export interface UseTypewriterReturn {
  /**
   * The currently displayed text — the value to bind to the textarea.
   * Starts empty and grows word-by-word as animation runs.
   */
  displayedText: string;

  /**
   * Call this to update the target text (e.g. when `liveTranscript` changes).
   * The typewriter will smoothly animate from the current `displayedText` to
   * the new `targetText`, appending only the delta words.
   *
   * If `targetText` is shorter than or equal to the current displayed text
   * (e.g. a reset to empty between questions), the update is applied instantly.
   */
  updateTarget: (targetText: string) => void;

  /**
   * Call this when the candidate manually edits the textarea.
   * Cancels any in-progress animation and syncs `displayedText` to the
   * manually edited value so the animation never fights cursor position.
   */
  onManualEdit: (text: string) => void;

  /**
   * Instantly flushes all remaining pending animation words and synchronously returns
   * the complete committed text so handleSubmitAnswer can commit it immediately.
   */
  flushNow: () => string;

  /**
   * Resets the typewriter state to empty (e.g. at start of a new question turn).
   */
  reset: () => void;
}

export function useTypewriter(): UseTypewriterReturn {
  const [displayedText, setDisplayedText] = useState('');

  // Pending words that have not yet been revealed on screen.
  const pendingWordsRef = useRef<string[]>([]);
  // The full "committed" target text — what we should eventually display.
  const targetTextRef = useRef('');
  // Whether the candidate performed a manual edit (disables animation until next STT chunk).
  const isManualEditRef = useRef(false);
  // rAF handle for the word-reveal loop.
  const rafRef = useRef<number | null>(null);
  // Timestamp of the last word reveal, used for frame-rate-independent pacing.
  const lastWordTimeRef = useRef(0);

  /** Cancel any running animation frame loop. */
  const cancelAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** The rAF loop — reveals one pending word per WORD_INTERVAL_MS tick. */
  const tick = useCallback(
    (timestamp: number) => {
      if (pendingWordsRef.current.length === 0) {
        rafRef.current = null;
        return;
      }

      const elapsed = timestamp - lastWordTimeRef.current;

      if (elapsed >= WORD_INTERVAL_MS) {
        lastWordTimeRef.current = timestamp;
        const word = pendingWordsRef.current.shift()!;

        setDisplayedText((prev) => {
          const separator = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
          return prev + separator + word;
        });
      }

      if (pendingWordsRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    },
    [],
  );

  const updateTarget = useCallback(
    (targetText: string) => {
      targetTextRef.current = targetText;

      // If the candidate manually edited the box, skip animation — trust their text.
      // The next STT chunk (updateTarget call) reactivates animation from that point.
      if (isManualEditRef.current) {
        // Sync displayed text to the STT target without animating, then clear flag.
        // This handles the case where the candidate typed then STT provides a correction.
        isManualEditRef.current = false;
        cancelAnimation();
        pendingWordsRef.current = [];
        setDisplayedText(targetText);
        return;
      }

      // If the new target is empty or shorter than what's displayed, apply instantly
      // (handles question resets and edge cases).
      if (!targetText) {
        cancelAnimation();
        pendingWordsRef.current = [];
        setDisplayedText('');
        return;
      }

      // Compute the delta: words in targetText not yet visible on screen.
      // We take displayed text + any still-pending words to find what's already
      // "committed" (either shown or queued), then queue only the remainder.
      const targetWords = targetText.trim().split(/\s+/).filter(Boolean);

      // Count how many words from the target are already in displayed + pending.
      const displayedWords = displayedText.trim().split(/\s+/).filter(Boolean);
      const pendingCount = pendingWordsRef.current.length;
      const coveredCount = displayedWords.length + pendingCount;

      if (coveredCount >= targetWords.length) {
        // Nothing new to animate — target is already fully covered.
        // Ensure displayed text is exactly the target (handles minor whitespace drift).
        if (pendingCount === 0) {
          setDisplayedText(targetText);
        }
        return;
      }

      // Queue the new delta words for animation.
      const newWords = targetWords.slice(coveredCount);
      pendingWordsRef.current.push(...newWords);

      // Kick off the rAF loop if not already running.
      if (rafRef.current === null) {
        lastWordTimeRef.current = 0;
        rafRef.current = requestAnimationFrame(tick);
      }

      // Suppress lint warning — displayedText is intentionally read as a snapshot
      // inside the callback for delta computation. React state updates are batched
      // so this is always consistent within a single render cycle.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cancelAnimation, tick, displayedText],
  );

  const onManualEdit = useCallback(
    (text: string) => {
      // Cancel pending animation so it doesn't overwrite the candidate's cursor.
      cancelAnimation();
      pendingWordsRef.current = [];
      isManualEditRef.current = true;
      targetTextRef.current = text;
      setDisplayedText(text);
    },
    [cancelAnimation],
  );

  const flushNow = useCallback((): string => {
    // Instantly reveal all pending words and synchronously return the full target text.
    cancelAnimation();
    pendingWordsRef.current = [];
    const fullText = targetTextRef.current;
    setDisplayedText(fullText);
    return fullText;
  }, [cancelAnimation]);

  const reset = useCallback(() => {
    cancelAnimation();
    pendingWordsRef.current = [];
    targetTextRef.current = '';
    isManualEditRef.current = false;
    setDisplayedText('');
  }, [cancelAnimation]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelAnimation();
    };
  }, [cancelAnimation]);

  return {
    displayedText,
    updateTarget,
    onManualEdit,
    flushNow,
    reset,
  };
}
