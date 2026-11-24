import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLedger } from '../../context/LedgerContext';
import { colors, type } from '../../theme';
import { CATEGORIES, Category, CategoryId, formatVietnameseDate, formatVND } from '../../types/transaction';
import { CategoryPickerModal } from './CategoryPickerModal';
import { VirtualNumpad } from './VirtualNumpad';

interface ManualEntryModalProps {
  visible?: boolean;
  onClose?: () => void;
}

export function ManualEntryModal({ visible, onClose }: ManualEntryModalProps) {
  const {
    isManualEntryOpen,
    closeManualEntry,
    addTransaction,
    selectedDate,
    dailyBudgetLimit,
  } = useLedger();

  const isModalVisible = visible !== undefined ? visible : isManualEntryOpen;
  const handleClose = onClose || closeManualEntry;

  // Initial amount buffer matches Figma Page 8: '45000'
  const [amountStr, setAmountStr] = useState<string>('45000');
  const [selectedCategoryId, setSelectedCategoryId] = useState<CategoryId>('food');
  const [note, setNote] = useState<string>('Cơm trưa');
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedCategory: Category = CATEGORIES[selectedCategoryId] || CATEGORIES.food;
  const numericAmount = parseInt(amountStr || '0', 10);

  // Virtual numpad handlers
  const handleDigitPress = (digit: string) => {
    setValidationError(null);
    setAmountStr((prev) => {
      if (!prev || prev === '0') return digit;
      if (prev.length >= 9) return prev; // Cap at 999,999,999 VND
      return prev + digit;
    });
  };

  const handleTripleZeroPress = () => {
    setValidationError(null);
    setAmountStr((prev) => {
      if (!prev || prev === '0') return '0';
      if (prev.length >= 7) return prev;
      return prev + '000';
    });
  };

  const handleDeletePress = () => {
    setValidationError(null);
    setAmountStr((prev) => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  };

  // Remaining budget preview calculation (carenta-implementation-plan §4 line 120):
  // Prior daily allowance = 120,000 ₫. With 45,000 ₫ expense: 120,000 - 45,000 = 75,000 ₫ remaining.
  const priorDailyAllowance = dailyBudgetLimit || 120000;
  const remainingAfterExpense = priorDailyAllowance - numericAmount;

  const handleSave = () => {
    if (numericAmount <= 0) {
      setValidationError('Vui lòng nhập số tiền lớn hơn 0');
      return;
    }

    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');

    // Default to the active calendar date (e.g. 2024-07-10) so the record reconciles immediately
    const entryDate = selectedDate || '2024-07-10';

    addTransaction({
      amount: numericAmount,
      categoryId: selectedCategoryId,
      note: note.trim() || selectedCategory.name,
      date: entryDate,
      time: `${hours}:${minutes}`,
    });

    // Reset and close
    setAmountStr('0');
    setNote('');
    handleClose();
  };

  const formattedAmountDisplay = numericAmount > 0
    ? numericAmount.toLocaleString('vi-VN')
    : '0';

  return (
    <Modal
      testID="manual-entry-modal"
      visible={isModalVisible}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        {/* Top Header with >= 48dp Back Button */}
        <View style={styles.topHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={handleClose}
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            testID="manual-entry-back"
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>

          <Text accessibilityRole="header" style={styles.headerTitle}>
            Thêm khoản chi
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Thin accent separator */}
        <View style={styles.accentDivider} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount Display Section */}
          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>SỐ TIỀN CHI TIÊU</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountNumberText} testID="amount-display-value">
                {formattedAmountDisplay}
              </Text>
              <Text style={styles.amountCurrencyUnderlined}> ₫</Text>
            </View>

            {/* Remaining budget badge (carenta-implementation-plan §4 line 120) */}
            <View
              style={[
                styles.budgetBadge,
                remainingAfterExpense < 0 && styles.budgetBadgeOverspent,
              ]}
              testID="remaining-budget-badge"
            >
              <Text
                style={[
                  styles.budgetBadgeText,
                  remainingAfterExpense < 0 && styles.budgetBadgeTextOverspent,
                ]}
              >
                {remainingAfterExpense >= 0
                  ? `Còn ${formatVND(remainingAfterExpense)} sau khoản chi này`
                  : `Vượt ngân sách ${formatVND(Math.abs(remainingAfterExpense))} sau khoản chi này`}
              </Text>
            </View>

            {validationError ? (
              <Text style={styles.errorText}>{validationError}</Text>
            ) : null}
          </View>

          {/* Form Card (Category & Note) */}
          <View style={styles.formCard}>
            {/* Category Row */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Danh mục hiện tại: ${selectedCategory.name}. Bấm để thay đổi.`}
              onPress={() => setIsCategoryPickerOpen(true)}
              style={({ pressed }) => [styles.formRow, pressed && styles.pressed]}
              testID="category-selector-button"
            >
              <View
                style={[
                  styles.fieldIconBox,
                  { backgroundColor: selectedCategory.backgroundColor },
                ]}
              >
                <Text style={styles.fieldIconSymbol}>
                  {selectedCategory.iconSymbol}
                </Text>
              </View>

              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>Danh mục</Text>
                <Text style={styles.fieldValue} testID="selected-category-name">
                  {selectedCategory.name}
                </Text>
              </View>

              <Text style={styles.chevronIcon}>⌄</Text>
            </Pressable>

            {/* Inner divider */}
            <View style={styles.cardDivider} />

            {/* Note Input Row */}
            <View style={styles.formRow}>
              <View style={[styles.fieldIconBox, styles.noteIconBg]}>
                <Text style={styles.fieldIconSymbol}>📝</Text>
              </View>

              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>Ghi chú</Text>
                <TextInput
                  accessibilityLabel="Nhập ghi chú khoản chi"
                  value={note}
                  onChangeText={setNote}
                  placeholder="Nhập tên khoản chi..."
                  placeholderTextColor={colors.subtle}
                  style={styles.noteInput}
                  testID="manual-entry-note-input"
                />
              </View>
            </View>
          </View>

          {/* Transaction Date Row */}
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Ngày giao dịch</Text>
            <View style={styles.dateValueGroup}>
              <Text style={styles.calendarIcon}>📅</Text>
              <Text style={styles.dateValueText}>
                {selectedDate
                  ? selectedDate === '2024-07-10'
                    ? 'Hôm nay (10 tháng 7, 2024)'
                    : formatVietnameseDate(selectedDate)
                  : 'Hôm nay'}
              </Text>
            </View>
          </View>

          {/* Virtual Numpad */}
          <VirtualNumpad
            onDigitPress={handleDigitPress}
            onTripleZeroPress={handleTripleZeroPress}
            onDeletePress={handleDeletePress}
          />

          {/* Submit Action Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lưu khoản chi"
            onPress={handleSave}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
            testID="submit-expense-button"
          >
            <Text style={styles.saveCheckIcon}>✓</Text>
            <Text style={styles.saveButtonText}>Lưu khoản chi</Text>
          </Pressable>
        </ScrollView>

        {/* Category Picker Modal */}
        <CategoryPickerModal
          visible={isCategoryPickerOpen}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={(cat) => setSelectedCategoryId(cat.id)}
          onClose={() => setIsCategoryPickerOpen(false)}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  backIcon: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  headerTitle: {
    ...type.heading,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  headerSpacer: {
    width: 48,
  },
  accentDivider: {
    height: 3,
    backgroundColor: '#3B82F6',
    marginHorizontal: 20,
    borderRadius: 2,
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  amountLabel: {
    ...type.captionBold,
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 0.8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  amountNumberText: {
    ...type.amountHero,
    fontSize: 42,
    fontWeight: '800',
    color: colors.text,
  },
  amountCurrencyUnderlined: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    textDecorationLine: 'underline',
  },
  budgetBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  budgetBadgeOverspent: {
    backgroundColor: '#FEE2E2',
  },
  budgetBadgeText: {
    ...type.captionBold,
    color: '#15803D',
    fontSize: 13,
  },
  budgetBadgeTextOverspent: {
    color: colors.danger,
  },
  errorText: {
    ...type.caption,
    color: colors.danger,
    marginTop: 4,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  fieldIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteIconBg: {
    backgroundColor: '#F1F5F9',
  },
  fieldIconSymbol: {
    fontSize: 20,
  },
  fieldInfo: {
    flex: 1,
    gap: 2,
  },
  fieldLabel: {
    ...type.caption,
    color: colors.subtle,
    fontSize: 11,
  },
  fieldValue: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  noteInput: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 15,
    padding: 0,
    margin: 0,
  },
  chevronIcon: {
    fontSize: 18,
    color: colors.subtle,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  dateLabel: {
    ...type.body,
    color: colors.muted,
    fontSize: 14,
  },
  dateValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarIcon: {
    fontSize: 16,
  },
  dateValueText: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 14,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    backgroundColor: '#1E655A',
    borderRadius: 16,
    marginTop: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  saveCheckIcon: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: '800',
  },
  saveButtonText: {
    ...type.bodyBold,
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
