/**
 * @file WebSpeechSTTProvider.ts
 * @description Hardened Web Speech API STT Provider.
 * Implements anti-halt continuous keep-alive, zero-drop interim text preservation,
 * graceful silence handling, and robust mutex state guards against DOMExceptions.
 */

import type {
  ISTTProvider,
  STTCallbacks,
  STTOptions,
  STTErrorPayload,
} from '../../contracts/stt.interface';

// -- Ambient Web Speech API types --------------------------------------------
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

type SpeechRecognitionCtor = SpeechRecognitionStaticAmbient;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class WebSpeechSTTProvider implements ISTTProvider {
  readonly name = 'WebSpeechSTTProvider';

  private recognition: SpeechRecognitionAmbient | null = null;
  private sessionAccumulatedTranscript = '';
  private currentSegmentFinal = '';
  private currentSegmentInterim = '';
  private segmentConfidence = 0.9;

  private isSessionActive = false;
  private isExplicitlyStopped = false;
  private isStarting = false;
  private restartAttempts = 0;

  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;

  private callbacks: STTCallbacks | null = null;
  private options: STTOptions = {};

  isSupported(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  isListening(): boolean {
    return this.isSessionActive && !this.isExplicitlyStopped;
  }

  getSessionTranscript(): string {
    return this.sessionAccumulatedTranscript;
  }

  /**
   * Updates base accumulated session transcript.
   * Seamlessly keeps manual candidate typing in sync with upcoming speech appends.
   */
  updateSessionTranscript(text: string): void {
    this.sessionAccumulatedTranscript = text;
    this.currentSegmentFinal = '';
    this.currentSegmentInterim = '';
  }

  start(callbacks: STTCallbacks, options: STTOptions = {}): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      const err: STTErrorPayload = {
        code: 'RECOGNITION_NOT_SUPPORTED',
        message:
          'SpeechRecognition is not supported in this browser. Please use Chrome, Edge, or Safari 14.1+.',
        recoverable: false,
      };
      callbacks.onError(err);
      throw new Error(err.message);
    }

    if (this.isSessionActive && !this.isExplicitlyStopped) {
      const err: STTErrorPayload = {
        code: 'RECOGNITION_ALREADY_ACTIVE',
        message:
          'A recognition session is already active. Call stopRecording() first.',
        recoverable: false,
      };
      throw new Error(err.message);
    }

    this.clearTimers();

    this.isSessionActive = true;
    this.isExplicitlyStopped = false;
    this.restartAttempts = 0;
    this.sessionAccumulatedTranscript = '';
    this.currentSegmentFinal = '';
    this.currentSegmentInterim = '';
    this.callbacks = callbacks;
    this.options = options;

    this.createAndStartRecognition(Ctor, true);
    this.startWatchdog();
  }

  stop(): void {
    this.isExplicitlyStopped = true;
    this.isSessionActive = false;

    this.clearTimers();
    this.flushUncommittedInterim();

    if (this.recognition !== null) {
      const rec = this.recognition;
      this.recognition = null;
      try {
        rec.stop();
      } catch {
        // Safe to ignore
      }
    }

    this.notifySessionEnd();
  }

  /**
   * Zero-drop interim text preservation.
   * Flushes any uncommitted interim or final text from the current segment
   * into the session transcript buffer so no spoken word is lost upon disconnect.
   */
  private flushUncommittedInterim(): void {
    const uncommitted = [this.currentSegmentFinal, this.currentSegmentInterim]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (uncommitted) {
      const prefix = this.sessionAccumulatedTranscript
        ? `${this.sessionAccumulatedTranscript.trimEnd()} `
        : '';
      this.sessionAccumulatedTranscript = `${prefix}${uncommitted}`.trim();
      if (this.callbacks) {
        this.callbacks.onFinalTranscript(
          this.sessionAccumulatedTranscript,
          this.segmentConfidence,
        );
      }
    }

    this.currentSegmentFinal = '';
    this.currentSegmentInterim = '';
  }

  private createAndStartRecognition(
    RecognitionClass: SpeechRecognitionCtor,
    isInitialStart = false,
  ): void {
    if (this.isExplicitlyStopped || !this.isSessionActive) return;

    const rec = new RecognitionClass();
    if (this.options.language !== undefined) {
      rec.lang = this.options.language;
    }
    rec.continuous = this.options.continuous ?? true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    this.recognition = rec;

    // Silence timer setup (if silenceTimeoutMs > 0)
    const timeout = this.options.silenceTimeoutMs ?? 0;
    const resetSilenceTimer = () => {
      if (timeout <= 0) return;
      if (this.silenceTimer !== null) clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => {
        if (this.recognition === rec) {
          this.isExplicitlyStopped = true;
          rec.stop();
        }
      }, timeout);
    };

    if (timeout > 0) {
      resetSilenceTimer();
    }

    // -- Event: results -------------------------------------------------------
    rec.onresult = (event: SpeechRecognitionEventAmbient) => {
      resetSilenceTimer();
      this.restartAttempts = 0; // Reset restart counter on successful audio packets

      let segmentFinalInEvent = '';
      let segmentInterimInEvent = '';
      let hasFinalInEvent = false;

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result === undefined) continue;
        const alt = result[0];
        if (alt === undefined) continue;

        if (result.isFinal) {
          segmentFinalInEvent =
            (segmentFinalInEvent ? `${segmentFinalInEvent} ` : '') +
            alt.transcript.trim();
          this.segmentConfidence = Math.min(
            1,
            Math.max(0, alt.confidence || 0.9),
          );
          hasFinalInEvent = true;
        } else {
          segmentInterimInEvent =
            (segmentInterimInEvent ? `${segmentInterimInEvent} ` : '') +
            alt.transcript.trim();
        }
      }

      this.currentSegmentFinal = segmentFinalInEvent;
      this.currentSegmentInterim = segmentInterimInEvent;

      const basePrefix = this.sessionAccumulatedTranscript
        ? `${this.sessionAccumulatedTranscript.trimEnd()} `
        : '';

      const activeSegmentSpeech = [
        this.currentSegmentFinal,
        this.currentSegmentInterim,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      const liveFullText = (basePrefix + activeSegmentSpeech).trim();

      if (liveFullText && this.callbacks) {
        this.callbacks.onInterimTranscript(liveFullText);
      }

      if (hasFinalInEvent && this.currentSegmentFinal && this.callbacks) {
        const finalizedFullText = (
          basePrefix + this.currentSegmentFinal
        ).trim();
        this.callbacks.onFinalTranscript(
          finalizedFullText,
          this.segmentConfidence,
        );
      }
    };

    // -- Event: error ---------------------------------------------------------
    rec.onerror = (event: SpeechRecognitionErrorEventAmbient) => {
      if (this.silenceTimer !== null) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      const errorType = event.error;

      // Self-aborted when stopping or restarting: benign.
      if (errorType === 'aborted') {
        return;
      }

      const codeMap: Record<string, string> = {
        'not-allowed': 'NOT_ALLOWED',
        'permission-denied': 'NOT_ALLOWED',
        'service-not-allowed': 'NOT_ALLOWED',
        'audio-capture': 'AUDIO_CAPTURE_FAILED',
        'no-speech': 'NO_SPEECH_DETECTED',
        network: 'RECOGNITION_NETWORK_ERROR',
        'bad-grammar': 'RECOGNITION_UNKNOWN',
        'language-not-supported': 'RECOGNITION_UNKNOWN',
      };

      const code = codeMap[errorType] ?? 'RECOGNITION_UNKNOWN';
      const isFatal =
        code === 'NOT_ALLOWED' ||
        code === 'AUDIO_CAPTURE_FAILED' ||
        code === 'RECOGNITION_NOT_SUPPORTED';

      if (isFatal) {
        this.isExplicitlyStopped = true;
        this.isSessionActive = false;
        this.recognition = null;
      }

      const messages: Record<string, string> = {
        NOT_ALLOWED:
          'Microphone access was denied. Allow microphone permission in your browser settings and try again.',
        AUDIO_CAPTURE_FAILED:
          'Cannot access your microphone. Check that it is connected and not being used by another application.',
        NO_SPEECH_DETECTED:
          'No speech was detected. Please speak clearly into your microphone.',
        RECOGNITION_NETWORK_ERROR:
          'A network error interrupted speech recognition. Check your connection.',
      };

      const message =
        messages[code] ?? `Speech recognition error: ${errorType}`;

      if (this.callbacks) {
        this.callbacks.onError({
          code,
          message,
          recoverable: !isFatal,
        });
      }
    };

    // -- Event: end -----------------------------------------------------------
    rec.onend = () => {
      if (this.silenceTimer !== null) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      // Zero-drop interim flush on segment termination
      this.flushUncommittedInterim();

      // If explicitly stopped or non-continuous:
      if (
        this.isExplicitlyStopped ||
        this.options.continuous === false ||
        !this.isSessionActive
      ) {
        this.recognition = null;
        this.isSessionActive = false;
        this.notifySessionEnd();
        return;
      }

      // Continuous mode: schedule instant restart with 50-100ms pause
      // allowing browser audio capture pipeline to release safely
      this.scheduleRestart(RecognitionClass);
    };

    // Mutex & State Guards: gracefully handle DOMException
    try {
      this.isStarting = true;
      rec.start();
    } catch (err: unknown) {
      this.isStarting = false;
      const errMsg = err instanceof Error ? err.message : String(err);
      // If recognition is already started, don't kill the session
      if (
        errMsg.includes('already started') ||
        (err instanceof DOMException && err.name === 'InvalidStateError')
      ) {
        console.warn(
          '[WebSpeechSTTProvider] Recognition already running, preserving session state.',
        );
        return;
      }

      if (isInitialStart) {
        this.recognition = null;
        this.isSessionActive = false;
        if (this.callbacks) {
          this.callbacks.onError({
            code: 'RECOGNITION_UNKNOWN',
            message: errMsg || 'Failed to start speech recognition.',
            recoverable: false,
          });
        }
        throw err;
      } else {
        // In background auto-restart: retry after short backoff instead of terminating
        console.warn(
          '[WebSpeechSTTProvider] Transient background start error, scheduling retry:',
          err,
        );
        this.restartAttempts++;
        this.scheduleRestart(RecognitionClass);
      }
    } finally {
      this.isStarting = false;
    }
  }

  private scheduleRestart(RecognitionClass: SpeechRecognitionCtor): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.isExplicitlyStopped || !this.isSessionActive) {
      return;
    }

    // 50ms delay gives Chrome time to cleanly release the previous audio stream handle
    const delay =
      this.restartAttempts === 0
        ? 50
        : Math.min(1000, 100 * Math.pow(1.5, this.restartAttempts));

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (
        !this.isExplicitlyStopped &&
        this.isSessionActive &&
        !this.isStarting
      ) {
        try {
          this.createAndStartRecognition(RecognitionClass, false);
        } catch (err) {
          console.warn(
            '[WebSpeechSTTProvider] Auto-restart recognition attempt failed:',
            err,
          );
          this.restartAttempts++;
          if (this.restartAttempts < 10) {
            this.scheduleRestart(RecognitionClass);
          }
        }
      }
    }, delay);
  }

  private startWatchdog(): void {
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
    }

    // Watchdog checks every 2500ms if session should be active but recognizer dropped
    this.watchdogTimer = setInterval(() => {
      if (
        this.isSessionActive &&
        !this.isExplicitlyStopped &&
        !this.recognition &&
        !this.restartTimer
      ) {
        const Ctor = getSpeechRecognitionCtor();
        if (Ctor) {
          console.warn(
            '[WebSpeechSTTProvider] Watchdog detected stalled recognizer. Reviving continuous loop...',
          );
          this.scheduleRestart(Ctor);
        }
      }
    }, 2500);
  }

  private clearTimers(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.watchdogTimer !== null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private notifySessionEnd(): void {
    if (this.callbacks !== null) {
      const cb = this.callbacks;
      this.callbacks = null;
      cb.onEnd();
    }
  }
}
