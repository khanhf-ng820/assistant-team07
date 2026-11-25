export { formatVnd as formatVND } from '../format';

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
  daysUnevaluated: number;
  statusMessage: string;
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
 * Formats compact amounts for detailed calendar grid (e.g., 250000 -> "250k")
 */
export function formatCompactK(amount: number): string {
  if (amount <= 0) return '';
  const thousands = Math.round(amount / 1000);
  return `${thousands}k`;
}

/**
 * Shared ISO date helpers (YYYY-MM-DD)
 */
export function formatIsoDate(year: number, month: number, day: number): string {
  const m = month.toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const parts = isoDate.split('-');
  return {
    year: parseInt(parts[0] || '2024', 10),
    month: parseInt(parts[1] || '7', 10),
    day: parseInt(parts[2] || '1', 10),
  };
}

/** Shifts an ISO YYYY-MM-DD date by deltaDays using calendar arithmetic. */
export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const next = new Date(year, month - 1, day + deltaDays);
  return formatIsoDate(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

export const VI_DAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

export function formatVietnameseDate(isoDate: string): string {
  try {
    const { year, month, day } = parseIsoDate(isoDate);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = VI_DAYS[dateObj.getDay()];
    return `${dayOfWeek}, ${day} tháng ${month}, ${year}`;
  } catch {
    return isoDate;
  }
}
