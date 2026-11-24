import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  deriveMonthlyBudgetSummary,
  generateMonthSummaries,
  INITIAL_AVAILABLE_BALANCE,
  INITIAL_DAILY_BUDGET,
  INITIAL_REMAINING_BUDGET,
  INITIAL_TRANSACTIONS,
} from '../fixtures/initialLedger';
import {
  DailyExpenseSummary,
  formatIsoDate,
  MonthlyBudgetSummary,
  parseIsoDate,
  Transaction,
} from '../types/transaction';

interface LedgerContextType {
  availableBalance: number;
  isBalanceVisible: boolean;
  toggleBalanceVisibility: () => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  activeYear: number;
  activeMonth: number;
  setActiveYearMonth: (year: number, month: number) => void;
  transactions: Transaction[];
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  monthlySummary: MonthlyBudgetSummary;
  dailySummaries: Record<string, DailyExpenseSummary>;
  getSummaryForDate: (date: string) => DailyExpenseSummary;
  dailyBudgetLimit: number;
  remainingTodayBudget: number;
  isDaySheetOpen: boolean;
  openDaySheet: (date?: string) => void;
  closeDaySheet: () => void;
  isManualEntryOpen: boolean;
  openManualEntry: () => void;
  closeManualEntry: () => void;
}

const LedgerContext = createContext<LedgerContextType | undefined>(undefined);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [availableBalance, setAvailableBalance] = useState<number>(INITIAL_AVAILABLE_BALANCE);
  const [isBalanceVisible, setIsBalanceVisible] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string>('2024-07-10');
  const [activeYear, setActiveYear] = useState<number>(2024);
  const [activeMonth, setActiveMonth] = useState<number>(7);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [isDaySheetOpen, setIsDaySheetOpen] = useState<boolean>(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState<boolean>(false);

  const toggleBalanceVisibility = useCallback(() => {
    setIsBalanceVisible((prev) => !prev);
  }, []);

  const openDaySheet = useCallback((date?: string) => {
    if (date) {
      setSelectedDate(date);
    }
    setIsDaySheetOpen(true);
  }, []);

  const closeDaySheet = useCallback(() => {
    setIsDaySheetOpen(false);
  }, []);

  const openManualEntry = useCallback(() => {
    setIsManualEntryOpen(true);
  }, []);

  const closeManualEntry = useCallback(() => {
    setIsManualEntryOpen(false);
  }, []);

  const setActiveYearMonth = useCallback((year: number, month: number) => {
    setActiveYear(year);
    setActiveMonth(month);
  }, []);

  const addTransaction = useCallback(
    (txData: Omit<Transaction, 'id' | 'createdAt'>) => {
      const newTx: Transaction = {
        ...txData,
        id: `tx-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };

      setTransactions((prev) => [newTx, ...prev]);
      setAvailableBalance((prev) => Math.max(0, prev - txData.amount));
    },
    []
  );

  // Daily summaries dynamically generated for the active year and month
  const dailySummaries = useMemo(() => {
    return generateMonthSummaries(activeYear, activeMonth, transactions);
  }, [activeYear, activeMonth, transactions]);

  // Monthly summary derived directly and coherently from the daily aggregation
  const monthlySummary = useMemo(() => {
    return deriveMonthlyBudgetSummary(activeYear, activeMonth, dailySummaries);
  }, [activeYear, activeMonth, dailySummaries]);

  const getSummaryForDate = useCallback(
    (date: string): DailyExpenseSummary => {
      if (dailySummaries[date]) {
        return dailySummaries[date];
      }
      const { year, month, day } = parseIsoDate(date);
      const dayTxs = transactions.filter((tx) => tx.date === date);
      const computedTotal = dayTxs.reduce((sum, tx) => sum + tx.amount, 0);
      const isOverBudget = computedTotal > 280000;

      return {
        date,
        dayNumber: day,
        month,
        year,
        totalSpent: computedTotal,
        isOverBudget,
        status: computedTotal === 0 ? 'empty' : isOverBudget ? 'over_budget' : 'normal',
        transactions: dayTxs,
      };
    },
    [dailySummaries, transactions]
  );

  const value = useMemo<LedgerContextType>(() => {
    return {
      availableBalance,
      isBalanceVisible,
      toggleBalanceVisibility,
      selectedDate,
      setSelectedDate,
      activeYear,
      activeMonth,
      setActiveYearMonth,
      transactions,
      addTransaction,
      monthlySummary,
      dailySummaries,
      getSummaryForDate,
      dailyBudgetLimit: INITIAL_DAILY_BUDGET,
      remainingTodayBudget: INITIAL_REMAINING_BUDGET,
      isDaySheetOpen,
      openDaySheet,
      closeDaySheet,
      isManualEntryOpen,
      openManualEntry,
      closeManualEntry,
    };
  }, [
    availableBalance,
    isBalanceVisible,
    toggleBalanceVisibility,
    selectedDate,
    activeYear,
    activeMonth,
    setActiveYearMonth,
    transactions,
    addTransaction,
    monthlySummary,
    dailySummaries,
    getSummaryForDate,
    isDaySheetOpen,
    openDaySheet,
    closeDaySheet,
    isManualEntryOpen,
    openManualEntry,
    closeManualEntry,
  ]);

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextType {
  const context = useContext(LedgerContext);
  if (!context) {
    throw new Error('useLedger must be used within a LedgerProvider');
  }
  return context;
}
