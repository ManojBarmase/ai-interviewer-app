/**
 * @file Enterprise Interview Feature Slice
 * Single Public API surface for the Interview domain.
 * External consumers import from `@/features/interview`.
 */

// ── Components ──
export { ActiveInterviewRoom } from './components/ActiveRoom/ActiveInterviewRoom';
export { WaitingRoom } from './components/WaitingRoom/WaitingRoom';
export {
  InterviewerStage,
  AudioWaveformVisualizer,
  TranscriptHistory,
  InterviewTimer,
  InterviewControls,
} from './components/ActiveRoom';

// ── Store & Selectors ──
export {
  useInterviewStore,
  InterviewPhase,
  selectPhase,
  selectPreviousPhase,
  selectSession,
  selectCurrentQuestion,
  selectCurrentTurnIndex,
  selectTurns,
  selectLiveTranscript,
  selectLastConfidenceScore,
  selectError,
  selectIsListening,
  selectIsProcessing,
  selectIsSpeaking,
  selectIsIdle,
  selectHasError,
  selectProgress,
} from './store/useInterviewStore';

export type {
  InterviewTurn,
  InterviewSession,
  CandidateContext,
  InterviewError,
  InterviewState,
  InterviewActions,
  InterviewStore,
} from './store/useInterviewStore';

// ── Audio Services & STT Architecture ──
export {
  AudioServiceError,
  startRecording,
  stopRecording,
  isRecording,
  speakText,
  stopSpeaking,
  isSpeaking,
  getAudioCapabilities,
  getAvailableVoices,
  updateSessionTranscript,
  getSessionTranscript,
  WebSpeechSTTProvider,
  AudioStreamSTTProvider,
  HybridSTTOrchestrator,
  STTFactory,
} from './services/audioService';

export type {
  AudioErrorCode,
  AudioCapabilities,
  RecordingCallbacks,
  RecordingOptions,
  SpeakOptions,
  VoiceDescriptor,
} from './services/audioService';

export type {
  ISTTProvider,
  STTCallbacks,
  STTOptions,
  STTErrorPayload,
  STTProviderStatus,
  CircuitBreakerState,
} from './contracts/stt.interface';

// ── Personas & Constants ──
export {
  INTERVIEWERS,
  INTERVIEWERS_MAP,
  DEFAULT_INTERVIEWER,
  DEFAULT_INTERVIEWER_ID,
  getInterviewerPersona,
  buildOpeningGreeting,
} from './constants/personas';

export type { Interviewer } from './constants/personas';
