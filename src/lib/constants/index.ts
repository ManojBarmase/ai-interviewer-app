/**
 * @file App-wide constants
 * @description Central location for all magic strings, numeric constants,
 * and route definitions. Never use raw strings in feature code.
 */

export const APP_NAME = 'AI Interviewer' as const;
export const APP_VERSION = '0.1.0' as const;

/** Route constants — strictly synchronized with Next.js App Router paths */
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  SETUP: '/dashboard/setup',
  SESSIONS: '/dashboard/sessions',
  QUESTIONS: '/dashboard/questions',
  REPORT: (id: string) => `/dashboard/report/${id}`,
  REPORT_BASE: '/dashboard/report',
  INTERVIEW: '/interview',
  AUTH: {
    SIGN_IN: '/login',
    SIGN_UP: '/login',
    SIGN_OUT: '/auth/sign-out',
  },
  API: {
    CHAT: '/api/interview/chat',
    EVALUATE: '/api/interview/evaluate',
    PARSE_RESUME: '/api/parse-resume',
    DEMO_AUTH: '/api/auth/demo',
  },
} as const;

export type RouteKey = keyof typeof ROUTES;

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

// -- Re-export Domain Personas ------------------------------------------------
export {
  INTERVIEWERS,
  INTERVIEWERS_MAP,
  DEFAULT_INTERVIEWER_ID,
  DEFAULT_INTERVIEWER,
} from '@/features/interview/constants/personas';
export type { Interviewer } from '@/features/interview/constants/personas';
