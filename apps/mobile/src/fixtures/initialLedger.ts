import {
  CategoryId,
  DailyExpenseSummary,
  formatIsoDate,
  MonthlyBudgetSummary,
  parseIsoDate,
  Transaction,
} from '../types/transaction';

export const INITIAL_AVAILABLE_BALANCE = 4500000;
export const DAILY_BUDGET_LIMIT = 280000;
export const MONTHLY_BUDGET_LIMIT = 6000000;

function fixtureTx(
  day: number,
  seq: number,
  amount: number,
  categoryId: CategoryId,
  note: string,
  time: string
): Transaction {
  const date = formatIsoDate(2024, 7, day);
  return {
    id: `tx-${date}-${seq}`,
    amount,
    categoryId,
    note,
    date,
    time,
    createdAt: `${date}T${time}:00.000Z`,
  };
}

/**
 * Single coherent July 2024 ledger fixture (days 1..15 evaluated: 12 within <= 280k,
 * 3 over > 280k on days 3, 10, 13; days 16..31 unevaluated).
 * Day 10 matches Figma Page 18 (65k + 45k + 180k = 290k).
 * Day 9 spends 160k so prior remaining allowance is 120k (matching plan §4 line 120).
 */
export const INITIAL_TRANSACTIONS: Transaction[] = [
  fixtureTx(1, 1, 250000, 'food', 'Đi chợ đầu tháng', '09:30'),
  fixtureTx(2, 1, 180000, 'bills', 'Tiền điện thoại', '10:00'),
  fixtureTx(3, 1, 310000, 'shopping', 'Mua đồ gia dụng', '16:20'),
  fixtureTx(4, 1, 220000, 'food', 'Ăn tối cùng bạn', '19:15'),
  fixtureTx(5, 1, 195000, 'transport', 'Đổ xăng & gửi xe', '08:45'),
  fixtureTx(6, 1, 280000, 'education', 'Mua sách tham khảo', '15:00'),
  fixtureTx(7, 1, 240000, 'entertainment', 'Xem phim cuối tuần', '20:00'),
  fixtureTx(8, 1, 205000, 'food', 'Cơm văn phòng & cà phê', '12:10'),
  fixtureTx(9, 1, 160000, 'food', 'Ăn trưa & trà sữa', '13:05'),
  fixtureTx(10, 1, 65000, 'food', 'Cơm trưa', '12:15'),
  fixtureTx(10, 2, 45000, 'transport', 'GrabBike', '14:30'),
  fixtureTx(10, 3, 180000, 'shopping', 'Áo thun', '18:45'),
  fixtureTx(11, 1, 210000, 'bills', 'Cước Internet', '11:00'),
  fixtureTx(12, 1, 185000, 'food', 'Bữa trưa & hoa quả', '12:40'),
  fixtureTx(13, 1, 300000, 'entertainment', 'Tụ tập cuối tuần', '19:30'),
  fixtureTx(14, 1, 260000, 'shopping', 'Vật dụng cá nhân', '17:10'),
  fixtureTx(15, 1, 215000, 'food', 'Cơm trưa & nước ép', '12:25'),
];

/** Builds a single day's summary directly from confirmed transactions. */
export function buildDailyExpenseSummary(
  date: string,
  transactionsForDate: Transaction[],
  dailyBudgetLimit: number = DAILY_BUDGET_LIMIT
): DailyExpenseSummary {
  const { year, month, day } = parseIsoDate(date);
  const totalSpent = transactionsForDate.reduce((sum, tx) => sum + tx.amount, 0);
  const isOverBudget = totalSpent > dailyBudgetLimit;

  return {
    date,
    dayNumber: day,
    month,
    year,
    totalSpent,
    isOverBudget,
    status: totalSpent === 0 ? 'empty' : isOverBudget ? 'over_budget' : 'normal',
    transactions: transactionsForDate,
  };
}

/**
 * Generates daily expense summaries dynamically for any given month/year
 * solely from confirmed transactions so calendar cells and sheets always reconcile.
 */
export function generateMonthSummaries(
  year: number,
  month: number,
  transactions: Transaction[] = INITIAL_TRANSACTIONS,
  dailyBudgetLimit: number = DAILY_BUDGET_LIMIT
): Record<string, DailyExpenseSummary> {
  const result: Record<string, DailyExpenseSummary> = {};
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = formatIsoDate(year, month, day);
    const txsForDay = transactions.filter((tx) => tx.date === dateKey);
    result[dateKey] = buildDailyExpenseSummary(dateKey, txsForDay, dailyBudgetLimit);
  }

  return result;
}

/**
 * Derives the monthly summary dynamically and coherently from daily aggregation
 * without hardcoded overrides (plan §4 lines 122–123 & §13 line 346).
 */
export function deriveMonthlyBudgetSummary(
  year: number,
  month: number,
  dailySummaries: Record<string, DailyExpenseSummary>
): MonthlyBudgetSummary {
  const monthDays = Object.values(dailySummaries).filter(
    (d) => d.year === year && d.month === month
  );

  const totalSpent = monthDays.reduce((acc, d) => acc + d.totalSpent, 0);
  const evaluatedDays = monthDays.filter((d) => d.totalSpent > 0);
  const daysOverBudget = evaluatedDays.filter((d) => d.isOverBudget).length;
  const daysWithinBudget = evaluatedDays.length - daysOverBudget;
  const daysUnevaluated = monthDays.length - evaluatedDays.length;

  return {
    month,
    year,
    monthTitle: `Tháng ${month} năm ${year}`,
    totalSpent,
    budgetLimit: MONTHLY_BUDGET_LIMIT,
    daysWithinBudget,
    daysEvaluated: evaluatedDays.length,
    daysOverBudget,
    daysUnevaluated,
    statusMessage:
      daysOverBudget > 0 && daysWithinBudget === 0
        ? 'Cần kiểm soát chi tiêu chặt hơn'
        : 'Bạn đang chi tiêu rất hợp lý',
  };
}
