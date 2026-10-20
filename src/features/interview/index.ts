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

// ── Audio Services ──
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
} from './services/audioService';

export type {
  AudioErrorCode,
  AudioCapabilities,
  RecordingCallbacks,
  RecordingOptions,
  SpeakOptions,
  VoiceDescriptor,
} from './services/audioService';

// ── Personas & Constants ──
export {
  INTERVIEWERS,
  INTERVIEWERS_MAP,
  DEFAULT_INTERVIEWER,
  DEFAULT_INTERVIEWER_ID,
} from './constants/personas';

export type { Interviewer } from './constants/personas';
