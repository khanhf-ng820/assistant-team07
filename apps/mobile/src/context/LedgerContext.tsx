import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { isApiError } from '../api/errors';
import { useOptionalAuth } from '../auth/AuthContext';
import {
  buildDailyExpenseSummary,
  DAILY_BUDGET_LIMIT,
  deriveMonthlyBudgetSummary,
  generateMonthSummaries,
  INITIAL_AVAILABLE_BALANCE,
  INITIAL_TRANSACTIONS,
} from '../fixtures/initialLedger';
import {
  AiExpenseDraft,
  formatVietnamTimeFromTimestamp,
  resolveDraftNote,
  validateAiDraft,
} from '../types/aiDraft';
import {
  DailyExpenseSummary,
  formatVND,
  MonthlyBudgetSummary,
  Transaction,
} from '../types/transaction';

export type ConfirmAiDraftResult =
  | { ok: true; deduplicated: boolean }
  | { ok: false; error: string };

export type AiDraftPersistFn = (
  draft: AiExpenseDraft,
  idempotencyKey: string
) => Promise<void> | void;

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
  pendingAiDraft: AiExpenseDraft | null;
  isAiConfirmationOpen: boolean;
  openAiConfirmation: (draft: AiExpenseDraft) => void;
  updatePendingAiDraft: (draft: AiExpenseDraft) => void;
  closeAiConfirmation: () => void;
  confirmAiDraft: (
    draft?: AiExpenseDraft,
    options?: { persist?: AiDraftPersistFn }
  ) => Promise<ConfirmAiDraftResult>;
  toastMessage: string | null;
  showSuccessToast: (message: string) => void;
  dismissToast: () => void;
}

export type LedgerContextType = LedgerDataContextType & LedgerUIContextType;

const LedgerDataContext = createContext<LedgerDataContextType | undefined>(undefined);
const LedgerUIContext = createContext<LedgerUIContextType | undefined>(undefined);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const auth = useOptionalAuth();
  const [availableBalance, setAvailableBalance] = useState<number>(INITIAL_AVAILABLE_BALANCE);
  const [isBalanceVisible, setIsBalanceVisible] = useState<boolean>(true);
  const [selectedDate, setSelectedDate] = useState<string>('2024-07-10');
  const [activeYear, setActiveYear] = useState<number>(2024);
  const [activeMonth, setActiveMonth] = useState<number>(7);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [isDaySheetOpen, setIsDaySheetOpen] = useState<boolean>(false);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState<boolean>(false);
  const [pendingAiDraft, setPendingAiDraft] = useState<AiExpenseDraft | null>(null);
  const [isAiConfirmationOpen, setIsAiConfirmationOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const confirmedDraftIdsRef = useRef<Set<string>>(new Set());
  const inFlightDraftIdsRef = useRef<Set<string>>(new Set());
  const draftIdempotencyKeysRef = useRef<Map<string, string>>(new Map());

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

  const openAiConfirmation = useCallback((draft: AiExpenseDraft) => {
    setPendingAiDraft(draft);
    setIsAiConfirmationOpen(true);
  }, []);

  const updatePendingAiDraft = useCallback((draft: AiExpenseDraft) => {
    setPendingAiDraft(draft);
  }, []);

  const closeAiConfirmation = useCallback(() => {
    setIsAiConfirmationOpen(false);
    setPendingAiDraft(null);
  }, []);

  const showSuccessToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  const dismissToast = useCallback(() => {
    setToastMessage(null);
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

  const confirmAiDraft = useCallback(
    async (
      draftOverride?: AiExpenseDraft,
      options?: { persist?: AiDraftPersistFn }
    ): Promise<ConfirmAiDraftResult> => {
      const targetDraft = draftOverride ?? pendingAiDraft;
      if (!targetDraft) {
        return { ok: false, error: 'Không tìm thấy bản nháp giao dịch để xác nhận.' };
      }

      const validation = validateAiDraft(targetDraft);
      if (!validation.isValid || targetDraft.amount === null || !targetDraft.categoryId) {
        return { ok: false, error: 'Vui lòng bổ sung đầy đủ số tiền và danh mục trước khi xác nhận.' };
      }

      // Single deduplication gate executed before any persistence side effect
      if (confirmedDraftIdsRef.current.has(targetDraft.draftId)) {
        setIsAiConfirmationOpen(false);
        setPendingAiDraft(null);
        return { ok: true, deduplicated: true };
      }

      if (inFlightDraftIdsRef.current.has(targetDraft.draftId)) {
        return { ok: true, deduplicated: true };
      }

      let idempotencyKey = draftIdempotencyKeysRef.current.get(targetDraft.draftId);
      if (!idempotencyKey) {
        idempotencyKey = `ai-draft-${targetDraft.draftId}`;
        draftIdempotencyKeysRef.current.set(targetDraft.draftId, idempotencyKey);
      }

      inFlightDraftIdsRef.current.add(targetDraft.draftId);
      const resolvedNote = resolveDraftNote(targetDraft);

      try {
        if (options?.persist) {
          await options.persist(targetDraft, idempotencyKey);
        } else if (auth?.isApiConfigured) {
          await auth.apiClient.createTransaction({
            amount: targetDraft.amount,
            kind: 'expense',
            category: targetDraft.categoryId,
            date: targetDraft.date,
            note: resolvedNote,
            idempotency_key: idempotencyKey,
          });
        }

        confirmedDraftIdsRef.current.add(targetDraft.draftId);
        const txTime =
          targetDraft.time ??
          formatVietnamTimeFromTimestamp(new Date().toISOString()) ??
          '00:00';

        addTransaction({
          amount: targetDraft.amount,
          categoryId: targetDraft.categoryId,
          note: resolvedNote,
          date: targetDraft.date,
          time: txTime,
        });

        setIsAiConfirmationOpen(false);
        setPendingAiDraft(null);
        setToastMessage(`Đã lưu khoản chi ${formatVND(targetDraft.amount)} vào sổ chi tiêu`);
        return { ok: true, deduplicated: false };
      } catch (error) {
        // Retain pending draft & stable idempotency key so the user can retry safely
        const message = isApiError(error)
          ? error.userMessage
          : error instanceof Error && error.message
            ? error.message
            : 'Không thể lưu giao dịch. Vui lòng thử lại.';
        return { ok: false, error: message };
      } finally {
        inFlightDraftIdsRef.current.delete(targetDraft.draftId);
      }
    },
    [pendingAiDraft, addTransaction, auth]
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
      pendingAiDraft,
      isAiConfirmationOpen,
      openAiConfirmation,
      updatePendingAiDraft,
      closeAiConfirmation,
      confirmAiDraft,
      toastMessage,
      showSuccessToast,
      dismissToast,
    };
  }, [
    isDaySheetOpen,
    openDaySheet,
    closeDaySheet,
    isManualEntryOpen,
    openManualEntry,
    closeManualEntry,
    pendingAiDraft,
    isAiConfirmationOpen,
    openAiConfirmation,
    updatePendingAiDraft,
    closeAiConfirmation,
    confirmAiDraft,
    toastMessage,
    showSuccessToast,
    dismissToast,
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
