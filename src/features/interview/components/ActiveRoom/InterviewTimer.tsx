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
      <div className="flex items-center gap-3">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isListening ? 'bg-red-500 animate-pulse' : 'bg-red-500'
          }`}
        />
        <h1 className="text-sm font-semibold text-white/90">
          {roleName} interview
        </h1>
        <span className="text-xs text-white/40 ml-2">
          Question {Math.min(currentTurn, totalQuestions)} of {totalQuestions}
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
