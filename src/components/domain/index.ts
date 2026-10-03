/**
 * @file Domain component barrel export
 * @description Re-exports all domain/feature-specific components.
 * These are business-logic-aware components tied to specific domains
 * (e.g., interview, auth, dashboard). Organize by feature subfolder.
 * Add new domain components here to expose them via @/components/domain
 */

// Example: export { InterviewCard } from './interview/InterviewCard/InterviewCard';
// Example: export { QuestionPanel } from './interview/QuestionPanel/QuestionPanel';
// Example: export { AuthGuard } from './auth/AuthGuard/AuthGuard';
export { ActiveInterviewRoom } from "./Interview/ActiveInterviewRoom";
