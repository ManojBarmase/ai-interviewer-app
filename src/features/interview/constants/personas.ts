/**
 * @file Interviewer personas definition & metadata
 * Single source of truth for all interviewer configurations, avatars, styles, and prompt identities.
 */

export interface Interviewer {
  id: string;
  name: string;
  title: string;
  avatar: string;
  tag: string;
  tagColor: string;
  desc: string;
}

export const INTERVIEWERS: readonly Interviewer[] = [
  {
    id: 'priya',
    name: 'Priya Nair',
    title: 'Staff Engineer, Northwind',
    avatar: '/ai-avatar.jpg',
    tag: 'Warm',
    tagColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    desc: 'Encouraging and conversational. Great for building confidence.',
  },
  {
    id: 'marcus',
    name: 'Marcus',
    title: 'Engineering Manager, Lumen Labs',
    avatar: '/avatar-marcus.jpg',
    tag: 'Direct',
    tagColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    desc: 'Crisp and to the point. Mirrors a fast-paced product team.',
  },
  {
    id: 'elena',
    name: 'Elena',
    title: 'Principal Architect, Helix Systems',
    avatar: '/avatar-elena.jpg',
    tag: 'Rigorous',
    tagColor: 'text-red-400 bg-red-400/10 border-red-400/20',
    desc: 'Probes assumptions with deeper follow-ups. Big-tech bar.',
  },
  {
    id: 'david',
    name: 'David',
    title: 'Senior Staff Engineer, Atlas Cloud',
    avatar: '/avatar-david.jpg',
    tag: 'Friendly',
    tagColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    desc: 'Relaxed and collaborative. Likes thinking out loud together.',
  },
] as const;

/** Lookup map for O(1) persona retrieval by id */
export const INTERVIEWERS_MAP: Record<string, Interviewer> = Object.fromEntries(
  INTERVIEWERS.map((inv) => [inv.id, inv]),
);

export const DEFAULT_INTERVIEWER_ID = 'priya' as const;
export const DEFAULT_INTERVIEWER: Interviewer = INTERVIEWERS[0] ?? {
  id: 'priya',
  name: 'Priya Nair',
  title: 'Staff Engineer, Northwind',
  avatar: '/ai-avatar.jpg',
  tag: 'Warm',
  tagColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  desc: 'Encouraging and conversational. Great for building confidence.',
};
