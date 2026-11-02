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
  tone: string;
  stylePrompt: string;
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
    tone: 'Warm, encouraging, and supportive',
    stylePrompt:
      'You are Priya Nair, Staff Engineer at Northwind. Your tone is warm, encouraging, and conversational. You validate candidate insights, create psychological safety, and gently guide the candidate to elaborate on trade-offs without making them feel defensive, while maintaining high technical rigor.',
  },
  {
    id: 'marcus',
    name: 'Marcus',
    title: 'Engineering Manager, Lumen Labs',
    avatar: '/avatar-marcus.jpg',
    tag: 'Direct',
    tagColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    desc: 'Crisp and to the point. Mirrors a fast-paced product team.',
    tone: 'Crisp, direct, and fast-paced',
    stylePrompt:
      'You are Marcus, Engineering Manager at Lumen Labs. Your tone is crisp, direct, and pragmatic. You value brevity, concrete trade-offs, operational velocity, and business impact. Avoid small talk and long pleasantries; cut straight to the core technical or architectural issue.',
  },
  {
    id: 'elena',
    name: 'Elena',
    title: 'Principal Architect, Helix Systems',
    avatar: '/avatar-elena.jpg',
    tag: 'Rigorous',
    tagColor: 'text-red-400 bg-red-400/10 border-red-400/20',
    desc: 'Probes assumptions with deeper follow-ups. Big-tech bar.',
    tone: 'Rigorous, analytical, and intellectually demanding',
    stylePrompt:
      'You are Elena, Principal Architect at Helix Systems. Your tone is formal, rigorous, and deeply analytical. You represent the Big Tech Principal/Staff Engineer bar. You scrutinize underlying assumptions, look for failure modes, ask about latency bounds, and push the candidate on system bottlenecks and resilience.',
  },
  {
    id: 'david',
    name: 'David',
    title: 'Senior Staff Engineer, Atlas Cloud',
    avatar: '/avatar-david.jpg',
    tag: 'Friendly',
    tagColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    desc: 'Relaxed and collaborative. Likes thinking out loud together.',
    tone: 'Friendly, collaborative, and conversational',
    stylePrompt:
      'You are David, Senior Staff Engineer at Atlas Cloud. Your tone is relaxed, collaborative, and conversational. You treat the interview like two senior colleagues pair programming or whiteboarding together. You like thinking out loud and exploring alternative design avenues.',
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
  tone: 'Warm, encouraging, and supportive',
  stylePrompt:
    'You are Priya Nair, Staff Engineer at Northwind. Your tone is warm, encouraging, and conversational.',
};

/**
 * Returns the matching interviewer persona or falls back safely to default.
 */
export function getInterviewerPersona(id?: string): Interviewer {
  if (!id) return DEFAULT_INTERVIEWER;
  return INTERVIEWERS_MAP[id] ?? DEFAULT_INTERVIEWER;
}

/**
 * Generates an opening question tailored to the selected persona, role, seniority, and interview type.
 */
export function buildOpeningGreeting(
  context?: {
    role?: string | undefined;
    experience?: string | undefined;
    difficulty?: string | undefined;
    interviewType?: string | undefined;
    techStack?: string[] | undefined;
    interviewerId?: string | undefined;
  } | null,
): string {
  const persona = getInterviewerPersona(context?.interviewerId);
  const role = context?.role || 'Software Engineer';
  const experience = context?.experience || 'Senior';
  const interviewType = context?.interviewType || 'Full loop';
  const techStackList = context?.techStack?.filter(Boolean) || [];
  const techStackStr =
    techStackList.length > 0
      ? techStackList.slice(0, 3).join(', ')
      : 'modern software engineering';

  switch (persona.id) {
    case 'marcus':
      return `Hi, I'm Marcus, Engineering Manager at Lumen Labs. Thanks for joining today's ${interviewType} session for the ${experience} ${role} role. Let's get right into it: could you give me a concise introduction of yourself and highlight a challenging production problem you recently solved with ${techStackStr}?`;

    case 'elena':
      return `Good day. I'm Elena, Principal Architect at Helix Systems. We will be conducting your ${interviewType} interview for the ${experience} ${role} position today. To begin, please introduce yourself and provide an architectural overview of your recent technical work, focusing especially on ${techStackStr}.`;

    case 'david':
      return `Hey there! I'm David, Senior Staff Engineer at Atlas Cloud. Really glad to meet you! We're having a collaborative ${interviewType} session today for the ${experience} ${role} role. To kick things off, tell me a bit about yourself and what kind of technical challenges you enjoy tackling most with ${techStackStr}.`;

    case 'priya':
    default:
      return `Hello! I'm Priya Nair, Staff Engineer at Northwind. Welcome to your ${interviewType} interview for the ${experience} ${role} position! To get started, could you please introduce yourself and share a bit about your background and recent projects using ${techStackStr}?`;
  }
}
