/**
 * @file STTFactory.ts
 * @description Provider Factory and Hardware Capability Introspector for STT engine.
 */

import { type ISTTProvider } from '../../contracts/stt.interface';

import { AudioStreamSTTProvider } from './AudioStreamSTTProvider';
import { HybridSTTOrchestrator } from './HybridSTTOrchestrator';
import { SileroVADProvider } from './SileroVADProvider';
import { WebSpeechSTTProvider } from './WebSpeechSTTProvider';

export type STTProviderType =
  'hybrid' | 'webspeech' | 'audiostream' | 'silerovad';

export interface STTCapabilities {
  isBrowser: boolean;
  webSpeechSupported: boolean;
  audioStreamSupported: boolean;
  preferredProvider: 'WebSpeechSTTProvider' | 'AudioStreamSTTProvider' | 'None';
}

export class STTFactory {
  /**
   * Introspects browser and hardware capabilities without triggering side-effects.
   * Safe to call during SSR.
   */
  static getCapabilities(): STTCapabilities {
    if (typeof window === 'undefined') {
      return {
        isBrowser: false,
        webSpeechSupported: false,
        audioStreamSupported: false,
        preferredProvider: 'None',
      };
    }

    const webSpeechSupported =
      'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

    const audioStreamSupported =
      Boolean(navigator?.mediaDevices?.getUserMedia) &&
      (Boolean(window.AudioContext) ||
        Boolean(
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext,
        ));

    let preferredProvider:
      'WebSpeechSTTProvider' | 'AudioStreamSTTProvider' | 'None' = 'None';

    if (webSpeechSupported) {
      preferredProvider = 'WebSpeechSTTProvider';
    } else if (audioStreamSupported) {
      preferredProvider = 'AudioStreamSTTProvider';
    }

    return {
      isBrowser: true,
      webSpeechSupported,
      audioStreamSupported,
      preferredProvider,
    };
  }

  /**
   * Creates an STT provider instance based on preference and capability.
   */
  static createProvider(type: STTProviderType = 'hybrid'): ISTTProvider {
    switch (type) {
      case 'webspeech':
        return new WebSpeechSTTProvider();
      case 'audiostream':
        return new AudioStreamSTTProvider();
      case 'silerovad':
        return new SileroVADProvider();
      case 'hybrid':
      default:
        return new HybridSTTOrchestrator();
    }
  }
}
