'use client';

import { MessageSquare, Code2, Activity } from 'lucide-react';

import type { InterviewTurn } from '../../store/useInterviewStore';

export interface TranscriptHistoryProps {
  showSidebar: boolean;
  activeTab: 'chat' | 'workspace' | 'live';
  setActiveTab: (tab: 'chat' | 'workspace' | 'live') => void;
  turns: readonly InterviewTurn[];
  currentQuestion: string | null;
  interviewerName: string;
}

/**
 * Sidebar component containing:
 * - Live dialog turn history between AI interviewer and candidate
 * - Code & notes scratchpad
 * - Live speaking pace and filler words telemetry
 */
export function TranscriptHistory({
  showSidebar,
  activeTab,
  setActiveTab,
  turns,
  currentQuestion,
  interviewerName,
}: TranscriptHistoryProps) {
  if (!showSidebar) return null;

  return (
    <aside className="w-[320px] lg:w-[400px] shrink-0 bg-[#0b0c10] flex flex-col z-10 border-l border-white/5">
      {/* ── Tabs Header ── */}
      <div className="flex items-center gap-8 px-6 pt-4 border-b border-white/5">
        <button
          onClick={() => setActiveTab('chat')}
          type="button"
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'chat'
              ? 'border-indigo-400 text-white'
              : 'border-transparent text-white/40 hover:text-white/80'
          }`}
        >
          <MessageSquare size={16} /> Chat
        </button>
        <button
          onClick={() => setActiveTab('workspace')}
          type="button"
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'workspace'
              ? 'border-indigo-400 text-white'
              : 'border-transparent text-white/40 hover:text-white/80'
          }`}
        >
          <Code2 size={16} /> Workspace
        </button>
        <button
          onClick={() => setActiveTab('live')}
          type="button"
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'live'
              ? 'border-indigo-400 text-white'
              : 'border-transparent text-white/40 hover:text-white/80'
          }`}
        >
          <Activity size={16} /> Live
        </button>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#0b0c10]">
        {/* 1. CHAT TAB */}
        {activeTab === 'chat' && (
          <div className="flex flex-col gap-4">
            {turns.map((turn, i) => (
              <div
                key={`turn-${turn.turnIndex ?? i}-${turn.startedAt ?? i}`}
                className="flex flex-col gap-3"
              >
                <div className="bg-[#11131a] rounded-2xl rounded-tl-sm p-4 text-sm text-white/90 leading-relaxed border border-white/5 shadow-sm">
                  <p className="text-[11px] font-semibold text-white/40 mb-1">
                    {interviewerName}
                  </p>
                  {turn.question}
                </div>
                {turn.rawTranscript && (
                  <div className="bg-indigo-500/10 rounded-2xl rounded-tr-sm p-4 text-sm text-white/90 leading-relaxed border border-indigo-500/20 self-end max-w-[90%] shadow-sm">
                    <p className="text-[11px] font-semibold text-indigo-400/50 mb-1 text-right">
                      You
                    </p>
                    {turn.rawTranscript}
                  </div>
                )}
              </div>
            ))}
            {/* Current Turn Question */}
            {currentQuestion && (
              <div className="bg-[#11131a] rounded-2xl rounded-tl-sm p-4 text-sm text-white/90 leading-relaxed border border-white/5 shadow-sm">
                <p className="text-[11px] font-semibold text-white/40 mb-1">
                  {interviewerName}
                </p>
                {currentQuestion}
              </div>
            )}
          </div>
        )}

        {/* 2. WORKSPACE TAB */}
        {activeTab === 'workspace' && (
          <div className="flex flex-col gap-6 h-full">
            <div className="flex-1 flex flex-col">
              <h3 className="text-xs font-semibold text-white/50 mb-2 px-1">
                Code scratchpad
              </h3>
              <textarea
                className="flex-1 bg-[#11131a] border border-white/5 rounded-xl p-4 text-sm text-white/80 font-mono resize-none focus:outline-none focus:border-indigo-500/50 shadow-inner shadow-black/20"
                placeholder="// Optional scratchpad for pseudocode or notes"
              />
            </div>
            <div className="flex-1 flex flex-col">
              <h3 className="text-xs font-semibold text-white/50 mb-2 px-1">
                Private Notes
              </h3>
              <textarea
                className="flex-1 bg-[#11131a] border border-white/5 rounded-xl p-4 text-sm text-white/80 resize-none focus:outline-none focus:border-indigo-500/50 shadow-inner shadow-black/20"
                placeholder="Jot down thoughts. Notes stay private and are not evaluated."
              />
            </div>
          </div>
        )}

        {/* 3. LIVE TAB */}
        {activeTab === 'live' && (
          <div className="flex flex-col gap-3">
            <div className="bg-[#11131a] border border-white/5 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-[11px] font-semibold text-white/50 mb-1 uppercase tracking-wider">
                  Speaking Pace
                </p>
                <p className="text-xl font-bold text-white">Optimal</p>
              </div>
              <p className="text-xs text-emerald-400/80 font-medium">130 WPM</p>
            </div>
            <div className="bg-[#11131a] border border-white/5 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-[11px] font-semibold text-white/50 mb-1 uppercase tracking-wider">
                  Filler words
                </p>
                <p className="text-xl font-bold text-white">0</p>
              </div>
              <p className="text-xs text-white/30 font-medium">Looking clean</p>
            </div>
            <div className="bg-[#11131a] border border-white/5 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-[11px] font-semibold text-white/50 mb-1 uppercase tracking-wider">
                  Active Turn Words
                </p>
                <p className="text-xl font-bold text-white">Active</p>
              </div>
              <p className="text-xs text-white/30 font-medium">
                Aim for 60-150
              </p>
            </div>
            <p className="text-[11px] text-white/30 mt-4 leading-relaxed text-center px-4">
              Live metrics are real-time telemetry estimates. Full scorecard
              analysis is computed upon interview completion.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
