import {
  MAX_VND,
  parseLocalDate,
  parseVnd,
  recommendSavings,
  type SavingsRecommendation,
} from '../savings/goal';

export interface CommitmentItem {
  id: string;
  title: string;
  amountVnd: number;
  /** Calendar day of month (1..31) when this recurring bill is due. */
  dueDay: number;
}

export interface OnboardingGoalDraft {
  title: string;
  targetVnd: number;
  deadline: string; // 'YYYY-MM-DD'
  initialSavedVnd: number;
}

export interface OnboardingProfile {
  monthlyAllowanceVnd: number;
  commitments: CommitmentItem[];
  goal: OnboardingGoalDraft;
  completedAt: string;
}

export interface OnboardingBudgetPreview {
  monthlyAllowanceVnd: number;
  totalCommitmentsVnd: number;
  remainingDaysInMonth: number;
  goalRecommendation: SavingsRecommendation;
  recommendedDailySavingVnd: number;
  recommendedMonthlyDeductionVnd: number;
  periodSavingsReserveVnd: number;
  protectedVnd: number;
  discretionaryRawVnd: number;
  safeToSpendVnd: number;
  fundingShortfallVnd: number;
  dailyAllowanceVnd: number;
  isFeasible: boolean;
}

/** Student financial commitment presets (strictly budgeting — no food/pantry/recipe items). */
export const DEFAULT_STUDENT_COMMITMENT_PRESETS: ReadonlyArray<{
  title: string;
  amountVnd: number;
  dueDay: number;
}> = [
  { title: 'Tiền trọ', amountVnd: 1_500_000, dueDay: 5 },
  { title: 'Điện nước & Internet', amountVnd: 350_000, dueDay: 10 },
  { title: 'Học phí / Tài liệu', amountVnd: 500_000, dueDay: 15 },
  { title: 'Gửi xe & Đi lại', amountVnd: 200_000, dueDay: 1 },
];

export const STUDENT_ALLOWANCE_PRESETS: readonly number[] = [
  2_000_000,
  3_000_000,
  5_000_000,
];

export const STUDENT_GOAL_TITLE_PRESETS: readonly string[] = [
  'Quỹ dự phòng sinh viên',
  'Laptop học tập',
  'Học phí kỳ sau',
];

/**
 * Computes inclusive days remaining in the calendar month of `todayIso` (always >= 1).
 * Uses UTC calendar arithmetic on strict YYYY-MM-DD so local device DST cannot skew counts.
 */
export function daysRemainingInMonth(todayIso: string): number {
  const dayNum = parseLocalDate(todayIso);
  if (dayNum === null) {
    throw new Error(`Invalid ISO date: ${todayIso}`);
  }
  const [year, month, day] = todayIso.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.max(1, daysInMonth - day + 1);
}

/**
 * Adds `months` calendar months to `isoDate`, clamping to the target month's last day
 * (e.g. 2026-01-31 + 1 month -> 2026-02-28; 2028-01-31 + 1 month -> 2028-02-29).
 */
export function addMonthsClamped(isoDate: string, months: number): string {
  if (parseLocalDate(isoDate) === null) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const totalMonths = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonthIndex = ((totalMonths % 12) + 12) % 12; // 0..11
  const maxDayInNextMonth = new Date(Date.UTC(nextYear, nextMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDayInNextMonth);
  const mm = String(nextMonthIndex + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${nextYear}-${mm}-${dd}`;
}

/**
 * Deterministic student onboarding budget & savings deduction calculator (plan §7).
 * Uses integer VND only; never hides funding shortfall behind zero.
 */
export function calculateOnboardingBudgetPreview(input: {
  monthlyAllowanceVnd: number;
  commitments: ReadonlyArray<Pick<CommitmentItem, 'amountVnd'>>;
  goal: OnboardingGoalDraft;
  today: string;
}): OnboardingBudgetPreview {
  const remainingDaysInMonth = daysRemainingInMonth(input.today);
  const totalCommitmentsVnd = input.commitments.reduce(
    (sum, item) => sum + Math.max(0, Math.trunc(item.amountVnd)),
    0
  );

  const goalRecommendation = recommendSavings({
    targetVnd: input.goal.targetVnd,
    savedVnd: input.goal.initialSavedVnd,
    today: input.today,
    deadline: input.goal.deadline,
  });

  const recommendedDailySavingVnd = goalRecommendation.dailyVnd ?? 0;
  const recommendedMonthlyDeductionVnd = goalRecommendation.thirtyDayVnd ?? 0;
  const periodSavingsReserveVnd =
    goalRecommendation.status === 'on_track' || goalRecommendation.status === 'due_today'
      ? Math.min(
          goalRecommendation.remainingVnd,
          recommendedDailySavingVnd * remainingDaysInMonth
        )
      : 0;

  const protectedVnd =
    totalCommitmentsVnd + Math.max(0, Math.trunc(input.goal.initialSavedVnd)) + periodSavingsReserveVnd;
  const discretionaryRawVnd = Math.trunc(input.monthlyAllowanceVnd) - protectedVnd;
  const safeToSpendVnd = Math.max(0, discretionaryRawVnd);
  const fundingShortfallVnd = Math.max(0, -discretionaryRawVnd);
  const dailyAllowanceVnd = Math.floor(safeToSpendVnd / remainingDaysInMonth);

  return {
    monthlyAllowanceVnd: Math.trunc(input.monthlyAllowanceVnd),
    totalCommitmentsVnd,
    remainingDaysInMonth,
    goalRecommendation,
    recommendedDailySavingVnd,
    recommendedMonthlyDeductionVnd,
    periodSavingsReserveVnd,
    protectedVnd,
    discretionaryRawVnd,
    safeToSpendVnd,
    fundingShortfallVnd,
    dailyAllowanceVnd,
    isFeasible: fundingShortfallVnd === 0,
  };
}

export function validateCommitmentDraft(input: {
  title: string;
  amountText: string;
  dueDay: number;
}): { ok: true; title: string; amountVnd: number; dueDay: number } | { ok: false; error: string } {
  const title = input.title.trim();
  if (title.length < 2) {
    return { ok: false, error: 'Vui lòng nhập tên khoản chi cố định (tối thiểu 2 ký tự).' };
  }
  const amountVnd = parseVnd(input.amountText);
  if (amountVnd === null) {
    return { ok: false, error: 'Số tiền khoản cố định phải lớn hơn 0 VND.' };
  }
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) {
    return { ok: false, error: 'Ngày đến hạn phải nằm trong khoảng 1 đến 31.' };
  }
  return { ok: true, title, amountVnd, dueDay: input.dueDay };
}

export function validateOnboardingGoal(input: {
  title: string;
  targetText: string;
  savedText: string;
  deadline: string;
  today: string;
}): { ok: true; goal: OnboardingGoalDraft } | { ok: false; error: string } {
  const title = input.title.trim();
  if (title.length < 2) {
    return { ok: false, error: 'Vui lòng đặt tên cho mục tiêu tiết kiệm.' };
  }
  const targetVnd = parseVnd(input.targetText);
  if (targetVnd === null) {
    return { ok: false, error: 'Số tiền mục tiêu phải là số nguyên dương hợp lệ (VND).' };
  }

  const trimmedSaved = input.savedText.trim();
  let initialSavedVnd = 0;
  if (trimmedSaved !== '' && trimmedSaved !== '0') {
    const parsedSaved = parseVnd(trimmedSaved);
    if (parsedSaved === null || parsedSaved > MAX_VND) {
      return { ok: false, error: 'Số tiền đã tiết kiệm không hợp lệ.' };
    }
    initialSavedVnd = parsedSaved;
  }

  const deadlineDay = parseLocalDate(input.deadline);
  const todayDay = parseLocalDate(input.today);
  if (deadlineDay === null || todayDay === null) {
    return { ok: false, error: 'Hạn mục tiêu cần đúng định dạng YYYY-MM-DD.' };
  }
  if (deadlineDay < todayDay) {
    return { ok: false, error: 'Hạn mục tiêu không được trước hôm nay.' };
  }

  return {
    ok: true,
    goal: {
      title,
      targetVnd,
      deadline: input.deadline.trim(),
      initialSavedVnd,
    },
  };
}
