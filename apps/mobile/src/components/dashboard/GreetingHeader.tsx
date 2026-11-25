import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLedger } from '../../context/LedgerContext';
import { colors, type } from '../../theme';
import { formatVND } from '../../types/transaction';

interface GreetingHeaderProps {
  userName?: string;
  onWalletPress?: () => void;
}

export function GreetingHeader({
  userName = 'Minh',
  onWalletPress,
}: GreetingHeaderProps) {
  const { availableBalance, isBalanceVisible, toggleBalanceVisibility } = useLedger();
  const isNegativeBalance = availableBalance < 0;

  return (
    <View style={styles.container} testID="greeting-header">
      {/* Top Greeting Bar */}
      <View style={styles.topRow}>
        <View style={styles.greetingTextContainer}>
          <Text accessibilityRole="header" style={styles.greetingTitle}>
            Xin chào, {userName}!
          </Text>
          <Text style={styles.greetingSubtitle}>Từng bước nhỏ. Thêm tự do.</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            onWalletPress ? 'Ví tài chính' : 'Ví tài chính — Sắp ra mắt'
          }
          accessibilityState={{ disabled: !onWalletPress }}
          disabled={!onWalletPress}
          onPress={onWalletPress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.walletButton,
            !onWalletPress && styles.walletButtonDisabled,
            pressed && styles.pressed,
          ]}
          testID="wallet-button"
        >
          <Text style={styles.walletIcon}>👛</Text>
        </Pressable>
      </View>

      {/* Recorded Balance Card (labeled 'Tổng số dư ghi nhận' per carenta-implementation-plan §4 line 119) */}
      <View style={styles.balanceCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.balanceLabel}>Tổng số dư ghi nhận</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isBalanceVisible ? 'Ẩn số dư' : 'Hiện số dư'}
            onPress={toggleBalanceVisibility}
            hitSlop={8}
            style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
            testID="toggle-balance-visibility"
          >
            <Text style={styles.eyeIcon}>{isBalanceVisible ? '👁️' : '🙈'}</Text>
          </Pressable>
        </View>

        <Text
          style={[styles.balanceAmount, isNegativeBalance && styles.balanceAmountNegative]}
          testID="balance-amount-display"
          accessibilityLabel={`Số dư: ${isBalanceVisible ? formatVND(availableBalance) : 'Đã ẩn'}`}
        >
          {isBalanceVisible ? formatVND(availableBalance) : '•••••••• ₫'}
        </Text>

        {/* Status Message Badge */}
        <View style={styles.statusBadge}>
          <View
            style={[
              styles.checkCircle,
              isNegativeBalance && styles.checkCircleDanger,
            ]}
          >
            <Text
              style={[
                styles.checkIcon,
                isNegativeBalance && styles.checkIconDanger,
              ]}
            >
              {isNegativeBalance ? '!' : '✓'}
            </Text>
          </View>
          <View style={styles.statusTextGroup}>
            <Text
              style={[
                styles.statusTitle,
                isNegativeBalance && styles.statusTitleDanger,
              ]}
            >
              {isNegativeBalance
                ? 'Số dư âm — cần đối soát thu chi'
                : 'Bạn đang chi tiêu rất hợp lý'}
            </Text>
            <Text style={styles.statusSubtitle}>Cập nhật 2 phút trước</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingTextContainer: {
    gap: 4,
  },
  greetingTitle: {
    ...type.title,
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  greetingSubtitle: {
    ...type.caption,
    color: colors.muted,
    fontSize: 13,
  },
  walletButton: {
    minWidth: 48,
    minHeight: 48,
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletButtonDisabled: {
    opacity: 0.7,
  },
  walletIcon: {
    fontSize: 22,
  },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    ...type.body,
    color: colors.muted,
    fontSize: 14,
  },
  eyeButton: {
    minWidth: 48,
    minHeight: 48,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 20,
  },
  balanceAmount: {
    ...type.amountHero,
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  balanceAmountNegative: {
    color: colors.danger,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleDanger: {
    backgroundColor: colors.dangerSoft,
  },
  checkIcon: {
    color: colors.successText,
    fontSize: 13,
    fontWeight: '700',
  },
  checkIconDanger: {
    color: colors.dangerText,
  },
  statusTextGroup: {
    gap: 2,
  },
  statusTitle: {
    ...type.captionBold,
    color: colors.successText,
    fontSize: 12,
  },
  statusTitleDanger: {
    color: colors.dangerText,
  },
  statusSubtitle: {
    ...type.caption,
    color: colors.subtle,
    fontSize: 11,
  },
  pressed: {
    opacity: 0.7,
  },
});
