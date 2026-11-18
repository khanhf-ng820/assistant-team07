import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { colors, type } from '../../theme';
import { formatVND } from '../../types/transaction';

export function MonthlyBudgetSummaryCard() {
  const { monthlySummary } = useLedger();

  return (
    <View style={styles.card} testID="monthly-budget-summary-card">
      {/* Row 1: Header with ratio */}
      <View style={styles.row}>
        <Text style={styles.title}>Ngân sách tháng</Text>
        <Text style={styles.highlightTeal} testID="days-within-ratio">
          {monthlySummary.daysWithinBudget} / {monthlySummary.daysEvaluated} ngày
        </Text>
      </View>

      {/* Row 2: Total Spent */}
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
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    ...type.body,
    color: colors.muted,
    fontSize: 14,
  },
  highlightTeal: {
    ...type.bodyBold,
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
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
});
