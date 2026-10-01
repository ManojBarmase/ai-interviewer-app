/**
 * @file hooks barrel export
 * @description Custom React hooks. Hooks should be pure, reusable, and
 * focused on a single concern.
 *
 * Categories:
 *  - use<Domain>/ → Domain-specific hooks (useInterview, useAuth)
 *  - useMedia/    → Media query / responsive hooks
 *  - useAsync/    → Async state management utilities
 *
 * Memory-Leak Rules (enforced by ESLint react-hooks/exhaustive-deps):
 *  - Always clean up subscriptions in useEffect return
 *  - Always cancel pending async operations on unmount
 *  - Use AbortController for fetch cancellation
 */

// Example: export { useDebounce } from './useDebounce/useDebounce';
// Example: export { useLocalStorage } from './useLocalStorage/useLocalStorage';
// Example: export { useMediaQuery } from './useMediaQuery/useMediaQuery';
export {};
