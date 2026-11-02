// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  type ISTTProvider,
  type STTCallbacks,
  type STTOptions,
} from '../../contracts/stt.interface';
import { HybridSTTOrchestrator } from '../stt/HybridSTTOrchestrator';

class MockSTTProvider implements ISTTProvider {
  name: string;
  supported: boolean;
  listening = false;
  transcript = '';
  callbacks: STTCallbacks | null = null;
  options: STTOptions | null = null;

  startMock = vi.fn();
  stopMock = vi.fn();

  constructor(name: string, supported = true) {
    this.name = name;
    this.supported = supported;
  }

  isSupported(): boolean {
    return this.supported;
  }

  isListening(): boolean {
    return this.listening;
  }

  getSessionTranscript(): string {
    return this.transcript;
  }

  updateSessionTranscript(text: string): void {
    this.transcript = text;
  }

  start(callbacks: STTCallbacks, options?: STTOptions): void {
    this.listening = true;
    this.callbacks = callbacks;
    this.options = options ?? null;
    this.startMock(callbacks, options);
  }

  stop(): void {
    this.listening = false;
    this.stopMock();
    if (this.callbacks) {
      const cb = this.callbacks;
      this.callbacks = null;
      cb.onEnd();
    }
  }

  // Test helpers to simulate events
  simulateInterim(text: string): void {
    this.callbacks?.onInterimTranscript(text);
  }

  simulateFinal(text: string, conf = 0.95): void {
    this.transcript = text;
    this.callbacks?.onFinalTranscript(text, conf);
  }

  simulateError(code: string, message: string, recoverable = true): void {
    this.callbacks?.onError({ code, message, recoverable });
  }
}

describe('HybridSTTOrchestrator Unit Tests', () => {
  let primary: MockSTTProvider;
  let secondary: MockSTTProvider;
  let orchestrator: HybridSTTOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers();
    primary = new MockSTTProvider('MockPrimary', true);
    secondary = new MockSTTProvider('MockSecondary', true);
    orchestrator = new HybridSTTOrchestrator(primary, secondary);
  });

  afterEach(() => {
    orchestrator.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Default Routing & Capabilities', () => {
    it('selects primary provider by default when supported', () => {
      const callbacks: STTCallbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      orchestrator.start(callbacks);
      expect(orchestrator.getActiveProviderName()).toBe('MockPrimary');
      expect(primary.listening).toBe(true);
      expect(secondary.listening).toBe(false);
      expect(orchestrator.getCircuitState()).toBe('CLOSED');
    });

    it('immediately selects secondary fallback when primary is unsupported (e.g. Firefox)', () => {
      primary.supported = false;
      const onProviderChange = vi.fn();
      const callbacks: STTCallbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
        onProviderChange,
      };

      orchestrator.start(callbacks);
      expect(orchestrator.getActiveProviderName()).toBe('MockSecondary');
      expect(secondary.listening).toBe(true);
      expect(primary.listening).toBe(false);
      expect(onProviderChange).toHaveBeenCalledWith('MockSecondary');
    });
  });

  describe('Circuit Breaker Auto-Failover on Repeated Failures', () => {
    it('trips circuit breaker to OPEN and migrates to secondary on 3 failures within 10s', async () => {
      const onProviderChange = vi.fn();
      const onError = vi.fn();
      const callbacks: STTCallbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError,
        onEnd: vi.fn(),
        onProviderChange,
      };

      orchestrator.start(callbacks);
      primary.simulateFinal('Spoken words before errors.');
      expect(orchestrator.getCircuitState()).toBe('CLOSED');

      // Failure 1
      primary.simulateError('UNKNOWN', 'Transient glitch 1');
      expect(orchestrator.getCircuitState()).toBe('CLOSED');
      expect(onError).toHaveBeenCalledTimes(1);

      // Failure 2 (after 2 seconds)
      vi.advanceTimersByTime(2000);
      primary.simulateError('UNKNOWN', 'Transient glitch 2');
      expect(orchestrator.getCircuitState()).toBe('CLOSED');
      expect(onError).toHaveBeenCalledTimes(2);

      // Failure 3 (after another 2 seconds - within 10s window)
      vi.advanceTimersByTime(2000);
      primary.simulateError('UNKNOWN', 'Transient glitch 3');

      // Circuit Breaker should TRIP to OPEN!
      expect(orchestrator.getCircuitState()).toBe('OPEN');
      expect(orchestrator.getActiveProviderName()).toBe('MockSecondary');
      expect(onProviderChange).toHaveBeenCalledWith('MockSecondary');

      // Transcript buffer must have been transferred to secondary!
      expect(secondary.getSessionTranscript()).toBe(
        'Spoken words before errors.',
      );
      expect(secondary.listening).toBe(true);
    });
  });

  describe('Circuit Breaker Auto-Failover on Network Drops', () => {
    it('instantly migrates to secondary on RECOGNITION_NETWORK_ERROR without dropping session', () => {
      const onProviderChange = vi.fn();
      const callbacks: STTCallbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
        onProviderChange,
      };

      orchestrator.start(callbacks);
      primary.simulateFinal('Enterprise speech underway');

      // Primary experiences a network drop
      primary.simulateError(
        'RECOGNITION_NETWORK_ERROR',
        'Network connection died',
      );

      // Instant migration
      expect(orchestrator.getCircuitState()).toBe('OPEN');
      expect(orchestrator.getActiveProviderName()).toBe('MockSecondary');
      expect(onProviderChange).toHaveBeenCalledWith('MockSecondary');
      expect(secondary.getSessionTranscript()).toBe(
        'Enterprise speech underway',
      );
      expect(secondary.listening).toBe(true);
    });
  });

  describe('Half-Open Recovery', () => {
    it('transitions to HALF_OPEN after cooldown period and heals to CLOSED on final transcript', () => {
      const callbacks: STTCallbacks = {
        onInterimTranscript: vi.fn(),
        onFinalTranscript: vi.fn(),
        onError: vi.fn(),
        onEnd: vi.fn(),
      };

      orchestrator.start(callbacks);
      // Trip circuit
      primary.simulateError('RECOGNITION_NETWORK_ERROR', 'Drop');
      expect(orchestrator.getCircuitState()).toBe('OPEN');

      // Advance 30 seconds (cooldown)
      vi.advanceTimersByTime(30000);
      expect(orchestrator.getCircuitState()).toBe('HALF_OPEN');

      // Stopping and restarting session while in HALF_OPEN probes primary
      orchestrator.stop();
      orchestrator.start(callbacks);
      expect(orchestrator.getActiveProviderName()).toBe('MockPrimary');

      // Successful transcript heals breaker to CLOSED
      primary.simulateFinal('Successful speech probe');
      expect(orchestrator.getCircuitState()).toBe('CLOSED');
    });
  });
});
