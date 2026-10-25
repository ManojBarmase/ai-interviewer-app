import { describe, it, expect } from 'vitest';

import {
  formatISODate,
  calculatePracticeStreak,
  calculateWeeklyGoal,
  generateRealHeatmapData,
} from '@/server/services/analytics.service';

describe('AnalyticsService', () => {
  describe('formatISODate', () => {
    it('returns "YYYY-MM-DD" format', () => {
      const date = new Date(2026, 11, 25); // Dec 25, 2026
      expect(formatISODate(date)).toBe('2026-12-25');
    });

    it('correctly pads single-digit month and day', () => {
      const date = new Date(2026, 3, 5); // April 5, 2026 (Month index 3 = April)
      expect(formatISODate(date)).toBe('2026-04-05');
    });
  });

  describe('calculatePracticeStreak', () => {
    const fixedToday = new Date(2026, 9, 25, 14, 0, 0); // Oct 25, 2026

    it('returns streak: 0 when no sessions', () => {
      const result = calculatePracticeStreak([], fixedToday);
      expect(result.streak).toBe(0);
      expect(result.activeToday).toBe(false);
      expect(result.label).toBe('0d');
    });

    it('returns streak: 1 when only today has a session', () => {
      const sessions = [new Date(2026, 9, 25, 10, 0, 0)];
      const result = calculatePracticeStreak(sessions, fixedToday);
      expect(result.streak).toBe(1);
      expect(result.activeToday).toBe(true);
      expect(result.label).toBe('1d');
    });

    it('returns streak: 3 when last 3 consecutive days have sessions', () => {
      const sessions = [
        new Date(2026, 9, 25, 9, 0, 0), // Today (Oct 25)
        new Date(2026, 9, 24, 11, 0, 0), // Yesterday (Oct 24)
        new Date(2026, 9, 23, 16, 0, 0), // 2 days ago (Oct 23)
      ];
      const result = calculatePracticeStreak(sessions, fixedToday);
      expect(result.streak).toBe(3);
      expect(result.activeToday).toBe(true);
      expect(result.label).toBe('3d');
    });

    it('returns correct streak when gap exists in history', () => {
      const sessions = [
        new Date(2026, 9, 25, 9, 0, 0), // Today (Oct 25)
        new Date(2026, 9, 24, 11, 0, 0), // Yesterday (Oct 24)
        // Gap on Oct 23 and Oct 22
        new Date(2026, 9, 21, 14, 0, 0),
        new Date(2026, 9, 20, 10, 0, 0),
      ];
      const result = calculatePracticeStreak(sessions, fixedToday);
      expect(result.streak).toBe(2);
      expect(result.activeToday).toBe(true);
    });

    it('activeToday is true when today has a session', () => {
      const sessions = [new Date(2026, 9, 25, 12, 0, 0)];
      const result = calculatePracticeStreak(sessions, fixedToday);
      expect(result.activeToday).toBe(true);
    });

    it('activeToday is false when only yesterday has a session', () => {
      const sessions = [new Date(2026, 9, 24, 18, 0, 0)];
      const result = calculatePracticeStreak(sessions, fixedToday);
      expect(result.activeToday).toBe(false);
      expect(result.streak).toBe(1);
    });
  });

  describe('calculateWeeklyGoal', () => {
    // Oct 21, 2026 is a Wednesday.
    // Week spans Monday Oct 19 to Sunday Oct 25.
    const wednesday = new Date(2026, 9, 21, 12, 0, 0);

    it('returns current: 0 when no sessions this week', () => {
      const result = calculateWeeklyGoal([], 3, wednesday);
      expect(result.current).toBe(0);
      expect(result.percentage).toBe(0);
      expect(result.achieved).toBe(false);
    });

    it('counts only sessions within current Monday-to-Sunday window', () => {
      const sessions = [
        new Date(2026, 9, 19, 10, 0, 0), // Monday this week
        new Date(2026, 9, 21, 14, 0, 0), // Wednesday this week
      ];
      const result = calculateWeeklyGoal(sessions, 3, wednesday);
      expect(result.current).toBe(2);
      expect(result.percentage).toBe(67);
      expect(result.achieved).toBe(false);
    });

    it('does not count sessions from last week', () => {
      const sessions = [
        new Date(2026, 9, 18, 20, 0, 0), // Sunday of last week
        new Date(2026, 9, 15, 12, 0, 0), // Thursday of last week
      ];
      const result = calculateWeeklyGoal(sessions, 3, wednesday);
      expect(result.current).toBe(0);
      expect(result.achieved).toBe(false);
    });

    it('returns achieved: true when current >= target', () => {
      const sessions = [
        new Date(2026, 9, 19, 10, 0, 0),
        new Date(2026, 9, 20, 11, 0, 0),
        new Date(2026, 9, 21, 12, 0, 0),
      ];
      const result = calculateWeeklyGoal(sessions, 3, wednesday);
      expect(result.current).toBe(3);
      expect(result.percentage).toBe(100);
      expect(result.achieved).toBe(true);
    });

    it('returns percentage: 100 when current exceeds target', () => {
      const sessions = [
        new Date(2026, 9, 19, 10, 0, 0),
        new Date(2026, 9, 20, 11, 0, 0),
        new Date(2026, 9, 21, 12, 0, 0),
        new Date(2026, 9, 21, 18, 0, 0),
      ];
      const result = calculateWeeklyGoal(sessions, 3, wednesday);
      expect(result.current).toBe(4);
      expect(result.percentage).toBe(100);
      expect(result.achieved).toBe(true);
    });
  });

  describe('generateRealHeatmapData', () => {
    const fixedRef = new Date(2026, 9, 21, 12, 0, 0); // Wednesday, Oct 21, 2026

    it('returns exactly weeksCount weeks (default 14)', () => {
      const heatmap = generateRealHeatmapData([], fixedRef);
      expect(heatmap).toHaveLength(14);

      const customWeeks = generateRealHeatmapData([], fixedRef, 8);
      expect(customWeeks).toHaveLength(8);
    });

    it('each week has exactly 7 days', () => {
      const heatmap = generateRealHeatmapData([], fixedRef, 14);
      for (const week of heatmap) {
        expect(week).toHaveLength(7);
      }
    });

    it('future dates have isFuture: true and count: 0', () => {
      const futureSession = new Date(2026, 9, 24); // Saturday Oct 24 (future relative to Wed Oct 21)
      const heatmap = generateRealHeatmapData([futureSession], fixedRef, 14);

      const allDays = heatmap.flat();
      const futureDays = allDays.filter((d) => d.isFuture);

      expect(futureDays.length).toBeGreaterThan(0);
      for (const day of futureDays) {
        expect(day.count).toBe(0);
        expect(day.level).toBe(0);
      }
    });

    it('past dates with activity have correct count', () => {
      const sessions = [
        new Date(2026, 9, 20, 10, 0, 0),
        new Date(2026, 9, 20, 14, 0, 0),
      ];
      const heatmap = generateRealHeatmapData(sessions, fixedRef, 14);
      const allDays = heatmap.flat();
      const oct20 = allDays.find((d) => d.date === '2026-10-20');

      expect(oct20).toBeDefined();
      expect(oct20?.count).toBe(2);
      expect(oct20?.level).toBe(2);
      expect(oct20?.isFuture).toBe(false);
    });

    it('level is 0 for count 0, 1 for count 1, 2 for count 2, 3 for count 3+', () => {
      const sessions = [
        new Date(2026, 9, 17, 10, 0, 0), // 1 session
        new Date(2026, 9, 18, 10, 0, 0), // 2 sessions
        new Date(2026, 9, 18, 11, 0, 0),
        new Date(2026, 9, 19, 10, 0, 0), // 3 sessions
        new Date(2026, 9, 19, 11, 0, 0),
        new Date(2026, 9, 19, 12, 0, 0),
        new Date(2026, 9, 20, 10, 0, 0), // 4 sessions (3+)
        new Date(2026, 9, 20, 11, 0, 0),
        new Date(2026, 9, 20, 12, 0, 0),
        new Date(2026, 9, 20, 13, 0, 0),
      ];

      const heatmap = generateRealHeatmapData(sessions, fixedRef, 14);
      const allDays = heatmap.flat();

      const emptyDay = allDays.find((d) => d.date === '2026-10-16');
      const day1 = allDays.find((d) => d.date === '2026-10-17');
      const day2 = allDays.find((d) => d.date === '2026-10-18');
      const day3 = allDays.find((d) => d.date === '2026-10-19');
      const day4 = allDays.find((d) => d.date === '2026-10-20');

      expect(emptyDay?.level).toBe(0);
      expect(day1?.level).toBe(1);
      expect(day2?.level).toBe(2);
      expect(day3?.level).toBe(3);
      expect(day4?.level).toBe(3);
    });
  });
});
