// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { stopSpeaking } from '../audioService';
import { SileroVADProvider } from '../stt/SileroVADProvider';

import type { MicVAD } from '@ricky0123/vad-web';

// Mock audioService stopSpeaking
vi.mock('../audioService', () => ({
  stopSpeaking: vi.fn(),
  speakText: vi.fn(),
}));

// Mock @ricky0123/vad-web
let capturedVADOptions: any = null;
const mockMicVADInstance = {
  start: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn().mockResolvedValue(undefined),
  listening: true,
};

vi.mock('@ricky0123/vad-web', () => {
  return {
    MicVAD: {
      new: vi.fn().mockImplementation((options: any) => {
        capturedVADOptions = options;
        return Promise.resolve(mockMicVADInstance as unknown as MicVAD);
      }),
    },
    utils: {
      encodeWAV: vi.fn().mockReturnValue(new ArrayBuffer(1024)),
    },
  };
});

describe('SileroVADProvider Unit Tests', () => {
  let provider: SileroVADProvider;
  let mockAudioContext: any;
  let mockMediaStream: any;
  let mockTrack: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    capturedVADOptions = null;
    vi.clearAllMocks();

    const { MicVAD } = await import('@ricky0123/vad-web');
    vi.mocked(MicVAD.new).mockImplementation((options: any) => {
      capturedVADOptions = options;
      return Promise.resolve(mockMicVADInstance as unknown as MicVAD);
    });

    mockTrack = {
      stop: vi.fn(),
      enabled: true,
    };

    mockMediaStream = {
      getAudioTracks: vi.fn().mockReturnValue([mockTrack]),
      getTracks: vi.fn().mockReturnValue([mockTrack]),
    };

    // Setup global navigator and AudioContext in jsdom
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
      },
      writable: true,
      configurable: true,
    });

    mockAudioContext = {
      state: 'running',
      close: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    class MockAudioContextClass {
      state = 'running';
      close = mockAudioContext.close;
      resume = mockAudioContext.resume;
    }

    (window as any).AudioContext = MockAudioContextClass;

    provider = new SileroVADProvider();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await provider.destroy();
  });

  describe('Configuration & Default Thresholds', () => {
    it('initializes with enterprise Silero VAD defaults', () => {
      expect(provider.positiveSpeechThreshold).toBe(0.8);
      expect(provider.negativeSpeechThreshold).toBe(0.35);
      expect(provider.redemptionFrames).toBe(8);
      expect(provider.silenceThresholdMs).toBe(2500);
      expect(provider.name).toBe('SileroVADProvider');
    });

    it('reports isSupported as true in a browser environment with WebAudio and getUserMedia', () => {
      expect(provider.isSupported()).toBe(true);
    });

    it('reports isListening as false before session start', () => {
      expect(provider.isListening()).toBe(false);
      expect(provider.isCandidateSpeaking()).toBe(false);
    });
  });

  describe('Start & Initialization', () => {
    it('initializes MicVAD with positiveSpeechThreshold 0.8, negativeSpeechThreshold 0.35, and redemptionFrames 8', async () => {
      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      await provider.start(callbacks);

      expect(provider.isListening()).toBe(true);
      expect(capturedVADOptions).toBeDefined();
      expect(capturedVADOptions.positiveSpeechThreshold).toBe(0.8);
      expect(capturedVADOptions.negativeSpeechThreshold).toBe(0.35);
      expect(capturedVADOptions.redemptionFrames).toBe(8);
      expect(capturedVADOptions.redemptionMs).toBe(2500);
    });

    it('reuses existing MediaStream without invoking getUserMedia', async () => {
      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      const existingStreamTrack = { stop: vi.fn() };
      const existingStream = {
        getAudioTracks: vi.fn().mockReturnValue([existingStreamTrack]),
        getTracks: vi.fn().mockReturnValue([existingStreamTrack]),
      } as any;

      await provider.start(callbacks, { existingStream });

      // Trigger the stream fetcher inside captured options
      const stream = await capturedVADOptions.getStream();
      expect(stream).toBe(existingStream);
      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it('handles VAD initialization failure and dispatches onError', async () => {
      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      const { MicVAD } = await import('@ricky0123/vad-web');
      vi.mocked(MicVAD.new).mockRejectedValueOnce(
        new Error('WASM binary load failed'),
      );

      await expect(provider.start(callbacks)).rejects.toThrow(
        'WASM binary load failed',
      );
      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'VAD_INIT_FAILED',
        }),
      );
    });

    it('handles AudioWorkletNode InvalidStateError gracefully without fatal unhandled rethrow', async () => {
      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      const { MicVAD } = await import('@ricky0123/vad-web');
      const invalidStateError = new Error(
        'Failed to construct AudioWorkletNode: AudioWorkletNode cannot be created: No execution context available.',
      );
      invalidStateError.name = 'InvalidStateError';
      vi.mocked(MicVAD.new).mockRejectedValueOnce(invalidStateError);

      // Enterprise fault tolerance: does NOT reject / crash application
      await expect(provider.start(callbacks)).resolves.not.toThrow();

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'VAD_INIT_FAILED',
          recoverable: true,
        }),
      );
    });

    it('suppresses errors cleanly if destroyed while initialization was in flight', async () => {
      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      await provider.destroy();

      // Calling start on a destroyed provider is a no-op
      await expect(provider.start(callbacks)).resolves.not.toThrow();
      expect(callbacks.onError).not.toHaveBeenCalled();
    });
  });

  describe('Barge-In (Interruption Handling)', () => {
    it('triggers barge-in immediately on onSpeechStart: cancels TTS and notifies room', async () => {
      const onSpeechStart = vi.fn();
      const onBargeIn = vi.fn();

      await provider.start({
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
        onSpeechStart,
        onBargeIn,
      });

      // Simulate Silero VAD neural detection of candidate speech onset
      capturedVADOptions.onSpeechStart();

      // Must immediately cancel active TTS with reason INTERRUPTED_BY_USER
      expect(stopSpeaking).toHaveBeenCalledWith('INTERRUPTED_BY_USER');
      expect(onBargeIn).toHaveBeenCalledTimes(1);
      expect(onSpeechStart).toHaveBeenCalledTimes(1);
      expect(provider.isCandidateSpeaking()).toBe(true);
    });
  });

  describe('Automatic Turn Detection (>2500ms Silence)', () => {
    it('triggers automatic submission after candidate stops talking for >2500ms', async () => {
      const onAutoSubmit = vi.fn();
      const onSpeechEnd = vi.fn();

      await provider.start({
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
        onSpeechEnd,
        onAutoSubmit,
      });

      // Candidate types / speaks interim text
      provider.updateSessionTranscript(
        'I architected micro-frontends with module federation.',
      );

      // Candidate starts speaking
      capturedVADOptions.onSpeechStart();
      expect(provider.isCandidateSpeaking()).toBe(true);

      // Candidate finishes speaking a chunk
      const audioFrame = new Float32Array(16000); // 1 second of audio
      capturedVADOptions.onSpeechEnd(audioFrame);

      expect(onSpeechEnd).toHaveBeenCalledWith(audioFrame);
      expect(provider.isCandidateSpeaking()).toBe(false);

      // Advance by 1200ms (not yet 2500ms)
      vi.advanceTimersByTime(1200);
      expect(onAutoSubmit).not.toHaveBeenCalled();

      // Advance remaining 1350ms to cross 2500ms threshold
      vi.advanceTimersByTime(1350);

      // Auto submission must be triggered without any button click
      expect(onAutoSubmit).toHaveBeenCalledWith(
        'I architected micro-frontends with module federation.',
      );
    });

    it('resets turnaround timer if candidate resumes speaking before 2500ms silence elapses', async () => {
      const onAutoSubmit = vi.fn();

      await provider.start({
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
        onAutoSubmit,
      });

      provider.updateSessionTranscript('Partial sentence...');

      // First speech burst
      capturedVADOptions.onSpeechStart();
      capturedVADOptions.onSpeechEnd(new Float32Array(8000));

      // Wait 1500ms (pause for thought)
      vi.advanceTimersByTime(1500);
      expect(onAutoSubmit).not.toHaveBeenCalled();

      // Candidate resumes speaking before 2500ms timeout!
      capturedVADOptions.onSpeechStart();
      expect(provider.isCandidateSpeaking()).toBe(true);

      // 1500ms later (total 3000ms since first end, but candidate is currently speaking!)
      vi.advanceTimersByTime(1500);
      expect(onAutoSubmit).not.toHaveBeenCalled();

      // Candidate now concludes full thought
      provider.updateSessionTranscript(
        'Partial sentence completed with full explanation.',
      );
      capturedVADOptions.onSpeechEnd(new Float32Array(8000));

      // Wait 2550ms of sustained silence
      vi.advanceTimersByTime(2550);

      expect(onAutoSubmit).toHaveBeenCalledWith(
        'Partial sentence completed with full explanation.',
      );
    });

    it('resets turnaround timer when resetSilenceTimer is called (typing activity)', async () => {
      const onAutoSubmit = vi.fn();

      await provider.start({
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
        onAutoSubmit,
      });

      provider.updateSessionTranscript('Drafting response...');
      capturedVADOptions.onSpeechStart();
      capturedVADOptions.onSpeechEnd(new Float32Array(8000));

      // 2000ms elapsed without speaking (getting close to 2500ms)
      vi.advanceTimersByTime(2000);
      expect(onAutoSubmit).not.toHaveBeenCalled();

      // Candidate types! resetSilenceTimer called
      provider.resetSilenceTimer();

      // Advance by another 1000ms (total 3000ms from speech end, but reset happened at 2000ms)
      vi.advanceTimersByTime(1000);
      expect(onAutoSubmit).not.toHaveBeenCalled();

      // Now wait remaining 1550ms for the reset timer to expire
      vi.advanceTimersByTime(1550);
      expect(onAutoSubmit).toHaveBeenCalledWith('Drafting response...');
    });

    it('handles VAD misfire by resetting active speech state', async () => {
      const onVADMisfire = vi.fn();

      await provider.start({
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
        onVADMisfire,
      });

      capturedVADOptions.onSpeechStart();
      expect(provider.isCandidateSpeaking()).toBe(true);

      capturedVADOptions.onVADMisfire();
      expect(provider.isCandidateSpeaking()).toBe(false);
      expect(onVADMisfire).toHaveBeenCalledTimes(1);
    });
  });

  describe('Audio Buffering & Server Whisper Integration', () => {
    it('transcribes buffered audio with /api/interview/stt on turn completion when transcribeWithWhisper is enabled', async () => {
      const onAutoSubmit = vi.fn();
      const onFinalTranscript = vi.fn();

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'Transcribed by Groq Whisper Turbo' }),
      });
      global.fetch = mockFetch;

      await provider.start(
        {
          onInterimTranscript: vi.fn(),
          onFinalTranscript,
          onError: vi.fn(),
          onEnd: vi.fn(),
          onAutoSubmit,
        },
        { transcribeWithWhisper: true },
      );

      // Feed candidate speech (16000 samples = 1s)
      capturedVADOptions.onSpeechStart();
      capturedVADOptions.onSpeechEnd(new Float32Array(16000));

      // Wait 2550ms
      await vi.advanceTimersByTimeAsync(2550);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/interview/stt',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(onFinalTranscript).toHaveBeenCalledWith(
        'Transcribed by Groq Whisper Turbo',
        0.99,
      );
      expect(onAutoSubmit).toHaveBeenCalledWith(
        'Transcribed by Groq Whisper Turbo',
      );
    });

    it('dispatches audio to /api/interview/stt every 2.5s (40,000 samples) of continuous active speech', async () => {
      const onFinalTranscript = vi.fn();
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({ text: `Chunk ${callCount}` }),
        };
      });
      global.fetch = mockFetch;

      await provider.start(
        {
          onInterimTranscript: vi.fn(),
          onFinalTranscript,
          onError: vi.fn(),
          onEnd: vi.fn(),
        },
        { transcribeWithWhisper: true },
      );

      capturedVADOptions.onSpeechStart();

      // Feed frames totaling 40,000 samples (2.5 seconds at 16kHz)
      // E.g. 80 frames of 512 samples = 40,960 samples
      for (let i = 0; i < 80; i++) {
        capturedVADOptions.onFrameProcessed(null, new Float32Array(512));
      }

      // Flush promise queue
      await vi.advanceTimersByTimeAsync(10);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/interview/stt',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(onFinalTranscript).toHaveBeenCalledWith('Chunk 1', 0.99);
    });

    it('strictly discards in-flight Whisper HTTP responses after abortTurn() is called', async () => {
      const onFinalTranscript = vi.fn();
      const onInterimTranscript = vi.fn();

      let resolveFetch: ((value: any) => void) | null = null;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      const mockFetch = vi.fn().mockReturnValue(fetchPromise);
      global.fetch = mockFetch;

      await provider.start(
        {
          onInterimTranscript,
          onFinalTranscript,
          onError: vi.fn(),
          onEnd: vi.fn(),
        },
        { transcribeWithWhisper: true },
      );

      // Start candidate speech and send 40,000 samples to trigger dispatch
      capturedVADOptions.onSpeechStart();
      for (let i = 0; i < 80; i++) {
        capturedVADOptions.onFrameProcessed(null, new Float32Array(512));
      }

      // Allow fetch to be initiated
      await vi.advanceTimersByTimeAsync(10);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Turn is submitted or skipped: candidate triggers abortTurn()
      provider.abortTurn();

      // In-flight fetch resolves *after* turn abort
      resolveFetch!({
        ok: true,
        json: async () => ({ text: 'Late response from previous question' }),
      });

      // Flush promises
      await vi.advanceTimersByTimeAsync(50);

      // The late text from Question 1 MUST be strictly discarded
      expect(onFinalTranscript).not.toHaveBeenCalled();
      expect(onInterimTranscript).not.toHaveBeenCalled();
      expect(provider.getSessionTranscript()).toBe('');
    });

    it('clears active speech frames, accumulated transcripts, and silence timers on abortTurn()', async () => {
      await provider.start(
        {
          onInterimTranscript: vi.fn(),
          onFinalTranscript: vi.fn(),
          onError: vi.fn(),
          onEnd: vi.fn(),
        },
        { transcribeWithWhisper: true },
      );

      provider.updateSessionTranscript('Partial answer for turn 1');
      capturedVADOptions.onSpeechStart();
      expect(provider.isCandidateSpeaking()).toBe(true);

      provider.abortTurn();

      expect(provider.getSessionTranscript()).toBe('');
      expect(provider.isCandidateSpeaking()).toBe(false);
      expect(provider.isSpeechBuffering()).toBe(false);
    });
  });

  describe('Lifecycle & Resource Management', () => {
    it('disconnects microphone stream and closes AudioContext on destroy', async () => {
      await provider.start({
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      });

      // Obtain stream via options to register owned stream
      await capturedVADOptions.getStream();

      await provider.destroy();

      expect(mockMicVADInstance.destroy).toHaveBeenCalledTimes(1);
      expect(mockTrack.stop).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.close).toHaveBeenCalledTimes(1);
      expect(provider.isListening()).toBe(false);
    });

    it('does not close externally passed AudioContext or shared MediaStream', async () => {
      const externalAudioContext = {
        state: 'running',
        close: vi.fn(),
      } as any;

      const sharedTrack = { stop: vi.fn() };
      const sharedStream = {
        getAudioTracks: vi.fn().mockReturnValue([sharedTrack]),
        getTracks: vi.fn().mockReturnValue([sharedTrack]),
      } as any;

      await provider.start(
        {
          onInterimTranscript: vi.fn(),
          onFinalTranscript: vi.fn(),
          onError: vi.fn(),
          onEnd: vi.fn(),
        },
        {
          audioContext: externalAudioContext,
          existingStream: sharedStream,
        },
      );

      await provider.destroy();

      expect(externalAudioContext.close).not.toHaveBeenCalled();
      expect(sharedTrack.stop).not.toHaveBeenCalled();
    });

    it('allows stop() to pause session and emit onEnd', async () => {
      const onEnd = vi.fn();
      await provider.start({
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd,
      });

      provider.stop();

      expect(mockMicVADInstance.pause).toHaveBeenCalledTimes(1);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(provider.isListening()).toBe(false);
    });
  });
});
