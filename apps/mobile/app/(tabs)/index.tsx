import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiHealthCheck } from '../../src/components/ApiHealthCheck';
import { DayTransactionsSheet } from '../../src/components/calendar/DayTransactionsSheet';
import { MonthCalendar } from '../../src/components/calendar/MonthCalendar';
import { GreetingHeader } from '../../src/components/dashboard/GreetingHeader';
import { MonthlyBudgetSummaryCard } from '../../src/components/dashboard/MonthlyBudgetSummaryCard';
import { ManualEntryModal } from '../../src/components/manual-entry/ManualEntryModal';
import { apiBaseUrl } from '../../src/config';
import { colors } from '../../src/theme';

export default function StatsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="stats-screen-scroll"
      >
        {/* Top Greeting & Balance Header */}
        <GreetingHeader
          userName="Minh"
          onWalletPress={() => router.push('/calendar-detail')}
        />

        {/* Compact Calendar */}
        <MonthCalendar
          mode="compact"
          onOpenDetailed={() => router.push('/calendar-detail')}
        />

        {/* Monthly Budget Summary Card */}
        <MonthlyBudgetSummaryCard />

        {/* Baseline API Health Check */}
        <View style={styles.healthCheckContainer}>
          <ApiHealthCheck baseUrl={apiBaseUrl} />
        </View>
      </ScrollView>

      {/* Selected Day Transaction Bottom Sheet */}
      <DayTransactionsSheet />

      {/* Manual Entry Modal */}
      <ManualEntryModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingVertical: 12,
    gap: 20,
    paddingBottom: 32,
  },
  healthCheckContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
