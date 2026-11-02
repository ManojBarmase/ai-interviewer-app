'use client';

import { useEffect, useState } from 'react';

import { Clock, LayoutTemplate } from 'lucide-react';

export interface InterviewTimerProps {
  roleName: string;
  currentTurn: number;
  totalQuestions: number;
  isListening: boolean;
  startedAt?: string | undefined;
  onToggleLayout?: (() => void) | undefined;
  experience?: string | undefined;
  difficulty?: string | undefined;
  interviewType?: string | undefined;
  timeLimit?: string | undefined;
}

/**
 * Header bar component rendering live session duration and question counter.
 */
export function InterviewTimer({
  roleName,
  currentTurn,
  totalQuestions,
  isListening,
  startedAt,
  onToggleLayout,
  experience,
  difficulty,
  interviewType,
  timeLimit,
}: InterviewTimerProps) {
  const [elapsed, setElapsed] = useState('00:00');

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();

    const update = () => {
      const now = Date.now();
      const diffSecs = Math.max(0, Math.floor((now - start) / 1000));
      const mins = Math.floor(diffSecs / 60);
      const secs = diffSecs % 60;
      setElapsed(
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0 bg-[#0b0c10]">
      <div className="flex items-center gap-2.5 flex-wrap">
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            isListening ? 'bg-red-500 animate-pulse' : 'bg-red-500'
          }`}
        />
        <h1 className="text-sm font-semibold text-white/90">{roleName}</h1>
        {experience && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/70 font-medium">
            {experience}
          </span>
        )}
        {interviewType && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-400 font-medium">
            {interviewType}
          </span>
        )}
        {difficulty && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
              difficulty === 'Hard'
                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                : difficulty === 'Easy'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            {difficulty}
          </span>
        )}
        {timeLimit && timeLimit !== 'None' && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/50 font-mono">
            {timeLimit} limit
          </span>
        )}
        <span className="text-xs text-white/40 ml-1 font-mono">
          Q{Math.min(currentTurn, totalQuestions)}/{totalQuestions}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {startedAt && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs font-mono text-white/70">
            <Clock size={12} className="text-white/40" />
            <span>{elapsed}</span>
          </div>
        )}
        {onToggleLayout && (
          <button
            onClick={onToggleLayout}
            type="button"
            className="text-white/40 hover:text-white/80 transition-colors cursor-pointer"
            title="Toggle Layout"
          >
            <LayoutTemplate size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
