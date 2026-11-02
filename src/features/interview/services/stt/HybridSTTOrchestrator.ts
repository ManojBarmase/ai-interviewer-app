/**
 * @file HybridSTTOrchestrator.ts
 * @description Master STT orchestrator implementing Circuit-Breaker Auto-Failover.
 * Silently migrates active speech sessions from low-latency WebSpeech to resilient
 * AudioStream fallback on network degradation or repeated browser faults without
 * dropping words or interrupting the candidate.
 */

import {
  type ISTTProvider,
  type STTCallbacks,
  type STTOptions,
  type CircuitBreakerState,
} from '../../contracts/stt.interface';

import { AudioStreamSTTProvider } from './AudioStreamSTTProvider';
import { WebSpeechSTTProvider } from './WebSpeechSTTProvider';

export class HybridSTTOrchestrator implements ISTTProvider {
  readonly name = 'HybridSTTOrchestrator';

  private readonly primaryProvider: ISTTProvider;
  private readonly secondaryProvider: ISTTProvider;
  private activeProvider: ISTTProvider;

  private circuitState: CircuitBreakerState = 'CLOSED';
  private failureTimestamps: number[] = [];
  private lastTripTime = 0;
  private readonly failureWindowMs = 10000; // 10 seconds window
  private readonly failureThreshold = 3; // 3 failures triggers trip
  private readonly cooldownMs = 30000; // 30s cooldown before half-open probe

  private isSessionActive = false;
  private isFailingOver = false;
  private callbacks: STTCallbacks | null = null;
  private options: STTOptions = {};

  constructor(primary?: ISTTProvider, secondary?: ISTTProvider) {
    this.primaryProvider = primary ?? new WebSpeechSTTProvider();
    this.secondaryProvider = secondary ?? new AudioStreamSTTProvider();
    this.activeProvider = this.primaryProvider;
  }

  isSupported(): boolean {
    return (
      this.primaryProvider.isSupported() || this.secondaryProvider.isSupported()
    );
  }

  isListening(): boolean {
    return this.activeProvider.isListening();
  }

  getSessionTranscript(): string {
    return this.activeProvider.getSessionTranscript();
  }

  getCircuitState(): CircuitBreakerState {
    this.checkHalfOpenTransition();
    return this.circuitState;
  }

  getActiveProviderName(): string {
    return this.activeProvider.name;
  }

  getActiveProvider(): ISTTProvider {
    return this.activeProvider;
  }

  resetCircuitBreaker(): void {
    this.circuitState = 'CLOSED';
    this.failureTimestamps = [];
    this.activeProvider = this.primaryProvider;
  }

  updateSessionTranscript(text: string): void {
    this.primaryProvider.updateSessionTranscript(text);
    this.secondaryProvider.updateSessionTranscript(text);
  }

  start(
    callbacks: STTCallbacks,
    options: STTOptions = {},
  ): Promise<void> | void {
    this.callbacks = callbacks;
    this.options = options;
    this.isSessionActive = true;
    this.isFailingOver = false;

    this.checkHalfOpenTransition();

    // Determine target provider based on capability & circuit state
    if (!this.primaryProvider.isSupported()) {
      this.activeProvider = this.secondaryProvider;
      this.circuitState = 'OPEN';
      callbacks.onProviderChange?.(this.secondaryProvider.name);
    } else if (this.circuitState === 'OPEN') {
      this.activeProvider = this.secondaryProvider;
      callbacks.onProviderChange?.(this.secondaryProvider.name);
    } else {
      this.activeProvider = this.primaryProvider;
    }

    const wrappedCallbacks = this.createWrappedCallbacks(
      this.activeProvider,
      callbacks,
    );
    return this.activeProvider.start(wrappedCallbacks, options);
  }

  stop(): void {
    this.isSessionActive = false;
    this.isFailingOver = false;
    this.activeProvider.stop();
  }

  private checkHalfOpenTransition(): void {
    if (
      this.circuitState === 'OPEN' &&
      Date.now() - this.lastTripTime >= this.cooldownMs &&
      this.primaryProvider.isSupported()
    ) {
      this.circuitState = 'HALF_OPEN';
    }
  }

  private async failoverToSecondary(): Promise<void> {
    if (this.isFailingOver || this.activeProvider === this.secondaryProvider) {
      return;
    }

    this.isFailingOver = true;
    this.circuitState = 'OPEN';
    this.lastTripTime = Date.now();

    // Zero-downtime transcript preservation: transfer accumulated buffer
    const currentTranscript = this.primaryProvider.getSessionTranscript();
    this.secondaryProvider.updateSessionTranscript(currentTranscript);

    try {
      this.primaryProvider.stop();
    } catch {
      // Safe to ignore primary teardown errors during failover
    }

    this.activeProvider = this.secondaryProvider;

    if (this.callbacks) {
      this.callbacks.onProviderChange?.(this.secondaryProvider.name);

      if (this.isSessionActive) {
        try {
          const wrapped = this.createWrappedCallbacks(
            this.secondaryProvider,
            this.callbacks,
          );
          await this.secondaryProvider.start(wrapped, this.options);
        } catch (err) {
          console.error(
            '[HybridSTTOrchestrator] Failed to start secondary provider:',
            err,
          );
        }
      }
    }

    this.isFailingOver = false;
  }

  private createWrappedCallbacks(
    targetProvider: ISTTProvider,
    destinationCallbacks: STTCallbacks,
  ): STTCallbacks {
    return {
      onInterimTranscript: (text: string) => {
        if (!this.isSessionActive) return;
        destinationCallbacks.onInterimTranscript(text);
      },
      onFinalTranscript: (text: string, confidence: number) => {
        if (!this.isSessionActive) return;
        // On successful final transcript in HALF_OPEN, heal back to CLOSED
        if (
          targetProvider === this.primaryProvider &&
          this.circuitState === 'HALF_OPEN'
        ) {
          this.circuitState = 'CLOSED';
          this.failureTimestamps = [];
        }
        destinationCallbacks.onFinalTranscript(text, confidence);
      },
      onError: async (error) => {
        if (!this.isSessionActive) return;

        // If error originates from the primary provider, evaluate circuit breaker
        if (targetProvider === this.primaryProvider) {
          const now = Date.now();
          this.failureTimestamps = this.failureTimestamps.filter(
            (t) => now - t <= this.failureWindowMs,
          );
          this.failureTimestamps.push(now);

          const isNetworkDrop = error.code === 'RECOGNITION_NETWORK_ERROR';
          const thresholdExceeded =
            this.failureTimestamps.length >= this.failureThreshold;

          if (
            (isNetworkDrop || thresholdExceeded) &&
            this.secondaryProvider.isSupported()
          ) {
            console.warn(
              `[HybridSTTOrchestrator] Circuit breaker TRIPPED (${isNetworkDrop ? 'network drop' : 'failures >= 3 in 10s'}). Migrating to ${this.secondaryProvider.name}...`,
            );
            await this.failoverToSecondary();
            return;
          }
        }

        // Pass through error if not handled by failover
        destinationCallbacks.onError(error);
      },
      onEnd: () => {
        // Suppress onEnd if we are actively migrating between providers
        if (this.isFailingOver) return;
        if (this.activeProvider !== targetProvider) return;

        this.isSessionActive = false;
        destinationCallbacks.onEnd();
      },
      onProviderChange: destinationCallbacks.onProviderChange,
    };
  }
}
