'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { MicOff } from 'lucide-react';

import { Button } from '@/components/ui';

import {
  INTERVIEWERS_MAP,
  DEFAULT_INTERVIEWER,
} from '../../constants/personas';
import {
  startRecording,
  stopRecording,
  speakText,
  stopSpeaking,
  updateSessionTranscript,
} from '../../services/audioService';
import {
  useInterviewStore,
  InterviewPhase,
} from '../../store/useInterviewStore';

import {
  InterviewerStage,
  AudioWaveformVisualizer,
  TranscriptHistory,
  InterviewTimer,
  InterviewControls,
} from './';

/**
 * Enterprise Active Interview Room Orchestrator
 *
 * Coordinates WebRTC audio/video hardware streams, Web Speech API speech-to-text / text-to-speech,
 * and the Interview state machine, delegating presentation to focused subcomponents:
 * - InterviewTimer: Progress & live elapsed timer
 * - InterviewerStage: Avatar & video arena
 * - AudioWaveformVisualizer: Voice activity indicator
 * - TranscriptHistory: Chat history, scratchpad & live metrics
 * - InterviewControls: Dock controls, turn submissions & modals
 */
export function ActiveInterviewRoom() {
  const {
    phase,
    liveTranscript,
    currentQuestion,
    transitionTo,
    setLiveTranscript,
    commitTranscript,
    completeTurn,
    endInterview,
    setError,
    turns,
    session,
    startSession,
    candidateContext,
  } = useInterviewStore();

  const [aiStreamingText, setAiStreamingText] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'workspace' | 'live'>(
    'chat',
  );
  const [showSidebar, setShowSidebar] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const evaluationStartedRef = useRef(false);

  // -- Submission Mutex Locks & Turn Transition Guards -----------------------
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const isProcessingTurnRef = useRef(false);

  // -- Webcam & Mic Hardware state --------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const isMicMutedRef = useRef(false);
  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);
  const baseTranscriptRef = useRef('');

  // -- Start webcam ------------------------------------------------------------
  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMicMutedRef.current;
      });
      webcamStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOn(true);
    } catch (err) {
      console.warn('Webcam unavailable, falling back to audio only:', err);
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        audioStream.getAudioTracks().forEach((track) => {
          track.enabled = !isMicMutedRef.current;
        });
        webcamStreamRef.current = audioStream;
        setIsCameraOn(false);
      } catch {
        setError({
          code: 'MIC_PERMISSION_DENIED',
          message:
            'Microphone permission is required. Please allow it in your browser settings.',
          retryable: true,
        });
      }
    }
  }, [setError]);

  // -- Toggle camera ----------------------------------------------------------
  const toggleCamera = useCallback(() => {
    const stream = webcamStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;
    const firstTrack = videoTracks[0];
    if (!firstTrack) return;
    const enabled = !firstTrack.enabled;
    firstTrack.enabled = enabled;
    setIsCameraOn(enabled);
  }, []);

  // -- Toggle mic mute --------------------------------------------------------
  const toggleMicMute = useCallback(() => {
    setIsMicMuted((prev) => {
      const nextMuted = !prev;
      isMicMutedRef.current = nextMuted;

      if (webcamStreamRef.current) {
        webcamStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = !nextMuted;
        });
      }

      if (nextMuted) {
        stopRecording();
      }

      return nextMuted;
    });
  }, []);

  // -- Hardware Lifecycle Cleanup ---------------------------------------------
  useEffect(() => {
    return () => {
      stopRecording();
      stopSpeaking();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (webcamStreamRef.current) {
        webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // -- Auto-Start Interview on Mount ------------------------------------------
  useEffect(() => {
    if (phase !== InterviewPhase.IDLE) return;
    let isSubscribed = true;

    const initInterview = async () => {
      try {
        await startWebcam();
        if (!isSubscribed) return;

        const roleText = candidateContext?.role || 'a position';
        const firstQuestion = `Hello! I am your AI interviewer. I see you are applying for ${roleText}. To get started, could you please introduce yourself?`;

        const totalQuestions = candidateContext?.numQuestions || 6;
        startSession(
          {
            sessionId: crypto.randomUUID(),
            startedAt: new Date().toISOString(),
            totalQuestions,
          },
          firstQuestion,
        );
      } catch (err: unknown) {
        console.error('Auto-start interview failed:', err);
      }
    };

    initInterview();
    return () => {
      isSubscribed = false;
    };
  }, [phase, startWebcam, startSession, candidateContext]);

  // -- Evaluation Phase Handler ------------------------------------------------
  useEffect(() => {
    if (phase === InterviewPhase.EVALUATING) {
      if (evaluationStartedRef.current) return;
      evaluationStartedRef.current = true;

      const evaluateSession = async () => {
        try {
          stopRecording();
          stopSpeaking();
          if (webcamStreamRef.current) {
            webcamStreamRef.current.getTracks().forEach((t) => t.stop());
            webcamStreamRef.current = null;
          }

          const state = useInterviewStore.getState();
          const sessionId = state.session?.sessionId;

          if (!sessionId) {
            router.push('/dashboard');
            return;
          }

          let transcript = state.turns
            .map(
              (t) =>
                `Interviewer: ${t.question}\nCandidate: ${t.rawTranscript || '(Silence)'}`,
            )
            .join('\n\n');

          const lastRecordedQuestion =
            state.turns[state.turns.length - 1]?.question;
          const activeTurnNotSaved = Boolean(
            state.currentQuestion &&
            state.currentQuestion !== lastRecordedQuestion,
          );
          if (activeTurnNotSaved) {
            const separator = transcript ? '\n\n' : '';
            transcript += `${separator}Interviewer: ${state.currentQuestion}\nCandidate: ${state.liveTranscript || '(Silence)'}`;
          }

          transcript = transcript.trim();

          const allTurns = [...state.turns];
          if (activeTurnNotSaved && state.currentQuestion) {
            allTurns.push({
              turnIndex: state.turns.length,
              question: state.currentQuestion,
              rawTranscript: state.liveTranscript || null,
              wordCount:
                state.liveTranscript?.split(/\s+/).filter(Boolean).length || 0,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            });
          }

          const durationSeconds = state.session?.startedAt
            ? Math.max(
                1,
                Math.round(
                  (Date.now() - new Date(state.session.startedAt).getTime()) /
                    1000,
                ),
              )
            : undefined;

          const response = await fetch('/api/interview/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              transcript,
              turns: allTurns,
              candidateContext: state.candidateContext,
              startedAt: state.session?.startedAt,
              endedAt: new Date().toISOString(),
              durationSeconds,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const apiError =
              errorData?.error?.message ||
              errorData?.error ||
              response.statusText;
            throw new Error(`Evaluation failed: ${apiError}`);
          }

          const data = await response.json();
          if (data.evaluation) {
            sessionStorage.setItem(
              `eval_${sessionId}`,
              JSON.stringify(data.evaluation),
            );
          }

          router.push(`/dashboard/report/${sessionId}`);
        } catch (error: unknown) {
          const errMsg =
            error instanceof Error
              ? error.message
              : 'Failed to evaluate the interview.';
          console.error('Evaluation error:', errMsg);
          setError({
            code: 'AI_RESPONSE_FAILED',
            message: errMsg,
            retryable: true,
          });
        } finally {
          evaluationStartedRef.current = false;
        }
      };

      evaluateSession();
    }
  }, [phase, router, setError]);

  // -- Turn Submission Handlers with Mutex Lock -------------------------------
  const handleSubmitAnswer = useCallback(() => {
    const state = useInterviewStore.getState();
    if (
      state.phase !== InterviewPhase.LISTENING ||
      isSubmittingRef.current ||
      !state.liveTranscript.trim()
    ) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    stopRecording();

    state.commitTranscript(state.liveTranscript.trim(), 1.0);
    state.transitionTo(InterviewPhase.PROCESSING);
  }, []);

  const handleSkipQuestion = useCallback(() => {
    const state = useInterviewStore.getState();
    if (state.phase !== InterviewPhase.LISTENING || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    stopRecording();

    state.commitTranscript('[Candidate skipped this question]', 1.0);
    state.transitionTo(InterviewPhase.PROCESSING);
  }, []);

  // -- Process Turn API Streaming ---------------------------------------------
  const processTurn = useCallback(async () => {
    if (isProcessingTurnRef.current) return;
    const state = useInterviewStore.getState();
    if (state.phase !== InterviewPhase.PROCESSING) return;

    isProcessingTurnRef.current = true;
    const targetTurnIndex = state.currentTurnIndex;
    const totalQuestions =
      state.session?.totalQuestions ?? candidateContext?.numQuestions ?? 6;
    const isLastQuestion = state.turns.length + 1 >= totalQuestions;

    const completedTurnData = {
      question: state.currentQuestion || '',
      rawTranscript: state.liveTranscript,
      wordCount: state.liveTranscript.split(/\s+/).filter(Boolean).length,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    if (isLastQuestion) {
      baseTranscriptRef.current = '';
      updateSessionTranscript('');
      if (useInterviewStore.getState().currentTurnIndex === targetTurnIndex) {
        completeTurn(completedTurnData);
      }
      isProcessingTurnRef.current = false;
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    const sessionId = state.session?.sessionId ?? 'dev-session-id';
    const historyMessages = state.turns.flatMap((t) => [
      { role: 'model' as const, content: t.question || '...' },
      { role: 'user' as const, content: t.rawTranscript || '(Silence)' },
    ]);
    historyMessages.push({
      role: 'model' as const,
      content: state.currentQuestion || '...',
    });
    historyMessages.push({
      role: 'user' as const,
      content: state.liveTranscript || '(Silence)',
    });

    const ac = new AbortController();
    abortControllerRef.current = ac;
    setAiStreamingText('');

    try {
      const response = await fetch('/api/interview/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messages: historyMessages,
          candidateContext,
        }),
        signal: ac.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream available in response.');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          if (jsonStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type === 'chunk' && typeof parsed.text === 'string') {
              fullText += parsed.text;
              setAiStreamingText(fullText);
            } else if (parsed.type === 'error') {
              throw new Error(
                parsed.message || 'Stream emitted an error event.',
              );
            }
          } catch (jsonErr: unknown) {
            const jsonMsg =
              jsonErr instanceof Error ? jsonErr.message : String(jsonErr);
            if (!jsonMsg.includes('JSON')) {
              throw jsonErr;
            }
          }
        }
      }

      const nextQuestionText = fullText.trim();
      if (nextQuestionText) {
        baseTranscriptRef.current = '';
        updateSessionTranscript('');
        // Guard against race conditions: verify turn index hasn't changed
        if (useInterviewStore.getState().currentTurnIndex === targetTurnIndex) {
          completeTurn(completedTurnData, nextQuestionText);
        }
      } else {
        throw new Error('AI returned an empty response.');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Turn processing failed:', err);
      setError({
        code: 'AI_RESPONSE_FAILED',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to generate next interview question.',
        retryable: true,
      });
    } finally {
      isProcessingTurnRef.current = false;
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      abortControllerRef.current = null;
    }
  }, [candidateContext, completeTurn, setError]);

  // -- Synchronize Speech Engine & Phase State Machine ------------------------
  useEffect(() => {
    let isCancelled = false;

    if (phase === InterviewPhase.SPEAKING) {
      // Clean up previous STT session and reset buffers
      stopRecording();
      baseTranscriptRef.current = '';
      updateSessionTranscript('');
      isSubmittingRef.current = false;

      if (!currentQuestion) {
        transitionTo(InterviewPhase.LISTENING);
        return;
      }

      speakText(currentQuestion)
        .then(() => {
          if (
            !isCancelled &&
            useInterviewStore.getState().phase === InterviewPhase.SPEAKING
          ) {
            transitionTo(InterviewPhase.LISTENING);
          }
        })
        .catch((err: { code?: string; message?: string } | Error) => {
          const errCode = 'code' in err ? err.code : '';
          const errMsg = err.message || 'Speech synthesis failed.';
          if (errCode !== 'SYNTHESIS_CANCELLED') {
            setError({
              code: 'TTS_FAILED',
              message: errMsg,
              retryable: true,
            });
            if (!isCancelled) transitionTo(InterviewPhase.LISTENING);
          }
        });
    } else if (phase === InterviewPhase.LISTENING) {
      // Entering listening phase: reset buffers for the candidate's turn
      baseTranscriptRef.current = '';
      updateSessionTranscript('');
      isSubmittingRef.current = false;

      if (isMicMutedRef.current) {
        stopRecording();
        return;
      }

      const stopRec = startRecording(
        {
          onInterimTranscript: (interimText: string) => {
            if (!isCancelled && !isSubmittingRef.current) {
              setLiveTranscript(interimText);
              baseTranscriptRef.current = interimText;
            }
          },
          onFinalTranscript: (finalText: string, confidence: number) => {
            if (!isCancelled && !isSubmittingRef.current) {
              setLiveTranscript(finalText);
              baseTranscriptRef.current = finalText;
              commitTranscript(finalText, confidence);
            }
          },
          onError: (err: { code?: string; message?: string }) => {
            if (
              !isCancelled &&
              err.code !== 'RECOGNITION_ABORTED' &&
              err.code !== 'NO_SPEECH_DETECTED'
            ) {
              setError({
                code: 'STT_FAILED',
                message:
                  err.message || 'Speech recognition encountered an issue.',
                retryable: true,
              });
            }
          },
          onEnd: () => {
            // Enterprise Rule: STT onEnd MUST NEVER auto-submit or skip question.
            // Turn progression is strictly driven by candidate manual submission.
          },
        },
        { language: 'en-US', continuous: true },
      );
      return () => {
        stopRec();
      };
    } else if (phase === InterviewPhase.PROCESSING) {
      stopRecording();
      stopSpeaking();
      const processTimer = setTimeout(() => {
        if (!isCancelled) {
          processTurn();
        }
      }, 0);
      return () => {
        isCancelled = true;
        clearTimeout(processTimer);
        stopSpeaking();
        stopRecording();
      };
    }

    return () => {
      isCancelled = true;
      stopSpeaking();
      stopRecording();
    };
  }, [
    phase,
    currentQuestion,
    transitionTo,
    setLiveTranscript,
    commitTranscript,
    processTurn,
    setError,
  ]);

  // Stream re-attachment
  useEffect(() => {
    if (videoRef.current && webcamStreamRef.current) {
      if (videoRef.current.srcObject !== webcamStreamRef.current) {
        videoRef.current.srcObject = webcamStreamRef.current;
      }
    }
  }, [phase, isCameraOn]);

  // ── Render States ──────────────────────────────────────────────────────────
  const isListening = phase === InterviewPhase.LISTENING;
  const isSpeaking = phase === InterviewPhase.SPEAKING;
  const isProcessing = phase === InterviewPhase.PROCESSING;
  const isInSession = phase !== InterviewPhase.IDLE;

  let phaseLabel = 'Thinking';
  if (isListening) phaseLabel = 'Listening';
  else if (isSpeaking) phaseLabel = 'AI Speaking';

  if (phase === InterviewPhase.IDLE) {
    return (
      <div className="w-full h-screen flex items-center justify-center p-4 bg-[hsl(222,28%,7%)]">
        <div className="flex flex-col items-center gap-4 text-white/50">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium animate-pulse">
            Connecting to AI Interviewer...
          </p>
        </div>
      </div>
    );
  }

  if (phase === InterviewPhase.ERROR) {
    return (
      <div className="w-full h-screen flex items-center justify-center p-6 bg-[#0b0c10] text-center">
        <div className="max-w-md bg-[#12131a] border border-white/10 rounded-2xl p-8 space-y-4">
          <h3 className="text-xl font-bold text-red-400">Interview Error</h3>
          <p className="text-sm text-white/60">
            {useInterviewStore.getState().error?.message ||
              'A network or hardware error occurred.'}
          </p>
          <Button
            variant="primary"
            onClick={() => {
              useInterviewStore.getState().acknowledgeError();
              transitionTo(InterviewPhase.IDLE);
            }}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (phase === InterviewPhase.EVALUATING) {
    return (
      <div className="w-full h-screen flex items-center justify-center p-6 bg-[#0b0c10] text-center">
        <div className="max-w-md bg-[#12131a] border border-white/10 rounded-2xl p-8 space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mx-auto" />
          <h3 className="text-xl font-bold text-indigo-400">
            Evaluating Interview...
          </h3>
          <p className="text-sm text-white/50">
            Our Senior AI Engineering Manager is analyzing your responses.
            Please wait...
          </p>
        </div>
      </div>
    );
  }

  const selectedId = candidateContext?.interviewerId || 'priya';
  const interviewer = INTERVIEWERS_MAP[selectedId] ?? DEFAULT_INTERVIEWER;
  const numQuestions =
    session?.totalQuestions || candidateContext?.numQuestions || 6;
  const roleName = candidateContext?.role || 'Frontend Engineer';

  return (
    <div className="w-full h-screen flex flex-col bg-[#0b0c10] text-slate-100 font-sans overflow-hidden">
      {/* ── 1. Top Header Bar with Timer & Progress ── */}
      <InterviewTimer
        roleName={roleName}
        currentTurn={turns.length + 1}
        totalQuestions={numQuestions}
        isListening={isListening}
        startedAt={session?.startedAt}
        onToggleLayout={() => setShowSidebar((prev) => !prev)}
      />

      {/* ── 2. Main Arena: Stage + Transcript History ── */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col border-r border-white/5 relative bg-[#0b0c10]">
          {/* Main Stage (Interviewer avatar + Self PiP) */}
          <InterviewerStage
            interviewer={interviewer}
            phaseLabel={phaseLabel}
            isListening={isListening}
            isSpeaking={isSpeaking}
            videoRef={videoRef}
            isCameraOn={isCameraOn}
            isMicMuted={isMicMuted}
          />

          {/* QA & Candidate Answer Workspace */}
          <div className="shrink-0 bg-[#0b0c10] p-6 border-t border-white/5">
            <div className="max-w-4xl mx-auto w-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold border border-indigo-500/20">
                    Behavioral
                  </span>
                  <span className="text-xs text-white/50">Active Session</span>
                </div>
                <AudioWaveformVisualizer
                  isActive={isListening || isSpeaking || isProcessing}
                  isListening={isListening}
                  isSpeaking={isSpeaking}
                  isProcessing={isProcessing}
                />
              </div>

              {/* Current Question Display */}
              <h3 className="text-lg font-bold text-white mb-4 leading-relaxed h-[56px] line-clamp-2">
                {isProcessing && aiStreamingText
                  ? aiStreamingText
                  : currentQuestion}
              </h3>

              {/* Muted Privacy Notice */}
              {isListening && isMicMuted && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs animate-fadeIn">
                  <MicOff size={14} className="shrink-0 text-red-400" />
                  <span>
                    Microphone is muted — speech is not being recorded. Click
                    unmute below or type your answer directly.
                  </span>
                </div>
              )}

              {/* Answer Input Box */}
              <div className="w-full bg-[#11131a] border border-indigo-500/30 rounded-xl p-4 min-h-[120px] relative flex flex-col shadow-inner shadow-black/20 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition-all">
                <textarea
                  className="w-full flex-1 bg-transparent border-none text-sm text-white/80 leading-relaxed resize-none focus:outline-none placeholder:text-white/40 custom-scrollbar"
                  placeholder={
                    isMicMuted
                      ? 'Microphone is muted. You can type your answer here, or click unmute below to speak.'
                      : 'Speak your answer. It appears here live. You can also type or edit.'
                  }
                  value={liveTranscript}
                  onChange={(e) => {
                    const text = e.target.value;
                    setLiveTranscript(text);
                    baseTranscriptRef.current = text;
                    updateSessionTranscript(text);
                  }}
                  disabled={!isListening || isSubmitting}
                />
                <div className="self-end mt-2 text-[10px] text-white/40 font-medium">
                  {liveTranscript?.split(' ').filter(Boolean).length || 0} words
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. Bottom Controls Dock & Modals ── */}
          <InterviewControls
            isMicMuted={isMicMuted}
            toggleMicMute={toggleMicMute}
            isCameraOn={isCameraOn}
            toggleCamera={toggleCamera}
            showSidebar={showSidebar}
            setShowSidebar={setShowSidebar}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            isInSession={isInSession}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isSubmitting={isSubmitting}
            liveTranscript={liveTranscript}
            turnsCount={turns.length}
            numQuestions={numQuestions}
            resumeText={candidateContext?.resumeText}
            onRepeatQuestion={() => {
              if (
                currentQuestion &&
                phase === InterviewPhase.LISTENING &&
                !isSubmitting
              ) {
                stopRecording();
                transitionTo(InterviewPhase.SPEAKING);
              }
            }}
            onSkipQuestion={handleSkipQuestion}
            onSubmitAnswer={handleSubmitAnswer}
            onEndInterview={() => endInterview()}
          />
        </div>

        {/* ── 4. Right Sidebar (Dialogue History, Workspace, Live Telemetry) ── */}
        <TranscriptHistory
          showSidebar={showSidebar}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          turns={turns}
          currentQuestion={currentQuestion}
          interviewerName={interviewer.name}
        />
      </div>
    </div>
  );
}
