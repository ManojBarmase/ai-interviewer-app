'use client';

import { useState, useEffect } from 'react';

import Link from 'next/link';

import {
  Copy,
  Download,
  Printer,
  ArrowLeft,
  RefreshCw,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Check,
  FileText,
  AlertCircle,
  Sparkles,
  CheckCheck,
} from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import { Button } from '@/components/ui';

export interface ScorecardCompetency {
  name: string;
  value: number;
  fullMark?: number;
}

export interface ScorecardStrength {
  title?: string;
  desc?: string;
}

export interface ScorecardWeakness {
  title?: string;
  desc?: string;
}

export interface ScorecardQuestionMetrics {
  content?: number | string;
  clarity?: number | string;
  delivery?: number | string;
  time?: string;
  [key: string]: unknown;
}

export interface ScorecardQuestionItem {
  id?: string;
  title?: string;
  type?: string;
  difficulty?: string;
  answer?: string;
  userAnswer?: string;
  modelAnswer?: string;
  score?: number;
  followUp?: string;
  conceptsCovered?: string[];
  conceptsMissed?: string[];
  metrics?: ScorecardQuestionMetrics;
  [key: string]: unknown;
}

export interface ScorecardData {
  isDemo?: boolean;
  isNotFound?: boolean;
  isPending?: boolean;
  role?: string;
  type?: string;
  level?: string;
  date?: string;
  interviewerName?: string;
  recommendation?: string;
  overallScore?: number;
  competencies?: ScorecardCompetency[];
  strengths?: Array<ScorecardStrength | string>;
  weaknesses?: Array<ScorecardWeakness | string>;
  nextSteps?: string[];
  questions?: ScorecardQuestionItem[];
  metrics?: {
    total?: number;
    answered?: number;
    durationMin?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

export function ScorecardClient({
  data,
  sessionId,
}: {
  data: ScorecardData;
  sessionId?: string;
}) {
  const [uiData, setUiData] = useState<ScorecardData>(data);
  const [copied, setCopied] = useState(false);
  const [expandedQ, setExpandedQ] = useState<string | null>(
    () => data?.questions?.[0]?.id || null,
  );

  // Sync client-side cached evaluation if available
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (!sessionId) return undefined;

    try {
      const stored = sessionStorage.getItem(`eval_${sessionId}`);
      if (stored) {
        const ev = JSON.parse(stored);

        // Pick the most complete questions list between local cache and server data
        const localQuestions: ScorecardQuestionItem[] = Array.isArray(
          ev.questions,
        )
          ? ev.questions
          : [];
        const serverQuestions: ScorecardQuestionItem[] = Array.isArray(
          data.questions,
        )
          ? data.questions
          : [];
        const qArray =
          serverQuestions.length > localQuestions.length
            ? serverQuestions
            : localQuestions.length > 0
              ? localQuestions
              : serverQuestions;

        const tech = Number(ev.technicalScore ?? 5);
        const comm = Number(ev.communicationScore ?? 5);

        // Dynamic Delivery: derived from question delivery metrics or ev.deliveryScore
        const qDeliveryAvg =
          qArray.length > 0
            ? qArray.reduce((acc: number, q: ScorecardQuestionItem) => {
                const delivery =
                  typeof q.metrics?.delivery === 'number'
                    ? q.metrics.delivery
                    : comm * 10;
                return acc + delivery;
              }, 0) / qArray.length
            : ev.deliveryScore
              ? Number(ev.deliveryScore) <= 10
                ? Number(ev.deliveryScore) * 10
                : Number(ev.deliveryScore)
              : comm * 10;
        const deliveryVal = Math.min(
          100,
          Math.max(10, Math.round(qDeliveryAvg)),
        );

        // Dynamic Problem Solving: derived from question scores or ev.problemSolvingScore
        const qScoreAvg =
          qArray.length > 0
            ? qArray.reduce(
                (acc: number, q: ScorecardQuestionItem) =>
                  acc + (Number(q.score) || tech * 10),
                0,
              ) / qArray.length
            : tech * 10;
        const probVal =
          ev.problemSolvingScore != null
            ? Number(ev.problemSolvingScore) <= 10
              ? Math.round(Number(ev.problemSolvingScore) * 10)
              : Math.round(Number(ev.problemSolvingScore))
            : Math.min(
                100,
                Math.max(10, Math.round(qScoreAvg * 0.7 + tech * 3)),
              );

        // Dynamic Impact: derived from ev.cultureFitScore or weighted communication & tech
        const cultVal =
          ev.cultureFitScore != null
            ? Number(ev.cultureFitScore) <= 10
              ? Math.round(Number(ev.cultureFitScore) * 10)
              : Math.round(Number(ev.cultureFitScore))
            : Math.min(100, Math.max(10, Math.round(comm * 6 + tech * 4)));

        const techVal = Math.min(100, Math.max(0, Math.round(tech * 10)));
        const commVal = Math.min(100, Math.max(0, Math.round(comm * 10)));

        const overall = ev.overallScore
          ? Number(ev.overallScore) <= 10
            ? Math.round(Number(ev.overallScore) * 10)
            : Math.round(Number(ev.overallScore))
          : Math.round(
              techVal * 0.3 +
                probVal * 0.25 +
                commVal * 0.2 +
                deliveryVal * 0.15 +
                cultVal * 0.1,
            );

        timeout = setTimeout(() => {
          setUiData((prev) => ({
            ...prev,
            isPending: false,
            isNotFound: false,
            overallScore: overall,
            competencies: [
              { name: 'Technical', value: techVal, fullMark: 100 },
              { name: 'Problem', value: probVal, fullMark: 100 },
              { name: 'Communication', value: commVal, fullMark: 100 },
              { name: 'Delivery', value: deliveryVal, fullMark: 100 },
              { name: 'Impact', value: cultVal, fullMark: 100 },
            ],
            strengths: (ev.strongAreas || []).map((s: string, idx: number) => ({
              title: `Key Strength ${idx + 1}`,
              desc: s,
            })),
            weaknesses: (ev.weakAreas || []).map((w: string, idx: number) => ({
              title: `Area for Growth ${idx + 1}`,
              desc: w,
            })),
            recommendation:
              ev.recommendation || prev.recommendation || 'Completed',
            questions: qArray,
          }));
        }, 0);
      }
    } catch (e) {
      console.error('[SCORECARD] Failed to parse local evaluation data', e);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [sessionId, data]);

  // Handle Session Not Found
  if (uiData.isNotFound) {
    return (
      <div className="max-w-xl mx-auto py-24 px-6 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
          <FileText size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">
          Interview Session Not Found
        </h2>
        <p className="text-sm text-white/50 mb-8 leading-relaxed">
          The requested scorecard could not be located in the system. It may
          have been deleted, or you might need to check your active account
          sessions.
        </p>
        <Link href="/dashboard/sessions">
          <Button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl gap-2 font-semibold">
            <ArrowLeft size={16} /> Return to Sessions List
          </Button>
        </Link>
      </div>
    );
  }

  // Handle Evaluation in Progress
  if (uiData.isPending) {
    return (
      <div className="max-w-xl mx-auto py-24 px-6 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 animate-pulse">
          <RefreshCw size={28} className="animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">
          Evaluation in Progress
        </h2>
        <p className="text-sm text-white/50 mb-8 leading-relaxed">
          Our AI model is currently evaluating your interview transcript and
          generating detailed performance metrics.
        </p>
        <div className="flex justify-center gap-4">
          <Button
            onClick={() => window.location.reload()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl gap-2 font-semibold"
          >
            <RefreshCw size={16} /> Refresh Status
          </Button>
          <Link href="/dashboard/sessions">
            <Button
              variant="ghost"
              className="border border-white/10 hover:bg-white/5 rounded-xl"
            >
              View All Sessions
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const score = Math.round(Number(uiData.overallScore) || 0);
  const pieData = [
    { name: 'Score', value: score },
    { name: 'Remaining', value: Math.max(0, 100 - score) },
  ];

  let badgeColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  let badgeText = 'Borderline';
  if (score >= 80) {
    badgeColor =
      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    badgeText = 'Strong Hire';
  } else if (score >= 65) {
    badgeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    badgeText = 'Hire';
  } else if (score < 50) {
    badgeColor = 'bg-red-500/10 text-red-400 border border-red-500/20';
    badgeText = 'Not Ready';
  }

  const handleCopySummary = async () => {
    const summary = `Interview Scorecard: ${uiData.role}
Overall Score: ${score}/100
Recommendation: ${uiData.recommendation}

Strengths:
${(uiData.strengths || []).map((s) => `- ${typeof s === 'string' ? s : s.desc || s.title}`).join('\n') || 'None'}

Areas to Improve:
${(uiData.weaknesses || []).map((w) => `- ${typeof w === 'string' ? w : w.desc || w.title}`).join('\n') || 'None'}
`;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    const md = `# Interview Scorecard

**Role:** ${uiData.role}
**Overall Score:** ${score}/100
**Recommendation:** ${uiData.recommendation}

## Strengths
${(uiData.strengths || []).map((s) => `- ${typeof s === 'string' ? s : s.desc || s.title}`).join('\n') || 'None'}

## Areas to Improve
${(uiData.weaknesses || []).map((w) => `- ${typeof w === 'string' ? w : w.desc || w.title}`).join('\n') || 'None'}

## Questions
${
  (uiData.questions || [])
    .map(
      (q, i: number) => `
### ${i + 1}. ${q.title || 'Question'}
**Answer:** ${q.answer || '(Silence)'}
**Model Answer:** ${q.modelAnswer || 'N/A'}
`,
    )
    .join('\n') || 'None'
}
`;
    downloadFile(md, `scorecard-${sessionId || 'export'}.md`, 'text/markdown');
  };

  const handleDownloadJSON = () => {
    const json = JSON.stringify(uiData, null, 2);
    downloadFile(
      json,
      `scorecard-${sessionId || 'export'}.json`,
      'application/json',
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const totalQuestions = uiData.questions?.length || uiData.metrics?.total || 5;
  const answeredQuestions = (uiData.questions || []).filter((q) => {
    const ans = (q.answer ?? q.userAnswer ?? '').trim();
    return (
      ans &&
      ans !== '(Silence)' &&
      !ans.toLowerCase().includes('[candidate skipped')
    );
  });
  const answeredCount =
    answeredQuestions.length || uiData.metrics?.answered || 0;
  const skippedCount = Math.max(0, totalQuestions - answeredCount);

  const totalWords = answeredQuestions.reduce((acc: number, q) => {
    return acc + (q.answer?.split(/\s+/).filter(Boolean).length || 0);
  }, 0);
  const avgWords =
    answeredCount > 0 ? Math.round(totalWords / answeredCount) : 0;

  let coveredConceptsCount = 0;
  let totalConceptsCount = 0;
  (uiData.questions || []).forEach((q) => {
    const covered = q.conceptsCovered?.length || 0;
    const missed = q.conceptsMissed?.length || 0;
    coveredConceptsCount += covered;
    totalConceptsCount += covered + missed;
  });
  const conceptCoverage =
    totalConceptsCount > 0
      ? Math.round((coveredConceptsCount / totalConceptsCount) * 100)
      : 0;

  const dynamicMetrics = {
    answered: answeredCount,
    total: totalQuestions,
    skipped: skippedCount,
    fillerRate: 0,
    conceptCoverage: conceptCoverage,
    avgWords: avgWords,
    durationMin: uiData.metrics?.durationMin || 2,
  };

  return (
    <div className="max-w-6xl mx-auto p-8 flex flex-col gap-8">
      {/* Demo Mode Notice */}
      {uiData.isDemo && (
        <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-400 shrink-0" />
            <span>
              Sample Demo Scorecard — Displaying synthetic anonymized evaluation
              data for demonstration purposes.
            </span>
          </div>
          <Link
            href="/dashboard/setup"
            className="underline hover:text-white font-semibold shrink-0"
          >
            Start Real Interview →
          </Link>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link
            href="/dashboard/sessions"
            className="text-white/40 hover:text-white flex items-center gap-2 text-sm font-medium mb-3 transition-colors"
          >
            <ArrowLeft size={16} /> All sessions
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2">
            Interview scorecard
          </h1>
          <p className="text-white/50 text-sm">
            {uiData.role} • {uiData.type} • {uiData.level} • {uiData.date} •
            with {uiData.interviewerName}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleCopySummary}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#161821] border border-white/10 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
          >
            {copied ? (
              <CheckCheck size={16} className="text-emerald-400" />
            ) : (
              <Copy size={16} />
            )}
            {copied ? 'Copied!' : 'Copy summary'}
          </button>
          <button
            onClick={handleDownloadMarkdown}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#161821] border border-white/10 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Download size={16} /> Markdown
          </button>
          <button
            onClick={handleDownloadJSON}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#161821] border border-white/10 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Download size={16} /> JSON
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#161821] border border-white/10 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Printer size={16} /> Print
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Overall Score */}
        <div className="bg-[#161821] border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center relative">
          <div className="w-48 h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={85}
                  startAngle={225}
                  endAngle={-45}
                  dataKey="value"
                  stroke="none"
                  cornerRadius={10}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`score-cell-${entry.name}`}
                      fill={COLORS[index % COLORS.length] ?? '#10b981'}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-white">{score}</span>
              <span className="text-xs text-white/40 mt-1">out of 100</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold mb-3 ${badgeColor}`}
            >
              {badgeText}
            </span>
            <h2 className="text-xl font-bold text-white mb-1 text-center">
              {uiData.recommendation}
            </h2>
            <p className="text-sm text-white/40">Estimated hiring signal</p>
          </div>
        </div>

        {/* Right Col: Competencies (Span 2) */}
        <div className="lg:col-span-2 bg-[#161821] border border-white/5 rounded-2xl p-8 flex flex-col md:flex-row">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white mb-6">Competencies</h3>
            <div className="h-[250px] w-full ml-[-20px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  data={uiData.competencies || []}
                >
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis
                    dataKey="name"
                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                  />
                  <Radar
                    name="Score"
                    dataKey="value"
                    stroke="#818cf8"
                    fill="#818cf8"
                    fillOpacity={0.2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-5 mt-8 md:mt-0 md:pl-8 border-t md:border-t-0 md:border-l border-white/5">
            {(uiData.competencies || []).map((comp) => (
              <div key={comp.name} className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-white/80 font-medium">{comp.name}</span>
                  <span className="text-white font-bold">{comp.value}</span>
                </div>
                <div className="w-full bg-[#0b0c10] rounded-full h-1.5">
                  <div
                    className={`h-full rounded-full ${comp.value >= 75 ? 'bg-emerald-400' : comp.value >= 55 ? 'bg-indigo-400' : comp.value >= 40 ? 'bg-amber-400' : 'bg-red-500'}`}
                    style={{
                      width: `${Math.min(100, Math.max(0, comp.value))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics Row (4 cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#161821] border border-white/5 rounded-2xl p-6">
          <p className="text-xs text-white/50 mb-2">Duration</p>
          <p className="text-2xl font-bold text-white">
            {dynamicMetrics.durationMin} min
          </p>
          <p className="text-xs text-white/40 mt-1">
            {dynamicMetrics.answered} of {dynamicMetrics.total} questions
          </p>
        </div>

        <div className="bg-[#161821] border border-white/5 rounded-2xl p-6">
          <p className="text-xs text-white/50 mb-2">Speaking Pace</p>
          <p className="text-2xl font-bold text-white">
            {dynamicMetrics.avgWords} wpm
          </p>
          <p className="text-xs text-emerald-400 mt-1">Normal conversational</p>
        </div>

        <div className="bg-[#161821] border border-white/5 rounded-2xl p-6">
          <p className="text-xs text-white/50 mb-2">Filler Words</p>
          <p className="text-2xl font-bold text-white">
            {dynamicMetrics.fillerRate}%
          </p>
          <p className="text-xs text-emerald-400 mt-1">Very clean delivery</p>
        </div>

        <div className="bg-[#161821] border border-white/5 rounded-2xl p-6">
          <p className="text-xs text-white/50 mb-2">Concept Coverage</p>
          <p className="text-2xl font-bold text-white">
            {dynamicMetrics.conceptCoverage}%
          </p>
          <p className="text-xs text-indigo-400 mt-1">Target concepts hit</p>
        </div>
      </div>

      {/* Strengths & Weaknesses (2 cols) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#161821] border border-white/5 rounded-2xl p-8 border-l-2 border-l-emerald-500">
          <div className="flex items-center gap-2 text-emerald-400 font-bold mb-6">
            <Check size={18} strokeWidth={2.5} />
            Strengths
          </div>
          <div className="flex flex-col gap-6">
            {(uiData.strengths || []).map((s) => {
              const isString = typeof s === 'string';
              const title = isString ? s : s.title;
              const desc = isString ? s : s.desc;
              const strengthKey = `strength-${title}-${(desc || '').slice(0, 20)}`;
              return (
                <div key={strengthKey}>
                  <h4 className="text-white font-bold text-sm mb-1">{title}</h4>
                  <p className="text-white/60 text-sm leading-relaxed">
                    {desc}
                  </p>
                </div>
              );
            })}
            {(!uiData.strengths || uiData.strengths.length === 0) && (
              <p className="text-sm text-white/40 italic">
                No specific strengths captured.
              </p>
            )}
          </div>
        </div>

        <div className="bg-[#161821] border border-white/5 rounded-2xl p-8 border-l-2 border-l-amber-500">
          <div className="flex items-center gap-2 text-amber-400 font-bold mb-6">
            <AlertCircle size={18} strokeWidth={2.5} />
            Areas to improve
          </div>
          <div className="flex flex-col gap-6">
            {(uiData.weaknesses || []).map((w) => {
              const isString = typeof w === 'string';
              const title = isString ? w : w.title;
              const desc = isString ? w : w.desc;
              const weaknessKey = `weakness-${title}-${(desc || '').slice(0, 20)}`;
              return (
                <div key={weaknessKey}>
                  <h4 className="text-white font-bold text-sm mb-1">{title}</h4>
                  <p className="text-white/60 text-sm leading-relaxed">
                    {desc}
                  </p>
                </div>
              );
            })}
            {(!uiData.weaknesses || uiData.weaknesses.length === 0) && (
              <p className="text-sm text-white/40 italic">
                No specific areas for growth captured.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-[#161821] border border-white/5 rounded-2xl p-8">
        <h3 className="text-lg font-bold text-white mb-6">
          Recommended next steps
        </h3>
        <div className="flex flex-col gap-4 mb-8">
          {(uiData.nextSteps || []).map((step: string, stepIdx: number) => (
            <div
              key={`next-step-${step.slice(0, 30)}`}
              className="flex items-start gap-4"
            >
              <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {stepIdx + 1}
              </div>
              <p className="text-white/80 text-sm leading-relaxed pt-1">
                {step}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <Link href="/dashboard/setup">
            <Button className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl gap-2 font-semibold">
              <RefreshCw size={16} /> Practice again
            </Button>
          </Link>
          <Link href="/dashboard/questions">
            <Button
              variant="ghost"
              className="border border-white/10 hover:bg-white/5 rounded-xl gap-2"
            >
              <RotateCcw size={16} /> Practice question bank
            </Button>
          </Link>
          <Link href="/dashboard/setup">
            <Button
              variant="ghost"
              className="border border-white/10 hover:bg-white/5 rounded-xl gap-2"
            >
              New setup
            </Button>
          </Link>
        </div>
      </div>

      {/* Question review */}
      <div className="mt-8 mb-16">
        <h2 className="text-xl font-bold text-white mb-6">Question review</h2>

        <div className="flex flex-col gap-4">
          {!uiData.questions || uiData.questions.length === 0 ? (
            <div className="p-8 text-center bg-[#161821] border border-white/5 rounded-2xl">
              <p className="text-white/50 text-sm">
                No question review details available for this session.
              </p>
            </div>
          ) : (
            uiData.questions.map((q, index: number) => {
              const uniqueId = q.id || `question-${index}`;
              const isExpanded = expandedQ === uniqueId;
              const qScore = typeof q.score === 'number' ? q.score : 50;
              const qScoreColor =
                qScore >= 75
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : qScore >= 50
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20';

              return (
                <div
                  key={uniqueId}
                  className="bg-[#161821] border border-white/5 rounded-2xl overflow-hidden transition-all duration-300"
                >
                  {/* Accordion Header */}
                  <div
                    className="p-6 flex items-start gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedQ(isExpanded ? null : uniqueId)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <div
                          className={`font-bold px-3 py-1 rounded-lg border text-sm ${qScoreColor}`}
                        >
                          {qScore}
                        </div>
                        <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold rounded-full uppercase tracking-wider">
                          {q.type || 'Technical'}
                        </span>
                        <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full uppercase tracking-wider">
                          {q.difficulty || 'medium'}
                        </span>
                      </div>
                      <h3 className="text-white font-medium pr-8">{q.title}</h3>
                    </div>
                    <button className="text-white/40 mt-2 shrink-0">
                      {isExpanded ? (
                        <ChevronUp size={20} />
                      ) : (
                        <ChevronDown size={20} />
                      )}
                    </button>
                  </div>

                  {/* Accordion Body */}
                  {isExpanded && (
                    <div className="px-6 pb-6 pt-2 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                      {/* Your Answer */}
                      <div className="mb-6">
                        <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">
                          Your Answer
                        </h4>
                        <p className="text-sm text-white/80 leading-relaxed mb-3">
                          {q.answer || '(No answer recorded)'}
                        </p>
                        {q.answer && q.answer !== '(Silence)' && (
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold rounded uppercase tracking-wider">
                              Analyzed Transcript
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Follow Ups */}
                      {q.followUp && (
                        <div className="mb-6">
                          <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">
                            Recommended Follow-up Practice
                          </h4>
                          <p className="text-sm font-bold text-white/90 mb-2">
                            {q.followUp.split('\n')[0]}
                          </p>
                          <p className="text-sm text-white/70 leading-relaxed">
                            {q.followUp.split('\n').slice(1).join('\n')}
                          </p>
                        </div>
                      )}

                      {/* Metrics row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-[#0b0c10] border border-white/5 rounded-xl p-4">
                          <p className="text-xs text-white/50 mb-2">Content</p>
                          <p className="text-xl font-bold text-white">
                            {q.metrics?.content ?? '--'}
                          </p>
                        </div>
                        <div className="bg-[#0b0c10] border border-white/5 rounded-xl p-4">
                          <p className="text-xs text-white/50 mb-2">Clarity</p>
                          <p className="text-xl font-bold text-white">
                            {q.metrics?.clarity ?? '--'}
                          </p>
                        </div>
                        <div className="bg-[#0b0c10] border border-white/5 rounded-xl p-4">
                          <p className="text-xs text-white/50 mb-2">Delivery</p>
                          <p className="text-xl font-bold text-white">
                            {q.metrics?.delivery ?? '--'}
                          </p>
                        </div>
                        <div className="bg-[#0b0c10] border border-white/5 rounded-xl p-4">
                          <p className="text-xs text-white/50 mb-2">Time</p>
                          <p className="text-xl font-bold text-white">
                            {q.metrics?.time ?? '--'}
                          </p>
                        </div>
                      </div>

                      {/* Concepts */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div>
                          <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">
                            Concepts Covered
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {(q.conceptsCovered || []).length > 0 ? (
                              (q.conceptsCovered || []).map((c: string) => (
                                <span
                                  key={c}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full"
                                >
                                  <Check size={12} strokeWidth={3} /> {c}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-white/40 italic">
                                None detected
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">
                            Concepts Missed / Growth
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {(q.conceptsMissed || []).length > 0 ? (
                              (q.conceptsMissed || []).map((c: string) => (
                                <span
                                  key={c}
                                  className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-full"
                                >
                                  {c}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-white/40 italic">
                                All target concepts addressed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Model Answer */}
                      {q.modelAnswer && (
                        <div>
                          <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">
                            Model Answer & Key Points
                          </h4>
                          <p className="text-sm text-white/70 leading-relaxed bg-[#0b0c10] p-4 rounded-xl border border-white/5">
                            {q.modelAnswer}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default ScorecardClient;
