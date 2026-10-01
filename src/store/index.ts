/**
 * @file store barrel export
 * @description Global client-side state management.
 * Use Zustand slices per domain for scalable state.
 *
 * Conventions:
 *  - One slice per domain (auth, interview, ui, etc.)
 *  - Slices are typed with StoreSlice<T> pattern
 *  - Never put server state here — use React Query / SWR instead
 *  - Selectors live alongside slices for memoized access
 */

// Example: export { useAuthStore } from './auth/auth.store';
// Example: export { useInterviewStore } from './interview/interview.store';
// Example: export { useUIStore } from './ui/ui.store';
export {};
