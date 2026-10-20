'use client';

import { useState } from 'react';

import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Send,
  SkipForward,
  LayoutTemplate,
  SquareChartGantt,
  FileText,
  RefreshCw,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui';

export interface InterviewControlsProps {
  isMicMuted: boolean;
  toggleMicMute: () => void;
  isCameraOn: boolean;
  toggleCamera: () => void;
  showSidebar: boolean;
  setShowSidebar: (val: boolean | ((prev: boolean) => boolean)) => void;
  activeTab: 'chat' | 'workspace' | 'live';
  setActiveTab: (tab: 'chat' | 'workspace' | 'live') => void;
  isInSession: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isSubmitting?: boolean;
  liveTranscript: string;
  turnsCount: number;
  numQuestions: number;
  resumeText?: string | undefined;
  onRepeatQuestion: () => void;
  onSkipQuestion: () => void;
  onSubmitAnswer: () => void;
  onEndInterview: () => void;
}

/**
 * Bottom control dock for hardware management, turn progression, and modals.
 */
export function InterviewControls({
  isMicMuted,
  toggleMicMute,
  isCameraOn,
  toggleCamera,
  showSidebar,
  setShowSidebar,
  activeTab,
  setActiveTab,
  isInSession,
  isListening,
  isSpeaking,
  isSubmitting = false,
  liveTranscript,
  turnsCount,
  numQuestions,
  resumeText,
  onRepeatQuestion,
  onSkipQuestion,
  onSubmitAnswer,
  onEndInterview,
}: InterviewControlsProps) {
  const [showEndModal, setShowEndModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);

  const isFinalQuestion = turnsCount + 1 >= numQuestions;
  const canSkip = isInSession && isListening && !isSpeaking && !isSubmitting;
  const canSubmit =
    isInSession &&
    isListening &&
    !isSpeaking &&
    !isSubmitting &&
    liveTranscript.trim().length > 0;

  return (
    <>
      <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-[#08090a] border-t border-white/5">
        {/* ── Left Controls: Hardware & Toggles ── */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMicMute}
            disabled={!isInSession}
            type="button"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border cursor-pointer ${
              isMicMuted
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25 border-red-500'
                : 'bg-white/5 hover:bg-white/10 text-white border-white/5'
            }`}
            title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <button
            onClick={toggleCamera}
            disabled={!isInSession}
            type="button"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border cursor-pointer ${
              isCameraOn
                ? 'bg-white/5 hover:bg-white/10 text-white border-white/5'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
            title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
          </button>

          <div className="w-px h-6 bg-white/10 mx-2" />

          <button
            onClick={() => setShowSidebar(!showSidebar)}
            disabled={!isInSession}
            type="button"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border cursor-pointer ${
              showSidebar
                ? 'bg-indigo-500 hover:bg-indigo-600 text-white border-indigo-500'
                : 'bg-white/5 hover:bg-white/10 text-white border-white/5'
            }`}
            title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
          >
            <LayoutTemplate size={18} />
          </button>

          <button
            onClick={() => {
              setShowSidebar(true);
              setActiveTab('live');
            }}
            disabled={!isInSession}
            type="button"
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border cursor-pointer ${
              showSidebar && activeTab === 'live'
                ? 'bg-indigo-500 text-white border-indigo-500'
                : 'bg-white/5 hover:bg-white/10 text-white border-white/5'
            }`}
            title="Live metrics"
          >
            <SquareChartGantt size={18} />
          </button>

          <button
            onClick={() => setShowResumeModal(true)}
            disabled={!isInSession}
            type="button"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white border border-white/5 transition-all cursor-pointer"
            title="View Candidate Resume"
          >
            <FileText size={18} />
          </button>

          <button
            onClick={onRepeatQuestion}
            disabled={isSpeaking || isSubmitting || !isInSession}
            type="button"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white border border-white/5 transition-all disabled:opacity-40 cursor-pointer"
            title="Repeat AI Question"
          >
            <RefreshCw size={18} className={isSpeaking ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── Right Controls: Turn Actions & End Session ── */}
        <div className="flex items-center gap-3">
          <button
            onClick={onSkipQuestion}
            disabled={!canSkip}
            type="button"
            className={`px-5 py-2 rounded-lg border font-semibold text-sm transition-colors flex items-center gap-2 ${
              canSkip
                ? 'border-white/10 text-white hover:bg-white/5 cursor-pointer'
                : 'border-white/5 text-white/30 cursor-not-allowed opacity-40'
            }`}
            title={isFinalQuestion ? 'Skip and finish' : 'Skip this question'}
          >
            <SkipForward
              size={16}
              className={canSkip ? 'text-white/60' : 'text-white/30'}
            />{' '}
            Skip
          </button>

          <button
            onClick={onSubmitAnswer}
            disabled={!canSubmit}
            type="button"
            className={`px-6 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 border transition-all ${
              canSubmit
                ? isFinalQuestion
                  ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/25 cursor-pointer'
                  : 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/25 cursor-pointer'
                : 'bg-white/5 text-white/30 border-white/5 cursor-not-allowed'
            }`}
          >
            <Send size={16} />
            {isFinalQuestion ? 'Submit & finish' : 'Submit answer'}
          </button>

          <div className="relative group ml-2">
            <button
              onClick={() => setShowEndModal(true)}
              type="button"
              className="w-12 h-10 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/25 transition-colors cursor-pointer"
              title="End Interview"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ── End Interview Confirmation Modal ── */}
      {showEndModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#161821] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-[#161821]">
              <h3 className="text-xl font-bold text-white">
                End the interview?
              </h3>
              <button
                onClick={() => setShowEndModal(false)}
                type="button"
                className="p-2 -mr-2 text-white/40 hover:text-white rounded-full transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm font-medium text-white/60 mb-3 leading-relaxed">
                {turnsCount === 0
                  ? 'You have not answered anything yet. No report will be created.'
                  : `You have answered ${turnsCount} of ${numQuestions} questions. Ending now will generate your performance scorecard.`}
              </p>
              <p className="text-xs text-white/40">
                You can start a new interview session at any time.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-[#0e0f15]">
              <Button
                variant="ghost"
                onClick={() => setShowEndModal(false)}
                className="text-white hover:bg-white/5"
              >
                Keep going
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setShowEndModal(false);
                  onEndInterview();
                }}
              >
                End interview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resume Preview Modal ── */}
      {showResumeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-3xl bg-[#0b0c10] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#11131a]">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileText size={20} className="text-indigo-400" /> Candidate
                Resume
              </h3>
              <button
                onClick={() => setShowResumeModal(false)}
                type="button"
                className="text-white/40 hover:text-white transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0b0c10]">
              <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-mono">
                {resumeText || 'No resume uploaded for this candidate.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
