/**
 * @file stt.interface.ts
 * @description Pure domain contracts and interfaces for speech-to-text (STT) providers.
 * Decoupled from browser-specific globals, third-party libraries, and UI frameworks.
 */

export interface STTErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface STTCallbacks {
  /**
   * Dispatched during speech with partial/interim transcript text.
   * Used for real-time live preview ("ghost text") in the UI.
   */
  onInterimTranscript: (text: string) => void;

  /**
   * Dispatched with committed text when a phrase or segment concludes.
   * Confidence is normalised in the range [0, 1].
   */
  onFinalTranscript: (text: string, confidence: number) => void;

  /**
   * Dispatched when an error occurs in the provider.
   */
  onError: (error: STTErrorPayload) => void;

  /**
   * Dispatched when the provider session terminates.
   */
  onEnd: () => void;

  /**
   * Optional telemetry callback notifying that the active STT provider
   * has changed (e.g., failed over from WebSpeech to AudioStream).
   */
  onProviderChange?: ((providerName: string) => void) | undefined;
}

export interface STTOptions {
  /** BCP 47 language tag (e.g. "en-US", "hi-IN"). */
  language?: string | undefined;

  /** Continuous listening mode across speech pauses. Default: true. */
  continuous?: boolean | undefined;

  /** Optional silence timeout in ms before stopping recognition. 0 = disabled. */
  silenceTimeoutMs?: number | undefined;

  /**
   * Optional existing MediaStream (e.g. shared from webcam capture).
   * Prevents Windows WASAPI audio device contention from duplicate getUserMedia calls.
   */
  existingStream?: MediaStream | undefined;
}

export type STTProviderStatus =
  'IDLE' | 'STARTING' | 'LISTENING' | 'ERROR' | 'STOPPED';

export interface ISTTProvider {
  /** Identifier name of the STT provider. */
  readonly name: string;

  /** Returns true if the environment supports this provider's capabilities. */
  isSupported(): boolean;

  /** Returns true if the provider is currently actively listening. */
  isListening(): boolean;

  /**
   * Starts speech recognition session.
   */
  start(callbacks: STTCallbacks, options?: STTOptions): Promise<void> | void;

  /**
   * Stops the active recognition session gracefully.
   */
  stop(): void;

  /**
   * Updates the base accumulated session transcript.
   * Synchronises manual typing in the answer textarea with upcoming speech appends.
   */
  updateSessionTranscript(text: string): void;

  /**
   * Returns the current accumulated session transcript.
   */
  getSessionTranscript(): string;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
