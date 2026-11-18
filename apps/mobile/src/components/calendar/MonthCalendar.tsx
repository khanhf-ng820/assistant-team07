import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { colors, type } from '../../theme';
import { formatCompactK } from '../../types/transaction';

interface MonthCalendarProps {
  mode?: 'compact' | 'detailed';
  onBackPress?: () => void;
  onOpenDetailed?: () => void;
}

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

interface CalendarCellData {
  dayNumber: number;
  dateKey: string;
  isCurrentMonth: boolean;
  amount: number;
  isOverBudget: boolean;
}

export function MonthCalendar({
  mode = 'compact',
  onBackPress,
  onOpenDetailed,
}: MonthCalendarProps) {
  const { selectedDate, setSelectedDate, openDaySheet, dailySummaries } = useLedger();

  // In this release, the baseline calendar is pinned to July 2024 as specified in the Figma prototype
  const [currentYear, setCurrentYear] = useState<number>(2024);
  const [currentMonth, setCurrentMonth] = useState<number>(7);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Build calendar matrix (5 weeks x 7 days)
  // July 2024 starts on Monday (T2 -> index 0) and has 31 days.
  const calendarCells: CalendarCellData[] = [];
  const daysInMonth = 31;

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = day.toString().padStart(2, '0');
    const monthStr = currentMonth.toString().padStart(2, '0');
    const dateKey = `${currentYear}-${monthStr}-${dayStr}`;

    const summary = dailySummaries[dateKey];
    calendarCells.push({
      dayNumber: day,
      dateKey,
      isCurrentMonth: true,
      amount: summary ? summary.totalSpent : 0,
      isOverBudget: summary ? summary.isOverBudget : false,
    });
  }

  // 4 trailing days from next month (August 1..4) to complete the 35-cell grid (5 rows x 7 cols)
  for (let nextDay = 1; nextDay <= 4; nextDay++) {
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const dayStr = nextDay.toString().padStart(2, '0');
    const monthStr = nextMonth.toString().padStart(2, '0');
    const dateKey = `${nextYear}-${monthStr}-${dayStr}`;

    // Sample mock amounts for next month preview matching mockup
    const mockAmounts: Record<number, number> = { 1: 250000, 2: 180000, 3: 310000, 4: 220000 };

    calendarCells.push({
      dayNumber: nextDay,
      dateKey,
      isCurrentMonth: false,
      amount: mockAmounts[nextDay] ?? 0,
      isOverBudget: false,
    });
  }

  const handleDayPress = (cell: CalendarCellData) => {
    if (!cell.isCurrentMonth) return;
    setSelectedDate(cell.dateKey);
    openDaySheet(cell.dateKey);
  };

  return (
    <View
      style={[styles.container, mode === 'detailed' && styles.detailedContainer]}
      testID={`month-calendar-${mode}`}
    >
      {/* Detailed Mode Top Navigation Header */}
      {mode === 'detailed' ? (
        <View style={styles.detailedHeaderRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={onBackPress}
            style={({ pressed }) => [styles.navSquareButton, pressed && styles.pressed]}
            testID="calendar-back-button"
          >
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.detailedHeaderTitle}>
            Lịch chi tiêu tháng
          </Text>
        </View>
      ) : null}

      {/* Month Title & Arrow Controls */}
      <View style={styles.monthSelectorRow}>
        <Pressable
          accessibilityRole="header"
          onPress={mode === 'compact' ? onOpenDetailed : undefined}
          hitSlop={8}
          testID="month-title-pressable"
        >
          <Text style={styles.monthTitleText}>
            Tháng {currentMonth} năm {currentYear}
          </Text>
        </Pressable>

        <View style={styles.monthControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tháng trước"
            onPress={handlePrevMonth}
            style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}
            testID="prev-month-button"
          >
            <Text style={styles.arrowIcon}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tháng sau"
            onPress={handleNextMonth}
            style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}
            testID="next-month-button"
          >
            <Text style={styles.arrowIcon}>›</Text>
          </Pressable>
        </View>
      </View>

      {/* Week Day Labels (T2 .. CN) */}
      <View style={styles.weekRow}>
        {WEEK_DAYS.map((wd) => (
          <Text key={wd} style={styles.weekDayText}>
            {wd}
          </Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.gridContainer}>
        {calendarCells.map((cell) => {
          const isSelected = cell.dateKey === selectedDate && cell.isCurrentMonth;
          return (
            <Pressable
              key={cell.dateKey}
              accessibilityRole="button"
              accessibilityLabel={`Ngày ${cell.dayNumber} tháng ${cell.isCurrentMonth ? currentMonth : 'sau'}, ${cell.amount > 0 ? `${cell.amount} đồng` : 'chưa có chi tiêu'}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => handleDayPress(cell)}
              disabled={!cell.isCurrentMonth}
              style={({ pressed }) => [
                styles.cell,
                mode === 'detailed' && styles.detailedCell,
                isSelected && styles.cellSelected,
                pressed && styles.pressed,
              ]}
              testID={`calendar-cell-${cell.dateKey}`}
            >
              <Text
                style={[
                  styles.dayNumberText,
                  !cell.isCurrentMonth && styles.dayNumberDimmed,
                  isSelected && styles.dayNumberSelected,
                ]}
              >
                {cell.dayNumber}
              </Text>

              {/* In Detailed Mode: show compact amount under day */}
              {mode === 'detailed' ? (
                <Text
                  style={[
                    styles.amountText,
                    !cell.isCurrentMonth && styles.amountTextDimmed,
                    isSelected && styles.amountTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {cell.amount > 0 ? formatCompactK(cell.amount) : ''}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Status Legend Row */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.dotNormal]} />
          <Text style={styles.legendText}>Bình thường</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.dotOverBudget]} />
          <Text style={styles.legendText}>Vượt ngân sách</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 12,
  },
  detailedContainer: {
    paddingTop: 8,
  },
  detailedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  navSquareButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 28,
  },
  detailedHeaderTitle: {
    ...type.heading,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  monthSelectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthTitleText: {
    ...type.subheading,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  monthControls: {
    flexDirection: 'row',
    gap: 8,
  },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIcon: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '600',
    lineHeight: 22,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  weekDayText: {
    width: 40,
    textAlign: 'center',
    ...type.captionBold,
    color: colors.subtle,
    fontSize: 12,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  cell: {
    width: '13.2%',
    height: 44,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailedCell: {
    height: 54,
    borderRadius: 14,
    paddingVertical: 4,
    justifyContent: 'space-between',
  },
  cellSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayNumberText: {
    ...type.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
  dayNumberDimmed: {
    color: '#CBD5E1',
  },
  dayNumberSelected: {
    color: colors.surface,
    fontWeight: '800',
  },
  amountText: {
    ...type.caption,
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  amountTextDimmed: {
    color: '#CBD5E1',
  },
  amountTextSelected: {
    color: '#CCFBF1',
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotNormal: {
    backgroundColor: '#0F766E',
  },
  dotOverBudget: {
    backgroundColor: colors.danger,
  },
  legendText: {
    ...type.caption,
    color: colors.muted,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.75,
  },
});
