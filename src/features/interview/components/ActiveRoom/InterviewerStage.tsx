'use client';

import type { RefObject } from 'react';

import Image from 'next/image';

import { MicOff } from 'lucide-react';

import { type Interviewer } from '@/features/interview/constants/personas';

export interface InterviewerStageProps {
  interviewer: Interviewer;
  phaseLabel: string;
  isListening: boolean;
  isSpeaking: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  isCameraOn: boolean;
  isMicMuted: boolean;
}

/**
 * Stage component representing the primary video arena:
 * - AI Persona Avatar with reactive speaking/listening pulse
 * - Contextual status badges
 * - Self PiP (Picture-in-Picture) video container
 */
export function InterviewerStage({
  interviewer,
  phaseLabel,
  isListening,
  isSpeaking,
  videoRef,
  isCameraOn,
  isMicMuted,
}: InterviewerStageProps) {
  return (
    <div className="relative flex-1 bg-linear-to-b from-[hsl(222,30%,12%)] to-[#0b0c10] overflow-hidden flex items-center justify-center">
      {/* ── Top Left: Interviewer Identity Badge ── */}
      <div className="absolute top-4 left-4 z-10 px-4 py-2 bg-[#0b0c10]/80 backdrop-blur-md rounded-full border border-white/5 flex items-center gap-2 shadow-sm">
        <span className="text-sm font-semibold text-white/90">
          {interviewer.name}
        </span>
        <span className="text-xs text-white/50">
          · {interviewer.title.split(',')[0]}
        </span>
      </div>

      {/* ── Top Right: Phase Status Pill ── */}
      <div className="absolute top-4 right-4 z-10 px-4 py-2 bg-[#0b0c10]/80 backdrop-blur-md rounded-full border border-white/5 flex items-center gap-2 shadow-sm">
        <div
          className={`w-2 h-2 rounded-full ${
            isListening
              ? 'bg-emerald-500 animate-pulse'
              : isSpeaking
                ? 'bg-indigo-500 animate-ping'
                : 'bg-amber-500'
          }`}
        />
        <span className="text-sm font-medium text-white/90">{phaseLabel}</span>
      </div>

      {/* ── AI Avatar (Centered with reactive ambient glow) ── */}
      <div className="relative w-64 h-64 lg:w-96 lg:h-96 mt-8 flex items-center justify-center">
        {/* Dynamic aura pulse when AI is speaking */}
        {isSpeaking && (
          <div className="absolute inset-4 rounded-full bg-indigo-500/20 blur-2xl animate-pulse pointer-events-none" />
        )}
        <Image
          src={interviewer.avatar}
          alt={interviewer.name}
          fill
          priority
          sizes="(max-width: 768px) 256px, 384px"
          className="object-contain drop-shadow-2xl transition-transform duration-300"
        />
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
