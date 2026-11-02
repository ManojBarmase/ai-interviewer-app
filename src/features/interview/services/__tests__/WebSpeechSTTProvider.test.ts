// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { WebSpeechSTTProvider } from '../stt/WebSpeechSTTProvider';

describe('WebSpeechSTTProvider Unit Tests', () => {
  const originalSpeechRecognition = (
    window as unknown as { SpeechRecognition?: unknown }
  ).SpeechRecognition;
  const originalWebkitSpeechRecognition = (
    window as unknown as { webkitSpeechRecognition?: unknown }
  ).webkitSpeechRecognition;

  class MockSpeechRecognition {
    lang = 'en-US';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: (event: any) => void = () => {};
    onerror: (event: any) => void = () => {};
    onend: () => void = () => {};
    onstart: () => void = () => {};

    start = vi.fn();
    stop = vi.fn(() => {
      this.onend();
    });
    abort = vi.fn(() => {
      this.onend();
    });
  }

  let provider: WebSpeechSTTProvider;

  beforeEach(() => {
    vi.useFakeTimers();
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      MockSpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition;
    provider = new WebSpeechSTTProvider();
  });

  afterEach(() => {
    provider.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      originalSpeechRecognition;
    (
      window as unknown as { webkitSpeechRecognition: unknown }
    ).webkitSpeechRecognition = originalWebkitSpeechRecognition;
  });

  describe('Capability Introspection', () => {
    it('returns true for isSupported() when SpeechRecognition is present', () => {
      expect(provider.isSupported()).toBe(true);
    });

    it('returns false for isSupported() when SpeechRecognition is absent', () => {
      delete (window as unknown as { SpeechRecognition?: unknown })
        .SpeechRecognition;
      delete (window as unknown as { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition;
      expect(provider.isSupported()).toBe(false);
    });
  });

  describe('Zero-Drop Interim Preservation', () => {
    it('flushes uncommitted interim text into session transcript upon disconnect (onend)', () => {
      let activeInstance: MockSpeechRecognition | null = null;
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
        class extends MockSpeechRecognition {
          constructor() {
            super();
            activeInstance = this;
          }
        };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      provider.start(callbacks, { continuous: true });
      expect(activeInstance).not.toBeNull();

      // Candidate starts speaking, resulting in an interim (unfinalized) token chunk
      activeInstance!.onresult({
        results: [
          Object.assign(
            [
              {
                transcript: 'I designed an event-driven architecture',
                confidence: 0.85,
              },
            ],
            {
              isFinal: false,
              length: 1,
              item: () => ({
                transcript: 'I designed an event-driven architecture',
                confidence: 0.85,
              }),
            },
          ),
        ],
      });

      expect(callbacks.onInterimTranscript).toHaveBeenCalledWith(
        'I designed an event-driven architecture',
      );
      // Final transcript has not been committed yet by the browser
      expect(callbacks.onFinalTranscript).not.toHaveBeenCalled();

      // Sudden disconnect / browser timeout fires onend
      activeInstance!.onend();

      // ZERO-DROP CHECK: The uncommitted interim text was flushed directly into the session!
      expect(callbacks.onFinalTranscript).toHaveBeenCalledWith(
        'I designed an event-driven architecture',
        expect.any(Number),
      );
      expect(provider.getSessionTranscript()).toBe(
        'I designed an event-driven architecture',
      );
    });
  });

  describe('Instant Reconnection Watchdog', () => {
    it('restarts recognition immediately on natural speech pause without terminating session', () => {
      let instanceCount = 0;
      let lastInstance: MockSpeechRecognition | null = null;

      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
        class extends MockSpeechRecognition {
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

      provider.start(callbacks, { continuous: true });
      expect(instanceCount).toBe(1);
      expect(provider.isListening()).toBe(true);

      // Simulate first phrase
      lastInstance!.onresult({
        results: [
          Object.assign(
            [{ transcript: 'First answer segment.', confidence: 0.95 }],
            {
              isFinal: true,
              length: 1,
              item: () => ({
                transcript: 'First answer segment.',
                confidence: 0.95,
              }),
            },
          ),
        ],
      });

      // Browser pauses and triggers onend
      lastInstance!.onend();

      // Session should remain active and NOT call onEnd
      expect(callbacks.onEnd).not.toHaveBeenCalled();
      expect(provider.isListening()).toBe(true);

      // Fast timer tick restarts engine immediately
      vi.advanceTimersByTime(60);
      expect(instanceCount).toBe(2);
      expect(provider.isListening()).toBe(true);
    });
  });

  describe('Mutex & State Guards', () => {
    it('gracefully handles "recognition has already started" DOMException without crashing', () => {
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
        class extends MockSpeechRecognition {
          override start = vi.fn(() => {
            const err = new DOMException(
              'Failed to execute "start" on "SpeechRecognition": recognition has already started.',
              'InvalidStateError',
            );
            throw err;
          });
        };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      // Starting should not throw and should keep session active
      expect(() => provider.start(callbacks)).not.toThrow();
      expect(provider.isListening()).toBe(true);
      expect(callbacks.onError).not.toHaveBeenCalled();
    });

    it('re-throws unexpected synchronous start errors', () => {
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
        class extends MockSpeechRecognition {
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

      expect(() => provider.start(callbacks)).toThrow('NotAllowedError');
      expect(provider.isListening()).toBe(false);
    });
  });

  describe('Manual Edit Sync (updateSessionTranscript)', () => {
    it('synchronises manual edits and appends subsequent speech seamlessly', () => {
      let activeInstance: MockSpeechRecognition | null = null;
      (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
        class extends MockSpeechRecognition {
          constructor() {
            super();
            activeInstance = this;
          }
        };

      const callbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      provider.start(callbacks, { continuous: true });

      // Spoken part 1
      activeInstance!.onresult({
        results: [
          Object.assign([{ transcript: 'I know React.', confidence: 0.9 }], {
            isFinal: true,
            length: 1,
            item: () => ({ transcript: 'I know React.', confidence: 0.9 }),
          }),
        ],
      });

      expect(callbacks.onFinalTranscript).toHaveBeenLastCalledWith(
        'I know React.',
        0.9,
      );

      // Candidate manually types to improve the sentence
      provider.updateSessionTranscript(
        'I have senior-level mastery of React, Next.js, and TypeScript.',
      );
      expect(provider.getSessionTranscript()).toBe(
        'I have senior-level mastery of React, Next.js, and TypeScript.',
      );

      // Browser pauses and restarts
      activeInstance!.onend();
      vi.advanceTimersByTime(60);

      // Candidate continues speaking
      activeInstance!.onresult({
        results: [
          Object.assign(
            [
              {
                transcript: 'along with distributed backend systems.',
                confidence: 0.93,
              },
            ],
            {
              isFinal: true,
              length: 1,
              item: () => ({
                transcript: 'along with distributed backend systems.',
                confidence: 0.93,
              }),
            },
          ),
        ],
      });

      // Appends cleanly after manual edits without overwriting
      expect(callbacks.onFinalTranscript).toHaveBeenLastCalledWith(
        'I have senior-level mastery of React, Next.js, and TypeScript. along with distributed backend systems.',
        0.93,
      );
    });
  });
});
