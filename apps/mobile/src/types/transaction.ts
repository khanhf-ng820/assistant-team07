export type CategoryId =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'education'
  | 'entertainment'
  | 'other';

export interface Category {
  id: CategoryId;
  name: string;
  iconSymbol: string;
  badgeLabel: string;
  color: string;
  backgroundColor: string;
}

export interface Transaction {
  id: string;
  amount: number;
  categoryId: CategoryId;
  note: string;
  date: string; // ISO format: 'YYYY-MM-DD'
  time: string; // 'HH:mm'
  createdAt: string;
}

export interface DailyExpenseSummary {
  date: string; // 'YYYY-MM-DD'
  dayNumber: number;
  month: number;
  year: number;
  totalSpent: number;
  isOverBudget: boolean;
  status: 'normal' | 'over_budget' | 'empty';
  transactions: Transaction[];
}

export interface MonthlyBudgetSummary {
  month: number;
  year: number;
  monthTitle: string;
  totalSpent: number;
  budgetLimit: number;
  daysWithinBudget: number;
  daysEvaluated: number;
  daysOverBudget: number;
  statusMessage: string;
}

export interface LedgerState {
  availableBalance: number;
  currencySymbol: string;
  isBalanceVisible: boolean;
  selectedDate: string;
  dailyBudgetLimit: number;
  remainingTodayBudget: number;
  transactions: Transaction[];
  monthlySummary: MonthlyBudgetSummary;
}

export const CATEGORIES: Record<CategoryId, Category> = {
  food: {
    id: 'food',
    name: 'Ăn uống',
    iconSymbol: '🍴',
    badgeLabel: 'Ăn uống',
    color: '#0D9488',
    backgroundColor: '#CCFBF1',
  },
  transport: {
    id: 'transport',
    name: 'Di chuyển',
    iconSymbol: '🛵',
    badgeLabel: 'Di chuyển',
    color: '#0284C7',
    backgroundColor: '#E0F2FE',
  },
  shopping: {
    id: 'shopping',
    name: 'Mua sắm',
    iconSymbol: '🛍️',
    badgeLabel: 'Mua sắm',
    color: '#D97706',
    backgroundColor: '#FEF3C7',
  },
  bills: {
    id: 'bills',
    name: 'Hóa đơn',
    iconSymbol: '⚡',
    badgeLabel: 'Hóa đơn',
    color: '#7C3AED',
    backgroundColor: '#EDE9FE',
  },
  education: {
    id: 'education',
    name: 'Học tập',
    iconSymbol: '📚',
    badgeLabel: 'Học tập',
    color: '#2563EB',
    backgroundColor: '#DBEAFE',
  },
  entertainment: {
    id: 'entertainment',
    name: 'Giải trí',
    iconSymbol: '🎮',
    badgeLabel: 'Giải trí',
    color: '#EC4899',
    backgroundColor: '#FCE7F3',
  },
  other: {
    id: 'other',
    name: 'Khác',
    iconSymbol: '🏷️',
    badgeLabel: 'Khác',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
  },
};

/**
 * Standardizes currency formatting according to project guidelines:
 * - 45000 -> "45.000 đ"
 * - 4500000 -> "4.500.000 VNĐ" (or "4.500.000đ")
 */
export function formatVND(amount: number, useVNDText: boolean = false): string {
  const formatted = amount.toLocaleString('vi-VN');
  return useVNDText ? `${formatted} VNĐ` : `${formatted}đ`;
}

/**
 * Formats compact amounts for detailed calendar grid (e.g., 250000 -> "250k")
 */
export function formatCompactK(amount: number): string {
  if (amount <= 0) return '';
  const thousands = Math.round(amount / 1000);
  return `${thousands}k`;
}
