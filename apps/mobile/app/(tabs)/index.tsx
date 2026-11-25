import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiHealthCheck } from '../../src/components/ApiHealthCheck';
import { MonthCalendar } from '../../src/components/calendar/MonthCalendar';
import { GreetingHeader } from '../../src/components/dashboard/GreetingHeader';
import { MonthlyBudgetSummaryCard } from '../../src/components/dashboard/MonthlyBudgetSummaryCard';
import { apiBaseUrl } from '../../src/config';
import { colors, type } from '../../src/theme';

export default function StatsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="stats-screen-scroll"
      >
        {/* Top Greeting & Recorded Balance Header */}
        <GreetingHeader userName="Minh" />

        {/* Compact Calendar */}
        <MonthCalendar
          mode="compact"
          onOpenDetailed={() => router.push('/calendar-detail')}
        />

        {/* Visible Action Button for Page 17 (docs/carenta-implementation-plan §4 line 100) */}
        <View style={styles.actionContainer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem lịch chi tiết"
            onPress={() => router.push('/calendar-detail')}
            hitSlop={8}
            style={({ pressed }) => [styles.viewDetailButton, pressed && styles.pressed]}
            testID="view-detailed-calendar-button"
          >
            <Text style={styles.viewDetailButtonText}>Xem lịch chi tiết</Text>
            <Text style={styles.viewDetailChevron}>›</Text>
          </Pressable>
        </View>

        {/* Monthly Budget Summary Card */}
        <MonthlyBudgetSummaryCard />

        {/* Baseline API Health Check */}
        <View style={styles.healthCheckContainer}>
          <ApiHealthCheck baseUrl={apiBaseUrl} />
        </View>
      </ScrollView>
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
    gap: 16,
    paddingBottom: 32,
  },
  actionContainer: {
    paddingHorizontal: 20,
  },
  viewDetailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    gap: 8,
  },
  viewDetailButtonText: {
    ...type.bodyBold,
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  viewDetailChevron: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '700',
    lineHeight: 20,
  },
  healthCheckContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  pressed: {
    opacity: 0.75,
  },
});
