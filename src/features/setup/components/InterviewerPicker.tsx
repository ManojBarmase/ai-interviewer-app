'use client';

import Image from 'next/image';

import {
  INTERVIEWERS,
  type Interviewer,
} from '@/features/interview/constants/personas';

export interface InterviewerPickerProps {
  selectedInterviewerId: string;
  onSelectInterviewer: (id: string) => void;
}

/**
 * Persona selector component for choosing the AI Interviewer persona.
 */
export function InterviewerPicker({
  selectedInterviewerId,
  onSelectInterviewer,
}: InterviewerPickerProps) {
  return (
    <section>
      <h2 className="text-sm font-bold text-white mb-4">Your interviewer</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {INTERVIEWERS.map((inv: Interviewer) => {
          const isSelected = selectedInterviewerId === inv.id;
          return (
            <button
              key={inv.id}
              onClick={() => onSelectInterviewer(inv.id)}
              type="button"
              className={`text-left p-4 rounded-2xl border transition-all duration-200 relative overflow-hidden group cursor-pointer ${
                isSelected
                  ? 'bg-brand-500/10 border-brand-500 ring-1 ring-brand-500'
                  : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
              }`}
            >
              <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-4 bg-[hsl(222,30%,15%)]">
                <Image
                  src={inv.avatar}
                  alt={inv.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 20vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="font-bold text-sm text-white">{inv.name}</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${inv.tagColor} shrink-0`}
                >
                  {inv.tag}
                </span>
              </div>
              <p className="text-xs text-white/40 mb-3 leading-snug h-8 line-clamp-2">
                {inv.title}
              </p>
              <p className="text-[11px] text-white/50 leading-relaxed border-t border-white/10 pt-3">
                {inv.desc}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
