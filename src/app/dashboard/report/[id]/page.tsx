import {
  ScorecardClient,
  type ScorecardQuestionItem,
} from '@/features/scorecard';
import { prisma } from '@/server/db/prisma';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    id: string; // sessionId
  }>;
}

// -----------------------------------------------------------------------------
// Enterprise Synthetic Demo Fixture
// Strictly NO PII — uses synthetic engineering questions and professional answers.
// Used ONLY when visiting /dashboard/report/demo or /dashboard/report/sample.
// -----------------------------------------------------------------------------
const SYNTHETIC_DEMO_DATA = {
  isDemo: true,
  role: 'Full Stack Engineer',
  type: 'Technical & System Design',
  level: 'Senior',
  date: new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }),
  interviewerName: 'Priya Nair (Staff Engineer)',
  overallScore: 78,
  recommendation: 'Ready for Next Round',
  metrics: {
    answered: 5,
    total: 5,
    skipped: 0,
    fillerRate: 2,
    conceptCoverage: 84,
    avgWords: 112,
    durationMin: 18,
  },
  competencies: [
    { name: 'Technical', value: 82, fullMark: 100 },
    { name: 'Problem', value: 80, fullMark: 100 },
    { name: 'Communication', value: 75, fullMark: 100 },
    { name: 'Delivery', value: 78, fullMark: 100 },
    { name: 'Impact', value: 76, fullMark: 100 },
  ],
  strengths: [
    {
      title: 'Clear Architectural Reasoning',
      desc: 'Articulated trade-offs between iterative traversal and recursive memory overhead clearly with Big-O complexity analysis.',
    },
    {
      title: 'Structured Communication',
      desc: 'Decomposed multi-part problems logically and verified edge cases before providing code implementations.',
    },
  ],
  weaknesses: [
    {
      title: 'Deepen Distributed Systems Concepts',
      desc: 'Consider detailing cache invalidation strategies and consensus mechanisms under network partition.',
    },
    {
      title: 'Pacing Consistency',
      desc: 'Take a brief pause before jumping into complex logic to maintain a steady speaking cadence.',
    },
  ],
  nextSteps: [
    'Practice system design questions focusing on idempotency and eventual consistency.',
    'Review pointer manipulation patterns (two-pointer, sliding window, fast/slow).',
    'Run another mock session to calibrate delivery speed between 120 and 150 words per minute.',
  ],
  questions: [
    {
      id: 'demo-q1',
      title:
        'Reverse a singly linked list. Walk me through pointer movement, edge cases, and computational complexity.',
      score: 85,
      type: 'Coding',
      difficulty: 'medium',
      answer:
        'To reverse a singly linked list in O(n) time and O(1) space, I use an iterative three-pointer technique: prev initialized to null, current starting at head, and next. In each step, we save current.next, update current.next to point to prev, then advance prev to current and current to next. Edge cases such as an empty list or single-node list are handled safely.',
      followUp:
        'Priya: How would this change if we solved it recursively?\nWith recursion, the call stack incurs O(n) auxiliary space, making it susceptible to stack overflow on very large lists, so iterative is generally preferred in production.',
      metrics: {
        content: 88,
        clarity: 84,
        delivery: 82,
        time: '01:25',
      },
      conceptsCovered: [
        'iterative',
        'prev pointer',
        'O(1) space',
        'edge cases',
        'null check',
      ],
      conceptsMissed: ['tail recursion optimization'],
      modelAnswer:
        'Iterate through the list using prev, current, and next pointers. Store next, reverse current.next to prev, then advance prev and current. Runs in O(n) time with O(1) auxiliary space, safely handling null and single-node edge cases.',
    },
  ],
};

function formatRecommendation(rec?: string | null): string {
  if (!rec) return 'Completed';
  switch (rec.toUpperCase()) {
    case 'STRONG_YES':
      return 'Strong Hire';
    case 'YES':
      return 'Ready for Next Round';
    case 'NEUTRAL':
      return 'Borderline / Needs Practice';
    case 'NO':
      return 'Not Yet Ready';
    case 'STRONG_NO':
      return 'Needs Significant Preparation';
    default:
      return rec;
  }
}

function parseBulletPoints(
  text?: string | null,
  defaultTitle: string = 'Observation',
): Array<{ title: string; desc: string }> {
  if (!text || typeof text !== 'string') return [];
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) return [];
  return lines.map((line, idx) => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 35) {
      return {
        title: line.slice(0, colonIdx).trim(),
        desc: line.slice(colonIdx + 1).trim(),
      };
    }
    return {
      title: `${defaultTitle} ${idx + 1}`,
      desc: line,
    };
  });
}

function parseNextSteps(feedback?: string | null): string[] {
  if (!feedback || typeof feedback !== 'string') {
    return [
      'Review key concepts on any missed questions and practice from the question bank.',
      'Back answers with concrete examples and quantifiable business metrics.',
      'Schedule another mock interview session to track score progression over time.',
    ];
  }
  const lines = feedback
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [feedback];
}

const isValidUuid = (val: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    val,
  );

export default async function ScorecardPage({ params }: PageProps) {
  const { id } = await params;

  // 1. Explicit Demo Mode
  if (id === 'demo' || id === 'sample') {
    return (
      <div className="min-h-screen bg-[#0b0c10] text-slate-100 font-sans">
        <ScorecardClient data={SYNTHETIC_DEMO_DATA} sessionId="demo" />
      </div>
    );
  }

  // 2. Validate UUID format — reject malformed IDs immediately without DB error
  if (!isValidUuid(id)) {
    const notFoundData = {
      isNotFound: true,
      sessionId: id,
      role: 'Interview Session',
      type: 'Technical',
      level: 'Standard',
      date: new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      interviewerName: 'AI Interviewer',
      overallScore: 0,
      recommendation: 'Not Found',
      metrics: {
        answered: 0,
        total: 0,
        skipped: 0,
        fillerRate: 0,
        conceptCoverage: 0,
        avgWords: 0,
        durationMin: 0,
      },
      competencies: [],
      strengths: [],
      weaknesses: [],
      nextSteps: [],
      questions: [],
    };
    return (
      <div className="min-h-screen bg-[#0b0c10] text-slate-100 font-sans">
        <ScorecardClient data={notFoundData} sessionId={id} />
      </div>
    );
  }

  // 3. Fetch session and scorecard from PostgreSQL database
  let session = null;
  try {
    session = await prisma.session.findUnique({
      where: { id },
      include: {
        scorecard: true,
        user: {
          select: { id: true, name: true, email: true },
        },
        transcripts: {
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });
  } catch (error) {
    console.error(`[DATABASE_ERROR] Failed to fetch session ${id}:`, error);
  }

  // 4. Session not found in DB
  if (!session) {
    const notFoundData = {
      isNotFound: true,
      sessionId: id,
      role: 'Interview Session',
      type: 'Technical',
      level: 'Standard',
      date: new Date().toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      interviewerName: 'AI Interviewer',
      overallScore: 0,
      recommendation: 'Session Not Found',
      metrics: {
        answered: 0,
        total: 0,
        skipped: 0,
        fillerRate: 0,
        conceptCoverage: 0,
        avgWords: 0,
        durationMin: 0,
      },
      competencies: [],
      strengths: [],
      weaknesses: [],
      nextSteps: [],
      questions: [],
    };
    return (
      <div className="min-h-screen bg-[#0b0c10] text-slate-100 font-sans">
        <ScorecardClient data={notFoundData} sessionId={id} />
      </div>
    );
  }

  // 5. Session exists, but Scorecard is pending / not yet evaluated
  if (!session.scorecard) {
    const pendingData = {
      isPending: true,
      sessionId: id,
      role: session.title || 'Interview Session',
      type: session.interviewType || 'Technical',
      level: 'Standard',
      date: new Date(session.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      interviewerName: 'AI Interviewer',
      overallScore: 0,
      recommendation: 'Evaluation in progress',
      metrics: {
        answered: 0,
        total: 5,
        skipped: 0,
        fillerRate: 0,
        conceptCoverage: 0,
        avgWords: 0,
        durationMin: 1,
      },
      competencies: [
        { name: 'Technical', value: 0, fullMark: 100 },
        { name: 'Problem', value: 0, fullMark: 100 },
        { name: 'Communication', value: 0, fullMark: 100 },
        { name: 'Delivery', value: 0, fullMark: 100 },
        { name: 'Impact', value: 0, fullMark: 100 },
      ],
      strengths: [],
      weaknesses: [],
      nextSteps: [
        'Your evaluation is being generated. Please refresh in a moment.',
      ],
      questions: [],
    };
    return (
      <div className="min-h-screen bg-[#0b0c10] text-slate-100 font-sans">
        <ScorecardClient data={pendingData} sessionId={id} />
      </div>
    );
  }

  // 6. Session and Scorecard exist: Parse real evaluation data
  const scorecard = session.scorecard;

  let dbQuestions: ScorecardQuestionItem[] = [];
  if (scorecard.dimensionBreakdown) {
    try {
      const raw = scorecard.dimensionBreakdown;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) {
        dbQuestions = parsed as ScorecardQuestionItem[];
      } else if (
        parsed &&
        typeof parsed === 'object' &&
        'questions' in parsed &&
        Array.isArray((parsed as { questions: unknown[] }).questions)
      ) {
        dbQuestions = (parsed as { questions: ScorecardQuestionItem[] })
          .questions;
      }
    } catch (e) {
      console.error(
        '[SCORECARD] Failed to parse dimensionBreakdown questions:',
        e,
      );
    }
  }

  // If dimensionBreakdown is empty, reconstruct safe questions from transcripts
  if (dbQuestions.length === 0 && session.transcripts?.length > 0) {
    dbQuestions = session.transcripts.map((t, i) => ({
      id: t.id || `q-${i + 1}`,
      title: t.questionId || `Question ${i + 1}`,
      score: Math.round(Number(scorecard.overallScore || 5) * 10),
      type: session.interviewType,
      difficulty: 'medium',
      answer: t.cleanedText || t.rawText || '(No transcript)',
      metrics: {
        content: 50,
        clarity: 50,
        delivery: 50,
        time: t.audioDurationMs
          ? `${Math.floor(t.audioDurationMs / 60000)}:${Math.floor(
              (t.audioDurationMs % 60000) / 1000,
            )
              .toString()
              .padStart(2, '0')}`
          : '00:45',
      },
      conceptsCovered: [],
      conceptsMissed: [],
      modelAnswer: 'Evaluation was completed at the session level.',
    }));
  }

  const titleParts = (session.title || 'AI Technical Interview').split(' - ');
  const role = titleParts[0]?.trim() || 'Software Engineer';
  const rawType = titleParts[1]?.trim() || session.interviewType || 'Technical';
  const level = titleParts[2]?.trim() || 'Mid-Senior';

  const tech = Number(scorecard.technicalScore ?? 5);
  const comm = Number(scorecard.communicationScore ?? 5);

  // Dynamic Delivery: derived from individual question delivery metrics (or comm)
  const questionDeliveryAvg =
    dbQuestions.length > 0
      ? dbQuestions.reduce(
          (acc: number, q: ScorecardQuestionItem) =>
            acc + (Number(q.metrics?.delivery) || comm * 10),
          0,
        ) / dbQuestions.length
      : comm * 10;
  const delivery = Math.min(100, Math.max(10, Math.round(questionDeliveryAvg)));

  // Dynamic Problem Solving: from scorecard.problemSolvingScore or question score average
  const questionScoreAvg =
    dbQuestions.length > 0
      ? dbQuestions.reduce(
          (acc: number, q: ScorecardQuestionItem) =>
            acc + (Number(q.score) || tech * 10),
          0,
        ) / dbQuestions.length
      : tech * 10;

  const probVal =
    scorecard.problemSolvingScore != null
      ? Number(scorecard.problemSolvingScore) <= 10
        ? Math.round(Number(scorecard.problemSolvingScore) * 10)
        : Math.round(Number(scorecard.problemSolvingScore))
      : Math.min(
          100,
          Math.max(10, Math.round(questionScoreAvg * 0.7 + tech * 3)),
        );

  // Dynamic Culture Fit / Impact: from scorecard.cultureFitScore or weighted signal
  const cultVal =
    scorecard.cultureFitScore != null
      ? Number(scorecard.cultureFitScore) <= 10
        ? Math.round(Number(scorecard.cultureFitScore) * 10)
        : Math.round(Number(scorecard.cultureFitScore))
      : Math.min(100, Math.max(10, Math.round(comm * 6 + tech * 4)));

  const techVal = Math.min(100, Math.max(0, Math.round(tech * 10)));
  const commVal = Math.min(100, Math.max(0, Math.round(comm * 10)));

  const competencies = [
    { name: 'Technical', value: techVal, fullMark: 100 },
    { name: 'Problem', value: probVal, fullMark: 100 },
    { name: 'Communication', value: commVal, fullMark: 100 },
    { name: 'Delivery', value: delivery, fullMark: 100 },
    { name: 'Impact', value: cultVal, fullMark: 100 },
  ];

  const rawOverall = scorecard.overallScore
    ? Number(scorecard.overallScore)
    : (techVal * 0.3 +
        probVal * 0.25 +
        commVal * 0.2 +
        delivery * 0.15 +
        cultVal * 0.1) /
      10;
  const overallScore = Math.min(
    100,
    rawOverall <= 10 ? Math.round(rawOverall * 10) : Math.round(rawOverall),
  );

  const strengths = parseBulletPoints(scorecard.strengths, 'Key Strength');
  const weaknesses = parseBulletPoints(scorecard.weaknesses, 'Area for Growth');
  const nextSteps = parseNextSteps(scorecard.detailedFeedback);

  let durationMin = 2;
  if (session.durationSeconds && session.durationSeconds > 0) {
    durationMin = Math.max(1, Math.round(session.durationSeconds / 60));
  } else if (session.startedAt && session.endedAt) {
    const diff = Math.round(
      (new Date(session.endedAt).getTime() -
        new Date(session.startedAt).getTime()) /
        60000,
    );
    if (diff > 0) durationMin = diff;
  }

  const answeredQuestionsCount = dbQuestions.filter(
    (q: ScorecardQuestionItem) => {
      const ans = (q.answer ?? q.userAnswer ?? '').trim();
      return (
        ans &&
        ans !== '(Silence)' &&
        !ans.toLowerCase().includes('[candidate skipped')
      );
    },
  ).length;

  const uiData = {
    sessionId: id,
    role,
    type: rawType,
    level,
    date: new Date(session.createdAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    interviewerName: 'AI Interviewer',
    overallScore,
    recommendation: formatRecommendation(scorecard.recommendation),
    metrics: {
      answered: answeredQuestionsCount,
      total: dbQuestions.length || 5,
      skipped: Math.max(0, (dbQuestions.length || 5) - answeredQuestionsCount),
      fillerRate: 0,
      conceptCoverage: 0,
      avgWords: 0,
      durationMin,
    },
    competencies,
    strengths:
      strengths.length > 0
        ? strengths
        : [
            {
              title: 'Overall Assessment',
              desc: 'Candidate successfully completed the interview session.',
            },
          ],
    weaknesses:
      weaknesses.length > 0
        ? weaknesses
        : [
            {
              title: 'Areas for Growth',
              desc: 'Continue practicing depth and precision in responses.',
            },
          ],
    nextSteps,
    questions: dbQuestions, // REAL DB QUESTIONS ONLY — NEVER MOCK DATA!
  };

  return (
    <div className="min-h-screen bg-[#0b0c10] text-slate-100 font-sans">
      <ScorecardClient data={uiData} sessionId={id} />
    </div>
  );
}
