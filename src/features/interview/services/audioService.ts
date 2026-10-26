/**
 * @file audioService.ts
 * @description Client-side audio I/O using native Web Speech APIs.
 *
 * --- API surface --------------------------------------------------------------
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
 * --- Design decisions ---------------------------------------------------------
 * • Pure module-level functions, no classes — simple and tree-shakeable.
 * • Single active session enforced via module-scoped state vars.
 * • Typed AudioServiceError — no raw DOMException string matching.
 * • No React / No Zustand — framework-agnostic per services/index.ts rules.
 * • All browser API access is guarded at call-time, not import-time.
 *   Accessing window.SpeechRecognition at module scope throws during SSR.
 *
 * --- Browser support ----------------------------------------------------------
 * SpeechRecognition: Chrome 25+, Edge 79+, Safari 14.1+ (NOT Firefox)
 * SpeechSynthesis:   Chrome 33+, Edge 14+, Firefox 49+, Safari 7+
 *
 * --- tsconfig -----------------------------------------------------------------
 * lib: ["dom", "dom.iterable", "esnext"] — all Web Speech types included.
 */

// -- Ambient Web Speech API types --------------------------------------------
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
  | 'aborted'
  | 'audio-capture'
  | 'bad-grammar'
  | 'language-not-supported'
  | 'network'
  | 'no-speech'
  | 'not-allowed'
  | 'permission-denied'
  | 'service-not-allowed';

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
  new (): SpeechRecognitionAmbient;
}

// -- Error types ---------------------------------------------------------------

/** Machine-readable codes for all audio operation failures. */
export type AudioErrorCode =
  // STT errors
  | 'RECOGNITION_NOT_SUPPORTED' // Browser has no SpeechRecognition API
  | 'NOT_ALLOWED' // Microphone permission denied
  | 'NO_MICROPHONE' // No microphone device found
  | 'AUDIO_CAPTURE_FAILED' // Device error during capture
  | 'RECOGNITION_ABORTED' // Aborted by our own stopRecording() call
  | 'RECOGNITION_NETWORK_ERROR' // Network required for cloud STT (Chrome)
  | 'NO_SPEECH_DETECTED' // Silence — no speech within timeout
  | 'RECOGNITION_ALREADY_ACTIVE' // startRecording called while already running
  | 'RECOGNITION_UNKNOWN' // Unmapped SpeechRecognitionError
  // TTS errors
  | 'SYNTHESIS_NOT_SUPPORTED' // Browser has no SpeechSynthesis API
  | 'SYNTHESIS_CANCELLED' // Utterance cancelled by stopSpeaking()
  | 'SYNTHESIS_UNKNOWN'; // Unmapped synthesis error

/** Typed error — always carries a `code` and a user-safe `message`. */
export class AudioServiceError extends Error {
  readonly code: AudioErrorCode;

  constructor(code: AudioErrorCode, message: string) {
    super(message);
    this.name = 'AudioServiceError';
    this.code = code;
  }
}

// -- Capability introspection --------------------------------------------------

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
  if (typeof window === 'undefined') {
    return {
      isBrowser: false,
      speechRecognitionSupported: false,
      speechSynthesisSupported: false,
    };
  }
  return {
    isBrowser: true,
    speechRecognitionSupported:
      'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    speechSynthesisSupported: 'speechSynthesis' in window,
  };
}

// -- SpeechRecognition constructor shim ---------------------------------------
// Chrome ships the API as `webkitSpeechRecognition`; we unify at runtime.

type SpeechRecognitionCtor = SpeechRecognitionStaticAmbient;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// -- Module-level session state ------------------------------------------------
// Ensures only one recognition session and one synthesis utterance can be
// active simultaneously. Stored here so stop* functions always have a handle.

let _recognition: SpeechRecognitionAmbient | null = null;
let _synthReject: ((err: AudioServiceError) => void) | null = null;

// -- Continuous Recognition & Session State -----------------------------------
let _sessionAccumulatedTranscript = '';
let _isSessionActive = false;
let _isExplicitlyStopped = false;
let _restartTimer: ReturnType<typeof setTimeout> | null = null;
let _silenceTimer: ReturnType<typeof setTimeout> | null = null;
let _activeCallbacks: RecordingCallbacks | null = null;
let _activeOptions: RecordingOptions | null = null;
let _clearActiveSegmentFinal: (() => void) | null = null;

/**
 * Updates the base accumulated transcript buffer for the active recording session.
 * Call this when the candidate manually types or edits the answer in the textarea,
 * ensuring subsequent speech seamlessly appends after their manual edits without conflict.
 */
export function updateSessionTranscript(text: string): void {
  _sessionAccumulatedTranscript = text;
  if (_clearActiveSegmentFinal !== null) {
    _clearActiveSegmentFinal();
  }
}

/**
 * Returns the current accumulated transcript buffer.
 */
export function getSessionTranscript(): string {
  return _sessionAccumulatedTranscript;
}

function notifySessionEnd(): void {
  if (_activeCallbacks !== null) {
    const cb = _activeCallbacks;
    _activeCallbacks = null;
    cb.onEnd();
  }
}

// -- STT types -----------------------------------------------------------------

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
   * Note: With manual submission, this is only called when stopRecording() is invoked.
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
   * Optional silence timeout in ms.
   * Default: 0 (disabled). Silence will NOT stop recording or submit answers.
   */
  silenceTimeoutMs?: number;

  /**
   * Keep recording across multiple speech bursts (dictation/interview mode).
   * Default: true — seamlessly keeps listening across 1-2s pauses without data loss.
   */
  continuous?: boolean;
}

// -- startRecording ------------------------------------------------------------

/**
 * Starts a continuous SpeechRecognition session and wires up all event handlers.
 *
 * @returns A cleanup function. Call it (or `stopRecording()`) to end the session.
 *
 * @throws {AudioServiceError} RECOGNITION_NOT_SUPPORTED — browser lacks the API.
 * @throws {AudioServiceError} RECOGNITION_ALREADY_ACTIVE — session already running.
 */
export function startRecording(
  callbacks: RecordingCallbacks,
  options: RecordingOptions = {},
): () => void {
  // -- Support check ---------------------------------------------------------
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    throw new AudioServiceError(
      'RECOGNITION_NOT_SUPPORTED',
      'SpeechRecognition is not supported in this browser. ' +
        'Please use Chrome, Edge, or Safari 14.1+.',
    );
  }
  const RecognitionClass = Ctor;

  if (_isSessionActive && !_isExplicitlyStopped) {
    throw new AudioServiceError(
      'RECOGNITION_ALREADY_ACTIVE',
      'A recognition session is already active. Call stopRecording() first.',
    );
  }

  // Clear previous timers if any lingering
  if (_restartTimer !== null) {
    clearTimeout(_restartTimer);
    _restartTimer = null;
  }
  if (_silenceTimer !== null) {
    clearTimeout(_silenceTimer);
    _silenceTimer = null;
  }

  // Initialize session state
  _isSessionActive = true;
  _isExplicitlyStopped = false;
  _sessionAccumulatedTranscript = '';
  _activeCallbacks = callbacks;
  _activeOptions = options;

  let _networkRetryCount = 0;

  function createAndStartRecognition(): SpeechRecognitionAmbient {
    const rec = new RecognitionClass();
    if (_activeOptions?.language !== undefined) {
      rec.lang = _activeOptions.language;
    }
    rec.continuous = _activeOptions?.continuous ?? true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    _recognition = rec;

    // -- Silence timer setup (only if silenceTimeoutMs is explicitly set > 0) ---
    const timeout = _activeOptions?.silenceTimeoutMs ?? 0;
    const resetSilenceTimer = () => {
      if (timeout <= 0) return;
      if (_silenceTimer !== null) clearTimeout(_silenceTimer);
      _silenceTimer = setTimeout(() => {
        if (_recognition === rec) {
          _isExplicitlyStopped = true;
          rec.stop();
        }
      }, timeout);
    };

    if (timeout > 0) {
      resetSilenceTimer();
    }

    // Segment-level transcript buffers:
    let segmentFinal = '';
    let segmentConfidence = 0.9;
    _clearActiveSegmentFinal = () => {
      segmentFinal = '';
    };

    // -- Event: results -------------------------------------------------------
    rec.onresult = (event: SpeechRecognitionEventAmbient) => {
      _networkRetryCount = 0;
      resetSilenceTimer();

      let currentSegmentFinal = '';
      let currentSegmentInterim = '';
      let hasFinalInEvent = false;

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result === undefined) continue;
        const alt = result[0];
        if (alt === undefined) continue;

        if (result.isFinal) {
          currentSegmentFinal =
            (currentSegmentFinal ? `${currentSegmentFinal} ` : '') +
            alt.transcript.trim();
          segmentConfidence = Math.min(1, Math.max(0, alt.confidence || 0.9));
          hasFinalInEvent = true;
        } else {
          currentSegmentInterim =
            (currentSegmentInterim ? `${currentSegmentInterim} ` : '') +
            alt.transcript.trim();
        }
      }

      segmentFinal = currentSegmentFinal;

      const basePrefix = _sessionAccumulatedTranscript
        ? `${_sessionAccumulatedTranscript.trimEnd()} `
        : '';

      const activeSegmentSpeech = [segmentFinal, currentSegmentInterim]
        .filter(Boolean)
        .join(' ')
        .trim();
      const liveFullText = (basePrefix + activeSegmentSpeech).trim();

      if (liveFullText) {
        _activeCallbacks?.onInterimTranscript(liveFullText);
      }

      if (hasFinalInEvent && segmentFinal) {
        const finalizedFullText = (basePrefix + segmentFinal).trim();
        _activeCallbacks?.onFinalTranscript(
          finalizedFullText,
          segmentConfidence,
        );
      }
    };

    // -- Event: error ---------------------------------------------------------
    rec.onerror = (event: SpeechRecognitionErrorEventAmbient) => {
      if (_silenceTimer !== null) {
        clearTimeout(_silenceTimer);
        _silenceTimer = null;
      }

      const codeMap: Record<string, AudioErrorCode> = {
        'not-allowed': 'NOT_ALLOWED',
        'permission-denied': 'NOT_ALLOWED',
        'service-not-allowed': 'NOT_ALLOWED',
        'no-speech': 'NO_SPEECH_DETECTED',
        aborted: 'RECOGNITION_ABORTED',
        'audio-capture': 'AUDIO_CAPTURE_FAILED',
        network: 'RECOGNITION_NETWORK_ERROR',
        'bad-grammar': 'RECOGNITION_UNKNOWN',
        'language-not-supported': 'RECOGNITION_UNKNOWN',
      };

      const code: AudioErrorCode =
        codeMap[event.error] ?? 'RECOGNITION_UNKNOWN';

      if (code === 'RECOGNITION_NETWORK_ERROR') {
        _networkRetryCount++;
      }

      const isFatal =
        code === 'NOT_ALLOWED' ||
        code === 'AUDIO_CAPTURE_FAILED' ||
        code === 'RECOGNITION_NOT_SUPPORTED';

      if (isFatal) {
        _isExplicitlyStopped = true;
        _isSessionActive = false;
        _recognition = null;
      }

      const messages: Partial<Record<AudioErrorCode, string>> = {
        NOT_ALLOWED:
          'Microphone access was denied. Allow microphone permission in your ' +
          'browser settings and try again.',
        NO_SPEECH_DETECTED:
          'No speech was detected. Please speak clearly into your microphone.',
        AUDIO_CAPTURE_FAILED:
          'Cannot access your microphone. Check that it is connected and not ' +
          'being used by another application.',
        RECOGNITION_NETWORK_ERROR:
          'A network error interrupted speech recognition. Check your connection.',
        RECOGNITION_ABORTED: 'Speech recognition was stopped.',
      };

      const message =
        messages[code] ?? `Speech recognition error: ${event.error}`;
      _activeCallbacks?.onError(new AudioServiceError(code, message));
    };

    // -- Event: end -----------------------------------------------------------
    rec.onend = () => {
      if (_silenceTimer !== null) {
        clearTimeout(_silenceTimer);
        _silenceTimer = null;
      }

      // Merge finalized text from this segment into session buffer
      if (segmentFinal) {
        const prefix = _sessionAccumulatedTranscript
          ? `${_sessionAccumulatedTranscript.trimEnd()} `
          : '';
        _sessionAccumulatedTranscript = `${prefix}${segmentFinal}`.trim();
        segmentFinal = '';
      }

      // If user or cleanup explicitly stopped recording, or fatal error occurred:
      if (
        _isExplicitlyStopped ||
        _activeOptions?.continuous === false ||
        !_isSessionActive
      ) {
        _recognition = null;
        _isSessionActive = false;
        notifySessionEnd();
        return;
      }

      // In continuous mode or recovering from transient error:
      // Auto-restart recognition seamlessly to keep listening without data loss.
      if (_restartTimer !== null) clearTimeout(_restartTimer);
      const delay =
        _networkRetryCount > 0
          ? Math.min(2000, 300 * Math.pow(2, _networkRetryCount))
          : 50;

      _restartTimer = setTimeout(() => {
        _restartTimer = null;
        if (!_isExplicitlyStopped && _isSessionActive) {
          try {
            createAndStartRecognition();
          } catch (err) {
            console.warn(
              '[audioService] Failed to auto-restart recognition:',
              err,
            );
            _recognition = null;
            _isSessionActive = false;
            notifySessionEnd();
          }
        }
      }, delay);
    };

    // -- Start — catch synchronous DOMException ------------------------------
    try {
      rec.start();
    } catch (err) {
      _recognition = null;
      _isSessionActive = false;
      if (_silenceTimer !== null) {
        clearTimeout(_silenceTimer);
        _silenceTimer = null;
      }
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to start speech recognition.';
      throw new AudioServiceError('RECOGNITION_UNKNOWN', msg);
    }

    return rec;
  }

  const initialRec = createAndStartRecognition();

  // -- Return cleanup fn -----------------------------------------------------
  return () => {
    _isExplicitlyStopped = true;
    _isSessionActive = false;
    if (_restartTimer !== null) {
      clearTimeout(_restartTimer);
      _restartTimer = null;
    }
    if (_silenceTimer !== null) {
      clearTimeout(_silenceTimer);
      _silenceTimer = null;
    }
    _sessionAccumulatedTranscript = '';
    _clearActiveSegmentFinal = null;
    if (_recognition === initialRec || _recognition !== null) {
      const active = _recognition;
      _recognition = null;
      try {
        active?.abort();
      } catch {
        // Safe to ignore abort errors on teardown
      }
    }
    notifySessionEnd();
  };
}

// -- stopRecording -------------------------------------------------------------

/**
 * Gracefully stops the active recognition session (no-op if none is active).
 * Sets explicit stop flag to ensure continuous recognition does not auto-restart.
 */
export function stopRecording(): void {
  _isExplicitlyStopped = true;
  _isSessionActive = false;

  if (_restartTimer !== null) {
    clearTimeout(_restartTimer);
    _restartTimer = null;
  }
  if (_silenceTimer !== null) {
    clearTimeout(_silenceTimer);
    _silenceTimer = null;
  }

  _sessionAccumulatedTranscript = '';
  _clearActiveSegmentFinal = null;

  if (_recognition !== null) {
    const rec = _recognition;
    _recognition = null;
    try {
      rec.stop();
    } catch {
      // Safe to ignore
    }
  }

  notifySessionEnd();
}

/** Returns true if a recognition session is currently active. */
export function isRecording(): boolean {
  return _isSessionActive && !_isExplicitlyStopped;
}

// -- TTS types -----------------------------------------------------------------

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

// -- speakText -----------------------------------------------------------------

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
export function speakText(
  text: string,
  options: SpeakOptions = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // -- Support check --------------------------------------------------------
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      reject(
        new AudioServiceError(
          'SYNTHESIS_NOT_SUPPORTED',
          'SpeechSynthesis is not available in this browser.',
        ),
      );
      return;
    }

    // -- Cancel any in-flight utterance ---------------------------------------
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      // Reject the previous speakText() Promise before cancelling.
      const prevReject = _synthReject;
      _synthReject = null;
      window.speechSynthesis.cancel();
      prevReject?.(
        new AudioServiceError(
          'SYNTHESIS_CANCELLED',
          'Utterance was interrupted by a new speakText() call.',
        ),
      );
    }

    _synthReject = reject;

    const utterance = new SpeechSynthesisUtterance(text);

    // -- Apply options --------------------------------------------------------
    if (options.language !== undefined) utterance.lang = options.language;
    if (options.rate !== undefined) utterance.rate = options.rate;
    if (options.pitch !== undefined) utterance.pitch = options.pitch;
    if (options.volume !== undefined) utterance.volume = options.volume;

    if (options.voiceName !== undefined) {
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.name === options.voiceName);
      if (voice !== undefined) utterance.voice = voice;
      // Falls back to browser default if not found — does not throw.
    }

    // -- Events ---------------------------------------------------------------
    utterance.onstart = () => {
      options.onStart?.();
    };

    utterance.onboundary = (ev: SpeechSynthesisEvent) => {
      if (ev.name === 'word' && options.onBoundary !== undefined) {
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
      if (ev.error === 'canceled' || ev.error === 'interrupted') {
        reject(
          new AudioServiceError(
            'SYNTHESIS_CANCELLED',
            'Speech synthesis was cancelled.',
          ),
        );
      } else {
        reject(
          new AudioServiceError(
            'SYNTHESIS_UNKNOWN',
            `Speech synthesis error: ${ev.error}`,
          ),
        );
      }
    };

    // -- Chrome voice-loading workaround --------------------------------------
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
        window.speechSynthesis.removeEventListener(
          'voiceschanged',
          onVoicesChanged,
        );
      };
      window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    }

    window.speechSynthesis.speak(utterance);
  });
}

// -- stopSpeaking --------------------------------------------------------------

/**
 * Cancels the currently active SpeechSynthesis utterance.
 * The Promise returned by `speakText()` will reject with SYNTHESIS_CANCELLED.
 * No-op if nothing is speaking.
 */
export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending)
    return;

  // Settle the Promise first so the rejection arrives before onerror fires.
  const reject = _synthReject;
  _synthReject = null;

  window.speechSynthesis.cancel();

  reject?.(
    new AudioServiceError(
      'SYNTHESIS_CANCELLED',
      'Speech synthesis was stopped by the application.',
    ),
  );
}

/** Returns true if SpeechSynthesis is currently producing audio. */
export function isSpeaking(): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false;
  return window.speechSynthesis.speaking;
}

// -- Voice catalogue -----------------------------------------------------------

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
  if (typeof window === 'undefined' || !('speechSynthesis' in window))
    return [];
  return window.speechSynthesis.getVoices().map((v) => ({
    name: v.name,
    language: v.lang,
    isDefault: v.default,
    isLocalService: v.localService,
  }));
}
