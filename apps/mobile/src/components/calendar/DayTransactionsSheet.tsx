import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLedger } from '../../context/LedgerContext';
import { colors, type } from '../../theme';
import { CATEGORIES, formatVND } from '../../types/transaction';

interface DayTransactionsSheetProps {
  visible?: boolean;
  onClose?: () => void;
}

const VI_DAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

function formatVietnameseDate(isoDate: string): string {
  try {
    const parts = isoDate.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = VI_DAYS[dateObj.getDay()];
    return `${dayOfWeek}, ${day} tháng ${month}, ${year}`;
  } catch {
    return isoDate;
  }
}

export function DayTransactionsSheet({ visible, onClose }: DayTransactionsSheetProps) {
  const {
    isDaySheetOpen,
    closeDaySheet,
    selectedDate,
    getSummaryForDate,
  } = useLedger();

  const isSheetVisible = visible !== undefined ? visible : isDaySheetOpen;
  const handleClose = onClose || closeDaySheet;

  const daySummary = getSummaryForDate(selectedDate);
  const transactions = daySummary.transactions;
  const totalAmount = daySummary.totalSpent;

  return (
    <Modal
      testID="day-transactions-modal"
      visible={isSheetVisible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} testID="sheet-backdrop" />

        <SafeAreaView edges={['bottom']} style={styles.sheetContainer}>
          {/* Drag Handle Indicator */}
          <View style={styles.handleBar} />

          {/* Title Row with Accessible Close Button (>= 48dp touch target) */}
          <View style={styles.headerRow}>
            <View style={styles.headerTextGroup}>
              <Text accessibilityRole="header" style={styles.titleText}>
                Chi tiêu ngày đã chọn
              </Text>
              <Text style={styles.subtitleDateText} testID="selected-day-label">
                {formatVietnameseDate(selectedDate)}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng chi tiết ngày"
              onPress={handleClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              testID="close-day-sheet"
            >
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          {/* Daily Total Summary Card */}
          <View style={styles.summaryCard} testID="day-total-summary-card">
            <View style={styles.summaryLeft}>
              <Text style={styles.summaryLabel}>Tổng chi trong ngày</Text>
              <Text style={styles.summaryCount}>
                {transactions.length} khoản chi
              </Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryAmountText} testID="day-total-amount">
                {formatVND(totalAmount)}
              </Text>
            </View>
          </View>

          {/* Transaction Section Header */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Chi tiết giao dịch</Text>
            <Text style={styles.sectionCurrency}>VND</Text>
          </View>

          {/* Transaction List */}
          <ScrollView
            contentContainerStyle={styles.transactionsList}
            showsVerticalScrollIndicator={false}
            testID="transactions-scroll-view"
          >
            {transactions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Chưa có giao dịch nào trong ngày này.</Text>
              </View>
            ) : (
              transactions.map((tx) => {
                const category = CATEGORIES[tx.categoryId] || CATEGORIES.other;
                return (
                  <View
                    key={tx.id}
                    style={styles.txCard}
                    testID={`transaction-item-${tx.id}`}
                  >
                    {/* Category Icon */}
                    <View
                      style={[
                        styles.categoryIconBox,
                        { backgroundColor: category.backgroundColor },
                      ]}
                    >
                      <Text style={styles.categoryIconSymbol}>
                        {category.iconSymbol}
                      </Text>
                    </View>

                    {/* Transaction Details */}
                    <View style={styles.txInfoCol}>
                      <Text style={styles.txTitle}>{tx.note || category.name}</Text>
                      <View style={styles.badgePill}>
                        <Text style={styles.badgeText}>{category.badgeLabel}</Text>
                      </View>
                    </View>

                    {/* Amount and Time */}
                    <View style={styles.txAmountCol}>
                      <Text style={styles.txAmountText}>{formatVND(tx.amount)}</Text>
                      <Text style={styles.txTimeText}>{tx.time}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '85%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  handleBar: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTextGroup: {
    gap: 4,
  },
  titleText: {
    ...type.heading,
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  subtitleDateText: {
    ...type.caption,
    fontSize: 13,
    color: colors.muted,
  },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.muted,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 20,
  },
  summaryLeft: {
    gap: 4,
  },
  summaryLabel: {
    ...type.bodyBold,
    color: colors.primary,
    fontSize: 14,
  },
  summaryCount: {
    ...type.caption,
    color: '#0D9488',
    fontSize: 12,
  },
  summaryRight: {
    alignItems: 'flex-end',
  },
  summaryAmountText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F766E',
    textDecorationLine: 'underline',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCurrency: {
    ...type.caption,
    color: colors.subtle,
    fontSize: 12,
  },
  transactionsList: {
    gap: 12,
    paddingBottom: 24,
  },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: colors.surface,
    gap: 12,
  },
  categoryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconSymbol: {
    fontSize: 20,
  },
  txInfoCol: {
    flex: 1,
    gap: 4,
  },
  txTitle: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  badgePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    ...type.captionBold,
    color: colors.primary,
    fontSize: 11,
  },
  txAmountCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  txAmountText: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  txTimeText: {
    ...type.caption,
    color: colors.subtle,
    fontSize: 12,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    ...type.body,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.7,
  },
});
