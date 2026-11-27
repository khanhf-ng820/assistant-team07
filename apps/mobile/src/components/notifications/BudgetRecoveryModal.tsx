import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLedger } from '../../context/LedgerContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatVnd } from '../../format';
import { colors, type } from '../../theme';
import { formatVietnameseDate } from '../../types/transaction';

export function BudgetRecoveryModal() {
  const { isRecoveryModalOpen, recoveryPlan, closeRecoveryPreview } = useNotifications();
  const { openDaySheet } = useLedger();

  const handleViewDayTransactions = () => {
    const targetDate = recoveryPlan?.date;
    closeRecoveryPreview();
    if (targetDate) {
      openDaySheet(targetDate);
    }
  };

  return (
    <Modal
      testID="budget-recovery-modal"
      visible={isRecoveryModalOpen && recoveryPlan !== null}
      transparent
      animationType="slide"
      onRequestClose={closeRecoveryPreview}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng kế hoạch điều chỉnh"
          onPress={closeRecoveryPreview}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                Kế hoạch điều chỉnh ngân sách
              </Text>
              {recoveryPlan ? (
                <Text style={styles.subtitle}>
                  {formatVietnameseDate(recoveryPlan.date)}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={closeRecoveryPreview}
              hitSlop={8}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              testID="recovery-modal-close"
            >
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          {recoveryPlan ? (
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Hạn mức ngày</Text>
                  <Text style={styles.metricValue}>
                    {formatVnd(recoveryPlan.dailyBudgetLimit)}
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Đã chi hôm nay</Text>
                  <Text style={styles.metricValue}>
                    {formatVnd(recoveryPlan.spentToday)}
                  </Text>
                </View>

                <View style={[styles.metricCard, styles.metricDangerCard]}>
                  <Text style={styles.metricDangerLabel}>Đã vượt hạn mức</Text>
                  <Text style={styles.metricDangerValue} testID="recovery-overspent-amount">
                    {formatVnd(recoveryPlan.overspentAmount)}
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Ngày còn lại trong tháng</Text>
                  <Text style={styles.metricValue}>
                    {recoveryPlan.remainingDaysInMonth} ngày
                  </Text>
                </View>
              </View>

              <View style={styles.suggestionCard}>
                <Text style={styles.suggestionHeading}>Đề xuất điều chỉnh</Text>
                <Text style={styles.suggestionSummary} testID="recovery-summary-text">
                  {recoveryPlan.summaryText}
                </Text>
                {recoveryPlan.overspentAmount > 0 && recoveryPlan.remainingDaysInMonth > 0 ? (
                  <View style={styles.suggestionHighlightRow}>
                    <Text style={styles.suggestionHighlightLabel}>
                      Hạn mức gợi ý mới mỗi ngày
                    </Text>
                    <Text style={styles.suggestionHighlightValue} testID="recovery-adjusted-allowance">
                      {formatVnd(recoveryPlan.adjustedDailyAllowance)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>
                  Đây chỉ là bản xem trước gợi ý — không tự động thay đổi mục tiêu tiết kiệm hay ghi nhận giao dịch.
                </Text>
              </View>
            </ScrollView>
          ) : null}

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xem giao dịch hôm nay"
              onPress={handleViewDayTransactions}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              testID="recovery-view-transactions-button"
            >
              <Text style={styles.secondaryButtonText}>Xem giao dịch hôm nay</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đã hiểu"
              onPress={closeRecoveryPreview}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
              testID="recovery-confirm-button"
            >
              <Text style={styles.primaryButtonText}>Đã hiểu</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlayBackdrop,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 16,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...type.heading,
    color: colors.text,
    fontWeight: '700',
  },
  subtitle: {
    ...type.caption,
    color: colors.muted,
  },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.muted,
  },
  content: {
    gap: 14,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
  },
  metricDangerCard: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.dangerSoft,
  },
  metricLabel: {
    ...type.caption,
    color: colors.muted,
  },
  metricValue: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  metricDangerLabel: {
    ...type.caption,
    color: colors.dangerText,
  },
  metricDangerValue: {
    ...type.bodyBold,
    color: colors.dangerText,
    fontSize: 15,
  },
  suggestionCard: {
    backgroundColor: colors.primaryTint,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    padding: 16,
    gap: 8,
  },
  suggestionHeading: {
    ...type.captionBold,
    color: colors.primaryDark,
    textTransform: 'uppercase',
  },
  suggestionSummary: {
    ...type.body,
    color: colors.text,
  },
  suggestionHighlightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.primaryLight,
  },
  suggestionHighlightLabel: {
    ...type.captionBold,
    color: colors.primaryDark,
  },
  suggestionHighlightValue: {
    ...type.bodyBold,
    color: colors.primary,
    fontSize: 16,
  },
  noticeBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    ...type.caption,
    color: colors.muted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryButtonText: {
    ...type.captionBold,
    color: colors.primary,
    fontSize: 13,
    textAlign: 'center',
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  primaryButtonText: {
    ...type.bodyBold,
    color: colors.surface,
  },
  pressed: {
    opacity: 0.8,
  },
});
