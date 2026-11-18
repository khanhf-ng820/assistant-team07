import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  generateInitialMonthSummaries,
  INITIAL_AVAILABLE_BALANCE,
  INITIAL_MONTH_SUMMARY,
  INITIAL_REMAINING_BUDGET,
  INITIAL_TRANSACTIONS,
} from '../fixtures/initialLedger';
import { DailyExpenseSummary, MonthlyBudgetSummary, Transaction } from '../types/transaction';

interface LedgerContextType {
  availableBalance: number;
  isBalanceVisible: boolean;
  toggleBalanceVisibility: () => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  transactions: Transaction[];
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  monthlySummary: MonthlyBudgetSummary;
  dailySummaries: Record<string, DailyExpenseSummary>;
  getSummaryForDate: (date: string) => DailyExpenseSummary;
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
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [monthlySummary] = useState<MonthlyBudgetSummary>(INITIAL_MONTH_SUMMARY);
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

  const dailySummaries = useMemo(() => {
    return generateInitialMonthSummaries(2024, 7, transactions);
  }, [transactions]);

  const getSummaryForDate = useCallback(
    (date: string): DailyExpenseSummary => {
      if (dailySummaries[date]) {
        return dailySummaries[date];
      }
      return {
        date,
        dayNumber: parseInt(date.split('-')[2] || '1', 10),
        month: 7,
        year: 2024,
        totalSpent: 0,
        isOverBudget: false,
        status: 'empty',
        transactions: [],
      };
    },
    [dailySummaries]
  );

  const value = useMemo<LedgerContextType>(() => {
    return {
      availableBalance,
      isBalanceVisible,
      toggleBalanceVisibility,
      selectedDate,
      setSelectedDate,
      transactions,
      addTransaction,
      monthlySummary,
      dailySummaries,
      getSummaryForDate,
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
