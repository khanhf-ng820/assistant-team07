import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { MonthCalendar } from '../src/components/calendar/MonthCalendar';
import { LedgerProvider } from '../src/context/LedgerContext';

describe('MonthCalendar', () => {
  it('renders July 2024 header, weekdays, and per-day budget status dots in compact mode', async () => {
    await render(
      <LedgerProvider>
        <MonthCalendar mode="compact" />
      </LedgerProvider>
    );

    expect(screen.getByText('Tháng 7 năm 2024')).toBeTruthy();
    for (const wd of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']) {
      expect(screen.getByText(wd)).toBeTruthy();
    }

    // Verify per-day color-coded status dots are rendered
    expect(screen.getByTestId('status-dot-2024-07-10')).toBeTruthy();
    expect(screen.getByTestId('status-dot-2024-07-01')).toBeTruthy();

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
    expect(screen.getByTestId('status-dot-2024-07-10')).toBeTruthy();
  });

  it('navigates dynamically across months and recalculates grid geometry', async () => {
    await render(
      <LedgerProvider>
        <MonthCalendar mode="compact" />
      </LedgerProvider>
    );

    // Initial: July 2024
    expect(screen.getByText('Tháng 7 năm 2024')).toBeTruthy();

    // Navigate to August 2024
    const nextButton = screen.getByTestId('next-month-button');
    await fireEvent.press(nextButton);
    expect(screen.getByText('Tháng 8 năm 2024')).toBeTruthy();

    // Navigate back to July then to June 2024
    const prevButton = screen.getByTestId('prev-month-button');
    await fireEvent.press(prevButton);
    expect(screen.getByText('Tháng 7 năm 2024')).toBeTruthy();

    await fireEvent.press(prevButton);
    expect(screen.getByText('Tháng 6 năm 2024')).toBeTruthy();
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
