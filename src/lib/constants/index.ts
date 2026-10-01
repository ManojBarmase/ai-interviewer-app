/**
 * @file App-wide constants
 * @description Central location for all magic strings, numeric constants,
 * and route definitions. Never use raw strings in feature code.
 */

export const APP_NAME = 'AI Interviewer' as const;
export const APP_VERSION = '0.1.0' as const;

/** Route constants — prevents hardcoded strings across the codebase */
export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  INTERVIEW: '/interview',
  RESULTS: '/results',
  AUTH: {
    SIGN_IN: '/auth/sign-in',
    SIGN_UP: '/auth/sign-up',
    SIGN_OUT: '/auth/sign-out',
  },
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];

/** HTTP status codes as typed constants */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
