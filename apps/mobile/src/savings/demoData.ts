import { addDays } from './goal';

export type SavingsHistoryEntry = {
  id: string;
  kind: 'allocation' | 'release';
  amountVnd: number;
  date: string;
};

export type SavingsSnapshot = {
  goal: { name: string; targetVnd: number; deadline: string };
  savedVnd: number;
  /** Recorded cash, read-only in the goal editor. */
  cashVnd: number;
  safeToSpendVnd: number;
  spentTodayVnd: number;
  dailyBudgetVnd: number;
  history: SavingsHistoryEntry[];
};

/**
 * Synthetic sample data shown until the mobile API client (issue #46) and
 * budget engine (issue #43) supply real values. Contains no personal data.
 */
export function createDemoSnapshot(today: string): SavingsSnapshot {
  return {
    goal: { name: 'Heo đất', targetVnd: 2_000_000, deadline: addDays(today, 30) },
    savedVnd: 1_250_000,
    cashVnd: 3_000_000,
    safeToSpendVnd: 1_500_000,
    spentTodayVnd: 45_000,
    dailyBudgetVnd: 100_000,
    history: [
      { id: 'demo-3', kind: 'allocation', amountVnd: 250_000, date: addDays(today, -1) },
      { id: 'demo-2', kind: 'allocation', amountVnd: 500_000, date: addDays(today, -8) },
      { id: 'demo-1', kind: 'allocation', amountVnd: 500_000, date: addDays(today, -15) },
    ],
  };
}
