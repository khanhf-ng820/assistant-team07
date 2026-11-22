// Deterministic savings-goal arithmetic (plan §7): integer VND, local dates.

export type GoalStatus = 'on_track' | 'due_today' | 'overdue' | 'completed';

type RecommendationBase = {
  remainingVnd: number;
  /** Days from tomorrow through the deadline; negative when overdue. */
  savingDays: number;
  progressPercent: number;
};

/**
 * Daily amounts exist only while there is time left to save; completed and
 * overdue goals carry null so callers must handle them explicitly.
 */
export type SavingsRecommendation = RecommendationBase &
  (
    | {
        status: Extract<GoalStatus, 'on_track' | 'due_today'>;
        /** Suggested daily saving. */
        dailyVnd: number;
        /** 30-day projection of the daily saving, capped at the remaining target. */
        thirtyDayVnd: number;
      }
    | { status: Extract<GoalStatus, 'overdue' | 'completed'>; dailyVnd: null; thirtyDayVnd: null }
  );

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MAX_VND = 1_000_000_000_000;

/** Parse a strict YYYY-MM-DD calendar date into a UTC day number, or null. */
export function parseLocalDate(value: string): number | null {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return time / 86_400_000;
}

/** Today's date in Vietnam (UTC+7, no daylight saving) as YYYY-MM-DD. */
export function todayInVietnam(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const day = parseLocalDate(date);
  if (day === null) throw new Error(`Invalid date: ${date}`);
  return new Date((day + days) * 86_400_000).toISOString().slice(0, 10);
}

export function progressPercent(targetVnd: number, savedVnd: number): number {
  if (targetVnd <= 0) return 0;
  return Math.min(100, Math.max(0, Math.floor((savedVnd * 100) / targetVnd)));
}

export function recommendSavings(input: {
  targetVnd: number;
  savedVnd: number;
  today: string;
  deadline: string;
}): SavingsRecommendation {
  const today = parseLocalDate(input.today);
  const deadline = parseLocalDate(input.deadline);
  if (today === null || deadline === null) throw new Error('Invalid date');

  const remainingVnd = Math.max(0, input.targetVnd - input.savedVnd);
  const savingDays = deadline - today;
  const progress = progressPercent(input.targetVnd, input.savedVnd);
  const base = { remainingVnd, savingDays, progressPercent: progress };

  if (remainingVnd === 0) return { ...base, status: 'completed', dailyVnd: null, thirtyDayVnd: null };
  if (savingDays < 0) return { ...base, status: 'overdue', dailyVnd: null, thirtyDayVnd: null };
  if (savingDays === 0) return { ...base, status: 'due_today', dailyVnd: remainingVnd, thirtyDayVnd: remainingVnd };

  const dailyVnd = Math.ceil(remainingVnd / savingDays);
  return {
    ...base,
    status: 'on_track',
    dailyVnd,
    thirtyDayVnd: Math.min(remainingVnd, dailyVnd * 30),
  };
}

/** Parse a user-typed VND amount (digits with optional . , or space separators). */
export function parseVnd(text: string): number | null {
  const digits = text.replace(/[.,\s]/g, '');
  if (!/^\d{1,13}$/.test(digits)) return null;
  const value = Number(digits);
  return value >= 1 && value <= MAX_VND ? value : null;
}

/** Format integer VND as "1.250.000 ₫" without relying on device Intl data. */
export function formatVnd(value: number): string {
  const sign = value < 0 ? '-' : '';
  const grouped = String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped} ₫`;
}
