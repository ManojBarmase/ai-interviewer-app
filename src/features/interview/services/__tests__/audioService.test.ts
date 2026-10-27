// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  AudioServiceError,
  getAudioCapabilities,
  startRecording,
  stopRecording,
  isRecording,
  speakText,
  stopSpeaking,
  isSpeaking,
  getAvailableVoices,
  updateSessionTranscript,
  getSessionTranscript,
} from '../audioService';

describe('AudioService Unit Tests', () => {
  // Save originals to restore after each test
  const originalSpeechSynthesis = window.speechSynthesis;
  const originalSpeechRecognition = (window as any).SpeechRecognition;
  const originalWebkitSpeechRecognition = (window as any)
    .webkitSpeechRecognition;

  class MockSpeechRecognition {
    lang = 'en-US';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: any = null;
    onerror: any = null;
    onend: any = null;
    onstart: any = null;

    start = vi.fn();
    stop = vi.fn(() => {
      if (this.onend) this.onend();
    });
    abort = vi.fn(() => {
      if (this.onend) this.onend();
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    // Reset module-level state by ensuring no lingering sessions
    stopRecording();
    stopSpeaking();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    // Restore window properties
    Object.defineProperty(window, 'speechSynthesis', {
      value: originalSpeechSynthesis,
      writable: true,
      configurable: true,
    });
    (window as any).SpeechRecognition = originalSpeechRecognition;
    (window as any).webkitSpeechRecognition = originalWebkitSpeechRecognition;
  });

  describe('AudioServiceError', () => {
    it('creates an instance with code and message', () => {
      const err = new AudioServiceError('NOT_ALLOWED', 'Permission denied');
      expect(err.name).toBe('AudioServiceError');
      expect(err.code).toBe('NOT_ALLOWED');
      expect(err.message).toBe('Permission denied');
      expect(err instanceof Error).toBe(true);
    });
  });

  describe('getAudioCapabilities', () => {
    it('detects browser capabilities accurately when APIs exist', () => {
      Object.defineProperty(window, 'speechSynthesis', {
        value: {},
        writable: true,
        configurable: true,
      });
      (window as any).SpeechRecognition = class MockRecognition {};

      const caps = getAudioCapabilities();
      expect(caps.isBrowser).toBe(true);
      expect(caps.speechRecognitionSupported).toBe(true);
      expect(caps.speechSynthesisSupported).toBe(true);
    });

    it('handles webkit prefix for SpeechRecognition', () => {
      delete (window as any).SpeechRecognition;
      (window as any).webkitSpeechRecognition = class MockWebkitRecognition {};

      const caps = getAudioCapabilities();
      expect(caps.speechRecognitionSupported).toBe(true);
    });

    it('reports false when speech APIs are missing in window', () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;
      delete (window as any).speechSynthesis;

      const caps = getAudioCapabilities();
      expect(caps.speechRecognitionSupported).toBe(false);
      expect(caps.speechSynthesisSupported).toBe(false);
    });
  });

  describe('Speech Recognition (STT)', () => {
    beforeEach(() => {
      (window as any).SpeechRecognition = MockSpeechRecognition;
      delete (window as any).webkitSpeechRecognition;
    });

    it('throws RECOGNITION_NOT_SUPPORTED if browser lacks the API', () => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;

      expect(() => {
        startRecording({
          onInterimTranscript: vi.fn(),
          onFinalTranscript: vi.fn(),
          onError: vi.fn(),
          onEnd: vi.fn(),
        });
      }).toThrowError(/SpeechRecognition is not supported/);
    });

    it('successfully starts recording and exposes isRecording flag', () => {
      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      const cleanup = startRecording(callbacks, {
        language: 'en-US',
        continuous: false,
      });
      expect(isRecording()).toBe(true);

      cleanup();
      expect(isRecording()).toBe(false);
    });

    it('throws RECOGNITION_ALREADY_ACTIVE if startRecording is called while active', () => {
      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      const cleanup = startRecording(callbacks);
      expect(() => startRecording(callbacks)).toThrow(AudioServiceError);

      cleanup();
    });

    it('processes speech recognition results for interim and final transcripts', () => {
      let instance: MockSpeechRecognition | null = null;
      (window as any).SpeechRecognition = class extends MockSpeechRecognition {
        constructor() {
          super();
          instance = this;
        }
      };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      startRecording(callbacks);
      expect(instance).not.toBeNull();

      // Simulate recognition result event
      const mockEvent = {
        results: [
          Object.assign([{ transcript: 'Hello world', confidence: 0.95 }], {
            isFinal: true,
            length: 1,
            item: () => ({ transcript: 'Hello world', confidence: 0.95 }),
          }),
        ],
      };

      instance!.onresult(mockEvent);

      expect(callbacks.onInterimTranscript).toHaveBeenCalledWith('Hello world');
      expect(callbacks.onFinalTranscript).toHaveBeenCalledWith(
        'Hello world',
        0.95,
      );

      stopRecording();
      expect(isRecording()).toBe(false);
    });

    it('maps recognition errors correctly and triggers onError callback', () => {
      let instance: MockSpeechRecognition | null = null;
      (window as any).SpeechRecognition = class extends MockSpeechRecognition {
        constructor() {
          super();
          instance = this;
        }
      };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      startRecording(callbacks);

      // Simulate permission denied error
      instance!.onerror({ error: 'not-allowed', message: 'Mic blocked' });

      expect(callbacks.onError).toHaveBeenCalled();
      const err = callbacks.onError.mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(AudioServiceError);
      expect(err?.code).toBe('NOT_ALLOWED');

      // Trigger onend to cleanly close
      instance!.onend();
      expect(callbacks.onEnd).toHaveBeenCalled();
    });

    it('stops recording gracefully when stopRecording is called', () => {
      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      startRecording(callbacks);
      expect(isRecording()).toBe(true);

      stopRecording();
      expect(isRecording()).toBe(false);

      // Safe to call again when already stopped
      expect(() => stopRecording()).not.toThrow();
    });

    it('auto-restarts recognition on speech pause (onend) without ending session when continuous', () => {
      let instanceCount = 0;
      let lastInstance: MockSpeechRecognition | null = null;

      (window as any).SpeechRecognition = class extends MockSpeechRecognition {
        constructor() {
          super();
          instanceCount++;
          lastInstance = this;
        }
      };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      startRecording(callbacks, { continuous: true });
      expect(instanceCount).toBe(1);
      expect(isRecording()).toBe(true);

      // Simulate first speech segment
      lastInstance!.onresult({
        results: [
          Object.assign([{ transcript: 'First sentence.', confidence: 0.9 }], {
            isFinal: true,
            length: 1,
            item: () => ({ transcript: 'First sentence.', confidence: 0.9 }),
          }),
        ],
      });

      // Browser pauses and triggers onend (simulating natural speech pause)
      lastInstance!.onend();

      // Ensure onEnd callback is NOT fired (no auto-submit on speech pause)
      expect(callbacks.onEnd).not.toHaveBeenCalled();
      expect(isRecording()).toBe(true);

      // Advance timers to trigger auto-restart
      vi.advanceTimersByTime(60);
      expect(instanceCount).toBe(2);
      expect(isRecording()).toBe(true);

      // Cleanly stop session
      stopRecording();
      expect(isRecording()).toBe(false);
      expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    });

    it('seamlessly appends new speech after pause without losing earlier transcript', () => {
      let currentInstance: MockSpeechRecognition | null = null;

      (window as any).SpeechRecognition = class extends MockSpeechRecognition {
        constructor() {
          super();
          currentInstance = this;
        }
      };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      startRecording(callbacks, { continuous: true });

      // First segment
      currentInstance!.onresult({
        results: [
          Object.assign(
            [{ transcript: 'I am a frontend architect.', confidence: 0.95 }],
            {
              isFinal: true,
              length: 1,
              item: () => ({
                transcript: 'I am a frontend architect.',
                confidence: 0.95,
              }),
            },
          ),
        ],
      });

      expect(callbacks.onFinalTranscript).toHaveBeenLastCalledWith(
        'I am a frontend architect.',
        0.95,
      );

      // Candidate pauses 2 seconds -> browser fires onend
      currentInstance!.onend();
      vi.advanceTimersByTime(60);

      // Second segment speaks after pause
      currentInstance!.onresult({
        results: [
          Object.assign(
            [{ transcript: 'With 10 years experience.', confidence: 0.9 }],
            {
              isFinal: true,
              length: 1,
              item: () => ({
                transcript: 'With 10 years experience.',
                confidence: 0.9,
              }),
            },
          ),
        ],
      });

      // Verifies that the earlier text was NOT wiped out and was cleanly appended
      expect(callbacks.onFinalTranscript).toHaveBeenLastCalledWith(
        'I am a frontend architect. With 10 years experience.',
        0.9,
      );

      stopRecording();
    });

    it('preserves manual edits via updateSessionTranscript and appends subsequent speech', () => {
      let currentInstance: MockSpeechRecognition | null = null;

      (window as any).SpeechRecognition = class extends MockSpeechRecognition {
        constructor() {
          super();
          currentInstance = this;
        }
      };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      startRecording(callbacks, { continuous: true });

      // Candidate speaks initially
      currentInstance!.onresult({
        results: [
          Object.assign(
            [{ transcript: 'I build web apps.', confidence: 0.9 }],
            {
              isFinal: true,
              length: 1,
              item: () => ({
                transcript: 'I build web apps.',
                confidence: 0.9,
              }),
            },
          ),
        ],
      });

      expect(callbacks.onFinalTranscript).toHaveBeenLastCalledWith(
        'I build web apps.',
        0.9,
      );

      // Candidate edits the textarea manually
      updateSessionTranscript(
        'I build high-scale web apps using React and Next.js.',
      );
      expect(getSessionTranscript()).toBe(
        'I build high-scale web apps using React and Next.js.',
      );

      // Candidate pauses and continues speaking
      currentInstance!.onend();
      vi.advanceTimersByTime(60);

      currentInstance!.onresult({
        results: [
          Object.assign([{ transcript: 'and TypeScript.', confidence: 0.92 }], {
            isFinal: true,
            length: 1,
            item: () => ({
              transcript: 'and TypeScript.',
              confidence: 0.92,
            }),
          }),
        ],
      });

      // Subsequent speech cleanly appends after the manual edit
      expect(callbacks.onFinalTranscript).toHaveBeenLastCalledWith(
        'I build high-scale web apps using React and Next.js. and TypeScript.',
        0.92,
      );

      stopRecording();
    });
  });

  describe('Speech Synthesis (TTS)', () => {
    let mockVoices: any[] = [];
    let mockSynth: any;

    beforeEach(() => {
      mockVoices = [
        {
          name: 'Google UK English Female',
          lang: 'en-GB',
          default: true,
          localService: true,
        },
        {
          name: 'Google US English',
          lang: 'en-US',
          default: false,
          localService: false,
        },
      ];

      mockSynth = {
        speaking: false,
        pending: false,
        speak: vi.fn((utterance: any) => {
          mockSynth.speaking = true;
          // Simulate async completion
          setTimeout(() => {
            mockSynth.speaking = false;
            if (utterance.onend) utterance.onend();
          }, 50);
        }),
        cancel: vi.fn(() => {
          mockSynth.speaking = false;
          mockSynth.pending = false;
        }),
        getVoices: vi.fn(() => mockVoices),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      Object.defineProperty(window, 'speechSynthesis', {
        value: mockSynth,
        writable: true,
        configurable: true,
      });

      // Mock SpeechSynthesisUtterance constructor
      (window as any).SpeechSynthesisUtterance = class {
        text: string;
        lang = 'en-US';
        rate = 1;
        pitch = 1;
        volume = 1;
        voice: any = null;
        onstart: any = null;
        onend: any = null;
        onerror: any = null;
        onboundary: any = null;

        constructor(text: string) {
          this.text = text;
        }
      };
    });

    it('rejects with SYNTHESIS_NOT_SUPPORTED when speechSynthesis is absent', async () => {
      delete (window as any).speechSynthesis;

      await expect(speakText('Hello')).rejects.toThrow(AudioServiceError);
    });

    it('speaks text and resolves when utterance finishes naturally', async () => {
      const onStart = vi.fn();
      const speakPromise = speakText('Welcome to the technical interview.', {
        language: 'en-US',
        rate: 1.1,
        onStart,
      });

      expect(mockSynth.speak).toHaveBeenCalled();
      vi.advanceTimersByTime(60);

      await expect(speakPromise).resolves.toBeUndefined();
    });

    it('cancels currently playing audio when new speakText is invoked', async () => {
      mockSynth.speaking = true;
      const promise1 = speakText('First question');

      // Starting second speak should cancel first
      const promise2 = speakText('Second question');

      await expect(promise1).rejects.toMatchObject({
        code: 'SYNTHESIS_CANCELLED',
      });

      vi.advanceTimersByTime(60);
      await expect(promise2).resolves.toBeUndefined();
    });

    it('allows explicit stopSpeaking to cancel active audio', async () => {
      mockSynth.speaking = true;
      const promise = speakText('Long speech in progress');

      stopSpeaking();

      await expect(promise).rejects.toMatchObject({
        code: 'SYNTHESIS_CANCELLED',
      });
    });

    it('reports available voices using getAvailableVoices', () => {
      const voices = getAvailableVoices();
      expect(voices).toHaveLength(2);
      expect(voices[0]).toEqual({
        name: 'Google UK English Female',
        language: 'en-GB',
        isDefault: true,
        isLocalService: true,
      });
    });

    it('returns speaking status with isSpeaking()', () => {
      mockSynth.speaking = false;
      expect(isSpeaking()).toBe(false);

      mockSynth.speaking = true;
      expect(isSpeaking()).toBe(true);
    });

    it('fires stop when silence timeout expires', () => {
      let instance: MockSpeechRecognition | null = null;
      (window as any).SpeechRecognition = class extends MockSpeechRecognition {
        constructor() {
          super();
          instance = this;
        }
      };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      startRecording(callbacks, { silenceTimeoutMs: 2000 });
      expect(instance).not.toBeNull();

      vi.advanceTimersByTime(2100);
      expect(instance!.stop).toHaveBeenCalled();
      stopRecording();
    });

    it('handles synchronous start exceptions', () => {
      (window as any).SpeechRecognition = class extends MockSpeechRecognition {
        override start = vi.fn(() => {
          throw new Error('NotAllowedError');
        });
      };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      expect(() => startRecording(callbacks)).toThrow(AudioServiceError);
    });

    it('maps network, no-speech and audio-capture error codes', () => {
      let instance: MockSpeechRecognition | null = null;
      (window as any).SpeechRecognition = class extends MockSpeechRecognition {
        constructor() {
          super();
          instance = this;
        }
      };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      startRecording(callbacks);

      instance!.onerror({ error: 'network', message: 'Network disconnected' });
      expect(callbacks.onError).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 'RECOGNITION_NETWORK_ERROR' }),
      );

      instance!.onerror({
        error: 'audio-capture',
        message: 'Hardware failure',
      });
      expect(callbacks.onError).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 'AUDIO_CAPTURE_FAILED' }),
      );

      instance!.onerror({ error: 'no-speech', message: 'Silence' });
      expect(callbacks.onError).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 'NO_SPEECH_DETECTED' }),
      );

      stopRecording();
    });

    it('handles synthesis errors and boundary callbacks in speakText', async () => {
      let lastUtterance: any = null;
      mockSynth.speak = vi.fn((utterance: any) => {
        lastUtterance = utterance;
        setTimeout(() => {
          if (utterance.onerror) {
            utterance.onerror({ error: 'audio-busy' });
          }
        }, 50);
      });

      const onBoundary = vi.fn();
      const speakPromise = speakText('Testing boundary events', {
        rate: 1.2,
        pitch: 1.1,
        volume: 0.9,
        voiceName: 'Google UK English Female',
        onBoundary,
      });

      // Trigger boundary manually on the utterance
      lastUtterance.onboundary({
        name: 'word',
        charIndex: 0,
        charLength: 7,
      });
      expect(onBoundary).toHaveBeenCalledWith(0, 'Testing');

      vi.advanceTimersByTime(60);

      await expect(speakPromise).rejects.toMatchObject({
        code: 'SYNTHESIS_UNKNOWN',
      });
    });

    it('handles cancelled error in utterance.onerror', async () => {
      mockSynth.speak = vi.fn((utterance: any) => {
        setTimeout(() => {
          if (utterance.onerror) {
            utterance.onerror({ error: 'canceled' });
          }
        }, 50);
      });

      const speakPromise = speakText('Cancel test');
      vi.advanceTimersByTime(60);

      await expect(speakPromise).rejects.toMatchObject({
        code: 'SYNTHESIS_CANCELLED',
      });
    });
  });
});
