/**
 * @file audioService.ts
 * @description Enterprise Audio Facade for Client-Side Audio I/O.
 * Unifies Speech-To-Text (HybridSTTOrchestrator with Circuit Breaker auto-failover)
 * and Speech-Synthesis (SpeechSynthesis API) with 100% backward-compatible API.
 *
 * --- API surface --------------------------------------------------------------
 *   startRecording(callbacks, options) → starts STT session, returns cleanup fn.
 *   stopRecording()  → gracefully stops the active recognition session
 *   isRecording()    → returns whether a session is currently active
 *   speakText(text, options) → speaks text via SpeechSynthesis
 *   stopSpeaking()   → cancels the active utterance
 *   isSpeaking()     → returns SpeechSynthesis speaking state
 *   getAudioCapabilities() → SSR-safe capability introspection
 *   getAvailableVoices()   → returns the voice catalogue
 *   updateSessionTranscript(text) → synchronises manual edits with speech appends
 *   getSessionTranscript() → returns current accumulated transcript
 *
 * --- Architecture -------------------------------------------------------------
 * Clean Domain Provider Pattern:
 * audioService (Facade) -> HybridSTTOrchestrator (Circuit Breaker)
 *   ├── WebSpeechSTTProvider (Primary: Zero-drop interim + Watchdog)
 *   └── AudioStreamSTTProvider (Secondary: 16kHz PCM ring buffer + VAD)
 */

import {
  type STTCallbacks,
  type STTOptions,
  type STTErrorPayload,
} from '../contracts/stt.interface';

import { AudioStreamSTTProvider } from './stt/AudioStreamSTTProvider';
import { HybridSTTOrchestrator } from './stt/HybridSTTOrchestrator';
import { SileroVADProvider } from './stt/SileroVADProvider';
import { STTFactory } from './stt/STTFactory';
import { WebSpeechSTTProvider } from './stt/WebSpeechSTTProvider';

// Re-export providers & factory for modular consumption
export {
  WebSpeechSTTProvider,
  AudioStreamSTTProvider,
  SileroVADProvider,
  HybridSTTOrchestrator,
  STTFactory,
};

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
  | 'AUDIO_STREAM_NOT_SUPPORTED'
  | 'AUDIO_STREAM_INIT_FAILED'
  | 'VAD_NOT_SUPPORTED'
  | 'VAD_INIT_FAILED'
  // TTS errors
  | 'SYNTHESIS_NOT_SUPPORTED' // Browser has no SpeechSynthesis API
  | 'SYNTHESIS_CANCELLED' // Utterance cancelled by stopSpeaking()
  | 'INTERRUPTED_BY_USER' // Utterance interrupted by candidate speech (barge-in)
  | 'SYNTHESIS_UNKNOWN'; // Unmapped synthesis error

/** Typed error — always carries a `code` and a user-safe `message`. */
export class AudioServiceError extends Error {
  readonly code: AudioErrorCode;
  readonly recoverable: boolean;

  constructor(code: AudioErrorCode, message: string, recoverable = false) {
    super(message);
    this.name = 'AudioServiceError';
    this.code = code;
    this.recoverable = recoverable;
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
  /** True if getUserMedia and AudioContext are available for audio streaming. */
  audioStreamSupported?: boolean;
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
      audioStreamSupported: false,
    };
  }

  const speechRecognitionSupported =
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  const speechSynthesisSupported = 'speechSynthesis' in window;
  const audioStreamSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    (Boolean(window.AudioContext) ||
      Boolean(
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext,
      ));

  return {
    isBrowser: true,
    speechRecognitionSupported,
    speechSynthesisSupported,
    audioStreamSupported,
  };
}

// -- STT Callback & Options contracts (Backward-Compatible) --------------------

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
   * Fired on any recognition error.
   */
  onError: (error: AudioServiceError) => void;

  /**
   * Fired when the session fully ends.
   */
  onEnd: () => void;

  /**
   * Optional provider failover notification callback.
   */
  onProviderChange?: ((providerName: string) => void) | undefined;
}

export interface RecordingOptions {
  /**
   * BCP 47 language tag (e.g. "en-US", "hi-IN").
   */
  language?: string | undefined;

  /**
   * Optional silence timeout in ms. Default: 0 (disabled).
   */
  silenceTimeoutMs?: number | undefined;

  /**
   * Keep recording across multiple speech bursts. Default: true.
   */
  continuous?: boolean | undefined;

  /**
   * Optional shared MediaStream (e.g. from webcam) to eliminate Windows WASAPI contention.
   */
  existingStream?: MediaStream | undefined;
}

// -- STT Session State & Orchestrator Facade -----------------------------------

let _orchestrator: HybridSTTOrchestrator | null = null;
let _activeVADProvider: SileroVADProvider | null = null;
let _sessionAccumulatedTranscript = '';

/**
 * Registers active SileroVADProvider instance with audioService.
 */
export function registerActiveVADProvider(
  provider: SileroVADProvider | null,
): void {
  _activeVADProvider = provider;
}

/**
 * Returns current accumulated session transcript buffer.
 */
export function getSessionTranscript(): string {
  if (_activeVADProvider) {
    return _activeVADProvider.getSessionTranscript();
  }
  if (_orchestrator) {
    return _orchestrator.getSessionTranscript();
  }
  return _sessionAccumulatedTranscript;
}

/**
 * Updates base accumulated transcript buffer.
 * Keeps manual candidate edits in sync so subsequent speech cleanly appends.
 */
export function updateSessionTranscript(text: string): void {
  _sessionAccumulatedTranscript = text;
  if (_orchestrator) {
    _orchestrator.updateSessionTranscript(text);
  }
  if (_activeVADProvider) {
    _activeVADProvider.updateSessionTranscript(text);
  }
}

/**
 * Returns true if speech recognition is currently active.
 */
export function isRecording(): boolean {
  return _orchestrator !== null && _orchestrator.isListening();
}

/**
 * Starts speech recognition session via HybridSTTOrchestrator.
 * Returns a cleanup function that stops recording when called.
 */
export function startRecording(
  callbacks: RecordingCallbacks,
  options: RecordingOptions = {},
): () => void {
  const caps = getAudioCapabilities();
  if (!caps.speechRecognitionSupported) {
    throw new AudioServiceError(
      'RECOGNITION_NOT_SUPPORTED',
      'SpeechRecognition is not supported in this browser. Please use Chrome, Edge, or Safari 14.1+.',
    );
  }

  if (isRecording()) {
    throw new AudioServiceError(
      'RECOGNITION_ALREADY_ACTIVE',
      'A recognition session is already active. Call stopRecording() first.',
    );
  }

  // Clear previous orchestrator if any lingering
  if (_orchestrator) {
    try {
      _orchestrator.stop();
    } catch {
      // Safe to ignore
    }
  }

  _orchestrator = new HybridSTTOrchestrator();

  const wrappedCallbacks: STTCallbacks = {
    onInterimTranscript: (text: string) => {
      callbacks.onInterimTranscript(text);
    },
    onFinalTranscript: (text: string, confidence: number) => {
      callbacks.onFinalTranscript(text, confidence);
    },
    onError: (err: STTErrorPayload) => {
      callbacks.onError(
        new AudioServiceError(
          err.code as AudioErrorCode,
          err.message,
          err.recoverable,
        ),
      );
    },
    onEnd: () => {
      callbacks.onEnd();
    },
    onProviderChange: callbacks.onProviderChange,
  };

  const sttOptions: STTOptions = {
    language: options.language,
    continuous: options.continuous,
    silenceTimeoutMs: options.silenceTimeoutMs,
    existingStream: options.existingStream,
  };

  try {
    const startResult = _orchestrator.start(wrappedCallbacks, sttOptions);
    if (startResult instanceof Promise) {
      startResult.catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : 'Audio stream failed to start.';
        callbacks.onError(
          new AudioServiceError('AUDIO_STREAM_INIT_FAILED', msg),
        );
      });
    }
  } catch (err: unknown) {
    _orchestrator = null;
    if (err instanceof AudioServiceError) {
      throw err;
    }
    const msg =
      err instanceof Error
        ? err.message
        : 'Failed to start speech recognition.';
    throw new AudioServiceError('RECOGNITION_UNKNOWN', msg);
  }

  return () => {
    stopRecording();
  };
}

/**
 * Gracefully stops the active speech recognition session.
 */
export function stopRecording(): void {
  if (_orchestrator !== null) {
    const orch = _orchestrator;
    _orchestrator = null;
    _sessionAccumulatedTranscript = '';
    orch.stop();
  }
}

// -- Speech Synthesis (TTS) & Audio Analysis -----------------------------------

export interface SpeakOptions {
  language?: string | undefined;
  rate?: number | undefined;
  pitch?: number | undefined;
  volume?: number | undefined;
  voiceName?: string | undefined;
  signal?: AbortSignal | undefined;
  onStart?: (() => void) | undefined;
  onBoundary?: ((charIndex: number, word: string) => void) | undefined;
}

class TTSAudioAnalyserEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private oscillator: OscillatorNode | null = null;
  private formantFilter: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private isAnalyzing = false;
  private animFrameId: number | null = null;

  getAnalyser(): AnalyserNode | null {
    this.ensureContext();
    return this.analyser;
  }

  getAudioContext(): AudioContext | null {
    this.ensureContext();
    return this.audioCtx;
  }

  private ensureContext(): void {
    if (typeof window === 'undefined') return;
    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          ?.webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioCtx = new AudioCtx();
          this.analyser = this.audioCtx.createAnalyser();
          this.analyser.fftSize = 128;
          this.analyser.smoothingTimeConstant = 0.75;
        } catch {
          // Gracefully handle environments without audio hardware
        }
      }
    }
  }

  startSpeechAnalysis(): void {
    this.ensureContext();
    if (!this.audioCtx || !this.analyser) return;

    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }

    this.stopSpeechAnalysis();
    this.isAnalyzing = true;

    try {
      const osc = this.audioCtx.createOscillator();
      const filter = this.audioCtx.createBiquadFilter();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, this.audioCtx.currentTime);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, this.audioCtx.currentTime);
      filter.Q.setValueAtTime(3, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.7, this.audioCtx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.analyser);

      // Route through silent gain to audio destination to drive Web Audio render pump
      const silentGain = this.audioCtx.createGain();
      silentGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      this.analyser.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);

      osc.start();
      this.oscillator = osc;
      this.formantFilter = filter;
      this.gainNode = gain;

      let step = 0;
      const modulate = () => {
        if (
          !this.isAnalyzing ||
          !this.audioCtx ||
          !this.gainNode ||
          !this.oscillator ||
          !this.formantFilter
        ) {
          return;
        }
        step++;
        const now = this.audioCtx.currentTime;
        const cadence =
          Math.sin(step * 0.15) * 0.4 + Math.sin(step * 0.05) * 0.3;
        const targetGain = Math.max(0.1, 0.6 + cadence * 0.3);
        this.gainNode.gain.setValueAtTime(targetGain, now);

        const formantFreq =
          750 + Math.sin(step * 0.22) * 450 + Math.cos(step * 0.11) * 200;
        this.formantFilter.frequency.setValueAtTime(formantFreq, now);

        const pitch = 135 + Math.sin(step * 0.08) * 30;
        this.oscillator.frequency.setValueAtTime(pitch, now);

        if (
          typeof window !== 'undefined' &&
          'requestAnimationFrame' in window
        ) {
          this.animFrameId = requestAnimationFrame(modulate);
        }
      };

      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        this.animFrameId = requestAnimationFrame(modulate);
      }
    } catch {
      // Safe to ignore in test or unsupported environments
    }
  }

  onWordBoundary(): void {
    if (!this.gainNode || !this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(0.9, now);
      this.gainNode.gain.exponentialRampToValueAtTime(0.4, now + 0.12);
    } catch {
      // Safe to ignore
    }
  }

  stopSpeechAnalysis(): void {
    this.isAnalyzing = false;
    if (
      this.animFrameId !== null &&
      typeof window !== 'undefined' &&
      'cancelAnimationFrame' in window
    ) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.gainNode && this.audioCtx) {
      try {
        this.gainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
      } catch {
        // Safe to ignore
      }
    }
    if (this.oscillator) {
      try {
        this.oscillator.stop();
        this.oscillator.disconnect();
      } catch {
        // Safe to ignore
      }
      this.oscillator = null;
    }
    if (this.formantFilter) {
      try {
        this.formantFilter.disconnect();
      } catch {
        // Safe to ignore
      }
      this.formantFilter = null;
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        // Safe to ignore
      }
      this.gainNode = null;
    }
  }
}

const _ttsAudioEngine = new TTSAudioAnalyserEngine();

/**
 * Returns Web Audio AnalyserNode connected to synthetic/TTS audio output.
 */
export function getTTSAnalyser(): AnalyserNode | null {
  return _ttsAudioEngine.getAnalyser();
}

/**
 * Returns Web Audio AudioContext powering TTS speech analysis.
 */
export function getTTSAudioContext(): AudioContext | null {
  return _ttsAudioEngine.getAudioContext();
}

let _synthReject: ((err: AudioServiceError) => void) | null = null;
let _speakAbortController: AbortController | null = null;
let _isBargeInInterrupted = false;

/**
 * Speaks `text` using SpeechSynthesis.
 * Holds an AbortController for clean user barge-in cancellation.
 * Always interrupts any currently playing utterance.
 */
export function speakText(
  text: string,
  options: SpeakOptions = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      reject(
        new AudioServiceError(
          'SYNTHESIS_NOT_SUPPORTED',
          'SpeechSynthesis is not available in this browser.',
        ),
      );
      return;
    }

    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      const prevReject = _synthReject;
      _synthReject = null;
      if (_speakAbortController) {
        _speakAbortController.abort('SYNTHESIS_CANCELLED');
        _speakAbortController = null;
      }
      window.speechSynthesis.cancel();
      prevReject?.(
        new AudioServiceError(
          'SYNTHESIS_CANCELLED',
          'Utterance was interrupted by a new speakText() call.',
          true,
        ),
      );
    }

    _isBargeInInterrupted = false;
    const ac = new AbortController();
    _speakAbortController = ac;

    if (options.signal) {
      if (options.signal.aborted) {
        const isBargeIn = options.signal.reason === 'INTERRUPTED_BY_USER';
        stopSpeaking(isBargeIn ? 'INTERRUPTED_BY_USER' : 'SYNTHESIS_CANCELLED');
        return;
      }
      options.signal.addEventListener('abort', () => {
        const isBargeIn = options.signal?.reason === 'INTERRUPTED_BY_USER';
        stopSpeaking(isBargeIn ? 'INTERRUPTED_BY_USER' : 'SYNTHESIS_CANCELLED');
      });
    }

    _synthReject = reject;
    const utterance = new SpeechSynthesisUtterance(text);

    if (options.language !== undefined) utterance.lang = options.language;
    if (options.rate !== undefined) utterance.rate = options.rate;
    if (options.pitch !== undefined) utterance.pitch = options.pitch;
    if (options.volume !== undefined) utterance.volume = options.volume;

    if (options.voiceName !== undefined) {
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.name === options.voiceName);
      if (voice !== undefined) utterance.voice = voice;
    }

    utterance.onstart = () => {
      _ttsAudioEngine.startSpeechAnalysis();
      options.onStart?.();
    };

    utterance.onboundary = (ev: SpeechSynthesisEvent) => {
      _ttsAudioEngine.onWordBoundary();
      if (ev.name === 'word' && options.onBoundary !== undefined) {
        const word = text.slice(ev.charIndex, ev.charIndex + ev.charLength);
        options.onBoundary(ev.charIndex, word);
      }
    };

    utterance.onend = () => {
      _ttsAudioEngine.stopSpeechAnalysis();
      _synthReject = null;
      _speakAbortController = null;
      resolve();
    };

    utterance.onerror = (ev: SpeechSynthesisErrorEvent) => {
      _ttsAudioEngine.stopSpeechAnalysis();
      const currentReject = _synthReject;
      _synthReject = null;
      _speakAbortController = null;

      const isInterrupted =
        _isBargeInInterrupted ||
        (ac.signal.aborted && ac.signal.reason === 'INTERRUPTED_BY_USER');

      if (isInterrupted) {
        _isBargeInInterrupted = false;
        currentReject?.(
          new AudioServiceError(
            'INTERRUPTED_BY_USER',
            'Speech synthesis was interrupted by candidate speech (barge-in).',
            true,
          ),
        );
      } else if (ev.error === 'canceled' || ev.error === 'interrupted') {
        currentReject?.(
          new AudioServiceError(
            'SYNTHESIS_CANCELLED',
            'Speech synthesis was cancelled.',
            true,
          ),
        );
      } else {
        currentReject?.(
          new AudioServiceError(
            'SYNTHESIS_UNKNOWN',
            `Speech synthesis error: ${ev.error}`,
          ),
        );
      }
    };

    // Chrome voice-loading workaround
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

/**
 * Cancels the currently active SpeechSynthesis utterance cleanly.
 * Accepts optional reason ('INTERRUPTED_BY_USER' on barge-in vs default 'SYNTHESIS_CANCELLED').
 */
export function stopSpeaking(
  reason: 'INTERRUPTED_BY_USER' | 'SYNTHESIS_CANCELLED' = 'SYNTHESIS_CANCELLED',
): void {
  _ttsAudioEngine.stopSpeechAnalysis();

  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
    return;
  }

  if (reason === 'INTERRUPTED_BY_USER') {
    _isBargeInInterrupted = true;
  }

  if (_speakAbortController) {
    _speakAbortController.abort(reason);
    _speakAbortController = null;
  }

  const reject = _synthReject;
  _synthReject = null;
  window.speechSynthesis.cancel();

  const code: AudioErrorCode =
    reason === 'INTERRUPTED_BY_USER'
      ? 'INTERRUPTED_BY_USER'
      : 'SYNTHESIS_CANCELLED';
  const msg =
    reason === 'INTERRUPTED_BY_USER'
      ? 'Speech synthesis was interrupted by candidate speech (barge-in).'
      : 'Speech synthesis was stopped by the application.';

  reject?.(new AudioServiceError(code, msg, true));
}

/**
 * Returns true if SpeechSynthesis is currently producing audio.
 */
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
 */
export function getAvailableVoices(): VoiceDescriptor[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  return window.speechSynthesis.getVoices().map((v) => ({
    name: v.name,
    language: v.lang,
    isDefault: v.default,
    isLocalService: v.localService,
  }));
}
