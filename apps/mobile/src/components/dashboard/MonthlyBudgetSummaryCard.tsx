import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { colors, type } from '../../theme';
import { formatVND } from '../../types/transaction';

export function MonthlyBudgetSummaryCard() {
  const { monthlySummary } = useLedger();

  return (
    <View style={styles.card} testID="monthly-budget-summary-card">
      {/* Row 1: Monthly adherence metric (carenta-implementation-plan §4 line 123) */}
      <View style={styles.row}>
        <Text style={styles.title}>Ngày trong hạn mức</Text>
        <Text
          style={styles.highlightTeal}
          testID="days-within-ratio"
          accessibilityLabel={`Ngày trong hạn mức: ${monthlySummary.daysWithinBudget}/${monthlySummary.daysEvaluated} ngày đã đánh giá`}
        >
          {monthlySummary.daysWithinBudget}/{monthlySummary.daysEvaluated} ngày đã đánh giá
        </Text>
      </View>

      {/* Row 2: Total Spent (derived dynamically from calendar aggregation) */}
      <View style={styles.row}>
        <Text style={styles.label}>Tổng chi tiêu</Text>
        <Text style={styles.amountValue} testID="monthly-total-spent">
          {formatVND(monthlySummary.totalSpent)}
        </Text>
      </View>

      {/* Row 3: Days Over Budget */}
      <View style={styles.row}>
        <Text style={styles.label}>Vượt ngân sách</Text>
        <Text style={styles.highlightDanger} testID="days-over-budget">
          {monthlySummary.daysOverBudget} ngày
        </Text>
      </View>

      {/* Row 4: Unevaluated Days (carenta-implementation-plan §4 line 123) */}
      <View style={styles.row}>
        <Text style={styles.label}>Chưa đánh giá</Text>
        <Text style={styles.mutedValue} testID="days-unevaluated">
          {monthlySummary.daysUnevaluated} ngày
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    gap: 14,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 0,
  },
  label: {
    ...type.body,
    color: colors.muted,
    fontSize: 14,
  },
  highlightTeal: {
    ...type.bodyBold,
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  amountValue: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  highlightDanger: {
    ...type.bodyBold,
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  mutedValue: {
    ...type.bodyBold,
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
});
