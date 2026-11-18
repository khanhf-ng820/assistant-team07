import { DailyExpenseSummary, MonthlyBudgetSummary, Transaction } from '../types/transaction';

export const INITIAL_AVAILABLE_BALANCE = 4500000;
export const INITIAL_DAILY_BUDGET = 120000;
export const INITIAL_REMAINING_BUDGET = 75000;

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-2024-07-10-1',
    amount: 65000,
    categoryId: 'food',
    note: 'Cơm trưa',
    date: '2024-07-10',
    time: '12:15',
    createdAt: '2024-07-10T12:15:00.000Z',
  },
  {
    id: 'tx-2024-07-10-2',
    amount: 45000,
    categoryId: 'transport',
    note: 'GrabBike',
    date: '2024-07-10',
    time: '14:30',
    createdAt: '2024-07-10T14:30:00.000Z',
  },
  {
    id: 'tx-2024-07-10-3',
    amount: 180000,
    categoryId: 'shopping',
    note: 'Áo thun',
    date: '2024-07-10',
    time: '18:45',
    createdAt: '2024-07-10T18:45:00.000Z',
  },
];

/**
 * July 2024 daily expense totals matching Figma Page 17 exactly:
 * - Green/normal dots vs Red/over budget dots
 */
export const JULY_2024_DAY_AMOUNTS: Record<number, number> = {
  1: 250000,
  2: 180000,
  3: 310000,
  4: 220000,
  5: 195000,
  6: 280000,
  7: 240000,
  8: 205000,
  9: 175000,
  10: 290000,
  11: 210000,
  12: 185000,
  13: 300000,
  14: 260000,
  15: 215000,
  16: 190000,
  17: 305000,
  18: 225000,
  19: 200000,
  20: 315000,
  21: 270000,
  22: 230000,
  23: 205000,
  24: 320000,
  25: 245000,
  26: 210000,
  27: 330000,
  28: 285000,
  29: 235000,
  30: 215000,
  31: 345000,
};

/**
 * Days flagged as over budget in Figma mockup:
 * e.g., Day 3 (310k), Day 10 (290k), Day 20 (315k)
 */
export const JULY_2024_OVER_BUDGET_DAYS = new Set([3, 10, 20]);

export const INITIAL_MONTH_SUMMARY: MonthlyBudgetSummary = {
  month: 7,
  year: 2024,
  monthTitle: 'Tháng 7 năm 2024',
  totalSpent: 4850000,
  budgetLimit: 6000000,
  daysWithinBudget: 12,
  daysEvaluated: 15,
  daysOverBudget: 3,
  statusMessage: 'Bạn đang chi tiêu rất hợp lý',
};

/**
 * Generates initial daily expense summaries for a given month/year
 */
export function generateInitialMonthSummaries(
  year: number = 2024,
  month: number = 7,
  customTransactions: Transaction[] = INITIAL_TRANSACTIONS
): Record<string, DailyExpenseSummary> {
  const result: Record<string, DailyExpenseSummary> = {};
  const daysInMonth = 31;

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = day.toString().padStart(2, '0');
    const monthStr = month.toString().padStart(2, '0');
    const dateKey = `${year}-${monthStr}-${dayStr}`;

    const txsForDay = customTransactions.filter((tx) => tx.date === dateKey);
    const mockAmount = JULY_2024_DAY_AMOUNTS[day] ?? 0;
    const computedTotal = txsForDay.length > 0
      ? txsForDay.reduce((sum, tx) => sum + tx.amount, 0)
      : mockAmount;

    const isOverBudget = JULY_2024_OVER_BUDGET_DAYS.has(day);

    result[dateKey] = {
      date: dateKey,
      dayNumber: day,
      month,
      year,
      totalSpent: computedTotal,
      isOverBudget,
      status: isOverBudget ? 'over_budget' : 'normal',
      transactions: txsForDay,
    };
  }

  return result;
}
