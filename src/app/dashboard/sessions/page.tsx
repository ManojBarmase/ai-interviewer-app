import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createServerClient } from '@supabase/ssr';

import { SessionsClient } from '@/features/scorecard';
import { DEMO_SESSION_COOKIE, DEMO_USER_ID } from '@/lib/constants';
import { prisma, type Prisma } from '@/server/db/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SessionQuestionItem {
  userAnswer?: string;
  answer?: string;
  rawTranscript?: string;
  scores?: { time?: string; [key: string]: unknown };
  [key: string]: unknown;
}

type SessionsPageSession = Prisma.SessionGetPayload<{
  include: {
    scorecard: true;
    transcripts: {
      select: { id: true };
    };
  };
}>;

export default async function SessionsPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isDemoSession = cookieStore.get(DEMO_SESSION_COOKIE)?.value === 'true';

  if (!user && !isDemoSession) {
    redirect('/login?redirectTo=/dashboard/sessions');
  }

  const userId = user?.id || DEMO_USER_ID;

  let sessions: SessionsPageSession[] = [];
  try {
    sessions = await prisma.session.findMany({
      where: { userId, isDeleted: false },
      include: {
        scorecard: true,
        transcripts: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.warn(
      '[SESSIONS_DB_WARN] Could not fetch sessions from DB, rendering fallback empty state:',
      error,
    );
  }

  // Serialize Prisma Date and Decimal objects for the client component
  const serializedSessions = sessions.map((s) => {
    let questions: SessionQuestionItem[] = [];
    if (s.scorecard?.dimensionBreakdown) {
      try {
        const raw = s.scorecard.dimensionBreakdown;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          questions = parsed as SessionQuestionItem[];
        } else if (
          parsed &&
          typeof parsed === 'object' &&
          'questions' in parsed &&
          Array.isArray((parsed as { questions: unknown[] }).questions)
        ) {
          questions = (parsed as { questions: SessionQuestionItem[] })
            .questions;
        }
      } catch (e) {
        console.error('Failed to parse dimensionBreakdown:', e);
      }
    }

    let totalQuestions = questions.length;
    let answeredCount = 0;

    if (totalQuestions > 0) {
      answeredCount = questions.filter((q) => {
        const ans = (q.userAnswer ?? q.answer ?? q.rawTranscript ?? '').trim();
        if (!ans) return false;
        const lower = ans.toLowerCase();
        return (
          lower !== '(silence)' &&
          !lower.includes('skipped') &&
          !lower.includes('[candidate skipped')
        );
      }).length;
    } else {
      answeredCount = s.transcripts?.length || 0;
      totalQuestions = Math.max(answeredCount, 5);
    }

    // Dynamic duration calculation in seconds
    let durationSeconds = s.durationSeconds || 0;
    if (!durationSeconds && s.startedAt && s.endedAt) {
      const diff = Math.round(
        (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) /
          1000,
      );
      if (diff > 0) durationSeconds = diff;
    }
    if (!durationSeconds && totalQuestions > 0) {
      let questionTimeSum = 0;
      for (const q of questions) {
        if (q.scores?.time && typeof q.scores.time === 'string') {
          const parts = q.scores.time.split(':').map(Number);
          const p0 = parts[0];
          const p1 = parts[1];
          if (
            parts.length === 2 &&
            p0 !== undefined &&
            p1 !== undefined &&
            !isNaN(p0) &&
            !isNaN(p1)
          ) {
            questionTimeSum += p0 * 60 + p1;
          }
        }
      }
      durationSeconds =
        questionTimeSum > 0 ? questionTimeSum : totalQuestions * 90;
    }

    return {
      id: s.id,
      title: s.title || 'AI Mock Interview',
      interviewType: s.interviewType,
      status: s.status,
      durationSeconds: durationSeconds,
      createdAt: s.createdAt.toISOString(),
      answeredCount,
      totalQuestions,
      scorecard: s.scorecard
        ? {
            overallScore: s.scorecard.overallScore
              ? Number(s.scorecard.overallScore)
              : null,
            recommendation: s.scorecard.recommendation || 'Not evaluated',
          }
        : null,
    };
  });

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white overflow-hidden">
      <SessionsClient initialSessions={serializedSessions} />
    </div>
  );
}
