'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { Video, Mic, Volume2 } from 'lucide-react';

import {
  INTERVIEWERS_MAP,
  DEFAULT_INTERVIEWER,
} from '../../constants/personas';
import { useInterviewStore } from '../../store/useInterviewStore';

export interface WaitingRoomProps {
  onJoin: () => void;
}

export function WaitingRoom({ onJoin }: WaitingRoomProps) {
  const router = useRouter();
  const { candidateContext } = useInterviewStore();

  const selectedId = candidateContext?.interviewerId || 'priya';
  const interviewer = INTERVIEWERS_MAP[selectedId] ?? DEFAULT_INTERVIEWER;

  const avatarSrc = interviewer.avatar;
  const interviewerName = interviewer.name;
  const interviewerTitle = interviewer.title;

  const numQuestions = candidateContext?.numQuestions || 6;
  const interviewType = candidateContext?.interviewType || 'Full loop';
  const role = candidateContext?.role || 'Frontend Engineer';

  return (
    <div className="min-h-screen bg-[hsl(222,28%,7%)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-[hsl(222,24%,11%)] rounded-2xl overflow-hidden shadow-2xl border border-white/5">
        {/* Avatar Section */}
        <div className="w-full h-[300px] relative bg-[hsl(222,30%,15%)]">
          <Image
            src={avatarSrc}
            alt={interviewerName}
            fill
            sizes="420px"
            className="object-cover object-top"
          />
          {/* Gradient Overlay for seamless blend */}
          <div className="absolute inset-0 bg-linear-to-t from-[hsl(222,24%,11%)] via-transparent to-transparent" />
        </div>

        {/* Info Section */}
        <div className="px-6 pb-6 pt-2 text-center flex flex-col items-center relative z-10">
          <h2 className="text-xl font-bold text-white mb-1">
            {interviewerName}
          </h2>
          <p className="text-sm text-white/70 mb-4">{interviewerTitle}</p>

          <p className="text-xs text-white/50 mb-6">
            {numQuestions} questions &middot; {interviewType} &middot; {role}
          </p>

          {/* Capabilities Pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide">
              <Mic size={12} /> Voice answers
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide">
              <Video size={12} /> Camera on
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wide">
              <Volume2 size={12} /> Spoken questions
            </span>
          </div>

          {/* Actions */}
          <div className="w-full flex gap-3">
            <button
              onClick={() => router.push('/dashboard/setup')}
              className="flex-1 py-3 px-4 rounded-xl border border-white/10 hover:bg-white/5 text-white text-sm font-semibold transition-colors"
            >
              Leave
            </button>
            <button
              onClick={onJoin}
              className="flex-[2] flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-brand-500/25"
            >
              <Video size={16} /> Join now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
