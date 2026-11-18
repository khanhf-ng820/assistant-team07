import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DayTransactionsSheet } from '../src/components/calendar/DayTransactionsSheet';
import { MonthCalendar } from '../src/components/calendar/MonthCalendar';
import { MonthlyBudgetSummaryCard } from '../src/components/dashboard/MonthlyBudgetSummaryCard';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { colors } from '../src/theme';

export default function CalendarDetailScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Full Month Calendar with per-day amounts and back button */}
        <MonthCalendar
          mode="detailed"
          onBackPress={() => router.back()}
        />

        {/* Monthly Budget Summary */}
        <MonthlyBudgetSummaryCard />
      </ScrollView>

      {/* Selected Day Transaction Sheet */}
      <DayTransactionsSheet />

      {/* Manual Expense Entry Modal */}
      <ManualEntryModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingVertical: 12,
    gap: 20,
  },
});
