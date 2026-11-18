import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { MonthCalendar } from '../src/components/calendar/MonthCalendar';
import { LedgerProvider } from '../src/context/LedgerContext';

describe('MonthCalendar', () => {
  it('renders July 2024 header and all weekdays in compact mode', async () => {
    await render(
      <LedgerProvider>
        <MonthCalendar mode="compact" />
      </LedgerProvider>
    );

    expect(screen.getByText('Tháng 7 năm 2024')).toBeTruthy();
    for (const wd of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']) {
      expect(screen.getByText(wd)).toBeTruthy();
    }

    expect(screen.getByText('Bình thường')).toBeTruthy();
    expect(screen.getByText('Vượt ngân sách')).toBeTruthy();
  });

  it('renders per-day amounts in detailed mode', async () => {
    await render(
      <LedgerProvider>
        <MonthCalendar mode="detailed" />
      </LedgerProvider>
    );

    expect(screen.getByText('Lịch chi tiêu tháng')).toBeTruthy();
    // Day 10 total in fixture is 290k
    expect(screen.getByText('290k')).toBeTruthy();
  });

  it('handles selecting a date cell and calling back button in detailed mode', async () => {
    const onBackPress = jest.fn();

    await render(
      <LedgerProvider>
        <MonthCalendar mode="detailed" onBackPress={onBackPress} />
      </LedgerProvider>
    );

    const backButton = screen.getByTestId('calendar-back-button');
    await fireEvent.press(backButton);
    expect(onBackPress).toHaveBeenCalledTimes(1);

    const day10Cell = screen.getByTestId('calendar-cell-2024-07-10');
    await fireEvent.press(day10Cell);
  });
});
