import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { colors, type } from '../../theme';
import { formatCompactK, formatIsoDate, formatVND } from '../../types/transaction';

interface MonthCalendarProps {
  mode?: 'compact' | 'detailed';
  onBackPress?: () => void;
  onOpenDetailed?: () => void;
}

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export interface CalendarCellData {
  dayNumber: number;
  month: number;
  year: number;
  dateKey: string;
  isCurrentMonth: boolean;
  amount: number;
  isOverBudget: boolean;
}

export function buildCalendarMatrix(
  year: number,
  month: number,
  dailySummaries: Record<string, { totalSpent: number; isOverBudget: boolean }>
): CalendarCellData[] {
  const cells: CalendarCellData[] = [];

  // 1. Current month length
  const daysInCurrentMonth = new Date(year, month, 0).getDate();

  // 2. Monday-based first day of week (0 = Monday, ..., 6 = Sunday)
  const firstDayDate = new Date(year, month - 1, 1);
  const leadingDaysCount = (firstDayDate.getDay() + 6) % 7;

  // 3. Leading days from previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate();

  for (let i = leadingDaysCount - 1; i >= 0; i--) {
    const dayNumber = daysInPrevMonth - i;
    const dateKey = formatIsoDate(prevYear, prevMonth, dayNumber);
    cells.push({
      dayNumber,
      month: prevMonth,
      year: prevYear,
      dateKey,
      isCurrentMonth: false,
      amount: 0,
      isOverBudget: false,
    });
  }

  // 4. Current month days
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const dateKey = formatIsoDate(year, month, day);
    const summary = dailySummaries[dateKey];
    cells.push({
      dayNumber: day,
      month,
      year,
      dateKey,
      isCurrentMonth: true,
      amount: summary ? summary.totalSpent : 0,
      isOverBudget: summary ? summary.isOverBudget : false,
    });
  }

  // 5. Trailing days from next month to complete 35- or 42-cell grid
  const totalCellsSoFar = cells.length;
  const targetCells = totalCellsSoFar <= 35 ? 35 : Math.ceil(totalCellsSoFar / 7) * 7;
  const trailingDaysCount = targetCells - totalCellsSoFar;

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  for (let nextDay = 1; nextDay <= trailingDaysCount; nextDay++) {
    const dateKey = formatIsoDate(nextYear, nextMonth, nextDay);
    cells.push({
      dayNumber: nextDay,
      month: nextMonth,
      year: nextYear,
      dateKey,
      isCurrentMonth: false,
      amount: 0,
      isOverBudget: false,
    });
  }

  return cells;
}

export function MonthCalendar({
  mode = 'compact',
  onBackPress,
  onOpenDetailed,
}: MonthCalendarProps) {
  const {
    selectedDate,
    setSelectedDate,
    openDaySheet,
    dailySummaries,
    activeYear,
    activeMonth,
    setActiveYearMonth,
  } = useLedger();

  const handlePrevMonth = () => {
    if (activeMonth === 1) {
      setActiveYearMonth(activeYear - 1, 12);
    } else {
      setActiveYearMonth(activeYear, activeMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (activeMonth === 12) {
      setActiveYearMonth(activeYear + 1, 1);
    } else {
      setActiveYearMonth(activeYear, activeMonth + 1);
    }
  };

  const calendarCells = buildCalendarMatrix(activeYear, activeMonth, dailySummaries);

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
            hitSlop={8}
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
          accessibilityRole={mode === 'compact' ? 'button' : 'header'}
          accessibilityLabel={
            mode === 'compact'
              ? `Tháng ${activeMonth} năm ${activeYear}. Bấm để xem lịch chi tiết`
              : `Tháng ${activeMonth} năm ${activeYear}`
          }
          onPress={mode === 'compact' ? onOpenDetailed : undefined}
          hitSlop={8}
          style={({ pressed }) => [
            styles.monthTitleButton,
            mode === 'compact' && pressed && styles.pressed,
          ]}
          testID="month-title-pressable"
        >
          <Text style={styles.monthTitleText}>
            Tháng {activeMonth} năm {activeYear}
          </Text>
        </Pressable>

        <View style={styles.monthControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tháng trước"
            onPress={handlePrevMonth}
            hitSlop={8}
            style={({ pressed }) => [styles.arrowButton, pressed && styles.pressed]}
            testID="prev-month-button"
          >
            <Text style={styles.arrowIcon}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tháng sau"
            onPress={handleNextMonth}
            hitSlop={8}
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
          const hasSpending = cell.amount > 0 && cell.isCurrentMonth;
          const statusText = hasSpending
            ? cell.isOverBudget
              ? 'vượt ngân sách'
              : 'trong hạn mức'
            : 'chưa có chi tiêu';

          return (
            <Pressable
              key={cell.dateKey}
              accessibilityRole="button"
              accessibilityLabel={`Ngày ${cell.dayNumber} tháng ${cell.month}, ${
                hasSpending
                  ? `${formatVND(cell.amount)}, trạng thái: ${statusText}`
                  : 'chưa có chi tiêu'
              }`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => handleDayPress(cell)}
              disabled={!cell.isCurrentMonth}
              hitSlop={4}
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
              {mode === 'detailed' && cell.isCurrentMonth ? (
                <Text
                  style={[
                    styles.amountText,
                    isSelected && styles.amountTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {cell.amount > 0 ? formatCompactK(cell.amount) : ''}
                </Text>
              ) : null}

              {/* Budget Status Indicator Dot (Green = within budget, Red = overspent) */}
              {hasSpending ? (
                <View
                  style={[
                    styles.statusDot,
                    cell.isOverBudget ? styles.dotOverBudget : styles.dotNormal,
                  ]}
                  testID={`status-dot-${cell.dateKey}`}
                  accessibilityLabel={`Trạng thái ngân sách: ${statusText}`}
                />
              ) : (
                <View style={styles.statusDotPlaceholder} />
              )}
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
    minWidth: 48,
    minHeight: 48,
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 26,
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
  monthTitleButton: {
    minHeight: 48,
    justifyContent: 'center',
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
    minWidth: 48,
    minHeight: 48,
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIcon: {
    fontSize: 22,
    color: colors.text,
    fontWeight: '600',
    lineHeight: 24,
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
    minHeight: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  detailedCell: {
    minHeight: 56,
    height: 56,
    borderRadius: 14,
    paddingVertical: 3,
    justifyContent: 'space-between',
  },
  cellSelected: {
    backgroundColor: colors.primaryTint,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dayNumberText: {
    ...type.bodyBold,
    fontSize: 13,
    color: colors.text,
  },
  dayNumberDimmed: {
    color: colors.borderStrong,
  },
  dayNumberSelected: {
    color: colors.primaryDark,
    fontWeight: '800',
  },
  amountText: {
    ...type.caption,
    fontSize: 10,
    color: colors.muted,
    fontWeight: '500',
  },
  amountTextSelected: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
    alignSelf: 'center',
  },
  statusDotPlaceholder: {
    width: 6,
    height: 6,
    marginTop: 2,
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
    backgroundColor: colors.success,
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
