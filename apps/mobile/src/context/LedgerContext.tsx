import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { TransactionResponse } from '../api/contracts';
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
  CATEGORIES,
  CategoryId,
} from '../types/transaction';

const fixtureExpenses = INITIAL_TRANSACTIONS.reduce((sum, tx) => sum + tx.amount, 0);

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
  addConfirmedExpense: (tx: TransactionResponse) => void;
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
  manualEntryDraft: ManualEntryDraft | null;
  openManualEntry: (draft?: ManualEntryDraft) => void;
  closeManualEntry: () => void;
}

type ManualEntryDraft = Pick<Transaction, 'amount' | 'categoryId' | 'note' | 'date'>;

export type LedgerContextType = LedgerDataContextType & LedgerUIContextType;

const LedgerDataContext = createContext<LedgerDataContextType | undefined>(undefined);
const LedgerUIContext = createContext<LedgerUIContextType | undefined>(undefined);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [isBalanceVisible, setIsBalanceVisible] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string>('2024-07-10');
  const [activeYear, setActiveYear] = useState<number>(2024);
  const [activeMonth, setActiveMonth] = useState<number>(7);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [isDaySheetOpen, setIsDaySheetOpen] = useState<boolean>(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState<boolean>(false);
  const [manualEntryDraft, setManualEntryDraft] = useState<ManualEntryDraft | null>(null);

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

  const openManualEntry = useCallback((draft?: ManualEntryDraft) => {
    setManualEntryDraft(draft ?? null);
    setIsManualEntryOpen(true);
  }, []);

  const closeManualEntry = useCallback(() => {
    setIsManualEntryOpen(false);
    setManualEntryDraft(null);
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
    },
    []
  );

  const addConfirmedExpense = useCallback((tx: TransactionResponse) => {
    if (tx.kind !== 'expense') return;
    const categoryId = Object.hasOwn(CATEGORIES, tx.category) ? tx.category as CategoryId : 'other';
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(tx.created_at));
    const entry: Transaction = {
      id: tx.id,
      amount: tx.amount,
      categoryId,
      date: tx.date,
      note: tx.note ?? CATEGORIES[categoryId].name,
      time,
      createdAt: tx.created_at,
    };
    setTransactions((prev) => prev.some((item) => item.id === tx.id) ? prev : [entry, ...prev]);
  }, []);

  // Recorded balance may go negative when spending exceeds current funds.
  const availableBalance = useMemo(
    () => INITIAL_AVAILABLE_BALANCE + fixtureExpenses - transactions.reduce((sum, tx) => sum + tx.amount, 0),
    [transactions]
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
      addConfirmedExpense,
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
    addConfirmedExpense,
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
      manualEntryDraft,
      openManualEntry,
      closeManualEntry,
    };
  }, [
    isDaySheetOpen,
    openDaySheet,
    closeDaySheet,
    isManualEntryOpen,
      manualEntryDraft,
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
