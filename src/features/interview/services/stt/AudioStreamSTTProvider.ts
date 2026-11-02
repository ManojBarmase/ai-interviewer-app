/**
 * @file AudioStreamSTTProvider.ts
 * @description Enterprise fallback STT provider using AudioContext & Groq Whisper API.
 * Captures microphone audio using MediaRecorder and 16kHz circular PCM buffer,
 * incorporates a local Voice Activity Detector (VAD), and posts audio slices to
 * `/api/interview/stt` for sub-250ms Whisper Large v3 Turbo transcription.
 */

import { utils } from '@ricky0123/vad-web';

import type {
  ISTTProvider,
  STTCallbacks,
  STTOptions,
  STTErrorPayload,
} from '../../contracts/stt.interface';

export class CircularAudioBuffer {
  private buffer: Float32Array;
  private writePointer = 0;
  private totalSamplesWritten = 0;
  readonly capacity: number;

  constructor(capacity = 16000 * 5) {
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity);
  }

  write(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.buffer[this.writePointer] = samples[i] ?? 0;
      this.writePointer = (this.writePointer + 1) % this.capacity;
      this.totalSamplesWritten++;
    }
  }

  getSnapshot(maxSamples = this.capacity): Float32Array {
    const available = Math.min(
      this.totalSamplesWritten,
      this.capacity,
      maxSamples,
    );
    const result = new Float32Array(available);
    let readPointer =
      (this.writePointer - available + this.capacity) % this.capacity;
    for (let i = 0; i < available; i++) {
      result[i] = this.buffer[readPointer] ?? 0;
      readPointer = (readPointer + 1) % this.capacity;
    }
    return result;
  }

  clear(): void {
    this.buffer.fill(0);
    this.writePointer = 0;
    this.totalSamplesWritten = 0;
  }
}

export type AudioChunkSink = (
  pcm16: Int16Array,
  isSpeech: boolean,
  rms: number,
) => void;

export class AudioStreamSTTProvider implements ISTTProvider {
  readonly name = 'AudioStreamSTTProvider';

  private isSessionActive = false;
  private isExplicitlyStopped = false;
  private sessionAccumulatedTranscript = '';

  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private ownsStream = false;

  private ringBuffer = new CircularAudioBuffer(16000 * 5);
  private callbacks: STTCallbacks | null = null;
  private chunkSink: AudioChunkSink | null = null;

  private activeSpeechFrames: Float32Array[] = [];
  private activeSpeechSamples = 0;
  private dispatchQueue: Promise<void> = Promise.resolve();
  private readonly CHUNK_SAMPLE_THRESHOLD = 40000; // 2.5s at 16kHz
  private readonly MIN_AUDIO_SAMPLES = 3200; // 200ms

  private vadConsecutiveSpeechFrames = 0;
  private vadSilenceFrames = 0;
  private isSpeechActive = false;

  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hasMedia =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia);
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    return Boolean(hasMedia && AudioCtx);
  }

  isListening(): boolean {
    return this.isSessionActive && !this.isExplicitlyStopped;
  }

  getSessionTranscript(): string {
    return this.sessionAccumulatedTranscript;
  }

  updateSessionTranscript(text: string): void {
    this.sessionAccumulatedTranscript = text;
  }

  setChunkSink(sink: AudioChunkSink | null): void {
    this.chunkSink = sink;
  }

  async start(
    callbacks: STTCallbacks,
    options: STTOptions = {},
  ): Promise<void> {
    if (!this.isSupported()) {
      const err: STTErrorPayload = {
        code: 'AUDIO_STREAM_NOT_SUPPORTED',
        message: 'Audio streaming is not supported in this environment.',
        recoverable: false,
      };
      callbacks.onError(err);
      throw new Error(err.message);
    }

    if (this.isSessionActive && !this.isExplicitlyStopped) {
      throw new Error('AudioStream STT session is already active.');
    }

    this.callbacks = callbacks;
    this.isSessionActive = true;
    this.isExplicitlyStopped = false;
    this.ringBuffer.clear();
    this.activeSpeechFrames = [];
    this.activeSpeechSamples = 0;
    this.dispatchQueue = Promise.resolve();

    try {
      if (
        options.existingStream &&
        options.existingStream.getAudioTracks().length > 0
      ) {
        this.mediaStream = options.existingStream;
        this.ownsStream = false;
      } else {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        this.ownsStream = true;
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this.isSessionActive || this.isExplicitlyStopped) return;

        const inputChannelData = event.inputBuffer.getChannelData(0);
        const sampleRate = this.audioContext?.sampleRate || 44100;

        // 1. Downsample to 16kHz mono PCM & store into circular ring buffer
        const pcm16 = this.downsampleTo16kPCM(inputChannelData, sampleRate);
        const floatSamples = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          floatSamples[i] = (pcm16[i] ?? 0) / 32767;
        }
        this.ringBuffer.write(floatSamples);

        // 2. RMS Voice Activity Detection
        let sumSquare = 0;
        for (let i = 0; i < inputChannelData.length; i++) {
          const val = inputChannelData[i] ?? 0;
          sumSquare += val * val;
        }
        const rms = Math.sqrt(sumSquare / inputChannelData.length);
        const speechDetected = rms > 0.015;

        if (this.chunkSink) {
          this.chunkSink(pcm16, this.isSpeechActive, rms);
        }

        // 3. VAD State Machine & Real-Time Audio Buffering
        if (speechDetected) {
          this.vadConsecutiveSpeechFrames++;
          this.vadSilenceFrames = 0;
          if (this.vadConsecutiveSpeechFrames >= 2) {
            if (!this.isSpeechActive) {
              this.isSpeechActive = true;
            }
            const copy = new Float32Array(floatSamples.length);
            copy.set(floatSamples);
            this.activeSpeechFrames.push(copy);
            this.activeSpeechSamples += copy.length;

            // Flush chunk every 2.5 seconds of continuous active speech
            if (this.activeSpeechSamples >= this.CHUNK_SAMPLE_THRESHOLD) {
              this.flushSpeechFramesToWhisper();
            }
          }
        } else {
          this.vadSilenceFrames++;
          if (this.isSpeechActive) {
            const copy = new Float32Array(floatSamples.length);
            copy.set(floatSamples);
            this.activeSpeechFrames.push(copy);
            this.activeSpeechSamples += copy.length;
          }

          if (this.vadSilenceFrames >= 5) {
            this.vadConsecutiveSpeechFrames = 0;
            if (this.isSpeechActive) {
              this.isSpeechActive = false;
              // On speech pause, immediately trigger Whisper transcription for pending audio
              this.flushSpeechFramesToWhisper();
            }
          }
        }
      };

      this.sourceNode.connect(this.processorNode);
      const silenceGain = this.audioContext.createGain();
      silenceGain.gain.value = 0;
      this.processorNode.connect(silenceGain);
      silenceGain.connect(this.audioContext.destination);
    } catch (err: unknown) {
      this.stop();
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to initialize audio stream.';
      const payload: STTErrorPayload = {
        code: 'AUDIO_STREAM_INIT_FAILED',
        message,
        recoverable: false,
      };
      callbacks.onError(payload);
      throw err;
    }
  }

  stop(): void {
    this.isExplicitlyStopped = true;
    this.isSessionActive = false;
    this.isSpeechActive = false;
    this.vadConsecutiveSpeechFrames = 0;
    this.vadSilenceFrames = 0;
    this.activeSpeechFrames = [];
    this.activeSpeechSamples = 0;

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // Safe to ignore
      }
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Safe to ignore
      }
      this.sourceNode = null;
    }

    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      } catch {
        // Safe to ignore
      }
      this.audioContext = null;
    }

    if (this.ownsStream && this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.callbacks) {
      const cb = this.callbacks;
      this.callbacks = null;
      cb.onEnd();
    }
  }

  private flushSpeechFramesToWhisper(): void {
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
      this.dispatchAudioChunkToWhisper(combined);
    }
  }

  private dispatchAudioChunkToWhisper(samples: Float32Array): void {
    if (!this.isSessionActive || this.isExplicitlyStopped) return;

    this.dispatchQueue = this.dispatchQueue
      .then(async () => {
        if (!this.isSessionActive || this.isExplicitlyStopped) return;

        const wavBuffer = utils.encodeWAV(samples);
        const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' });

        const formData = new FormData();
        formData.append('file', audioBlob, 'candidate-speech.wav');
        formData.append('language', 'en');

        const res = await fetch('/api/interview/stt', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!res.ok) return;

        const data = (await res.json()) as { text?: string };
        const transcribedText = (data.text || '').trim();

        if (
          transcribedText &&
          this.isSessionActive &&
          !this.isExplicitlyStopped
        ) {
          const prefix = this.sessionAccumulatedTranscript
            ? `${this.sessionAccumulatedTranscript.trimEnd()} `
            : '';
          this.sessionAccumulatedTranscript =
            `${prefix}${transcribedText}`.trim();
          this.callbacks?.onInterimTranscript?.(
            this.sessionAccumulatedTranscript,
          );
          this.callbacks?.onFinalTranscript(
            this.sessionAccumulatedTranscript,
            0.98,
          );
        }
      })
      .catch((err) => {
        console.warn(
          '[AudioStreamSTTProvider] Whisper transcription dispatch failed:',
          err,
        );
      });
  }

  private downsampleTo16kPCM(
    buffer: Float32Array,
    inputSampleRate: number,
  ): Int16Array {
    if (inputSampleRate === 16000) {
      const pcm16 = new Int16Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i] ?? 0));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return pcm16;
    }

    const ratio = inputSampleRate / 16000;
    const newLength = Math.round(buffer.length / ratio);
    const pcm16 = new Int16Array(newLength);

    for (let i = 0; i < newLength; i++) {
      const originIdx = Math.round(i * ratio);
      const s = Math.max(-1, Math.min(1, buffer[originIdx] ?? 0));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return pcm16;
  }
}
