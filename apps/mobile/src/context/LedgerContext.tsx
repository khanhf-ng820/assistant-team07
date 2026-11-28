import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  buildDailyExpenseSummary,
  DAILY_BUDGET_LIMIT,
  deriveMonthlyBudgetSummary,
  generateMonthSummaries,
  INITIAL_AVAILABLE_BALANCE,
  INITIAL_TRANSACTIONS,
} from '../fixtures/initialLedger';
import {
  DailyExpenseSummary,
  MonthlyBudgetSummary,
  Transaction,
} from '../types/transaction';

interface LedgerDataContextType {
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
}

interface LedgerUIContextType {
  isDaySheetOpen: boolean;
  openDaySheet: (date?: string) => void;
  closeDaySheet: () => void;
  isManualEntryOpen: boolean;
  openManualEntry: () => void;
  closeManualEntry: () => void;
}

export type LedgerContextType = LedgerDataContextType & LedgerUIContextType;

const LedgerDataContext = createContext<LedgerDataContextType | undefined>(undefined);
const LedgerUIContext = createContext<LedgerUIContextType | undefined>(undefined);

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
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
      };

      setTransactions((prev) => [newTx, ...prev]);
      // Recorded balance may go negative when spending exceeds current funds (plan §7 line 183)
      setAvailableBalance((prev) => prev - txData.amount);
    },
    []
  );

  // Daily summaries dynamically generated for the active year and month
  const dailySummaries = useMemo(() => {
    return generateMonthSummaries(activeYear, activeMonth, transactions, DAILY_BUDGET_LIMIT);
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
      const dayTxs = transactions.filter((tx) => tx.date === date);
      return buildDailyExpenseSummary(date, dayTxs, DAILY_BUDGET_LIMIT);
    },
    [dailySummaries, transactions]
  );

  const remainingTodayBudget = useMemo(() => {
    return DAILY_BUDGET_LIMIT - getSummaryForDate(selectedDate).totalSpent;
  }, [getSummaryForDate, selectedDate]);

  const dataValue = useMemo<LedgerDataContextType>(() => {
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
      dailyBudgetLimit: DAILY_BUDGET_LIMIT,
      remainingTodayBudget,
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
    remainingTodayBudget,
  ]);

  const uiValue = useMemo<LedgerUIContextType>(() => {
    return {
      isDaySheetOpen,
      openDaySheet,
      closeDaySheet,
      isManualEntryOpen,
      openManualEntry,
      closeManualEntry,
    };
  }, [
    isDaySheetOpen,
    openDaySheet,
    closeDaySheet,
    isManualEntryOpen,
    openManualEntry,
    closeManualEntry,
  ]);

  return (
    <LedgerDataContext.Provider value={dataValue}>
      <LedgerUIContext.Provider value={uiValue}>{children}</LedgerUIContext.Provider>
    </LedgerDataContext.Provider>
  );
}

export function useLedger(): LedgerContextType {
  const data = useContext(LedgerDataContext);
  const ui = useContext(LedgerUIContext);
  if (!data || !ui) {
    throw new Error('useLedger must be used within a LedgerProvider');
  }
  return useMemo(() => ({ ...data, ...ui }), [data, ui]);
}

export function useOptionalLedger(): LedgerContextType | null {
  const data = useContext(LedgerDataContext);
  const ui = useContext(LedgerUIContext);
  return useMemo(() => (data && ui ? { ...data, ...ui } : null), [data, ui]);
}
