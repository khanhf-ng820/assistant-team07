import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { MonthCalendar } from '../src/components/calendar/MonthCalendar';
import { LedgerProvider } from '../src/context/LedgerContext';
import { colors } from '../src/theme';

describe('MonthCalendar', () => {
  it('renders July 2024 header, weekdays, and preserves overspent dot color on selected day', async () => {
    await render(
      <LedgerProvider>
        <MonthCalendar mode="compact" />
      </LedgerProvider>
    );

    expect(screen.getByText('Tháng 7 năm 2024')).toBeTruthy();
    for (const wd of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']) {
      expect(screen.getByText(wd)).toBeTruthy();
    }

    // Selected overspent day (2024-07-10) must retain red overspent dot color
    const selectedOverspentDot = screen.getByTestId('status-dot-2024-07-10');
    expect(StyleSheet.flatten(selectedOverspentDot.props.style).backgroundColor).toBe(
      colors.danger
    );

    // Within-budget day (2024-07-01) must use green success dot color
    const normalDot = screen.getByTestId('status-dot-2024-07-01');
    expect(StyleSheet.flatten(normalDot.props.style).backgroundColor).toBe(
      colors.success
    );

    // Unevaluated day (2024-07-16) must not render a budget dot
    expect(screen.queryByTestId('status-dot-2024-07-16')).toBeNull();

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

  it('labels leading previous-month and trailing next-month cells with their true month', async () => {
    await render(
      <LedgerProvider>
        <MonthCalendar mode="compact" />
      </LedgerProvider>
    );

    // Navigate to August 2024 (starts Thursday -> leading days 29, 30, 31 belong to July)
    await fireEvent.press(screen.getByTestId('next-month-button'));
    expect(screen.getByText('Tháng 8 năm 2024')).toBeTruthy();

    const leadingJulyCell = screen.getByTestId('calendar-cell-2024-07-29');
    expect(leadingJulyCell.props.accessibilityLabel).toContain('Ngày 29 tháng 7');

    const trailingSeptCell = screen.getByTestId('calendar-cell-2024-09-01');
    expect(trailingSeptCell.props.accessibilityLabel).toContain('Ngày 1 tháng 9');
  });

  it('navigates dynamically across months and recalculates grid geometry', async () => {
    await render(
      <LedgerProvider>
        <MonthCalendar mode="compact" />
      </LedgerProvider>
    );

    expect(screen.getByText('Tháng 7 năm 2024')).toBeTruthy();

    const nextButton = screen.getByTestId('next-month-button');
    await fireEvent.press(nextButton);
    expect(screen.getByText('Tháng 8 năm 2024')).toBeTruthy();

    const prevButton = screen.getByTestId('prev-month-button');
    await fireEvent.press(prevButton);
    expect(screen.getByText('Tháng 7 năm 2024')).toBeTruthy();

    await fireEvent.press(prevButton);
    expect(screen.getByText('Tháng 6 năm 2024')).toBeTruthy();
  });

  it('navigates across year boundaries (December to January)', async () => {
    await render(
      <LedgerProvider>
        <MonthCalendar mode="compact" />
      </LedgerProvider>
    );

    const nextButton = screen.getByTestId('next-month-button');
    for (let i = 0; i < 5; i++) {
      await fireEvent.press(nextButton);
    }
    expect(screen.getByText('Tháng 12 năm 2024')).toBeTruthy();

    await fireEvent.press(nextButton);
    expect(screen.getByText('Tháng 1 năm 2025')).toBeTruthy();

    const prevButton = screen.getByTestId('prev-month-button');
    await fireEvent.press(prevButton);
    expect(screen.getByText('Tháng 12 năm 2024')).toBeTruthy();
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
