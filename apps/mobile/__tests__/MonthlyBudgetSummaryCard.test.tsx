import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DayTransactionsSheet } from '../src/components/calendar/DayTransactionsSheet';
import { MonthCalendar } from '../src/components/calendar/MonthCalendar';
import { MonthlyBudgetSummaryCard } from '../src/components/dashboard/MonthlyBudgetSummaryCard';
import { LedgerProvider, useLedger } from '../src/context/LedgerContext';
import { Pressable, Text } from 'react-native';

function AddTestExpenseButton({ date, amount }: { date: string; amount: number }) {
  const { addTransaction } = useLedger();
  return (
    <Pressable
      testID={`add-tx-${date}`}
      onPress={() =>
        addTransaction({
          amount,
          categoryId: 'food',
          note: 'Khoản chi thêm',
          date,
          time: '15:00',
        })
      }
    >
      <Text>Add</Text>
    </Pressable>
  );
}

describe('MonthlyBudgetSummaryCard and ledger reconciliation', () => {
  it('derives evaluated, over-budget, unevaluated counts and monthly total from transactions', async () => {
    await render(
      <LedgerProvider>
        <MonthlyBudgetSummaryCard />
      </LedgerProvider>
    );

    expect(screen.getByTestId('days-within-ratio')).toHaveTextContent('12/15 ngày đã đánh giá');
    expect(screen.getByTestId('monthly-total-spent')).toHaveTextContent('3.500.000 ₫');
    expect(screen.getByTestId('days-over-budget')).toHaveTextContent('3 ngày');
    expect(screen.getByTestId('days-unevaluated')).toHaveTextContent('16 ngày');
  });

  it('adds to an existing fixture day total rather than replacing it and reconciles monthly totals', async () => {
    await render(
      <LedgerProvider>
        <MonthCalendar mode="detailed" />
        <DayTransactionsSheet visible />
        <MonthlyBudgetSummaryCard />
        <AddTestExpenseButton date="2024-07-05" amount={45000} />
        <AddTestExpenseButton date="2024-07-16" amount={100000} />
      </LedgerProvider>
    );

    // Select July 5 (fixture: 195,000 ₫, 1 transaction)
    await fireEvent.press(screen.getByTestId('calendar-cell-2024-07-05'));
    expect(screen.getByTestId('day-total-amount')).toHaveTextContent('195.000 ₫');
    expect(screen.getByText('1 khoản chi')).toBeTruthy();

    // Add 45,000 ₫ on July 5 -> 195k + 45k = 240k (never drops to 45k)
    await fireEvent.press(screen.getByTestId('add-tx-2024-07-05'));
    expect(screen.getByTestId('day-total-amount')).toHaveTextContent('240.000 ₫');
    expect(screen.getByText('2 khoản chi')).toBeTruthy();
    expect(screen.getByTestId('monthly-total-spent')).toHaveTextContent('3.545.000 ₫');

    // Add 100,000 ₫ on previously unevaluated July 16 -> evaluated increases to 16, unevaluated drops to 15
    await fireEvent.press(screen.getByTestId('add-tx-2024-07-16'));
    expect(screen.getByTestId('days-within-ratio')).toHaveTextContent('13/16 ngày đã đánh giá');
    expect(screen.getByTestId('days-unevaluated')).toHaveTextContent('15 ngày');
    expect(screen.getByTestId('monthly-total-spent')).toHaveTextContent('3.645.000 ₫');
  });
});
