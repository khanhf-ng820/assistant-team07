import {
  buildBudgetRecoveryPlan,
  buildBudgetRecoveryPlanFromServerSummary,
  clampReminderTime,
  evaluateEveningCheckInAlert,
  evaluateOverspendingAlert,
  EVENING_CHECKIN_MESSAGE,
  formatOverspendingAlertMessage,
  formatOverspendingPushBody,
  formatReminderTime,
  OVERSPENDING_PRIVATE_PUSH_MESSAGE,
  parseNotificationActionTarget,
} from '../src/notifications/alertEngine';
import { DailyExpenseSummary } from '../src/types/transaction';

function makeSummary(overrides: Partial<DailyExpenseSummary> = {}): DailyExpenseSummary {
  return {
    date: '2024-07-10',
    dayNumber: 10,
    month: 7,
    year: 2024,
    totalSpent: 0,
    isOverBudget: false,
    status: 'empty',
    transactions: [],
    ...overrides,
  };
}

describe('alertEngine deterministic rules', () => {
  it('formats exact overspending copy for 45.000đ and clamps negative input', () => {
    expect(formatOverspendingAlertMessage(45000)).toBe(
      'Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức 45.000đ!'
    );
    expect(formatOverspendingAlertMessage(-500)).toBe(
      'Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức 0đ!'
    );
    expect(formatOverspendingPushBody(45000, false)).toBe(
      'Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức 45.000đ!'
    );
    expect(formatOverspendingPushBody(45000, true)).toBe(
      OVERSPENDING_PRIVATE_PUSH_MESSAGE
    );
  });

  it('evaluates overspending only when totalSpent strictly exceeds positive dailyBudgetLimit', () => {
    const exactLimit = makeSummary({ totalSpent: 280000 });
    expect(evaluateOverspendingAlert(exactLimit, 280000)).toBeNull();
    expect(evaluateOverspendingAlert(exactLimit, 0)).toBeNull();

    const overspent = makeSummary({ totalSpent: 325000, isOverBudget: true, status: 'over_budget' });
    const alert = evaluateOverspendingAlert(overspent, 280000);
    expect(alert).toMatchObject({
      kind: 'overspending',
      severity: 'danger',
      overspentAmount: 45000,
      message: 'Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức 45.000đ!',
      primaryActionTarget: 'open_budget_recovery',
    });
  });

  it('triggers evening check-in alert only when no expenses logged at or after threshold time', () => {
    const emptyDay = makeSummary({ date: '2024-07-16', dayNumber: 16, transactions: [] });
    expect(evaluateEveningCheckInAlert(emptyDay, 19, 59, 20, 0)).toBeNull();

    const atThreshold = evaluateEveningCheckInAlert(emptyDay, 20, 0, 20, 0);
    expect(atThreshold).toMatchObject({
      id: 'evening_checkin:2024-07-16',
      kind: 'evening_checkin',
      severity: 'warning',
      message: EVENING_CHECKIN_MESSAGE,
      primaryActionTarget: 'open_manual_entry',
    });

    const loggedDay = makeSummary({
      date: '2024-07-16',
      dayNumber: 16,
      totalSpent: 35000,
      transactions: [
        {
          id: 'tx-1',
          amount: 35000,
          categoryId: 'food',
          note: 'Cơm trưa',
          date: '2024-07-16',
          time: '12:00',
          createdAt: '2024-07-16T12:00:00.000Z',
        },
      ],
    });
    expect(evaluateEveningCheckInAlert(loggedDay, 21, 30, 20, 0)).toBeNull();
  });

  it('computes deterministic recovery plan and handles last day of month without division by zero', () => {
    const midMonth = makeSummary({ date: '2024-07-10', dayNumber: 10, totalSpent: 325000 });
    const plan = buildBudgetRecoveryPlan(midMonth, 280000);
    expect(plan).toMatchObject({
      overspentAmount: 45000,
      remainingDaysInMonth: 21,
      suggestedDailyReduction: 2143,
      adjustedDailyAllowance: 277857,
      canRecoverWithinMonth: true,
    });

    const lastDay = makeSummary({ date: '2024-07-31', dayNumber: 31, totalSpent: 350000 });
    const lastDayPlan = buildBudgetRecoveryPlan(lastDay, 280000);
    expect(lastDayPlan.remainingDaysInMonth).toBe(0);
    expect(lastDayPlan.adjustedDailyAllowance).toBe(0);
    expect(lastDayPlan.canRecoverWithinMonth).toBe(false);
    expect(lastDayPlan.summaryText).toContain('ngày cuối tháng');

    const extremeOverrun = makeSummary({ date: '2024-07-30', dayNumber: 30, totalSpent: 700000 });
    const overrunPlan = buildBudgetRecoveryPlan(extremeOverrun, 280000);
    expect(overrunPlan.remainingDaysInMonth).toBe(1);
    expect(overrunPlan.suggestedDailyReduction).toBe(280000);
    expect(overrunPlan.adjustedDailyAllowance).toBe(0);
    expect(overrunPlan.canRecoverWithinMonth).toBe(false);
    expect(overrunPlan.source).toBe('local_ledger_estimate');
  });

  it('aligns recovery plan directly with server /budget/summary subsequent_daily_budget', () => {
    const day10 = makeSummary({ date: '2024-07-10', dayNumber: 10, totalSpent: 325000 });
    const serverPlan = buildBudgetRecoveryPlan(day10, 280000, {
      daily_budget: 280000,
      spent_today: 325000,
      overspent_amount_today: 45000,
      days_remaining: 22,
      subsequent_daily_budget: 277857,
    });
    expect(serverPlan).toMatchObject({
      source: 'server_budget_summary',
      remainingDaysInMonth: 21,
      suggestedDailyReduction: 2143,
      adjustedDailyAllowance: 277857,
      canRecoverWithinMonth: true,
    });

    const directServer = buildBudgetRecoveryPlanFromServerSummary('2024-07-10', {
      daily_budget: 200000,
      spent_today: 260000,
      overspent_amount_today: 60000,
      days_remaining: 11,
      subsequent_daily_budget: 194000,
    });
    expect(directServer).toMatchObject({
      source: 'server_budget_summary',
      dailyBudgetLimit: 200000,
      overspentAmount: 60000,
      remainingDaysInMonth: 10,
      suggestedDailyReduction: 6000,
      adjustedDailyAllowance: 194000,
    });
  });

  it('validates notification action allowlist and clamps reminder time bounds', () => {
    expect(parseNotificationActionTarget('open_budget_recovery')).toBe('open_budget_recovery');
    expect(parseNotificationActionTarget('open_manual_entry')).toBe('open_manual_entry');
    expect(parseNotificationActionTarget('open_stats')).toBe('open_stats');
    expect(parseNotificationActionTarget('javascript:alert(1)')).toBeNull();
    expect(parseNotificationActionTarget(123)).toBeNull();

    expect(clampReminderTime(-3, 75)).toEqual({ eveningHour: 0, eveningMinute: 59 });
    expect(clampReminderTime(28, Number.NaN)).toEqual({ eveningHour: 23, eveningMinute: 0 });
    expect(formatReminderTime(8, 5)).toBe('08:05');
  });
});
