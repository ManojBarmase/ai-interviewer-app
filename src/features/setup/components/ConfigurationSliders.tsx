'use client';

import { ChevronRight } from 'lucide-react';

export const TIME_LIMITS = ['None', '90s', '3m', '5m'];

export interface ConfigurationSlidersProps {
  numQuestions: number;
  timeLimit: string;
  allowFollowUps: boolean;
  onNumQuestionsChange: (num: number) => void;
  onTimeLimitChange: (limit: string) => void;
  onToggleFollowUps: () => void;
  onProceed: () => void;
}

/**
 * Component for interview pace configuration: sliders, question limits, follow-ups toggle.
 */
export function ConfigurationSliders({
  numQuestions,
  timeLimit,
  allowFollowUps,
  onNumQuestionsChange,
  onTimeLimitChange,
  onToggleFollowUps,
  onProceed,
}: ConfigurationSlidersProps) {
  return (
    <div className="space-y-6 pt-4 border-t border-white/5">
      {/* ── QUESTION COUNT SLIDER & TIME LIMITS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 py-2">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Interview Length</h2>
            <span className="text-xs font-mono font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
              {numQuestions} questions
            </span>
          </div>
          <input
            type="range"
            min="3"
            max="10"
            value={numQuestions}
            onChange={(e) => onNumQuestionsChange(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-500"
          />
          <div className="flex justify-between text-[11px] text-white/30 mt-2 font-mono">
            <span>3 (Quick)</span>
            <span>6 (Standard)</span>
            <span>10 (Full Loop)</span>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-white mb-3">
            Time Limit per Answer
          </h2>
          <div className="flex p-1 bg-white/[0.03] border border-white/5 rounded-xl w-fit">
            {TIME_LIMITS.map((t) => (
              <button
                key={t}
                onClick={() => onTimeLimitChange(t)}
                type="button"
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  timeLimit === t
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── FOLLOW-UP QUESTIONS TOGGLE ── */}
      <div className="flex items-center justify-between p-4 bg-white/[0.01] border border-white/5 rounded-xl">
        <div>
          <h2 className="text-sm font-bold text-white mb-1">
            Allow AI Follow-up Questions
          </h2>
          <p className="text-xs text-white/50">
            The interviewer probes deeper when answers miss critical trade-offs.
          </p>
        </div>
        <button
          onClick={onToggleFollowUps}
          type="button"
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
            allowFollowUps ? 'bg-brand-500' : 'bg-white/20'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              allowFollowUps ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* ── PROCEED TO TECH CHECK CTA ── */}
      <div className="pt-4 flex justify-end">
        <button
          onClick={onProceed}
          type="button"
          className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition shadow-lg shadow-blue-500/25 cursor-pointer"
        >
          Proceed to Tech Check <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
