/**
 * @file audioService.ts
 * @description Client-side audio I/O using native Web Speech APIs.
 *
 * ─── API surface ──────────────────────────────────────────────────────────────
 *   startRecording(callbacks, options) → starts SpeechRecognition, streams
 *     interim + final transcript chunks via callbacks. Returns cleanup fn.
 *   stopRecording()  → gracefully stops the active recognition session
 *   isRecording()    → returns whether a session is currently active
 *   speakText(text, options) → speaks text via SpeechSynthesis, returns
 *     a Promise that resolves on utterance end or rejects on cancel/error
 *   stopSpeaking()   → cancels the active utterance; rejects the Promise
 *   isSpeaking()     → returns SpeechSynthesis speaking state
 *   getAudioCapabilities() → SSR-safe capability introspection
 *   getAvailableVoices()   → returns the voice catalogue
 *
 * ─── Design decisions ─────────────────────────────────────────────────────────
 * • Pure module-level functions, no classes — simple and tree-shakeable.
 * • Single active session enforced via module-scoped state vars.
 * • Typed AudioServiceError — no raw DOMException string matching.
 * • No React / No Zustand — framework-agnostic per services/index.ts rules.
 * • All browser API access is guarded at call-time, not import-time.
 *   Accessing window.SpeechRecognition at module scope throws during SSR.
 *
 * ─── Browser support ──────────────────────────────────────────────────────────
 * SpeechRecognition: Chrome 25+, Edge 79+, Safari 14.1+ (NOT Firefox)
 * SpeechSynthesis:   Chrome 33+, Edge 14+, Firefox 49+, Safari 7+
 *
 * ─── tsconfig ─────────────────────────────────────────────────────────────────
 * lib: ["dom", "dom.iterable", "esnext"] — all Web Speech types included.
 */

// ── Ambient Web Speech API types ────────────────────────────────────────────
// TypeScript's lib.dom.d.ts does not include SpeechRecognition interfaces in
// all versions. We declare the minimal shape we need as ambient types so this
// file compiles without requiring a third-party @types package.

interface SpeechRecognitionAlternativeAmbient {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultAmbient {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeAmbient;
  [index: number]: SpeechRecognitionAlternativeAmbient;
}

interface SpeechRecognitionResultListAmbient {
  readonly length: number;
  item(index: number): SpeechRecognitionResultAmbient;
  [index: number]: SpeechRecognitionResultAmbient;
}

interface SpeechRecognitionEventAmbient extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListAmbient;
}

type SpeechRecognitionErrorCode =
  | "aborted" | "audio-capture" | "bad-grammar" | "language-not-supported"
  | "network" | "no-speech" | "not-allowed" | "permission-denied"
  | "service-not-allowed";

interface SpeechRecognitionErrorEventAmbient extends Event {
  readonly error: SpeechRecognitionErrorCode | string;
  readonly message: string;
}

interface SpeechRecognitionAmbient extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventAmbient) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventAmbient) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionStaticAmbient {
  new(): SpeechRecognitionAmbient;
}

// ── Error types ───────────────────────────────────────────────────────────────

/** Machine-readable codes for all audio operation failures. */
export type AudioErrorCode =
  // STT errors
  | "RECOGNITION_NOT_SUPPORTED"  // Browser has no SpeechRecognition API
  | "NOT_ALLOWED"                // Microphone permission denied
  | "NO_MICROPHONE"              // No microphone device found
  | "AUDIO_CAPTURE_FAILED"       // Device error during capture
  | "RECOGNITION_ABORTED"        // Aborted by our own stopRecording() call
  | "RECOGNITION_NETWORK_ERROR"  // Network required for cloud STT (Chrome)
  | "NO_SPEECH_DETECTED"         // Silence — no speech within timeout
  | "RECOGNITION_ALREADY_ACTIVE" // startRecording called while already running
  | "RECOGNITION_UNKNOWN"        // Unmapped SpeechRecognitionError
  // TTS errors
  | "SYNTHESIS_NOT_SUPPORTED"    // Browser has no SpeechSynthesis API
  | "SYNTHESIS_CANCELLED"        // Utterance cancelled by stopSpeaking()
  | "SYNTHESIS_UNKNOWN";         // Unmapped synthesis error

/** Typed error — always carries a `code` and a user-safe `message`. */
export class AudioServiceError extends Error {
  readonly code: AudioErrorCode;

  constructor(code: AudioErrorCode, message: string) {
    super(message);
    this.name = "AudioServiceError";
    this.code = code;
  }
}

// ── Capability introspection ──────────────────────────────────────────────────

export interface AudioCapabilities {
  /** True when running in a browser (false during SSR). */
  isBrowser: boolean;
  /** True if SpeechRecognition (or the webkit prefix) is present. */
  speechRecognitionSupported: boolean;
  /** True if SpeechSynthesis is present. */
  speechSynthesisSupported: boolean;
}

/**
 * Returns capability flags without triggering permissions or side-effects.
 * Safe to call during SSR — all flags will be false.
 */
export function getAudioCapabilities(): AudioCapabilities {
  if (typeof window === "undefined") {
    return {
      isBrowser: false,
      speechRecognitionSupported: false,
      speechSynthesisSupported: false,
    };
  }
  return {
    isBrowser: true,
    speechRecognitionSupported:
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
    speechSynthesisSupported: "speechSynthesis" in window,
  };
}

// ── SpeechRecognition constructor shim ───────────────────────────────────────
// Chrome ships the API as `webkitSpeechRecognition`; we unify at runtime.

type SpeechRecognitionCtor = SpeechRecognitionStaticAmbient;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── Module-level session state ────────────────────────────────────────────────
// Ensures only one recognition session and one synthesis utterance can be
// active simultaneously. Stored here so stop* functions always have a handle.

let _recognition: SpeechRecognitionAmbient | null = null;
let _synthReject: ((err: AudioServiceError) => void) | null = null;

// ── STT types ─────────────────────────────────────────────────────────────────

export interface RecordingCallbacks {
  /**
   * Fired repeatedly with partial transcript text while the user speaks.
   * Use this to show live "ghost text" in the UI.
   */
  onInterimTranscript: (text: string) => void;

  /**
   * Fired once with the committed transcript when recognition ends cleanly.
   * `confidence` is in [0, 1]; some browsers always return 0.
   */
  onFinalTranscript: (text: string, confidence: number) => void;

  /**
   * Fired on any recognition error. The session is already terminated when
   * this fires — do NOT call stopRecording() from this callback.
   */
  onError: (error: AudioServiceError) => void;

  /**
   * Fired when the session fully ends (success or error).
   * Use to transition the interview FSM: LISTENING → PROCESSING or ERROR.
   */
  onEnd: () => void;
}

export interface RecordingOptions {
  /**
   * BCP 47 language tag (e.g. "en-US", "hi-IN").
   * Defaults to the browser's UI language if omitted.
   */
  language?: string;

  /**
   * If the user is silent for this many ms, stop recording automatically.
   * Resets on each interim result so it only fires after true silence.
   */
  silenceTimeoutMs?: number;

  /**
   * Keep recording across multiple speech bursts (dictation mode).
   * Default: false — stops after the first final result (Q&A interview mode).
   */
  continuous?: boolean;
}

// ── startRecording ────────────────────────────────────────────────────────────

/**
 * Starts a SpeechRecognition session and wires up all event handlers.
 *
 * @returns A cleanup function. Call it (or `stopRecording()`) to end the session.
 *
 * @throws {AudioServiceError} RECOGNITION_NOT_SUPPORTED — browser lacks the API.
 * @throws {AudioServiceError} RECOGNITION_ALREADY_ACTIVE — session already running.
 *
 * @example
 * ```ts
 * const stop = startRecording(
 *   {
 *     onInterimTranscript: (t) => store.appendLiveTranscript(t),
 *     onFinalTranscript:   (t, c) => store.commitTranscript(t, c),
 *     onError:             (e) => store.setError({ code: "STT_FAILED", message: e.message, retryable: true }),
 *     onEnd:               ()  => store.transitionTo(InterviewPhase.PROCESSING),
 *   },
 *   { language: "en-US", silenceTimeoutMs: 8000 }
 * );
 * ```
 */
export function startRecording(
  callbacks: RecordingCallbacks,
  options: RecordingOptions = {}
): () => void {
  // ── Support check ─────────────────────────────────────────────────────────
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    throw new AudioServiceError(
      "RECOGNITION_NOT_SUPPORTED",
      "SpeechRecognition is not supported in this browser. " +
        "Please use Chrome, Edge, or Safari 14.1+."
    );
  }

  if (_recognition !== null) {
    throw new AudioServiceError(
      "RECOGNITION_ALREADY_ACTIVE",
      "A recognition session is already active. Call stopRecording() first."
    );
  }

  // ── Configure ────────────────────────────────────────────────────────────
  const rec = new Ctor();
  if (options.language !== undefined) rec.lang = options.language;
  rec.continuous = options.continuous ?? false;
  rec.interimResults = true;    // required for onInterimTranscript
  rec.maxAlternatives = 1;

  _recognition = rec;

  // ── Silence timer setup ──────────────────────────────────────────────────
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;

  const resetSilenceTimer = () => {
    // Default to 2000ms debounce if not specified
    const timeout = options.silenceTimeoutMs ?? 2000;
    if (timeout <= 0) return;
    
    if (silenceTimer !== null) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (_recognition === rec) rec.stop();
    }, timeout);
  };

  // Start the silence timer immediately (fires if user never speaks).
  resetSilenceTimer();

  // ── Event: results ───────────────────────────────────────────────────────
  rec.onresult = (event: SpeechRecognitionEventAmbient) => {
    // Reset silence timer on every result to ensure it only fires after
    // genuine silence, not between words.
    resetSilenceTimer();

    let fullText = "";
    let confidence = 0;
    let hasFinal = false;

    // Accumulate the entire transcript from the beginning of the session
    // to prevent duplication issues with interim results.
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      if (result === undefined) continue;
      const alt = result[0];
      if (alt === undefined) continue;
      
      fullText += alt.transcript;
      
      if (result.isFinal) {
        hasFinal = true;
        confidence = Math.min(1, Math.max(0, alt.confidence || 0));
      }
    }

    // Always update the live transcript with the complete text
    if (fullText) {
      callbacks.onInterimTranscript(fullText);
    }
    
    // Commit the transcript if there are finalized results
    if (hasFinal && fullText) {
      callbacks.onFinalTranscript(fullText.trim(), confidence);
    }
  };

  // ── Event: error ─────────────────────────────────────────────────────────
  rec.onerror = (event: SpeechRecognitionErrorEventAmbient) => {
    if (silenceTimer !== null) clearTimeout(silenceTimer);

    const codeMap: Record<string, AudioErrorCode> = {
      "not-allowed":          "NOT_ALLOWED",
      "permission-denied":    "NOT_ALLOWED",
      "service-not-allowed":  "NOT_ALLOWED",
      "no-speech":            "NO_SPEECH_DETECTED",
      "aborted":              "RECOGNITION_ABORTED",
      "audio-capture":        "AUDIO_CAPTURE_FAILED",
      "network":              "RECOGNITION_NETWORK_ERROR",
      "bad-grammar":          "RECOGNITION_UNKNOWN",
      "language-not-supported": "RECOGNITION_UNKNOWN",
    };

    const code: AudioErrorCode = codeMap[event.error] ?? "RECOGNITION_UNKNOWN";

    const messages: Partial<Record<AudioErrorCode, string>> = {
      NOT_ALLOWED:
        "Microphone access was denied. Allow microphone permission in your " +
        "browser settings and try again.",
      NO_SPEECH_DETECTED:
        "No speech was detected. Please speak clearly into your microphone.",
      AUDIO_CAPTURE_FAILED:
        "Cannot access your microphone. Check that it is connected and not " +
        "being used by another application.",
      RECOGNITION_NETWORK_ERROR:
        "A network error interrupted speech recognition. Check your connection.",
      RECOGNITION_ABORTED:
        "Speech recognition was stopped.",
    };

    const message = messages[code] ?? `Speech recognition error: ${event.error}`;
    callbacks.onError(new AudioServiceError(code, message));
  };

  // ── Event: end ───────────────────────────────────────────────────────────
  rec.onend = () => {
    if (silenceTimer !== null) clearTimeout(silenceTimer);
    _recognition = null;
    callbacks.onEnd();
  };

  // ── Start — catch synchronous DOMException ────────────────────────────────
  try {
    rec.start();
  } catch (err) {
    _recognition = null;
    if (silenceTimer !== null) clearTimeout(silenceTimer);
    const msg = err instanceof Error ? err.message : "Failed to start speech recognition.";
    throw new AudioServiceError("RECOGNITION_UNKNOWN", msg);
  }

  // ── Return cleanup fn ─────────────────────────────────────────────────────
  return () => {
    if (silenceTimer !== null) clearTimeout(silenceTimer);
    if (_recognition === rec) rec.abort();
  };
}

// ── stopRecording ─────────────────────────────────────────────────────────────

/**
 * Gracefully stops the active recognition session (no-op if none is active).
 *
 * Uses `stop()` (not `abort()`): the engine commits any pending audio before
 * ending, so the final transcript is not lost.
 */
export function stopRecording(): void {
  if (_recognition !== null) {
    _recognition.stop();
    // _recognition is cleared to null by the rec.onend handler.
  }
}

/** Returns true if a recognition session is currently active. */
export function isRecording(): boolean {
  return _recognition !== null;
}

// ── TTS types ─────────────────────────────────────────────────────────────────

export interface SpeakOptions {
  /** BCP 47 language tag, e.g. "en-US". Defaults to browser UI language. */
  language?: string;
  /** Speaking rate (0.1–10). 1.0 = normal. Default: 1.0. */
  rate?: number;
  /** Pitch (0–2). 1.0 = normal. Default: 1.0. */
  pitch?: number;
  /** Volume (0–1). Default: 1.0. */
  volume?: number;
  /**
   * Preferred voice name (matched to SpeechSynthesisVoice.name).
   * Falls back to the browser default if not found.
   */
  voiceName?: string;
  /** Called when the utterance actually begins playing (after queue delay). */
  onStart?: () => void;
  /**
   * Called on each word boundary (not supported in all browsers).
   * `charIndex` is the character offset in the original text string.
   */
  onBoundary?: (charIndex: number, word: string) => void;
}

// ── speakText ─────────────────────────────────────────────────────────────────

/**
 * Speaks `text` using SpeechSynthesis.
 *
 * Always interrupts any currently playing utterance — in the interview flow,
 * new text always takes priority over queued text.
 *
 * @returns Promise<void> — resolves when the utterance finishes naturally,
 *   rejects with AudioServiceError on cancellation or synthesis failure.
 *
 * @example
 * ```ts
 * try {
 *   await speakText("Tell me about a challenging project.", { language: "en-US", rate: 0.9 });
 *   store.transitionTo(InterviewPhase.LISTENING);
 * } catch (err) {
 *   if (err instanceof AudioServiceError && err.code === "SYNTHESIS_CANCELLED") return;
 *   store.setError({ code: "TTS_FAILED", message: "AI speech failed.", retryable: true });
 * }
 * ```
 */
export function speakText(text: string, options: SpeakOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // ── Support check ────────────────────────────────────────────────────────
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      reject(
        new AudioServiceError(
          "SYNTHESIS_NOT_SUPPORTED",
          "SpeechSynthesis is not available in this browser."
        )
      );
      return;
    }

    // ── Cancel any in-flight utterance ───────────────────────────────────────
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      // Reject the previous speakText() Promise before cancelling.
      const prevReject = _synthReject;
      _synthReject = null;
      window.speechSynthesis.cancel();
      prevReject?.(
        new AudioServiceError(
          "SYNTHESIS_CANCELLED",
          "Utterance was interrupted by a new speakText() call."
        )
      );
    }

    _synthReject = reject;

    const utterance = new SpeechSynthesisUtterance(text);

    // ── Apply options ────────────────────────────────────────────────────────
    if (options.language !== undefined) utterance.lang = options.language;
    if (options.rate !== undefined)     utterance.rate = options.rate;
    if (options.pitch !== undefined)    utterance.pitch = options.pitch;
    if (options.volume !== undefined)   utterance.volume = options.volume;

    if (options.voiceName !== undefined) {
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.name === options.voiceName);
      if (voice !== undefined) utterance.voice = voice;
      // Falls back to browser default if not found — does not throw.
    }

    // ── Events ───────────────────────────────────────────────────────────────
    utterance.onstart = () => {
      options.onStart?.();
    };

    utterance.onboundary = (ev: SpeechSynthesisEvent) => {
      if (ev.name === "word" && options.onBoundary !== undefined) {
        const word = text.slice(ev.charIndex, ev.charIndex + ev.charLength);
        options.onBoundary(ev.charIndex, word);
      }
    };

    utterance.onend = () => {
      _synthReject = null;
      resolve();
    };

    utterance.onerror = (ev: SpeechSynthesisErrorEvent) => {
      _synthReject = null;
      if (ev.error === "canceled" || ev.error === "interrupted") {
        reject(
          new AudioServiceError("SYNTHESIS_CANCELLED", "Speech synthesis was cancelled.")
        );
      } else {
        reject(
          new AudioServiceError("SYNTHESIS_UNKNOWN", `Speech synthesis error: ${ev.error}`)
        );
      }
    };

    // ── Chrome voice-loading workaround ──────────────────────────────────────
    // Chrome's getVoices() returns [] until the `voiceschanged` event fires.
    // If we haven't matched a voice yet, retry once after the event.
    if (
      options.voiceName !== undefined &&
      utterance.voice === null &&
      window.speechSynthesis.getVoices().length === 0
    ) {
      const onVoicesChanged = () => {
        const voice = window.speechSynthesis
          .getVoices()
          .find((v) => v.name === options.voiceName);
        if (voice !== undefined) utterance.voice = voice;
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    }

    window.speechSynthesis.speak(utterance);
  });
}

// ── stopSpeaking ──────────────────────────────────────────────────────────────

/**
 * Cancels the currently active SpeechSynthesis utterance.
 * The Promise returned by `speakText()` will reject with SYNTHESIS_CANCELLED.
 * No-op if nothing is speaking.
 */
export function stopSpeaking(): void {
  if (typeof window === "undefined") return;
  if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) return;

  // Settle the Promise first so the rejection arrives before onerror fires.
  const reject = _synthReject;
  _synthReject = null;

  window.speechSynthesis.cancel();

  reject?.(
    new AudioServiceError(
      "SYNTHESIS_CANCELLED",
      "Speech synthesis was stopped by the application."
    )
  );
}

/** Returns true if SpeechSynthesis is currently producing audio. */
export function isSpeaking(): boolean {
  if (typeof window === "undefined") return false;
  return window.speechSynthesis.speaking;
}

// ── Voice catalogue ───────────────────────────────────────────────────────────

export interface VoiceDescriptor {
  name: string;
  language: string;
  isDefault: boolean;
  isLocalService: boolean;
}

/**
 * Returns all available synthesis voices.
 * Call after `voiceschanged` has fired (or on a user gesture) in Chrome.
 * Returns [] during SSR or if SpeechSynthesis is unavailable.
 */
export function getAvailableVoices(): VoiceDescriptor[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices().map((v) => ({
    name: v.name,
    language: v.lang,
    isDefault: v.default,
    isLocalService: v.localService,
  }));
}
