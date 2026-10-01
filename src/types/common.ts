/**
 * @file Common primitive types
 * @description Branded types and utility types used throughout the app.
 * Branded types prevent ID-mixing bugs at compile time.
 */

// ─── Branded Primitives ────────────────────────────────────────────────────

declare const __brand: unique symbol;

/** Branded type factory — prevents mixing different ID types */
type Brand<T, TBrand> = T & { readonly [__brand]: TBrand };

export type UserId = Brand<string, 'UserId'>;
export type InterviewId = Brand<string, 'InterviewId'>;
export type QuestionId = Brand<string, 'QuestionId'>;

/** ISO 8601 timestamp string */
export type ISODateString = Brand<string, 'ISODateString'>;

// ─── Utility Types ─────────────────────────────────────────────────────────

/** Makes specified keys optional */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Makes specified keys required */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>;

/** Deep readonly */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/** Nullable wrapper */
export type Nullable<T> = T | null;

/** AsyncState — represents the lifecycle of an async operation */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
