'use client';

/**
 * @file Dashboard Page — /dashboard
 * @description Main dashboard matching the Figma design spec.
 *
 * Sections (top-to-bottom):
 *  1. Hero banner (greeting, CTA, AI avatar)
 *  2. Stats cards row (Sessions, Avg Score, Practice Time, Streak)
 *  3. Score Trend chart + Competencies radar
 *  4. Practice Activity heatmap + Weekly Goal ring
 *  5. Recommended Focus + Achievements
 *  6. Recent Sessions list
 *
 * All charts are rendered with HTML Canvas — zero external chart deps.
 * Fully responsive across all breakpoints.
 */

import { useEffect, useRef, useState, useMemo } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import {
  Clock,
  BarChart3,
  Flame,
  Target,
  ChevronRight,
  Trophy,
  Zap,
  ArrowRight,
} from 'lucide-react';

import type { HeatmapDay } from '@/server/services/analytics.service';

function createEmptyHeatmapData(weeksCount = 14): HeatmapDay[][] {
  const weeks: HeatmapDay[][] = [];
  for (let w = 0; w < weeksCount; w++) {
    const week: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({
        date: '',
        displayDate: 'No activity',
        count: 0,
        level: 0,
        isFuture: false,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

// ══════════════════════════════════════════════════════════════════════════════
// MOCK DATA — Fallback defaults when props are omitted
// ══════════════════════════════════════════════════════════════════════════════

const MOCK_USER = { name: 'Alex' };

const MOCK_STATS: DashboardStats = {
  sessions: { value: 9, sub: '1 this week', thisWeek: 1 },
  avgScore: {
    value: 66,
    sub: '+21 vs previous',
    trend: [30, 35, 42, 55, 60, 66],
  },
  practiceTime: { value: '33 min', sub: '47 questions answered' },
  streak: { value: '3d', sub: 'Keep it going today' },
  sessionsThisWeek: 1,
};

const MOCK_SCORE_TREND = {
  labels: ['40', '79', '92', '93'],
  data: [25, 45, 55, 60, 70, 93],
};

const MOCK_COMPETENCIES = {
  labels: ['Technical', 'Problem', 'Communication', 'Delivery', 'Impact'],
  current: [85, 70, 90, 60, 75],
  previous: [60, 55, 70, 50, 60],
};

const MOCK_ACHIEVEMENTS = [
  {
    icon: <Flame size={18} />,
    title: '3-day streak',
    sub: 'Unlocked',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
  },
  {
    icon: <Target size={18} />,
    title: 'Hit weekly goal',
    sub: '1/3',
    color: 'text-brand-400',
    bg: 'bg-brand-400/10',
  },
  {
    icon: <Trophy size={18} />,
    title: 'Score 85+',
    sub: 'Unlocked',
    color: 'text-red-400',
    bg: 'bg-red-400/10',
  },
  {
    icon: <Zap size={18} />,
    title: '50 questions',
    sub: '47/50',
    color: 'text-brand-300',
    bg: 'bg-brand-300/10',
  },
];

export interface SessionRow {
  id?: string;
  score: number;
  role: string;
  type: string;
  date: string;
  answered: string;
  duration: string;
  badge: string;
  badgeColor: string;
}

const MOCK_SESSIONS: SessionRow[] = [
  {
    score: 93,
    role: 'Frontend Engineer',
    type: 'Mixed',
    date: 'Yesterday',
    answered: '6/6 answered',
    duration: '5 min',
    badge: 'Strong hire',
    badgeColor: 'bg-emerald-500/15 text-emerald-400',
  },
  {
    score: 72,
    role: 'Backend Engineer',
    type: 'Technical',
    date: '2 days ago',
    answered: '5/5 answered',
    duration: '4 min',
    badge: 'Hire',
    badgeColor: 'bg-brand-500/15 text-brand-400',
  },
  {
    score: 92,
    role: 'Frontend Engineer',
    type: 'Mixed',
    date: '3 days ago',
    answered: '6/6 answered',
    duration: '5 min',
    badge: 'Strong hire',
    badgeColor: 'bg-emerald-500/15 text-emerald-400',
  },
  {
    score: 91,
    role: 'Frontend Engineer',
    type: 'Technical',
    date: '29 Sept',
    answered: '5/5 answered',
    duration: '5 min',
    badge: 'Strong hire',
    badgeColor: 'bg-emerald-500/15 text-emerald-400',
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// REUSABLE SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

/** Dashboard card wrapper */
function DCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-[hsl(222,24%,11%)] border border-white/5 rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}

/** Stat card (Sessions, Avg Score, etc.) */
function StatCard({
  icon,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  trend?: number[] | undefined;
}) {
  return (
    <DCard className="p-5 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          {label}
        </span>
        <span className="text-white/20">{icon}</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold text-white">{value}</span>
        {trend && <MiniSparkline data={trend} />}
      </div>
      <span className="text-xs text-white/40">{sub}</span>
    </DCard>
  );
}

/** Mini inline sparkline chart */
function MiniSparkline({ data }: { data: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const step = w / (data.length - 1);

    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'hsl(220 70% 65%)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      width={80}
      height={32}
      className="w-20 h-8 opacity-70"
    />
  );
}

// -- Score Trend Chart --------------------------------------------------------

function ScoreTrendChart({
  data,
  labels,
}: {
  data: number[];
  labels: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle retina
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padX = 40;
    const padY = 30;
    const chartW = w - padX - 20;
    const chartH = h - padY - 20;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    const gridSteps = [0, 25, 50, 75, 100];
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    gridSteps.forEach((v) => {
      const y = padY + chartH - (v / 100) * chartH;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(padX + chartW, y);
      ctx.stroke();
      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(String(v), padX - 8, y + 4);
    });
    ctx.setLineDash([]);

    // Data points
    const step = chartW / (data.length - 1);
    const points = data.map((v, i) => ({
      x: padX + i * step,
      y: padY + chartH - (v / 100) * chartH,
      value: v,
    }));

    // Fill area
    const gradient = ctx.createLinearGradient(0, padY, 0, padY + chartH);
    gradient.addColorStop(0, 'rgba(99,102,241,0.25)');
    gradient.addColorStop(1, 'rgba(99,102,241,0)');
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    if (firstPoint && lastPoint) {
      ctx.beginPath();
      ctx.moveTo(firstPoint.x, padY + chartH);
      points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(lastPoint.x, padY + chartH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Line
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = 'hsl(220 70% 65%)';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(220 70% 65%)';
      ctx.fill();
      ctx.strokeStyle = 'hsl(222,28%,11%)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Tooltip on last point
    const last = points[points.length - 1];
    if (last !== undefined) {
      ctx.fillStyle = 'rgba(30,30,50,0.95)';
      const tooltipW = 90;
      const tooltipH = 52;
      const tx = Math.min(last.x - tooltipW / 2, w - tooltipW - 10);
      const ty = last.y - tooltipH - 12;
      ctx.beginPath();
      ctx.roundRect(tx, ty, tooltipW, tooltipH, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${last.value}/100`, tx + tooltipW / 2, ty + 22);
      ctx.font = '10px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Frontend Eng.', tx + tooltipW / 2, ty + 38);
    }

    // X-axis labels
    labels.forEach((label, i) => {
      const x = padX + (i / (labels.length - 1)) * chartW;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, h - 4);
    });
  }, [data, labels, period]);

  return (
    <DCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Score trend</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Overall score per session
          </p>
        </div>
        <div className="flex bg-white/5 rounded-lg p-0.5">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={[
                'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                period === p
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-48"
        style={{ width: '100%', height: '192px' }}
      />
    </DCard>
  );
}

// -- Competencies Radar ------------------------------------------------------

function CompetenciesRadar({
  labels,
  current,
  previous,
}: {
  labels: string[];
  current: number[];
  previous: number[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 30;
    const n = labels.length;

    ctx.clearRect(0, 0, w, h);

    // Grid rings
    [0.25, 0.5, 0.75, 1].forEach((scale) => {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x = cx + Math.cos(angle) * r * scale;
        const y = cy + Math.sin(angle) * r * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Axes
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.stroke();
    }

    // Previous data (dashed, dimmer)
    const drawPoly = (
      values: number[],
      strokeColor: string,
      fillColor: string,
      dash: number[] = [],
    ) => {
      ctx.beginPath();
      ctx.setLineDash(dash);
      values.forEach((v, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x = cx + Math.cos(angle) * r * (v / 100);
        const y = cy + Math.sin(angle) * r * (v / 100);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.setLineDash([]);
    };

    drawPoly(
      previous,
      'rgba(255,255,255,0.2)',
      'rgba(255,255,255,0.03)',
      [4, 4],
    );
    drawPoly(current, 'hsl(260 80% 65%)', 'hsla(260,80%,65%,0.12)');

    // Labels
    labels.forEach((label, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const lx = cx + Math.cos(angle) * (r + 20);
      const ly = cy + Math.sin(angle) * (r + 20);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, ly);
    });
  }, [labels, current, previous]);

  return (
    <DCard className="p-5">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-white">Competencies</h3>
        <p className="text-xs text-white/40 mt-0.5">
          Last 5 sessions vs the 5 before
        </p>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ width: '100%', height: '220px' }}
      />
    </DCard>
  );
}

// -- Activity Heatmap --------------------------------------------------------

function ActivityHeatmap({ data }: { data: HeatmapDay[][] | number[][] }) {
  const cellSize = 16;
  const gap = 3;

  const totalSessions = useMemo(() => {
    if (!data || !Array.isArray(data)) return 0;
    let sum = 0;
    for (const week of data) {
      if (!Array.isArray(week)) continue;
      for (const day of week) {
        const count = typeof day === 'number' ? day : day?.count || 0;
        sum += count;
      }
    }
    return sum;
  }, [data]);

  return (
    <DCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Practice activity
          </h3>
          <p className="text-xs text-white/40 mt-0.5">
            {totalSessions > 0
              ? `${totalSessions} session${totalSessions !== 1 ? 's' : ''} completed in the last 14 weeks`
              : 'Sessions per day, last 14 weeks'}
          </p>
        </div>
        <span className="text-[11px] font-medium text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full border border-brand-500/20">
          14-Week View
        </span>
      </div>
      <div className="overflow-x-auto pb-2">
        <div
          className="flex gap-[3px]"
          style={{ minWidth: `${(data?.length || 14) * (cellSize + gap)}px` }}
        >
          {(data || []).map((week) => {
            const firstCell = week[0];
            const weekKey =
              typeof firstCell === 'object' &&
              firstCell !== null &&
              firstCell.date
                ? `week-${firstCell.date}`
                : `week-${JSON.stringify(week)}`;

            return (
              <div key={weekKey} className="flex flex-col gap-[3px]">
                {week.map((dayItem) => {
                  const isObj = typeof dayItem === 'object' && dayItem !== null;
                  const count = isObj ? dayItem.count : dayItem;
                  const level = isObj ? dayItem.level : count >= 3 ? 3 : count;
                  const isFuture = isObj ? Boolean(dayItem.isFuture) : false;

                  const title = isObj
                    ? isFuture
                      ? 'Upcoming'
                      : count === 0
                        ? `No sessions on ${dayItem.displayDate || dayItem.date}`
                        : `${count} session${count !== 1 ? 's' : ''} on ${dayItem.displayDate || dayItem.date}`
                    : `${dayItem} session${dayItem !== 1 ? 's' : ''}`;

                  const dayKey =
                    isObj && dayItem.date
                      ? dayItem.date
                      : `day-cell-${title}-${count}`;

                  return (
                    <div
                      key={dayKey}
                      className={`rounded-sm transition-all duration-150 ${
                        isFuture
                          ? 'opacity-20 cursor-default'
                          : 'hover:scale-110 hover:ring-1 hover:ring-white/40 cursor-pointer'
                      }`}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor:
                          level === 0
                            ? 'rgba(255,255,255,0.04)'
                            : level === 1
                              ? 'hsl(250 60% 35%)'
                              : level === 2
                                ? 'hsl(250 70% 50%)'
                                : 'hsl(250 80% 65%)',
                      }}
                      title={title}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-[10px] text-white/30">Less</span>
        {[0, 1, 2, 3].map((level) => (
          <div
            key={level}
            className="w-3 h-3 rounded-sm"
            style={{
              backgroundColor:
                level === 0
                  ? 'rgba(255,255,255,0.04)'
                  : level === 1
                    ? 'hsl(250 60% 35%)'
                    : level === 2
                      ? 'hsl(250 70% 50%)'
                      : 'hsl(250 80% 65%)',
            }}
          />
        ))}
        <span className="text-[10px] text-white/30">More</span>
      </div>
    </DCard>
  );
}

// -- Weekly Goal Ring --------------------------------------------------------

function WeeklyGoalRing({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progress = current / target;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 140 * dpr;
    canvas.height = 140 * dpr;
    ctx.scale(dpr, dpr);

    const cx = 70;
    const cy = 70;
    const r = 55;
    const lineWidth = 10;

    ctx.clearRect(0, 0, 140, 140);

    // Background track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    // Progress arc
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + Math.PI * 2 * Math.min(progress, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = 'hsl(220 70% 65%)';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Glow effect
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = 'rgba(99,102,241,0.3)';
    ctx.lineWidth = lineWidth + 6;
    ctx.lineCap = 'round';
    ctx.stroke();
  }, [progress]);

  return (
    <DCard className="p-5 flex flex-col items-center justify-center text-center">
      <div className="relative w-[140px] h-[140px]">
        <canvas
          ref={canvasRef}
          style={{ width: '140px', height: '140px' }}
          className="w-[140px] h-[140px]"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">
            {current}/{target}
          </span>
          <span className="text-[11px] text-white/40">Weekly goal</span>
        </div>
      </div>
      <p className="text-xs text-white/50 mt-3">
        {target - current > 0
          ? `${target - current} more to hit your goal`
          : 'Goal completed! Keep it up!'}
      </p>
    </DCard>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD PAGE
// ══════════════════════════════════════════════════════════════════════════════

export interface DashboardUser {
  name: string;
}

export interface DashboardStats {
  sessions: { value: number; sub: string; thisWeek?: number };
  avgScore: { value: number; sub: string; trend?: number[] };
  practiceTime: { value: string; sub: string };
  streak: { value: string; sub: string };
  sessionsThisWeek?: number;
}

export interface ScoreTrendData {
  labels: string[];
  data: number[];
}

export interface CompetenciesData {
  labels: string[];
  current: number[];
  previous: number[];
}

export interface AchievementItem {
  icon: React.ReactNode;
  title: string;
  sub: string;
  color: string;
  bg: string;
}

export interface DashboardClientProps {
  user?: DashboardUser;
  stats?: DashboardStats;
  scoreTrend?: ScoreTrendData;
  competencies?: CompetenciesData;
  achievements?: AchievementItem[];
  recentSessions?: SessionRow[];
  heatmapData?: HeatmapDay[][] | number[][];
  weeklyGoal?: { current: number; target: number };
}

export function DashboardClient({
  user,
  stats,
  scoreTrend,
  competencies,
  achievements,
  recentSessions,
  heatmapData: initialHeatmapData,
  weeklyGoal,
}: DashboardClientProps) {
  const router = useRouter();
  const heatmapData = initialHeatmapData || createEmptyHeatmapData();

  // Use dynamic data instead of MOCK_DATA
  const DATA_USER = user || MOCK_USER;
  const DATA_STATS = stats || MOCK_STATS;
  const DATA_SCORE_TREND = scoreTrend || MOCK_SCORE_TREND;
  const DATA_COMPETENCIES = competencies || MOCK_COMPETENCIES;
  const DATA_ACHIEVEMENTS = achievements || MOCK_ACHIEVEMENTS;
  const DATA_SESSIONS = recentSessions || MOCK_SESSIONS;

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      {/* ═══ HERO BANNER ═══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-[hsl(222,24%,13%)] to-[hsl(222,28%,10%)] border border-white/5 p-6 sm:p-8 lg:p-10">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-12">
          {/* Text content */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
              {greeting}, {DATA_USER.name}
            </p>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight mb-3">
              Practice like it&apos;s the real thing.
            </h1>
            <p className="text-sm text-white/50 leading-relaxed max-w-lg mb-6">
              Sit across from a lifelike interviewer, answer out loud, and get a
              scorecard with delivery and content feedback in minutes. Free,
              private, no sign-up.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.push('/dashboard/setup')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors shadow-lg shadow-brand-500/20"
              >
                <Zap size={16} />
                Quick start
              </button>
            </div>

            {/* AI quote bubble */}
            <div className="flex items-center gap-3 mt-6">
              <span className="px-2.5 py-1 rounded-full bg-brand-500/15 text-brand-400 text-xs font-semibold">
                Priya
              </span>
              <p className="text-sm text-white/40 italic">
                &ldquo;Ready when you are, {DATA_USER.name}. From deep Technical
                rounds to HR and System Design, what would you like to practice
                today?&rdquo;
              </p>
            </div>
          </div>

          {/* AI Avatar */}
          <div className="hidden lg:block shrink-0">
            <div className="relative w-[200px] h-[200px] rounded-2xl overflow-hidden">
              <Image
                src="/ai-avatar.jpg"
                alt="AI Interviewer"
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ STATS ROW ═════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<Clock size={16} />}
          label="Sessions"
          value={DATA_STATS.sessions.value}
          sub={DATA_STATS.sessions.sub}
        />
        <StatCard
          icon={<BarChart3 size={16} />}
          label="Avg Score"
          value={DATA_STATS.avgScore.value}
          sub={DATA_STATS.avgScore.sub}
          trend={DATA_STATS.avgScore.trend}
        />
        <StatCard
          icon={<Clock size={16} />}
          label="Practice Time"
          value={DATA_STATS.practiceTime.value}
          sub={DATA_STATS.practiceTime.sub}
        />
        <StatCard
          icon={<Flame size={16} />}
          label="Streak"
          value={DATA_STATS.streak.value}
          sub={DATA_STATS.streak.sub}
        />
      </section>

      {/* ═══ SCORE TREND + COMPETENCIES ═══════════════════════════════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="lg:col-span-3">
          <ScoreTrendChart
            data={DATA_SCORE_TREND.data}
            labels={DATA_SCORE_TREND.labels}
          />
        </div>
        <div className="lg:col-span-2">
          <CompetenciesRadar
            labels={DATA_COMPETENCIES.labels}
            current={DATA_COMPETENCIES.current}
            previous={DATA_COMPETENCIES.previous}
          />
        </div>
      </section>

      {/* ═══ ACTIVITY HEATMAP + WEEKLY GOAL ═══════════════════════════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="lg:col-span-3">
          <ActivityHeatmap data={heatmapData} />
        </div>
        <div className="lg:col-span-2">
          <WeeklyGoalRing
            current={weeklyGoal?.current ?? DATA_STATS.sessionsThisWeek ?? 0}
            target={weeklyGoal?.target ?? 3}
          />
        </div>
      </section>

      {/* ═══ RECOMMENDED FOCUS + ACHIEVEMENTS ════════════════════════════ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Recommended Focus */}
        <DCard className="p-5 sm:p-6">
          <span className="inline-block px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold mb-3">
            ✦ Recommended focus
          </span>
          <h3 className="text-lg font-bold text-white mb-1">Delivery</h3>
          <p className="text-sm text-white/40 leading-relaxed mb-4">
            Currently 81/100, your lowest area. Keep your pace near 130 to 160
            words per minute and pause instead of saying um.
          </p>
          <div className="w-full h-1.5 rounded-full bg-white/5 mb-4 overflow-hidden">
            <div
              className="h-full rounded-full bg-linear-to-r from-amber-500 to-orange-500"
              style={{ width: '81%' }}
            />
          </div>
          <button
            onClick={() => router.push('/dashboard/setup')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors"
          >
            Practice this <ArrowRight size={14} />
          </button>
        </DCard>

        {/* Achievements */}
        <DCard className="p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-white mb-4">
            Achievements
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {DATA_ACHIEVEMENTS.map((a, i) => (
              <div
                key={a.title || `achievement-${i}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
              >
                <div
                  className={`w-9 h-9 rounded-lg ${a.bg} flex items-center justify-center ${a.color}`}
                >
                  {a.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white/80 truncate">
                    {a.title}
                  </p>
                  <p className="text-[11px] text-white/40">{a.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </DCard>
      </section>

      {/* ═══ RECENT SESSIONS ═════════════════════════════════════════════ */}
      <section>
        <DCard className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">
              Recent sessions
            </h3>
            <button
              onClick={() => router.push('/dashboard/sessions')}
              className="text-xs text-white/40 hover:text-white/60 font-medium flex items-center gap-1 transition-colors"
            >
              View all <ChevronRight size={14} />
            </button>
          </div>
          <div className="divide-y divide-white/5">
            {DATA_SESSIONS.length === 0 ? (
              <div className="py-6 text-center text-white/40 text-sm">
                No recent sessions found. Start a new interview!
              </div>
            ) : (
              DATA_SESSIONS.map((s, i) => (
                <div
                  key={s.id || `session-${i}`}
                  onClick={() => router.push(`/dashboard/report/${s.id}`)}
                  className="flex items-center gap-4 py-3.5 group cursor-pointer hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors"
                >
                  {/* Score badge */}
                  <div
                    className={[
                      'w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0',
                      s.score >= 90
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : s.score >= 80
                          ? 'bg-brand-500/15 text-brand-400'
                          : 'bg-amber-500/15 text-amber-400',
                    ].join(' ')}
                  >
                    {s.score}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/80">
                      {s.role} · {s.type}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {s.date} · {s.answered} · {s.duration}
                    </p>
                  </div>

                  {/* Badge */}
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold ${s.badgeColor} hidden sm:inline-block`}
                  >
                    {s.badge}
                  </span>

                  <ChevronRight
                    size={16}
                    className="text-white/15 group-hover:text-white/30 transition-colors shrink-0"
                  />
                </div>
              ))
            )}
          </div>
        </DCard>
      </section>

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  );
}

export default DashboardClient;
