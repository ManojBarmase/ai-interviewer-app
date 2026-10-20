import 'server-only';

/**
 * Dashboard Analytics & Heatmap Service
 * Provides aggregation for interview activity heatmaps, practice streaks,
 * and weekly goal tracking in compliance with enterprise standards.
 */

export interface HeatmapDay {
  date: string; // ISO format: "YYYY-MM-DD"
  displayDate: string; // "Sun, Oct 18, 2026"
  count: number;
  level: number; // 0 (empty), 1 (1 session), 2 (2 sessions), 3 (3+ sessions)
  isFuture: boolean;
}

export interface StreakInfo {
  streak: number;
  activeToday: boolean;
  label: string;
  sub: string;
}

export interface WeeklyGoalInfo {
  current: number;
  target: number;
  percentage: number;
  sub: string;
  achieved: boolean;
}

/** Formats date into local "YYYY-MM-DD" key */
export function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Formats date for display in tooltips */
export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Generates deterministic activity heatmap data for the past N weeks (default 14 weeks = 98 days).
 * Aligns columns to weeks (Sunday to Saturday) ending on the current week.
 */
export function generateRealHeatmapData(
  sessionDates: Array<Date | string>,
  referenceDate: Date = new Date(),
  weeksCount = 14,
): HeatmapDay[][] {
  const countByDate = new Map<string, number>();
  for (const rawDate of sessionDates) {
    if (!rawDate) continue;
    const d = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
    if (isNaN(d.getTime())) continue;
    const key = formatISODate(d);
    countByDate.set(key, (countByDate.get(key) || 0) + 1);
  }

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();
  const refDayOfWeek = referenceDate.getDay();

  const currentWeekSunday = new Date(refYear, refMonth, refDay - refDayOfWeek);
  currentWeekSunday.setHours(0, 0, 0, 0);

  const gridStartDate = new Date(
    currentWeekSunday.getFullYear(),
    currentWeekSunday.getMonth(),
    currentWeekSunday.getDate() - (weeksCount - 1) * 7,
  );
  gridStartDate.setHours(0, 0, 0, 0);

  const todayMid = new Date(
    refYear,
    refMonth,
    refDay,
    23,
    59,
    59,
    999,
  ).getTime();
  const weeks: HeatmapDay[][] = [];

  for (let w = 0; w < weeksCount; w++) {
    const week: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(
        gridStartDate.getFullYear(),
        gridStartDate.getMonth(),
        gridStartDate.getDate() + (w * 7 + d),
      );
      cellDate.setHours(0, 0, 0, 0);

      const cellKey = formatISODate(cellDate);
      const isFuture = cellDate.getTime() > todayMid;
      const count = isFuture ? 0 : countByDate.get(cellKey) || 0;

      const level =
        isFuture || count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;

      week.push({
        date: cellKey,
        displayDate: formatDisplayDate(cellDate),
        count,
        level,
        isFuture,
      });
    }
    weeks.push(week);
  }

  return weeks;
}

/**
 * Creates empty fallback heatmap data
 */
export function createEmptyHeatmapData(weeksCount = 14): HeatmapDay[][] {
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

/**
 * Calculates current practice streak based on consecutive calendar days of completed sessions.
 */
export function calculatePracticeStreak(
  sessionDates: Array<Date | string>,
  referenceDate: Date = new Date(),
): StreakInfo {
  const uniqueDates = new Set<string>();
  for (const rawDate of sessionDates) {
    if (!rawDate) continue;
    const d = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
    if (isNaN(d.getTime())) continue;
    uniqueDates.add(formatISODate(d));
  }

  const todayKey = formatISODate(referenceDate);
  const yesterday = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate() - 1,
  );
  const yesterdayKey = formatISODate(yesterday);

  const activeToday = uniqueDates.has(todayKey);
  const activeYesterday = uniqueDates.has(yesterdayKey);

  if (!activeToday && !activeYesterday) {
    return {
      streak: 0,
      activeToday: false,
      label: '0d',
      sub: 'Complete a session to start your streak',
    };
  }

  const checkDate = activeToday
    ? new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate(),
      )
    : new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate(),
      );

  let streak = 0;
  while (uniqueDates.has(formatISODate(checkDate))) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return {
    streak,
    activeToday,
    label: `${streak}d`,
    sub: activeToday
      ? 'Streak extended today!'
      : 'Practice today to keep it going',
  };
}

/**
 * Calculates sessions completed during the current calendar week vs weekly target.
 */
export function calculateWeeklyGoal(
  sessionDates: Array<Date | string>,
  target = 3,
  referenceDate: Date = new Date(),
): WeeklyGoalInfo {
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();
  const dayOfWeek = referenceDate.getDay();
  const distanceToMonday = (dayOfWeek + 6) % 7;

  const monday = new Date(refYear, refMonth, refDay - distanceToMonday);
  monday.setHours(0, 0, 0, 0);

  const nextMonday = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + 7,
  );

  let current = 0;
  for (const rawDate of sessionDates) {
    if (!rawDate) continue;
    const d = typeof rawDate === 'string' ? new Date(rawDate) : rawDate;
    if (isNaN(d.getTime())) continue;
    if (d >= monday && d < nextMonday) {
      current++;
    }
  }

  return {
    current,
    target,
    percentage: Math.min(100, Math.round((current / target) * 100)),
    sub: `${current} this week`,
    achieved: current >= target,
  };
}
