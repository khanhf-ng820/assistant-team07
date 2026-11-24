import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { DayTransactionsSheet } from '../src/components/calendar/DayTransactionsSheet';
import { LedgerProvider } from '../src/context/LedgerContext';

describe('DayTransactionsSheet', () => {
  it('renders itemized daily transactions and total amount for selected date 2024-07-10', async () => {
    const onClose = jest.fn();

    await render(
      <LedgerProvider>
        <DayTransactionsSheet visible onClose={onClose} />
      </LedgerProvider>
    );

    expect(screen.getByText('Chi tiêu ngày đã chọn')).toBeTruthy();
    expect(screen.getByTestId('day-total-amount')).toHaveTextContent('290.000 ₫');
    expect(screen.getByText('3 khoản chi')).toBeTruthy();

    // Verify all 3 itemized transactions matching Figma Page 18
    expect(screen.getByText('Cơm trưa')).toBeTruthy();
    expect(screen.getByText('65.000 ₫')).toBeTruthy();

    expect(screen.getByText('GrabBike')).toBeTruthy();
    expect(screen.getByText('45.000 ₫')).toBeTruthy();

    expect(screen.getByText('Áo thun')).toBeTruthy();
    expect(screen.getByText('180.000 ₫')).toBeTruthy();

    // Close button triggers callback
    await fireEvent.press(screen.getByTestId('close-day-sheet'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
