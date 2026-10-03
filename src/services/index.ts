/**
 * @file services barrel export
 * @description All external API communication lives here.
 * Services are plain async functions (or class instances) that
 * call REST/GraphQL APIs. They are framework-agnostic — no React.
 *
 * Naming convention: <Domain>Service  (e.g., InterviewService, AuthService)
 *
 * Rules:
 *  - Never import from @/store or @/components
 *  - Always return typed responses
 *  - Always handle errors with typed error classes
 */

// Example: export { interviewService } from './interview/interview.service';
// Example: export { authService } from './auth/auth.service';
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
} from "./audioService";
