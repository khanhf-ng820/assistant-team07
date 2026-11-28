import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import { ApiHealthCheck } from '../../src/components/ApiHealthCheck';
import { MonthCalendar } from '../../src/components/calendar/MonthCalendar';
import { GreetingHeader } from '../../src/components/dashboard/GreetingHeader';
import { MonthlyBudgetSummaryCard } from '../../src/components/dashboard/MonthlyBudgetSummaryCard';
import { colors, type } from '../../src/theme';

function SessionStatusBar() {
  const { status, student, error, signOut } = useAuth();
  if (status === 'local_dev') {
    return (
      <Text style={styles.localNote}>
        Chế độ LAN cục bộ (chưa cấu hình Supabase)
      </Text>
    );
  }
  if (status === 'authenticated' && student) {
    return (
      <View style={styles.sessionContainer}>
        <View style={styles.sessionRow}>
          <Text style={styles.userText}>{student.email ?? student.id}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đăng xuất"
            onPress={() => {
              void signOut().catch(() => {
                // Auth snapshot surfaces storage clear errors below.
              });
            }}
            style={styles.logoutButton}
          >
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </Pressable>
        </View>
        {error ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {error}
          </Text>
        ) : null}
      </View>
    );
  }
  return null;
}

export default function StatsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="stats-screen-scroll"
      >
        {/* Top Greeting & Recorded Balance Header (wallet opens financial onboarding) */}
        <GreetingHeader
          userName="Minh"
          onWalletPress={() => router.push('/onboarding')}
        />

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

        {/* Baseline API Health Check & Auth Session Status */}
        <View style={styles.healthCheckContainer}>
          <ApiHealthCheck />
          <SessionStatusBar />
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
    gap: 10,
  },
  localNote: { ...type.caption, color: colors.muted },
  sessionContainer: { gap: 8, paddingTop: 4 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  userText: { ...type.caption, color: colors.text, flexShrink: 1 },
  errorText: { ...type.caption, color: colors.danger, fontWeight: '600' },
  logoutButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  logoutText: { ...type.caption, color: colors.savings, fontWeight: '600' },
  pressed: {
    opacity: 0.75,
  },
});
