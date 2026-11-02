'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { MicOff } from 'lucide-react';

import { Button } from '@/components/ui';

import {
  INTERVIEWERS_MAP,
  DEFAULT_INTERVIEWER,
  buildOpeningGreeting,
} from '../../constants/personas';
import {
  startRecording,
  stopRecording,
  speakText,
  stopSpeaking,
  updateSessionTranscript,
  registerActiveVADProvider,
  SileroVADProvider,
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
  CandidateAnswerBox,
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
  const phase = useInterviewStore((s) => s.phase);
  const currentQuestion = useInterviewStore((s) => s.currentQuestion);
  const turns = useInterviewStore((s) => s.turns);
  const session = useInterviewStore((s) => s.session);
  const candidateContext = useInterviewStore((s) => s.candidateContext);

  const transitionTo = useInterviewStore((s) => s.transitionTo);
  const setLiveTranscript = useInterviewStore((s) => s.setLiveTranscript);
  const commitTranscript = useInterviewStore((s) => s.commitTranscript);
  const completeTurn = useInterviewStore((s) => s.completeTurn);
  const endInterview = useInterviewStore((s) => s.endInterview);
  const setError = useInterviewStore((s) => s.setError);
  const startSession = useInterviewStore((s) => s.startSession);

  const [aiStreamingText, setAiStreamingText] = useState('');
  const [sttNotice, setSttNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'workspace' | 'live'>(
    'chat',
  );
  const [showSidebar, setShowSidebar] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const evaluationStartedRef = useRef(false);
  const vadProviderRef = useRef<SileroVADProvider | null>(null);
  const [bargeInNotice, setBargeInNotice] = useState<string | null>(null);

  // Ref to CandidateAnswerBox's typewriter flushNow — called before submit to ensure
  // all pending animated words are committed to the store (Invariant 6: Instant Flush on Submit).
  const typewriterFlushRef = useRef<(() => string) | null>(null);
  const lastSubmittedTranscriptRef = useRef('');

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
      if (vadProviderRef.current) {
        void vadProviderRef.current.destroy();
        vadProviderRef.current = null;
      }
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

        const firstQuestion = buildOpeningGreeting(candidateContext);

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
          if (vadProviderRef.current) {
            void vadProviderRef.current.destroy();
            vadProviderRef.current = null;
          }
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

          let response = await fetch('/api/interview/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
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

          if (response.status === 401) {
            try {
              const reauth = await fetch('/api/auth/demo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
              });
              if (reauth.ok) {
                response = await fetch('/api/interview/evaluate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
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
              }
            } catch {
              // Fall through to error handler
            }
          }

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

    // 1. Instantly flush typewriter and obtain full committed text synchronously
    const flushedText = typewriterFlushRef.current?.() || state.liveTranscript;
    const finalAnswer = flushedText.trim();

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    // 2. Abort VAD speech buffers and invalidate any in-flight Whisper requests for this turn
    vadProviderRef.current?.abortTurn();
    stopRecording();

    // 3. Commit clean final answer to Store and transition
    lastSubmittedTranscriptRef.current = finalAnswer;
    state.commitTranscript(finalAnswer, 1.0);
    state.setLiveTranscript('');
    state.transitionTo(InterviewPhase.PROCESSING);
  }, []);

  const handleSkipQuestion = useCallback(() => {
    const state = useInterviewStore.getState();
    if (state.phase !== InterviewPhase.LISTENING || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    vadProviderRef.current?.abortTurn();
    stopRecording();

    lastSubmittedTranscriptRef.current = '[Candidate skipped this question]';
    state.commitTranscript('[Candidate skipped this question]', 1.0);
    state.setLiveTranscript('');
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

    const submittedTranscript =
      lastSubmittedTranscriptRef.current || state.liveTranscript;

    const completedTurnData = {
      question: state.currentQuestion || '',
      rawTranscript: submittedTranscript,
      wordCount: submittedTranscript.split(/\s+/).filter(Boolean).length,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    if (isLastQuestion) {
      baseTranscriptRef.current = '';
      lastSubmittedTranscriptRef.current = '';
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
      content: submittedTranscript || '(Silence)',
    });

    const ac = new AbortController();
    abortControllerRef.current = ac;
    setAiStreamingText('');

    try {
      let response = await fetch('/api/interview/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          messages: historyMessages,
          candidateContext,
        }),
        signal: ac.signal,
      });

      // Enterprise resilience: if unauthorized (e.g. demo cookie dropped or expired),
      // attempt one silent recovery reauth against /api/auth/demo
      if (response.status === 401) {
        try {
          const reauthRes = await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });
          if (reauthRes.ok) {
            response = await fetch('/api/interview/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                sessionId,
                messages: historyMessages,
                candidateContext,
              }),
              signal: ac.signal,
            });
          }
        } catch {
          // Re-auth failed; fallback to standard error handler
        }
      }

      if (!response.ok) {
        if (response.status === 401) {
          setError({
            code: 'SESSION_EXPIRED',
            message:
              'Your authentication session expired. Please sign in or reactivate demo access to continue.',
            retryable: true,
          });
          return;
        }
        throw new Error(
          `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream available in response.');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let streamError: string | null = null;

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
              streamError = parsed.message || 'Stream emitted an error event.';
              break;
            }
          } catch {
            // Ignore incomplete chunks awaiting subsequent bytes
          }
        }

        if (streamError) break;
      }

      if (streamError) {
        setError({
          code: 'AI_RESPONSE_FAILED',
          message: streamError,
          retryable: true,
        });
        return;
      }

      const nextQuestionText = fullText.trim();
      if (nextQuestionText) {
        baseTranscriptRef.current = '';
        lastSubmittedTranscriptRef.current = '';
        updateSessionTranscript('');
        // Guard against race conditions: verify turn index hasn't changed
        if (useInterviewStore.getState().currentTurnIndex === targetTurnIndex) {
          completeTurn(completedTurnData, nextQuestionText);
        }
      } else {
        setError({
          code: 'AI_RESPONSE_FAILED',
          message: 'AI returned an empty response. Please try again.',
          retryable: true,
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[ActiveInterviewRoom] Turn processing failed:',
          err instanceof Error ? err.message : String(err),
        );
      }
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

  const processTurnRef = useRef(processTurn);
  useEffect(() => {
    processTurnRef.current = processTurn;
  }, [processTurn]);

  // -- Synchronize Speech Engine & Phase State Machine ------------------------
  useEffect(() => {
    let isCancelled = false;

    if (phase === InterviewPhase.SPEAKING) {
      // Clean up previous STT session and reset buffers for new question
      stopRecording();
      baseTranscriptRef.current = '';
      lastSubmittedTranscriptRef.current = '';
      updateSessionTranscript('');
      vadProviderRef.current?.updateSessionTranscript('');
      setLiveTranscript('');
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
          if (errCode === 'INTERRUPTED_BY_USER') {
            // Barge-in: candidate interrupted AI speech.
            // Transition store state smoothly to LISTENING without logging error boundary.
            if (
              !isCancelled &&
              useInterviewStore.getState().phase === InterviewPhase.SPEAKING
            ) {
              transitionTo(InterviewPhase.LISTENING);
            }
            return;
          }
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
      isSubmittingRef.current = false;

      // Silero VAD + Groq Whisper serves as primary STT.
      // Fall back to browser STT only if Silero VAD is not active/supported.
      if (!vadProviderRef.current && !isMicMutedRef.current) {
        let stopRec: () => void = () => {};
        try {
          stopRec = startRecording(
            {
              onInterimTranscript: (interimText: string) => {
                if (!isCancelled && !isSubmittingRef.current) {
                  setSttNotice(null);
                  setLiveTranscript(interimText);
                  baseTranscriptRef.current = interimText;
                }
              },
              onFinalTranscript: (finalText: string, confidence: number) => {
                if (!isCancelled && !isSubmittingRef.current) {
                  setSttNotice(null);
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
                  console.warn(
                    '[ActiveInterviewRoom] Speech recognition fallback degradation:',
                    err,
                  );
                  setSttNotice(
                    err.message ||
                      'A network error interrupted speech recognition. Check your connection.',
                  );
                }
              },
              onEnd: () => {},
            },
            {
              language: 'en-US',
              continuous: true,
              existingStream: webcamStreamRef.current ?? undefined,
            },
          );
        } catch (err: unknown) {
          console.warn(
            '[ActiveInterviewRoom] Fallback speech recognition unavailable:',
            err,
          );
        }

        return () => {
          stopRec();
        };
      }
    } else if (phase === InterviewPhase.PROCESSING) {
      stopRecording();
      stopSpeaking();
      const processTimer = setTimeout(() => {
        if (!isCancelled) {
          processTurnRef.current();
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
    isMicMuted,
    currentQuestion,
    transitionTo,
    setLiveTranscript,
    commitTranscript,
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

  // ── Silero VAD Neural Voice Activity Detection & Whisper STT (Mount-Once Lifecycle) ────
  const isVADSessionActive =
    phase !== InterviewPhase.IDLE && phase !== InterviewPhase.EVALUATING;

  useEffect(() => {
    if (!isVADSessionActive) {
      return;
    }

    let isDisposed = false;
    const vad = new SileroVADProvider();
    vadProviderRef.current = vad;
    registerActiveVADProvider(vad);

    vad
      .start(
        {
          onInterimTranscript: (interimText: string) => {
            if (
              !isDisposed &&
              !isMicMutedRef.current &&
              !isSubmittingRef.current &&
              useInterviewStore.getState().phase === InterviewPhase.LISTENING
            ) {
              setSttNotice(null);
              setLiveTranscript(interimText);
              baseTranscriptRef.current = interimText;
            }
          },
          onFinalTranscript: (finalText: string, confidence: number) => {
            if (
              !isDisposed &&
              !isMicMutedRef.current &&
              !isSubmittingRef.current &&
              useInterviewStore.getState().phase === InterviewPhase.LISTENING
            ) {
              setSttNotice(null);
              setLiveTranscript(finalText);
              baseTranscriptRef.current = finalText;
              commitTranscript(finalText, confidence);
            }
          },
          onError: (err) => {
            if (!isDisposed) {
              console.warn('[SileroVAD] Detection error/warning:', err);
              if (
                err.code !== 'NO_SPEECH_DETECTED' &&
                err.code !== 'RECOGNITION_ABORTED'
              ) {
                setSttNotice(
                  err.message || 'Speech recognition degradation detected.',
                );
              }
            }
          },
          onEnd: () => {},
          onSpeechStart: () => {
            if (isDisposed || isMicMutedRef.current) return;
            const currentPhase = useInterviewStore.getState().phase;

            if (currentPhase === InterviewPhase.SPEAKING) {
              // ── Dynamic Barge-In (Interruption Handling) ─────────────────
              setBargeInNotice('Candidate interrupted — Listening to you...');
              setTimeout(() => {
                if (!isDisposed) setBargeInNotice(null);
              }, 2200);

              stopSpeaking('INTERRUPTED_BY_USER');
              transitionTo(InterviewPhase.LISTENING);
            }
          },
          // Enterprise Rule: Turn progression is strictly driven by candidate manual submission
          // via the "Submit answer" button. Auto-submit on silence is intentionally omitted.
        },
        {
          positiveSpeechThreshold: 0.8,
          negativeSpeechThreshold: 0.35,
          redemptionFrames: 8,
          transcribeWithWhisper: true,
          existingStream: webcamStreamRef.current ?? undefined,
        },
      )
      .catch((err: unknown) => {
        if (!isDisposed) {
          console.warn('[SileroVAD] Initialization notice:', err);
        }
      });

    return () => {
      isDisposed = true;
      registerActiveVADProvider(null);
      void vad.destroy();
      if (vadProviderRef.current === vad) {
        vadProviderRef.current = null;
      }
    };
  }, [isVADSessionActive, transitionTo, setLiveTranscript, commitTranscript]);

  // Teardown VAD immediately when interview is completed or evaluating
  useEffect(() => {
    if (phase === InterviewPhase.EVALUATING || phase === InterviewPhase.IDLE) {
      if (vadProviderRef.current) {
        void vadProviderRef.current.destroy();
        vadProviderRef.current = null;
      }
    }
  }, [phase]);

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
        experience={candidateContext?.experience || 'Senior'}
        difficulty={candidateContext?.difficulty || 'Medium'}
        interviewType={candidateContext?.interviewType || 'Full loop'}
        timeLimit={candidateContext?.timeLimit}
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

              {/* Dynamic Barge-In Interruption Notice */}
              {bargeInNotice && (
                <div className="flex items-center gap-2 mb-3 px-3.5 py-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs animate-fadeIn shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping shrink-0" />
                  <span className="font-semibold">{bargeInNotice}</span>
                </div>
              )}

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

              {/* Speech Recognition Network/Degradation Fallback Notice */}
              {isListening && !isMicMuted && sttNotice && (
                <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                    <span>
                      {sttNotice}{' '}
                      <span className="text-white/80 font-medium">
                        You can continue typing your answer directly below.
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSttNotice(null);
                      stopRecording();
                      setTimeout(() => {
                        if (!isMicMutedRef.current) {
                          try {
                            startRecording(
                              {
                                onInterimTranscript: (text: string) => {
                                  if (
                                    !isMicMutedRef.current &&
                                    !isSubmittingRef.current &&
                                    useInterviewStore.getState().phase ===
                                      InterviewPhase.LISTENING
                                  ) {
                                    setSttNotice(null);
                                    setLiveTranscript(text);
                                    baseTranscriptRef.current = text;
                                  }
                                },
                                onFinalTranscript: (
                                  text: string,
                                  conf: number,
                                ) => {
                                  if (
                                    !isMicMutedRef.current &&
                                    !isSubmittingRef.current &&
                                    useInterviewStore.getState().phase ===
                                      InterviewPhase.LISTENING
                                  ) {
                                    setSttNotice(null);
                                    setLiveTranscript(text);
                                    baseTranscriptRef.current = text;
                                    commitTranscript(text, conf);
                                  }
                                },
                                onError: (err) => {
                                  if (
                                    err.code !== 'RECOGNITION_ABORTED' &&
                                    err.code !== 'NO_SPEECH_DETECTED'
                                  ) {
                                    setSttNotice(
                                      err.message ||
                                        'A network error interrupted speech recognition. Check your connection.',
                                    );
                                  }
                                },
                                onEnd: () => {},
                                onProviderChange: (providerName: string) => {
                                  if (
                                    providerName === 'AudioStreamSTTProvider'
                                  ) {
                                    setSttNotice(
                                      'Switched to resilient audio stream due to network instability.',
                                    );
                                  }
                                },
                              },
                              {
                                language: 'en-US',
                                continuous: true,
                                existingStream:
                                  webcamStreamRef.current ?? undefined,
                              },
                            );
                          } catch {
                            // Ignored
                          }
                        }
                      }, 50);
                    }}
                    className="text-[11px] underline font-semibold hover:text-white shrink-0 ml-2 cursor-pointer"
                  >
                    Retry Mic
                  </button>
                </div>
              )}

              {/* Render-Isolated Candidate Answer Workspace */}
              <CandidateAnswerBox
                isListening={isListening}
                isSubmitting={isSubmitting}
                isMicMuted={isMicMuted}
                flushRef={typewriterFlushRef}
              />
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
