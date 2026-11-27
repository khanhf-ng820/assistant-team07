import type { BudgetSummaryResponse } from '../api/contracts';
import { formatVndDigits } from '../format';
import { DailyExpenseSummary } from '../types/transaction';

export type ServerBudgetRecoveryInput = Pick<
  BudgetSummaryResponse,
  | 'daily_budget'
  | 'spent_today'
  | 'overspent_amount_today'
  | 'days_remaining'
  | 'subsequent_daily_budget'
>;

export type BudgetRecoverySource = 'server_budget_summary' | 'local_ledger_estimate';

export type ProactiveAlertKind = 'overspending' | 'evening_checkin';

export type ProactiveAlertSeverity = 'danger' | 'warning';

export type NotificationActionTarget =
  | 'open_budget_recovery'
  | 'open_manual_entry'
  | 'open_stats';

export interface ProactiveAlert {
  id: string;
  kind: ProactiveAlertKind;
  severity: ProactiveAlertSeverity;
  title: string;
  message: string;
  date: string;
  overspentAmount?: number;
  primaryActionLabel: string;
  primaryActionTarget: NotificationActionTarget;
}

export interface BudgetRecoveryPlan {
  date: string;
  dailyBudgetLimit: number;
  spentToday: number;
  overspentAmount: number;
  remainingDaysInMonth: number;
  suggestedDailyReduction: number;
  adjustedDailyAllowance: number;
  canRecoverWithinMonth: boolean;
  summaryText: string;
  source: BudgetRecoverySource;
}

export interface ReminderPreferences {
  enabled: boolean;
  eveningHour: number;
  eveningMinute: number;
  overspendingAlertsEnabled: boolean;
  hideAmountOnPush: boolean;
}

export const DEFAULT_EVENING_CHECKIN_HOUR = 20;
export const DEFAULT_EVENING_CHECKIN_MINUTE = 0;

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  enabled: false,
  eveningHour: DEFAULT_EVENING_CHECKIN_HOUR,
  eveningMinute: DEFAULT_EVENING_CHECKIN_MINUTE,
  overspendingAlertsEnabled: true,
  hideAmountOnPush: false,
};

export const EVENING_CHECKIN_TITLE = 'Nhắc nhở buổi tối';
export const EVENING_CHECKIN_MESSAGE = 'Buổi tối: Bạn chưa nhập khoản chi nào hôm nay';

export const OVERSPENDING_ALERT_TITLE = 'Cảnh báo vượt hạn mức ngày';
export const OVERSPENDING_PRIVATE_PUSH_MESSAGE =
  'Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức ngày!';

export const GENERIC_SCHEDULED_REMINDER_TITLE = 'Nhắc nhở ghi chi tiêu CARENTA';
export const GENERIC_SCHEDULED_REMINDER_BODY = 'Kiểm tra và ghi lại chi tiêu hôm nay';

const ALLOWED_NOTIFICATION_TARGETS = new Set<NotificationActionTarget>([
  'open_budget_recovery',
  'open_manual_entry',
  'open_stats',
]);

/** Formats the overspending warning message with integer VND grouping. */
export function formatOverspendingAlertMessage(overspentAmount: number): string {
  const normalized = Math.max(0, Math.trunc(overspentAmount));
  return `Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức ${formatVndDigits(normalized)}đ!`;
}

/** Formats the overspending local push body, optionally hiding exact amounts on the lock screen. */
export function formatOverspendingPushBody(
  overspentAmount: number,
  hideAmount: boolean
): string {
  return hideAmount
    ? OVERSPENDING_PRIVATE_PUSH_MESSAGE
    : formatOverspendingAlertMessage(overspentAmount);
}

/**
 * Evaluates whether confirmed daily spending exceeds the saved daily budget limit.
 * Uses deterministic integer VND comparison without mutating state.
 */
export function evaluateOverspendingAlert(
  summary: DailyExpenseSummary,
  dailyBudgetLimit: number
): ProactiveAlert | null {
  if (dailyBudgetLimit <= 0 || summary.totalSpent <= dailyBudgetLimit) {
    return null;
  }

  const overspentAmount = Math.trunc(summary.totalSpent - dailyBudgetLimit);
  return {
    id: `overspending:${summary.date}:${overspentAmount}`,
    kind: 'overspending',
    severity: 'danger',
    title: OVERSPENDING_ALERT_TITLE,
    message: formatOverspendingAlertMessage(overspentAmount),
    date: summary.date,
    overspentAmount,
    primaryActionLabel: 'Xem kế hoạch điều chỉnh',
    primaryActionTarget: 'open_budget_recovery',
  };
}

/**
 * Evaluates whether the evening check-in alert should surface when no expenses
 * have been recorded for the active day at or after the configured check-in time.
 */
export function evaluateEveningCheckInAlert(
  summary: DailyExpenseSummary,
  currentHour: number,
  currentMinute: number,
  eveningHour: number = DEFAULT_EVENING_CHECKIN_HOUR,
  eveningMinute: number = DEFAULT_EVENING_CHECKIN_MINUTE
): ProactiveAlert | null {
  if (summary.transactions.length > 0) {
    return null;
  }

  const clampedTime = clampReminderTime(eveningHour, eveningMinute);
  const currentTotalMinutes = Math.trunc(currentHour) * 60 + Math.trunc(currentMinute);
  const thresholdTotalMinutes = clampedTime.eveningHour * 60 + clampedTime.eveningMinute;

  if (currentTotalMinutes < thresholdTotalMinutes) {
    return null;
  }

  return {
    id: `evening_checkin:${summary.date}`,
    kind: 'evening_checkin',
    severity: 'warning',
    title: EVENING_CHECKIN_TITLE,
    message: EVENING_CHECKIN_MESSAGE,
    date: summary.date,
    primaryActionLabel: 'Ghi chi tiêu ngay',
    primaryActionTarget: 'open_manual_entry',
  };
}

function formatRecoverySummaryText(
  overspentAmount: number,
  remainingDaysInMonth: number,
  suggestedDailyReduction: number,
  adjustedDailyAllowance: number,
  canRecoverWithinMonth: boolean
): string {
  if (overspentAmount === 0) {
    return 'Chi tiêu hôm nay vẫn nằm trong hạn mức ngày đã đặt.';
  }
  if (remainingDaysInMonth === 0) {
    return `Hôm nay là ngày cuối tháng; phần vượt ${formatVndDigits(overspentAmount)}đ sẽ cần cân đối lại khi lập kế hoạch tháng mới.`;
  }
  return canRecoverWithinMonth
    ? `Giảm khoảng ${formatVndDigits(suggestedDailyReduction)}đ/ngày trong ${remainingDaysInMonth} ngày còn lại của tháng (còn ${formatVndDigits(adjustedDailyAllowance)}đ/ngày) để bù phần vượt mức.`
    : `Khoản vượt ${formatVndDigits(overspentAmount)}đ lớn hơn tổng hạn mức của ${remainingDaysInMonth} ngày còn lại; cần xem lại khoản chi hoặc bổ sung nguồn thu.`;
}

/**
 * Builds the budget-recovery preview directly from the deterministic server
 * `/budget/summary` response (`subsequent_daily_budget`) so mobile and API never drift.
 */
export function buildBudgetRecoveryPlanFromServerSummary(
  date: string,
  serverSummary: ServerBudgetRecoveryInput
): BudgetRecoveryPlan {
  const dailyBudgetLimit = Math.max(0, Math.trunc(serverSummary.daily_budget));
  const spentToday = Math.max(0, Math.trunc(serverSummary.spent_today));
  const overspentAmount = Math.max(0, Math.trunc(serverSummary.overspent_amount_today));
  const remainingDaysInMonth = Math.max(0, Math.trunc(serverSummary.days_remaining) - 1);
  const adjustedDailyAllowance =
    overspentAmount === 0
      ? dailyBudgetLimit
      : remainingDaysInMonth === 0
        ? 0
        : Math.max(0, Math.trunc(serverSummary.subsequent_daily_budget));

  const suggestedDailyReduction =
    overspentAmount === 0
      ? 0
      : remainingDaysInMonth === 0
        ? overspentAmount
        : Math.max(0, dailyBudgetLimit - adjustedDailyAllowance);

  const canRecoverWithinMonth =
    overspentAmount === 0 || (remainingDaysInMonth > 0 && adjustedDailyAllowance > 0);

  return {
    date,
    dailyBudgetLimit,
    spentToday,
    overspentAmount,
    remainingDaysInMonth,
    suggestedDailyReduction,
    adjustedDailyAllowance,
    canRecoverWithinMonth,
    summaryText: formatRecoverySummaryText(
      overspentAmount,
      remainingDaysInMonth,
      suggestedDailyReduction,
      adjustedDailyAllowance,
      canRecoverWithinMonth
    ),
    source: 'server_budget_summary',
  };
}

/**
 * Computes a deterministic budget-recovery preview for an overspent day
 * without modifying savings goals or creating transactions (plan §7 & §10).
 * Uses the server `/budget/summary` figures when available, falling back to
 * the same `floor(remainingPool / remainingDays)` integer rule locally.
 */
export function buildBudgetRecoveryPlan(
  summary: DailyExpenseSummary,
  dailyBudgetLimit: number,
  serverSummary?: ServerBudgetRecoveryInput
): BudgetRecoveryPlan {
  if (serverSummary) {
    return buildBudgetRecoveryPlanFromServerSummary(summary.date, serverSummary);
  }

  const safeLimit = Math.max(0, Math.trunc(dailyBudgetLimit));
  const spentToday = Math.max(0, Math.trunc(summary.totalSpent));
  const overspentAmount = Math.max(0, spentToday - safeLimit);

  const daysInMonth = new Date(summary.year, summary.month, 0).getDate();
  const remainingDaysInMonth = Math.max(0, daysInMonth - summary.dayNumber);

  if (overspentAmount === 0) {
    return {
      date: summary.date,
      dailyBudgetLimit: safeLimit,
      spentToday,
      overspentAmount: 0,
      remainingDaysInMonth,
      suggestedDailyReduction: 0,
      adjustedDailyAllowance: safeLimit,
      canRecoverWithinMonth: true,
      summaryText: formatRecoverySummaryText(0, remainingDaysInMonth, 0, safeLimit, true),
      source: 'local_ledger_estimate',
    };
  }

  if (remainingDaysInMonth === 0) {
    return {
      date: summary.date,
      dailyBudgetLimit: safeLimit,
      spentToday,
      overspentAmount,
      remainingDaysInMonth: 0,
      suggestedDailyReduction: overspentAmount,
      adjustedDailyAllowance: 0,
      canRecoverWithinMonth: false,
      summaryText: formatRecoverySummaryText(overspentAmount, 0, overspentAmount, 0, false),
      source: 'local_ledger_estimate',
    };
  }

  const remainingPool = Math.max(0, safeLimit * (remainingDaysInMonth + 1) - spentToday);
  const adjustedDailyAllowance =
    remainingPool > 0 ? Math.floor(remainingPool / remainingDaysInMonth) : 0;
  const suggestedDailyReduction = Math.max(0, safeLimit - adjustedDailyAllowance);
  const canRecoverWithinMonth = remainingPool > 0 && adjustedDailyAllowance > 0;

  return {
    date: summary.date,
    dailyBudgetLimit: safeLimit,
    spentToday,
    overspentAmount,
    remainingDaysInMonth,
    suggestedDailyReduction,
    adjustedDailyAllowance,
    canRecoverWithinMonth,
    summaryText: formatRecoverySummaryText(
      overspentAmount,
      remainingDaysInMonth,
      suggestedDailyReduction,
      adjustedDailyAllowance,
      canRecoverWithinMonth
    ),
    source: 'local_ledger_estimate',
  };
}

/** Validates deep-link / notification tap action targets against a strict allowlist. */
export function parseNotificationActionTarget(
  rawTarget: unknown
): NotificationActionTarget | null {
  if (typeof rawTarget !== 'string') {
    return null;
  }
  return ALLOWED_NOTIFICATION_TARGETS.has(rawTarget as NotificationActionTarget)
    ? (rawTarget as NotificationActionTarget)
    : null;
}

/** Clamps hour/minute values to valid 24-hour clock integers. */
export function clampReminderTime(
  hour: number,
  minute: number
): { eveningHour: number; eveningMinute: number } {
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, Math.trunc(hour))) : DEFAULT_EVENING_CHECKIN_HOUR;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, Math.trunc(minute))) : DEFAULT_EVENING_CHECKIN_MINUTE;
  return {
    eveningHour: safeHour,
    eveningMinute: safeMinute,
  };
}

/** Formats hour and minute as HH:mm (e.g., 20:00). */
export function formatReminderTime(hour: number, minute: number): string {
  const { eveningHour, eveningMinute } = clampReminderTime(hour, minute);
  return `${eveningHour.toString().padStart(2, '0')}:${eveningMinute.toString().padStart(2, '0')}`;
}
