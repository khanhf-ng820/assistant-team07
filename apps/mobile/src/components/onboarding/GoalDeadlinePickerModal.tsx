import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parseLocalDate } from '../../savings/goal';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { formatIsoDate, formatVietnameseDate } from '../../types/transaction';
import { Button } from '../Button';

export interface GoalDeadlinePickerModalProps {
  visible: boolean;
  selectedDate: string;
  today: string;
  onConfirm: (date: string) => void;
  onCancel: () => void;
}

const WEEKDAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

function extractYearMonth(isoDate: string): { year: number; month: number } {
  if (parseLocalDate(isoDate) === null) {
    return { year: 2026, month: 7 };
  }
  const [y, m] = isoDate.split('-').map(Number);
  return { year: y, month: m };
}

/**
 * Goal-deadline bottom sheet (plan §4 page 14).
 * Maintains temporary selection until user taps Confirm; Cancel restores prior date.
 */
export function GoalDeadlinePickerModal({
  visible,
  selectedDate,
  today,
  onConfirm,
  onCancel,
}: GoalDeadlinePickerModalProps) {
  const initialYm = extractYearMonth(selectedDate);
  const [draftDate, setDraftDate] = useState<string>(selectedDate);
  const [viewYear, setViewYear] = useState<number>(initialYm.year);
  const [viewMonth, setViewMonth] = useState<number>(initialYm.month);

  useEffect(() => {
    if (visible) {
      const nextDate = parseLocalDate(selectedDate) !== null ? selectedDate : today;
      const ym = extractYearMonth(nextDate);
      setDraftDate(nextDate);
      setViewYear(ym.year);
      setViewMonth(ym.month);
    }
  }, [visible, selectedDate, today]);

  const todayDayNum = parseLocalDate(today) ?? 0;

  const calendarCells = useMemo(() => {
    const firstWeekdaySun0 = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();
    // Monday-first grid: Mon=0 .. Sun=6
    const leadingEmpty = (firstWeekdaySun0 + 6) % 7;
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();

    const cells: Array<{ key: string; iso: string | null; day: number | null }> = [];
    for (let i = 0; i < leadingEmpty; i++) {
      cells.push({ key: `empty-start-${i}`, iso: null, day: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = formatIsoDate(viewYear, viewMonth, d);
      cells.push({ key: iso, iso, day: d });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ key: `empty-end-${cells.length}`, iso: null, day: null });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const shiftMonth = (delta: number) => {
    const total = viewYear * 12 + (viewMonth - 1) + delta;
    const nextYear = Math.floor(total / 12);
    const nextMonth = ((total % 12) + 12) % 12 + 1;
    setViewYear(nextYear);
    setViewMonth(nextMonth);
  };

  return (
    <Modal
      testID="goal-deadline-picker-modal"
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <SafeAreaView accessibilityViewIsModal edges={['bottom']} style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng chọn hạn mục tiêu"
          onPress={onCancel}
          style={styles.backdrop}
        />

        <View style={[styles.sheet, shadows.lg]}>
          <Text accessibilityRole="header" style={styles.title}>
            Chọn hạn mục tiêu
          </Text>
          <Text testID="deadline-picker-selected-label" style={styles.selectedPreview}>
            Đang chọn: {formatVietnameseDate(draftDate)}
          </Text>

          <View style={styles.monthBar}>
            <Pressable
              testID="deadline-picker-prev-month"
              accessibilityRole="button"
              accessibilityLabel="Tháng trước"
              onPress={() => shiftMonth(-1)}
              style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}
            >
              <Text style={styles.monthArrowText}>‹</Text>
            </Pressable>

            <Text testID="deadline-picker-month-label" style={styles.monthLabel}>
              Tháng {viewMonth}/{viewYear}
            </Text>

            <Pressable
              testID="deadline-picker-next-month"
              accessibilityRole="button"
              accessibilityLabel="Tháng sau"
              onPress={() => shiftMonth(1)}
              style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}
            >
              <Text style={styles.monthArrowText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_HEADERS.map((label) => (
              <Text key={label} style={styles.weekdayText}>
                {label}
              </Text>
            ))}
          </View>

          <ScrollView style={styles.gridScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {calendarCells.map((cell) => {
                if (!cell.iso || cell.day === null) {
                  return <View key={cell.key} style={styles.cellSlot} />;
                }
                const cellDayNum = parseLocalDate(cell.iso) ?? 0;
                const isDisabled = cellDayNum < todayDayNum;
                const isSelected = cell.iso === draftDate;

                return (
                  <View key={cell.key} style={styles.cellSlot}>
                    <Pressable
                      testID={`deadline-day-${cell.iso}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Chọn ngày ${cell.iso}`}
                      accessibilityState={{ disabled: isDisabled, selected: isSelected }}
                      disabled={isDisabled}
                      onPress={() => setDraftDate(cell.iso!)}
                      style={({ pressed }) => [
                        styles.dayButton,
                        isSelected && styles.dayButtonSelected,
                        isDisabled && styles.dayButtonDisabled,
                        pressed && !isDisabled && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          isSelected && styles.dayTextSelected,
                          isDisabled && styles.dayTextDisabled,
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Button
              testID="deadline-picker-cancel"
              title="Hủy"
              variant="outline"
              size="md"
              onPress={onCancel}
              style={styles.footerButton}
            />
            <Button
              testID="deadline-picker-confirm"
              title="Xác nhận ngày"
              variant="primary"
              size="md"
              onPress={() => onConfirm(draftDate)}
              style={styles.footerButton}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: '85%',
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  selectedPreview: {
    ...typography.captionBold,
    color: colors.primaryDark,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  monthArrow: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: {
    ...typography.title,
    color: colors.text,
  },
  monthLabel: {
    ...typography.subheading,
    color: colors.text,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    ...typography.captionBold,
    color: colors.muted,
    width: '14.285%',
    textAlign: 'center',
  },
  gridScroll: {
    maxHeight: 320,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellSlot: {
    width: '14.285%',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  dayButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButtonSelected: {
    backgroundColor: colors.primary,
  },
  dayButtonDisabled: {
    opacity: 0.35,
  },
  dayText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  dayTextSelected: {
    color: colors.surface,
  },
  dayTextDisabled: {
    color: colors.muted,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  footerButton: {
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
  },
});

export default GoalDeadlinePickerModal;
