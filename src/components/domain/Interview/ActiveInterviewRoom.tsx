"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useInterviewStore, InterviewPhase } from "@/store/useInterviewStore";
import {
  startRecording,
  stopRecording,
  speakText,
  stopSpeaking,
} from "@/services/audioService";
import { Button, Card, CardBody } from "@/components/ui";

/**
 * Visualizer Component
 * Displays a minimal CSS-based audio wave that animates during
 * LISTENING or SPEAKING phases.
 */
function AudioVisualizer({ isActive, colorClass }: { isActive: boolean; colorClass: string }) {
  // A simple 5-bar visualizer using Tailwind's animate-pulse and varying delays.
  return (
    <div className="flex items-center justify-center gap-1.5 h-12 my-6">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={[
            "w-2 rounded-full transition-all duration-300",
            colorClass,
            isActive ? "animate-pulse" : "h-2",
          ].join(" ")}
          style={{
            // When active, vary the height of the bars
            height: isActive ? ["60%", "100%", "70%", "100%", "50%"][i] : "8px",
            animationDelay: `${i * 150}ms`,
            animationDuration: "800ms",
          }}
        />
      ))}
    </div>
  );
}

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
  } = useInterviewStore();

  const [aiStreamingText, setAiStreamingText] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Hardware Lifecycle Cleanup (Mount / Unmount) ─────────────────────────
  // Instantly disconnect mic and speaker when the user navigates away or closes.
  useEffect(() => {
    return () => {
      stopRecording();
      stopSpeaking();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ── Evaluation Phase Handler ────────────────────────────────────────────────
  useEffect(() => {
    if (phase === InterviewPhase.EVALUATING) {
      const evaluateSession = async () => {
        try {
          const state = useInterviewStore.getState();
          const sessionId = state.session?.sessionId;
          
          if (!sessionId) {
            transitionTo(InterviewPhase.IDLE);
            return;
          }

          // Build a readable transcript from turns
          let transcript = state.turns
            .map(t => `Interviewer: ${t.question}\nCandidate: ${t.rawTranscript || "(Silence)"}`)
            .join("\n\n");

          // Include the current active turn which hasn't been saved to 'turns' yet
          if (state.currentQuestion) {
            const separator = transcript ? "\n\n" : "";
            transcript += `${separator}Interviewer: ${state.currentQuestion}\nCandidate: ${state.liveTranscript || "(Silence)"}`;
          }
          
          transcript = transcript.trim();

          const response = await fetch("/api/interview/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              userId: "test-user-id", // Match the mocked auth from chat route
              transcript,
            }),
          });

          if (!response.ok) {
            // Attempt to extract the real error message from the API response
            const errorData = await response.json().catch(() => null);
            const apiError = errorData?.error?.message || errorData?.error || response.statusText;
            throw new Error(`Evaluation failed: ${apiError}`);
          }
          
          const data = await response.json();
          console.log("Evaluation Result:", data);
          
          // Evaluation completed successfully. In a real app, you might redirect to a Scorecard page.
          // For now, we transition back to IDLE so the user can start a new interview.
          alert(`Interview Evaluated!\nTechnical Score: ${data.evaluation.technicalScore}/10\nCommunication: ${data.evaluation.communicationScore}/10`);
          transitionTo(InterviewPhase.IDLE);
          
        } catch (error: any) {
          console.error("Evaluation error:", error.message);
          setError({
            code: "AI_RESPONSE_FAILED",
            message: error.message || "Failed to evaluate the interview.",
            retryable: true,
          });
        }
      };

      evaluateSession();
    }
  }, [phase, transitionTo, setError]);

  // ── Phase Machine Effects ──────────────────────────────────────────────────

  // Handle API streaming during PROCESSING
  const processTurn = useCallback(async () => {
    if (phase !== InterviewPhase.PROCESSING) return;

    // Use current store state for history to ensure freshness
    const state = useInterviewStore.getState();
    const sessionId = state.session?.sessionId ?? "dev-session-id";
    const historyMessages = state.turns.flatMap((t) => [
      { role: "model" as const, content: t.question || "..." },
      { role: "user" as const, content: t.rawTranscript || "(Silence)" },
    ]);
    // Add current turn context
    historyMessages.push({
      role: "model" as const,
      content: state.currentQuestion || "...",
    });
    historyMessages.push({
      role: "user" as const,
      content: state.liveTranscript || "(Silence)",
    });

    const ac = new AbortController();
    abortControllerRef.current = ac;
    setAiStreamingText("");

    console.log("Sending chat request with payload:", JSON.stringify({ sessionId, messages: historyMessages }, null, 2));

    try {
      const response = await fetch("/api/interview/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          messages: historyMessages,
        }),
        signal: ac.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const apiError = errorData?.error || response.statusText;
        throw new Error(`API Error: ${response.status} ${apiError}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullResponse = "";

      if (reader) {
        let done = false;
        let sseBuffer = "";
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (value) {
            sseBuffer += decoder.decode(value, { stream: true });

            // SSE events are separated by double newlines (\n\n)
            let eventEndIndex;
            while ((eventEndIndex = sseBuffer.indexOf("\n\n")) >= 0) {
              // Extract a single complete SSE event payload
              const sseEventStr = sseBuffer.slice(0, eventEndIndex);
              // Remove the processed event from the buffer
              sseBuffer = sseBuffer.slice(eventEndIndex + 2);

              const lines = sseEventStr.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  const dataRaw = line.substring(6).trim();
                  if (!dataRaw) continue;
                  try {
                    const event = JSON.parse(dataRaw);
                    if (event.type === "chunk" && event.text) {
                      fullResponse += event.text;
                      setAiStreamingText((prev) => prev + event.text);
                    } else if (event.type === "error") {
                      throw new Error(event.message || "Streaming error");
                    }
                  } catch (e) {
                    if (e instanceof SyntaxError) {
                      console.error("Failed to parse SSE event JSON:", dataRaw);
                    } else {
                      throw e; // Bubble up actual errors (like our custom error type)
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (!fullResponse.trim()) {
        throw new Error("AI returned an empty response.");
      }

      completeTurn({
        question: fullResponse.trim(),
        rawTranscript: state.liveTranscript,
        wordCount: state.liveTranscript.split(/\s+/).filter(Boolean).length,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
      // completeTurn automatically transitions to SPEAKING (or IDLE if done)
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError({
        code: "AI_RESPONSE_FAILED",
        message: err.message ?? "Failed to get AI response",
        retryable: true,
      });
    } finally {
      abortControllerRef.current = null;
    }
  }, [phase, completeTurn, setError]);

  // STT / TTS Phase driver
  useEffect(() => {
    switch (phase) {
      case InterviewPhase.SPEAKING:
        if (currentQuestion) {
          speakText(currentQuestion, {
            language: "en-US",
          })
            .then(() => {
              transitionTo(InterviewPhase.LISTENING);
            })
            .catch((err) => {
              if (err.code !== "SYNTHESIS_CANCELLED") {
                setError({
                  code: "TTS_FAILED",
                  message: "Failed to play AI audio.",
                  retryable: true,
                });
              }
            });
        } else {
          // Fallback if there's no question queued
          transitionTo(InterviewPhase.IDLE);
        }
        break;

      case InterviewPhase.LISTENING:
        const stopRec = startRecording(
          {
            onInterimTranscript: (text) => setLiveTranscript(text),
            onFinalTranscript: (text, conf) => commitTranscript(text, conf),
            onError: (err) => {
              // Ignore aborts
              if (err.code !== "RECOGNITION_ABORTED") {
                setError({
                  code: err.code as any, // Typecast since some STT codes map directly
                  message: err.message,
                  retryable: true,
                });
              }
            },
            onEnd: () => {
              // Only move to processing if we are still LISTENING (not error'd out)
              if (useInterviewStore.getState().phase === InterviewPhase.LISTENING) {
                transitionTo(InterviewPhase.PROCESSING);
              }
            },
          },
          { language: "en-US", continuous: false, silenceTimeoutMs: 2000 }
        );
        return () => {
          stopRec();
        };

      case InterviewPhase.PROCESSING:
        processTurn();
        break;

      case InterviewPhase.IDLE:
      case InterviewPhase.ERROR:
      case InterviewPhase.EVALUATING:
        stopRecording();
        stopSpeaking();
        break;
    }

    // TS requires explicit return for `noImplicitReturns` because one case returns a cleanup fn
    return undefined;
  }, [
    phase,
    currentQuestion,
    transitionTo,
    setLiveTranscript,
    commitTranscript,
    processTurn,
    setError,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isListening = phase === InterviewPhase.LISTENING;
  const isSpeaking = phase === InterviewPhase.SPEAKING;
  const isProcessing = phase === InterviewPhase.PROCESSING;

  // Determine visualizer active state and color
  const visualizerActive = isListening || isSpeaking || isProcessing;
  let visualizerColor = "bg-brand-500";
  if (isListening) visualizerColor = "bg-success";
  else if (isSpeaking) visualizerColor = "bg-info";
  else if (isProcessing) visualizerColor = "bg-brand-300";

  return (
    <Card className="w-full max-w-3xl mx-auto mt-12" variant="elevated" size="lg">
      <CardBody className="flex flex-col items-center min-h-[400px]">
        {/* Header / Status indicator */}
        <div className="w-full flex justify-between items-center mb-8">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-text-primary">
              {phase === InterviewPhase.IDLE && "Ready"}
              {phase === InterviewPhase.LISTENING && "Listening..."}
              {phase === InterviewPhase.PROCESSING && "Thinking..."}
              {phase === InterviewPhase.SPEAKING && "AI is Speaking..."}
              {phase === InterviewPhase.ERROR && "Error"}
            </h2>
            {session && phase !== InterviewPhase.IDLE && phase !== InterviewPhase.EVALUATING && (
              <span className="text-sm text-text-muted">
                Question {turns.length + 1}
              </span>
            )}
          </div>

          <Button
            variant="danger-outline"
            size="sm"
            onClick={() => endInterview()}
            disabled={phase === InterviewPhase.IDLE || phase === InterviewPhase.EVALUATING}
          >
            End Session
          </Button>
        </div>

        {/* Dynamic Visualizer & Transcript or Start Button */}
        {phase === InterviewPhase.IDLE ? (
          <div className="w-full flex-1 flex flex-col items-center justify-center pb-6">
            <Button
              variant="primary"
              size="lg"
              onClick={async () => {
                try {
                  // Explicitly ask for microphone permission here on user click.
                  // This guarantees the browser popup will appear.
                  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                  // Instantly stop the tracks; we just needed the permission granted.
                  stream.getTracks().forEach((t) => t.stop());

                  startSession(
                    {
                      sessionId: crypto.randomUUID(),
                      startedAt: new Date().toISOString(),
                    },
                    "Hello! I am your AI interviewer. To get started, could you please introduce yourself?"
                  );
                } catch (err: any) {
                  // Display the exact error to distinguish between NotAllowedError (blocked) 
                  // and NotFoundError (no microphone hardware connected).
                  let exactMessage = "Microphone permission is required. Please allow it in your browser settings.";
                  if (err.name === "NotFoundError" || err.message?.includes("requested device not found")) {
                    exactMessage = "No microphone detected. Please plug in a microphone and try again.";
                  } else if (err.message) {
                    exactMessage = `Microphone error: ${err.name} - ${err.message}`;
                  }
                  
                  setError({
                    code: "NOT_ALLOWED",
                    message: exactMessage,
                    retryable: true,
                  });
                }
              }}
            >
              Start Interview
            </Button>
            <p className="mt-4 text-sm text-text-muted">
              Ensure your microphone is connected and you are in a quiet room.
            </p>
          </div>
        ) : phase === InterviewPhase.ERROR ? (
          <div className="w-full flex-1 flex flex-col items-center justify-center pb-6">
            <div className="text-error bg-error-bg px-4 py-3 rounded-md mb-4 text-center max-w-lg">
              <p className="font-semibold mb-1">An error occurred</p>
              <p className="text-sm">
                {useInterviewStore.getState().error?.message || "Unknown STT/TTS or Network Error."}
              </p>
            </div>
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
        ) : phase === InterviewPhase.EVALUATING ? (
          <div className="w-full flex-1 flex flex-col items-center justify-center pb-6">
            <h3 className="text-xl font-bold mb-4 text-brand-400 animate-pulse">Evaluating Interview...</h3>
            <p className="text-text-muted text-center max-w-lg mb-6">
              Our Senior AI Engineering Manager is analyzing your responses. Please wait...
            </p>
          </div>
        ) : (
          <>
            <AudioVisualizer isActive={visualizerActive} colorClass={visualizerColor} />

            {/* Transcript / Subtitles Area */}
            <div className="w-full flex-1 flex flex-col justify-end text-center pb-6">
              {/* Show the AI's question if speaking or processing */}
              {(isSpeaking || isProcessing) && (
                <div className="mb-6 px-4">
                  <p className="text-sm text-text-muted mb-1 font-semibold">Interviewer</p>
                  <p className="text-lg text-text-primary">
                    {isProcessing && aiStreamingText ? aiStreamingText : currentQuestion}
                  </p>
                </div>
              )}

              {/* Show user's live transcript */}
              {(isListening || (isProcessing && !aiStreamingText)) && (
                <div className="px-4">
                  <p className="text-sm text-success mb-1 font-semibold">You</p>
                  <p className="text-xl font-medium text-text-primary">
                    {liveTranscript || <span className="opacity-50">Speak now...</span>}
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
