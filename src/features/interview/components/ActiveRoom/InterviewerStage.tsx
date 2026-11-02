'use client';

import { type RefObject, useEffect, useRef, useCallback } from 'react';

import Image from 'next/image';

import { MicOff } from 'lucide-react';

import { type Interviewer } from '@/features/interview/constants/personas';
import { getTTSAnalyser } from '@/features/interview/services/audioService';

export interface InterviewerStageProps {
  interviewer: Interviewer;
  phaseLabel: string;
  isListening: boolean;
  isSpeaking: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  isCameraOn: boolean;
  isMicMuted: boolean;
  analyserNode?: AnalyserNode | null | undefined;
}

/**
 * Enterprise Audio-Reactive Interviewer Stage
 *
 * Connects Web Audio AnalyserNode to the synthetic/TTS audio output.
 * Extracts real-time frequency data (`getByteFrequencyData`) via `requestAnimationFrame`.
 * Renders:
 * - Fluid multi-harmonic canvas ripple-wave aura syncing with speech amplitude & phonemes.
 * - Dynamic reactive persona avatar with vocal resonance & gaze reactive pulses.
 * - Picture-in-Picture candidate self camera feed.
 */
export function InterviewerStage({
  interviewer,
  phaseLabel,
  isListening,
  isSpeaking,
  videoRef,
  isCameraOn,
  isMicMuted,
  analyserNode,
}: InterviewerStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const avatarWrapperRef = useRef<HTMLDivElement | null>(null);
  const mouthAuraRef = useRef<HTMLDivElement | null>(null);
  const eyeGleamRef = useRef<HTMLDivElement | null>(null);

  // Audio frequency state smoothed across frames
  const smoothedAmpRef = useRef(0);
  const smoothedBassRef = useRef(0);
  const smoothedMidRef = useRef(0);
  const smoothedHighRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  // Audio visualizer render loop
  const startVisualizerLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserNode ?? getTTSAnalyser();
    const binCount = analyser?.frequencyBinCount ?? 64;
    const frequencyData = new Uint8Array(binCount);

    let phaseStep = 0;

    const render = () => {
      phaseStep += 0.03;

      let targetAmp = 0;
      let targetBass = 0;
      let targetMid = 0;
      let targetHigh = 0;

      if (analyser && isSpeaking) {
        analyser.getByteFrequencyData(frequencyData);

        let sumAll = 0;
        let sumBass = 0;
        let sumMid = 0;
        let sumHigh = 0;

        const bassEnd = Math.max(1, Math.floor(binCount * 0.15));
        const midEnd = Math.max(bassEnd + 1, Math.floor(binCount * 0.5));

        for (let i = 0; i < binCount; i++) {
          const val = (frequencyData[i] ?? 0) / 255;
          sumAll += val;
          if (i < bassEnd) sumBass += val;
          else if (i < midEnd) sumMid += val;
          else sumHigh += val;
        }

        targetAmp = sumAll / binCount;
        targetBass = sumBass / bassEnd;
        targetMid = sumMid / (midEnd - bassEnd);
        targetHigh = sumHigh / (binCount - midEnd);
      } else if (isListening) {
        // Subtle ambient listening pulse
        const breathe = Math.sin(phaseStep * 0.8) * 0.5 + 0.5;
        targetAmp = 0.08 + breathe * 0.06;
        targetBass = 0.05 + breathe * 0.05;
        targetMid = 0.08 + breathe * 0.04;
        targetHigh = 0.04;
      } else {
        // Idle gentle breathing baseline
        const breathe = Math.sin(phaseStep * 0.5) * 0.5 + 0.5;
        targetAmp = 0.03 + breathe * 0.02;
        targetBass = 0.02;
        targetMid = 0.02;
        targetHigh = 0.01;
      }

      // Smooth interpolation (lerp)
      const lerpFactor = 0.22;
      smoothedAmpRef.current +=
        (targetAmp - smoothedAmpRef.current) * lerpFactor;
      smoothedBassRef.current +=
        (targetBass - smoothedBassRef.current) * lerpFactor;
      smoothedMidRef.current +=
        (targetMid - smoothedMidRef.current) * lerpFactor;
      smoothedHighRef.current +=
        (targetHigh - smoothedHighRef.current) * lerpFactor;

      const amp = smoothedAmpRef.current;
      const bass = smoothedBassRef.current;
      const mid = smoothedMidRef.current;
      const high = smoothedHighRef.current;

      // ── Canvas Ripple-Wave Rendering ─────────────────────────────────────────
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const baseRadius = Math.min(width, height) * 0.28;

      // 1. Ambient Central Glow
      const glowGrad = ctx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.2,
        cx,
        cy,
        baseRadius * (1.4 + amp * 0.6),
      );

      if (isSpeaking) {
        glowGrad.addColorStop(
          0,
          `rgba(99, 102, 241, ${Math.min(0.55, 0.2 + amp * 0.5)})`,
        );
        glowGrad.addColorStop(
          0.5,
          `rgba(168, 85, 247, ${Math.min(0.35, 0.1 + mid * 0.35)})`,
        );
        glowGrad.addColorStop(1, 'rgba(11, 12, 16, 0)');
      } else if (isListening) {
        glowGrad.addColorStop(
          0,
          `rgba(16, 185, 129, ${Math.min(0.4, 0.15 + amp * 0.3)})`,
        );
        glowGrad.addColorStop(
          0.6,
          `rgba(20, 184, 166, ${Math.min(0.25, 0.08 + amp * 0.2)})`,
        );
        glowGrad.addColorStop(1, 'rgba(11, 12, 16, 0)');
      } else {
        glowGrad.addColorStop(0, 'rgba(99, 102, 241, 0.08)');
        glowGrad.addColorStop(1, 'rgba(11, 12, 16, 0)');
      }

      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * (1.6 + amp * 0.8), 0, Math.PI * 2);
      ctx.fill();

      // 2. Harmonic Concentric Ripple Waves
      const waveCount = 4;
      for (let i = 0; i < waveCount; i++) {
        const offset = i / waveCount;
        const waveProgress = (phaseStep * 0.4 + offset) % 1;
        const currentRadius =
          baseRadius + waveProgress * baseRadius * (0.8 + amp * 1.2);
        const waveAlpha = Math.max(
          0,
          (1 - waveProgress) * (isSpeaking ? 0.2 + amp * 0.7 : 0.15),
        );

        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius, 0, Math.PI * 2);

        if (isSpeaking) {
          ctx.strokeStyle = `rgba(129, 140, 248, ${waveAlpha})`;
          ctx.lineWidth = 1.5 + amp * 3 * (1 - waveProgress);
        } else if (isListening) {
          ctx.strokeStyle = `rgba(52, 211, 153, ${waveAlpha * 0.8})`;
          ctx.lineWidth = 1.2;
        } else {
          ctx.strokeStyle = `rgba(255, 255, 255, ${waveAlpha * 0.3})`;
          ctx.lineWidth = 1;
        }

        ctx.stroke();
      }

      // 3. Liquid Phoneme Perimeter Undulation (during AI speech)
      if (isSpeaking && amp > 0.04) {
        const perimeterPoints = 48;
        ctx.beginPath();
        for (let j = 0; j <= perimeterPoints; j++) {
          const angle = (j / perimeterPoints) * Math.PI * 2;
          const binIndex = Math.floor((j / perimeterPoints) * (binCount * 0.6));
          const freqIntensity = ((frequencyData[binIndex] ?? 0) / 255) * amp;
          const waveDeform =
            Math.sin(angle * 6 + phaseStep * 3) * (8 + freqIntensity * 28) +
            Math.cos(angle * 4 - phaseStep * 2) * (5 + bass * 18);
          const r = baseRadius * 1.08 + waveDeform;
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;

          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(192, 132, 252, ${Math.min(0.65, 0.2 + mid * 0.6)})`;
        ctx.lineWidth = 1.8 + amp * 2;
        ctx.stroke();
      }

      // ── Reactive Avatar Element Animations ─────────────────────────────────
      if (avatarWrapperRef.current) {
        const scaleVal = 1 + amp * 0.06 + bass * 0.03;
        const translateY = Math.sin(phaseStep * 1.2) * (1.5 + amp * 3);
        avatarWrapperRef.current.style.transform = `scale(${scaleVal.toFixed(4)}) translateY(${translateY.toFixed(2)}px)`;
      }

      // Mouth vocal resonance glow
      if (mouthAuraRef.current) {
        if (isSpeaking) {
          const mouthScaleX = 1 + mid * 0.5;
          const mouthScaleY = 1 + mid * 0.9;
          const mouthOpacity = Math.min(1, 0.25 + mid * 0.75 + amp * 0.4);
          mouthAuraRef.current.style.transform = `translate(-50%, -50%) scale(${mouthScaleX.toFixed(3)}, ${mouthScaleY.toFixed(3)})`;
          mouthAuraRef.current.style.opacity = `${mouthOpacity.toFixed(2)}`;
        } else {
          mouthAuraRef.current.style.opacity = '0';
        }
      }

      // Eye gaze clarity glow
      if (eyeGleamRef.current) {
        if (isSpeaking) {
          const eyeOpacity = Math.min(0.85, 0.2 + high * 0.65);
          eyeGleamRef.current.style.opacity = `${eyeOpacity.toFixed(2)}`;
        } else if (isListening) {
          eyeGleamRef.current.style.opacity = '0.35';
        } else {
          eyeGleamRef.current.style.opacity = '0.1';
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
  }, [analyserNode, isSpeaking, isListening]);

  // Setup canvas high-DPI scaling & visualizer lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    const displayWidth = rect.width || 420;
    const displayHeight = rect.height || 420;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }

    startVisualizerLoop();

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [startVisualizerLoop]);

  return (
    <div className="relative flex-1 bg-linear-to-b from-[hsl(222,30%,12%)] to-[#0b0c10] overflow-hidden flex items-center justify-center select-none">
      {/* ── Top Left: Interviewer Identity Badge ── */}
      <div className="absolute top-4 left-4 z-20 px-4 py-2 bg-[#0b0c10]/85 backdrop-blur-md rounded-full border border-white/5 flex items-center gap-2 shadow-lg">
        <span className="text-sm font-semibold text-white/90">
          {interviewer.name}
        </span>
        <span className="text-xs text-white/50">
          · {interviewer.title.split(',')[0]}
        </span>
      </div>

      {/* ── Top Right: Phase Status Pill ── */}
      <div className="absolute top-4 right-4 z-20 px-4 py-2 bg-[#0b0c10]/85 backdrop-blur-md rounded-full border border-white/5 flex items-center gap-2 shadow-lg">
        <div
          className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
            isListening
              ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)] animate-pulse'
              : isSpeaking
                ? 'bg-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.9)] animate-ping'
                : 'bg-amber-500'
          }`}
        />
        <span className="text-sm font-medium text-white/90">{phaseLabel}</span>
      </div>

      {/* ── Central Audio-Reactive Arena: Canvas Ripple Aura + Animated Avatar ── */}
      <div className="relative w-80 h-80 sm:w-96 sm:h-96 lg:w-[460px] lg:h-[460px] flex items-center justify-center">
        {/* Audio-Frequency Reactive Ripple Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
        />

        {/* Dynamic Persona Avatar Container */}
        <div
          ref={avatarWrapperRef}
          className="relative w-64 h-64 sm:w-72 sm:h-72 lg:w-96 lg:h-96 z-10 flex items-center justify-center transition-transform duration-75 ease-out"
        >
          <Image
            src={interviewer.avatar}
            alt={interviewer.name}
            fill
            priority
            sizes="(max-width: 768px) 288px, 384px"
            className="object-contain drop-shadow-[0_25px_45px_rgba(0,0,0,0.6)] pointer-events-none"
          />

          {/* Mouth / Vocal Resonance Reactive Glow Overlay */}
          <div
            ref={mouthAuraRef}
            className="absolute top-[68%] left-[50%] w-16 h-8 rounded-full bg-indigo-400/40 blur-md pointer-events-none opacity-0 transition-opacity duration-75"
          />

          {/* Eye / Gaze Focus Gleam Overlay */}
          <div
            ref={eyeGleamRef}
            className="absolute top-[38%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-28 h-7 rounded-full bg-cyan-300/25 blur-sm pointer-events-none opacity-10 transition-opacity duration-150"
          />
        </div>
      </div>

      {/* ── Candidate Self PiP Video ── */}
      <div className="absolute bottom-6 right-6 w-48 aspect-video bg-black/60 rounded-xl border border-white/10 overflow-hidden shadow-2xl z-20">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${!isCameraOn ? 'hidden' : ''}`}
        />
        {!isCameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <span className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white/50 text-lg font-bold">
              You
            </span>
          </div>
        )}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 rounded text-[10px] font-medium text-white/80 backdrop-blur-sm">
          You
        </div>
        {isMicMuted && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-red-600/90 text-white rounded text-[10px] font-semibold flex items-center gap-1 shadow-md backdrop-blur-sm">
            <MicOff size={10} />
            <span>Muted</span>
          </div>
        )}
      </div>
    </div>
  );
}
