/**
 * @file SileroVADProvider.ts
 * @description Enterprise Voice Activity Detection (VAD) & Automatic Turn Provider.
 * Powered by Silero VAD (@ricky0123/vad-web) client-side neural speech detection.
 *
 * Provides:
 * 1. Ultra-low latency voice activity detection.
 * 2. Instant Barge-In interruption handling (cancels AI TTS when candidate speaks).
 * 3. Automatic Turn Detection (triggers AI response on >1200ms sustained silence).
 * 4. Enterprise resource lifecycle management (MediaStream & AudioContext teardown).
 */

import { MicVAD, utils, type RealTimeVADOptions } from '@ricky0123/vad-web';

import {
  type ISTTProvider,
  type STTCallbacks,
  type STTOptions,
  type STTErrorPayload,
} from '../../contracts/stt.interface';
import { stopSpeaking } from '../audioService';

export interface SileroVADCallbacks extends STTCallbacks {
  /** Dispatched when candidate speech begins (triggers barge-in). */
  onSpeechStart?: (() => void) | undefined;
  /** Dispatched specifically when candidate interrupts active TTS playback. */
  onBargeIn?: (() => void) | undefined;
  /** Dispatched when candidate speech segment concludes with raw audio samples. */
  onSpeechEnd?: ((audio?: Float32Array | undefined) => void) | undefined;
  /** Dispatched when candidate speech was too brief (misfire). */
  onVADMisfire?: (() => void) | undefined;
  /** Dispatched when >1200ms silence completes turn, passing finalized transcript for auto AI trigger. */
  onAutoSubmit?: ((transcript: string) => void) | undefined;
}

export interface SileroVADOptions extends STTOptions {
  /** Threshold above which Silero VAD indicates positive speech (default: 0.8). */
  positiveSpeechThreshold?: number | undefined;
  /** Threshold below which Silero VAD indicates speech absence (default: 0.35). */
  negativeSpeechThreshold?: number | undefined;
  /** Number of redemption frames before speech end is considered (default: 8). */
  redemptionFrames?: number | undefined;
  /** Silence pause timeout in ms before automatic turn finalization (default: 1200). */
  silenceThresholdMs?: number | undefined;
  /** Base asset URL for Silero ONNX models. */
  baseAssetPath?: string | undefined;
  /** Base URL for ONNX Runtime WebAssembly binaries. */
  onnxWASMBasePath?: string | undefined;
  /** Existing shared AudioContext. */
  audioContext?: AudioContext | undefined;
  /** Whether to transcribe buffered audio via /api/interview/stt on turn completion. */
  transcribeWithWhisper?: boolean | undefined;
}

export class SileroVADProvider implements ISTTProvider {
  readonly name = 'SileroVADProvider';

  // Enterprise baseline specification defaults
  readonly positiveSpeechThreshold: number = 0.8;
  readonly negativeSpeechThreshold: number = 0.35;
  readonly redemptionFrames: number = 8;
  readonly silenceThresholdMs: number = 2500;

  private vadInstance: MicVAD | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private ownsAudioContext = false;
  private ownsStream = false;

  private isDestroyed = false;
  private isSessionActive = false;
  private isSpeechActive = false;
  private isBuffering = false;
  private sessionAccumulatedTranscript = '';
  private liveTranscriptBuffer = '';
  private bufferedAudioSegments: Float32Array[] = [];

  // Real-time active speech buffering
  private activeSpeechFrames: Float32Array[] = [];
  private activeSpeechSamples = 0;
  private dispatchQueue: Promise<void> = Promise.resolve();
  private readonly CHUNK_SAMPLE_THRESHOLD = 40000; // 2.5 seconds at 16kHz
  private readonly MIN_AUDIO_SAMPLES = 3200; // 200ms minimum to transcribe

  // Strategy B: Adaptive First-Chunk Threshold state
  // First chunk in a new speech burst uses 1.2s (19,200 samples at 16kHz) fast-start
  // threshold; all subsequent chunks in the same continuous burst pace at 2.5s.
  // lastDispatchTimestamp enforces a hard minimum 1,100ms inter-dispatch guard so total
  // Whisper requests never exceed 18 RPM even during continuous rapid speech.
  private isInitialChunkInBurst = true;
  private lastDispatchTimestamp = 0;
  private readonly INITIAL_CHUNK_THRESHOLD = 19200; // 1.2 seconds at 16kHz
  private readonly MIN_DISPATCH_INTERVAL_MS = 1100; // ≤18 RPM guard

  // Turn Epoch Tracking: Guards against cross-turn STT buffer bleeding when
  // a candidate submits while in-flight Whisper HTTP requests are pending.
  private turnEpoch = 0;

  private callbacks: SileroVADCallbacks | null = null;
  private options: SileroVADOptions = {};
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Introspects browser capability for Silero VAD.
   * Safe to call during SSR.
   */
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hasMedia =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia);
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        ?.webkitAudioContext;
    return Boolean(hasMedia && AudioCtx);
  }

  /**
   * Returns true if Silero VAD session is actively running.
   */
  isListening(): boolean {
    return this.isSessionActive;
  }

  /**
   * Returns whether candidate is currently producing speech.
   */
  isCandidateSpeaking(): boolean {
    return this.isSpeechActive;
  }

  /**
   * Returns whether speech audio is currently being buffered.
   */
  isSpeechBuffering(): boolean {
    return this.isBuffering;
  }

  /**
   * Returns accumulated transcript for current session.
   */
  getSessionTranscript(): string {
    return this.sessionAccumulatedTranscript;
  }

  /**
   * Updates accumulated transcript buffer for synchronization with UI.
   */
  updateSessionTranscript(text: string): void {
    this.sessionAccumulatedTranscript = text;
    this.liveTranscriptBuffer = text;
  }

  /**
   * Starts Silero VAD neural voice activity detection session.
   */
  async start(
    callbacks: STTCallbacks | SileroVADCallbacks,
    options: STTOptions | SileroVADOptions = {},
  ): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    if (!this.isSupported()) {
      const err: STTErrorPayload = {
        code: 'VAD_NOT_SUPPORTED',
        message: 'Silero VAD is not supported in this environment.',
        recoverable: false,
      };
      callbacks.onError(err);
      throw new Error(err.message);
    }

    this.callbacks = callbacks as SileroVADCallbacks;
    this.options = options as SileroVADOptions;
    this.isSessionActive = true;
    this.isSpeechActive = false;
    this.isBuffering = false;
    this.bufferedAudioSegments = [];
    this.activeSpeechFrames = [];
    this.activeSpeechSamples = 0;
    this.turnEpoch = 0;
    this.dispatchQueue = Promise.resolve();

    const posThreshold =
      this.options.positiveSpeechThreshold ?? this.positiveSpeechThreshold;
    const negThreshold =
      this.options.negativeSpeechThreshold ?? this.negativeSpeechThreshold;
    const redFrames = this.options.redemptionFrames ?? this.redemptionFrames;
    const silenceTimeout =
      this.options.silenceThresholdMs ?? this.silenceThresholdMs;

    // Build MicVAD options adhering to strict specifications
    const vadOptions: Partial<RealTimeVADOptions> & {
      redemptionFrames?: number;
    } = {
      positiveSpeechThreshold: posThreshold,
      negativeSpeechThreshold: negThreshold,
      redemptionFrames: redFrames,
      redemptionMs: silenceTimeout,
      // Enterprise standard: do not automatically start audio stream during model load.
      // This decouples ONNX model download from WebAudio graph attachment and prevents
      // InvalidStateError if the component unmounts while model is downloading.
      startOnLoad: false,
      baseAssetPath: this.options.baseAssetPath ?? '/vad/',
      onnxWASMBasePath: this.options.onnxWASMBasePath ?? '/vad/',
      getStream: async () => {
        if (this.isDestroyed || !this.isSessionActive) {
          throw new Error('Session destroyed before acquiring audio stream');
        }

        if (
          this.options.existingStream &&
          this.options.existingStream.getAudioTracks().length > 0
        ) {
          this.mediaStream = this.options.existingStream;
          this.ownsStream = false;
          return this.mediaStream;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            autoGainControl: true,
            noiseSuppression: true,
          },
        });

        if (this.isDestroyed || !this.isSessionActive) {
          stream.getTracks().forEach((track) => track.stop());
          throw new Error(
            'Session destroyed before audio stream could be bound',
          );
        }

        this.mediaStream = stream;
        this.ownsStream = true;
        return stream;
      },
      pauseStream: async (stream: MediaStream) => {
        if (this.ownsStream) {
          stream.getTracks().forEach((track) => track.stop());
        }
      },
      onSpeechStart: () => {
        if (!this.isDestroyed && this.isSessionActive) {
          this.handleSpeechStart();
        }
      },
      onSpeechEnd: (audio: Float32Array) => {
        if (!this.isDestroyed && this.isSessionActive) {
          this.handleSpeechEnd(audio);
        }
      },
      onVADMisfire: () => {
        if (!this.isDestroyed && this.isSessionActive) {
          this.handleVADMisfire();
        }
      },
      onFrameProcessed: (_probs: unknown, frame: Float32Array) => {
        if (!this.isDestroyed && this.isSessionActive) {
          this.handleFrameProcessed(frame);
        }
      },
    };

    if (this.options.audioContext) {
      this.audioContext = this.options.audioContext;
      this.ownsAudioContext = false;
      vadOptions.audioContext = this.audioContext;
    } else {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          ?.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        this.ownsAudioContext = true;
        vadOptions.audioContext = this.audioContext;
      }
    }

    try {
      const instance = await MicVAD.new(
        vadOptions as Partial<RealTimeVADOptions>,
      );

      // Enterprise Cancellation Check: if destroyed while compiling ONNX model
      if (this.isDestroyed || !this.isSessionActive) {
        try {
          await instance.destroy();
        } catch {
          // Ignore cancellation cleanup errors
        }
        return;
      }

      this.vadInstance = instance;

      // Safe AudioContext state validation: ensure context is alive before starting worklet
      if (!this.audioContext || this.audioContext.state === 'closed') {
        throw new Error('AudioContext was closed before VAD could start');
      }

      if (this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
        } catch {
          // Will resume automatically upon candidate gesture
        }
      }

      // Start listening pipeline
      await this.vadInstance.start();
    } catch (err: unknown) {
      if (this.isDestroyed) {
        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : 'Failed to initialize Silero VAD engine.';

      const isLifecycleAbort =
        this.isDestroyed ||
        (err instanceof Error &&
          (err.name === 'InvalidStateError' ||
            err.name === 'AbortError' ||
            err.message.includes('No execution context available') ||
            err.message.includes('AudioWorkletNode cannot be created') ||
            err.message.includes('AudioContext was closed')));

      callbacks.onError({
        code: 'VAD_INIT_FAILED',
        message,
        recoverable: isLifecycleAbort,
      });

      this.stop();

      // Enterprise fault tolerance: do not crash the interview session on unmount or context loss
      if (!isLifecycleAbort) {
        throw err;
      }
    }
  }

  /**
   * Internal handler for speech onset detected by Silero neural model.
   * Immediately triggers barge-in to stop TTS and buffers candidate utterance.
   */
  private handleSpeechStart(): void {
    if (!this.isSessionActive) return;

    // 1. Immediately cancel active SpeechSynthesis utterance with reason INTERRUPTED_BY_USER
    try {
      stopSpeaking('INTERRUPTED_BY_USER');
    } catch {
      // Safe to ignore in headless or unsupported environments
    }

    // 2. Clear any pending turn-completion silence countdown
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    // 3. Mark speech active & start audio buffering
    this.isSpeechActive = true;
    this.isBuffering = true;
    this.activeSpeechFrames = [];
    this.activeSpeechSamples = 0;

    // Strategy B: Reset fast-start flag so first chunk in this new burst dispatches
    // at 1.2s (INITIAL_CHUNK_THRESHOLD) for ultra-low first-word latency.
    this.isInitialChunkInBurst = true;

    // 4. Dispatch barge-in and speech start callbacks
    this.callbacks?.onBargeIn?.();
    this.callbacks?.onSpeechStart?.();
  }

  /**
   * Internal handler for continuous audio frame buffering during speech.
   * Strategy B: Adaptive First-Chunk Threshold.
   *   - First chunk in a new burst: flushes at 1.2s (19,200 samples) for ultra-low first-word latency.
   *   - Subsequent chunks in the same continuous burst: pace at 2.5s (40,000 samples).
   *   - Hard RPM guard: enforces ≥1,100ms between dispatches so total requests ≤18 RPM.
   */
  private handleFrameProcessed(frame: Float32Array): void {
    if (!this.isSpeechActive || !this.isSessionActive) return;

    const copy = new Float32Array(frame.length);
    copy.set(frame);
    this.activeSpeechFrames.push(copy);
    this.activeSpeechSamples += copy.length;

    if (!this.options.transcribeWithWhisper) return;

    // Strategy B: Use fast-start 1.2s threshold for the initial chunk of each speech
    // burst; fall back to the standard 2.5s threshold for all subsequent chunks.
    const adaptiveThreshold = this.isInitialChunkInBurst
      ? this.INITIAL_CHUNK_THRESHOLD
      : this.CHUNK_SAMPLE_THRESHOLD;

    if (this.activeSpeechSamples >= adaptiveThreshold) {
      // Hard RPM guard: ensure at least MIN_DISPATCH_INTERVAL_MS has elapsed since
      // the last dispatch so total Whisper requests never exceed 18 RPM.
      const now = Date.now();
      const msSinceLastDispatch = now - this.lastDispatchTimestamp;

      if (
        this.lastDispatchTimestamp === 0 ||
        msSinceLastDispatch >= this.MIN_DISPATCH_INTERVAL_MS
      ) {
        this.flushActiveSpeechChunk();
        // After the first chunk is sent, subsequent chunks pace at the slower 2.5s threshold.
        this.isInitialChunkInBurst = false;
        this.lastDispatchTimestamp = Date.now();
      }
      // If the RPM guard is holding, keep accumulating frames — they will be flushed
      // on the next frame tick once the interval has elapsed or on speech end.
    }
  }

  /**
   * Flushes accumulated speech frames to Whisper and resets the slice accumulator.
   */
  private flushActiveSpeechChunk(): void {
    if (this.activeSpeechFrames.length === 0) return;

    const totalLength = this.activeSpeechSamples;
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const frame of this.activeSpeechFrames) {
      combined.set(frame, offset);
      offset += frame.length;
    }

    this.activeSpeechFrames = [];
    this.activeSpeechSamples = 0;

    if (totalLength >= this.MIN_AUDIO_SAMPLES) {
      this.dispatchAudioChunk(combined);
    }
  }

  /**
   * Internal handler for candidate speech pause detected by Silero model.
   * Dispatches any remaining audio slice to Whisper and handles turn silence timeout.
   */
  private handleSpeechEnd(audio?: Float32Array): void {
    if (!this.isSessionActive) return;

    this.isSpeechActive = false;
    this.isBuffering = false;

    if (this.options.transcribeWithWhisper) {
      if (this.activeSpeechFrames.length > 0) {
        // Flush any remaining accumulated frames (may be less than the adaptive threshold).
        this.flushActiveSpeechChunk();
      } else if (audio && audio.length >= this.MIN_AUDIO_SAMPLES) {
        // Fallback for environments or tests where onFrameProcessed was not triggered
        this.dispatchAudioChunk(audio);
      }
    }

    // Strategy B: Reset fast-start flag for the next speech burst.
    this.isInitialChunkInBurst = true;

    if (audio && audio.length > 0) {
      this.bufferedAudioSegments.push(audio);
    }

    this.callbacks?.onSpeechEnd?.(audio);

    // Clear prior timer if any
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
    }

    // Only schedule auto-submit if onAutoSubmit callback is explicitly configured.
    // In standard enterprise manual-submission mode, turn progression is strictly driven by the candidate button.
    if (this.callbacks?.onAutoSubmit) {
      const waitMs = this.options.silenceThresholdMs ?? this.silenceThresholdMs;

      this.silenceTimer = setTimeout(() => {
        if (!this.isSessionActive || this.isSpeechActive) return;
        void this.finalizeSpeechAndTriggerSubmission();
      }, waitMs);
    }
  }

  /**
   * Internal handler for brief misfires (clicks, background taps under min duration).
   */
  private handleVADMisfire(): void {
    this.isSpeechActive = false;
    this.isBuffering = false;
    this.activeSpeechFrames = [];
    this.activeSpeechSamples = 0;
    this.callbacks?.onVADMisfire?.();
  }

  /**
   * Aborts current turn processing immediately:
   * - Increments turnEpoch so all in-flight Whisper HTTP responses are instantly invalidated & discarded.
   * - Empties buffered speech frames and resets accumulated session transcripts.
   * - Clears any pending silence timers.
   */
  abortTurn(): void {
    this.turnEpoch++;
    this.activeSpeechFrames = [];
    this.activeSpeechSamples = 0;
    this.sessionAccumulatedTranscript = '';
    this.liveTranscriptBuffer = '';
    this.isSpeechActive = false;
    this.isBuffering = false;
    this.isInitialChunkInBurst = true;
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Dispatches a Float32Array PCM audio chunk to Groq Whisper via /api/interview/stt.
   * Encodes audio into a valid WAV file with a standard 44-byte RIFF header.
   */
  private dispatchAudioChunk(samples: Float32Array): void {
    if (this.isDestroyed || !this.isSessionActive) return;
    const requestEpoch = this.turnEpoch;

    this.dispatchQueue = this.dispatchQueue
      .then(async () => {
        if (
          this.isDestroyed ||
          !this.isSessionActive ||
          this.turnEpoch !== requestEpoch
        ) {
          return;
        }

        const wavBuffer = utils.encodeWAV(samples);
        const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' });

        const formData = new FormData();
        formData.append('file', audioBlob, 'candidate-speech.wav');
        formData.append('language', this.options.language ?? 'en');

        const response = await fetch('/api/interview/stt', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        // Turn boundary guard: If candidate submitted the turn while request was in-flight, discard!
        if (this.turnEpoch !== requestEpoch || !this.isSessionActive) return;

        if (response.ok) {
          const data = (await response.json()) as { text?: string };
          const whisperText = (data.text ?? '').trim();
          if (
            whisperText &&
            this.turnEpoch === requestEpoch &&
            this.isSessionActive
          ) {
            const prefix = this.sessionAccumulatedTranscript.trim();
            const updated = prefix ? `${prefix} ${whisperText}` : whisperText;
            this.sessionAccumulatedTranscript = updated;
            this.liveTranscriptBuffer = updated;
            this.callbacks?.onInterimTranscript?.(updated);
            this.callbacks?.onFinalTranscript(updated, 0.99);
          }
        }
      })
      .catch((err) => {
        console.warn('[SileroVAD] Whisper transcription dispatch failed:', err);
      });
  }

  /**
   * Finalizes transcribed speech and dispatches automatic AI turn trigger.
   */
  private async finalizeSpeechAndTriggerSubmission(): Promise<void> {
    if (!this.isSessionActive) return;

    if (this.options.transcribeWithWhisper) {
      await this.dispatchQueue;
    }

    let finalTranscript =
      this.sessionAccumulatedTranscript.trim() ||
      this.liveTranscriptBuffer.trim();

    const textToSubmit = finalTranscript.trim();
    if (textToSubmit) {
      this.callbacks?.onAutoSubmit?.(textToSubmit);
    }

    this.bufferedAudioSegments = [];
  }

  /**
   * Gracefully pauses or stops active listening session.
   */
  stop(): void {
    this.isSessionActive = false;
    this.isSpeechActive = false;
    this.isBuffering = false;
    this.activeSpeechFrames = [];
    this.activeSpeechSamples = 0;
    this.isInitialChunkInBurst = true;
    this.lastDispatchTimestamp = 0;
    this.turnEpoch++;

    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.vadInstance) {
      try {
        void this.vadInstance.pause();
      } catch {
        // Safe to ignore
      }
    }

    if (this.callbacks) {
      const cb = this.callbacks;
      cb.onEnd();
    }
  }

  /**
   * Resets the silence detection timer without losing speech state.
   * Call this when the candidate is actively typing to extend the auto-submit window.
   * This prevents premature submission when the candidate pauses speech to type.
   */
  resetSilenceTimer(): void {
    if (!this.isSessionActive || this.isSpeechActive) return;

    // Only reset if a silence timer is currently running
    // (i.e., we're in the post-speech silence window)
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);

      const waitMs = this.options.silenceThresholdMs ?? this.silenceThresholdMs;

      this.silenceTimer = setTimeout(() => {
        if (!this.isSessionActive || this.isSpeechActive) return;
        void this.finalizeSpeechAndTriggerSubmission();
      }, waitMs);
    }
  }

  /**
   * Clean lifecycle management: Disconnect microphone stream and release AudioContext
   * on unmount or interview phase completion.
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true;
    this.stop();

    if (this.vadInstance) {
      try {
        await this.vadInstance.destroy();
      } catch {
        // Safe to ignore
      }
      this.vadInstance = null;
    }

    if (this.ownsAudioContext && this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          await this.audioContext.close();
        }
      } catch {
        // Safe to ignore
      }
      this.audioContext = null;
    }

    if (this.ownsStream && this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {
        // Safe to ignore
      }
      this.mediaStream = null;
    }

    this.callbacks = null;
    this.bufferedAudioSegments = [];
    this.activeSpeechFrames = [];
    this.activeSpeechSamples = 0;
  }
}
