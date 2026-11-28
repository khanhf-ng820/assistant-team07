import React, { useEffect, useState } from 'react';
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
import { formatVndDigits } from '../../format';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import {
  AiExpenseDraft,
  isValidIsoDate,
  MAX_DRAFT_AMOUNT_VND,
  todayInVietnamIso,
} from '../../types/aiDraft';
import {
  CATEGORIES,
  Category,
  CategoryId,
  formatVietnameseDate,
  formatVND,
  shiftIsoDate,
} from '../../types/transaction';
import { Button } from '../Button';
import { Header } from '../Header';
import { CategoryPickerModal } from '../manual-entry/CategoryPickerModal';
import { VirtualNumpad } from '../manual-entry/VirtualNumpad';

export interface QuickEditModalProps {
  visible: boolean;
  draft: AiExpenseDraft;
  dailyBudgetLimit: number;
  getSpentForDate: (date: string) => number;
  onApply: (updatedDraft: AiExpenseDraft) => void;
  onClose: () => void;
}

export function QuickEditModal({
  visible,
  draft,
  dailyBudgetLimit,
  getSpentForDate,
  onApply,
  onClose,
}: QuickEditModalProps) {
  const safeInitialDate = isValidIsoDate(draft.date) ? draft.date : todayInVietnamIso();
  const [amountStr, setAmountStr] = useState<string>(
    draft.amount && draft.amount > 0 ? String(draft.amount) : '0'
  );
  const [categoryId, setCategoryId] = useState<CategoryId>(draft.categoryId ?? 'food');
  const [merchant, setMerchant] = useState<string>(draft.merchant ?? '');
  const [note, setNote] = useState<string>(draft.note ?? '');
  const [entryDate, setEntryDate] = useState<string>(safeInitialDate);
  const [timeInput, setTimeInput] = useState<string>(draft.time ?? '');
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync local draft form state whenever the modal opens for a draft
  useEffect(() => {
    if (visible) {
      setAmountStr(draft.amount && draft.amount > 0 ? String(draft.amount) : '0');
      setCategoryId(draft.categoryId ?? 'food');
      setMerchant(draft.merchant ?? '');
      setNote(draft.note ?? '');
      setEntryDate(isValidIsoDate(draft.date) ? draft.date : todayInVietnamIso());
      setTimeInput(draft.time ?? '');
      setValidationError(null);
      setIsCategoryPickerOpen(false);
    }
  }, [visible, draft]);

  const numericAmount = parseInt(amountStr || '0', 10);
  const selectedCategory: Category = CATEGORIES[categoryId] ?? CATEGORIES.food;
  const formattedAmount = numericAmount > 0 ? formatVndDigits(numericAmount) : '0';

  const priorRemaining = dailyBudgetLimit - getSpentForDate(entryDate);
  const remainingAfter = priorRemaining - numericAmount;

  const handleDigitPress = (digit: string) => {
    setValidationError(null);
    setAmountStr((prev) => {
      if (!prev || prev === '0') return digit;
      if (prev.length >= 9) return prev;
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

  const handleApply = () => {
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      setValidationError('Vui lòng nhập số tiền lớn hơn 0');
      return;
    }

    if (numericAmount > MAX_DRAFT_AMOUNT_VND) {
      setValidationError('Số tiền vượt quá giới hạn tối đa cho phép');
      return;
    }

    if (!isValidIsoDate(entryDate)) {
      setValidationError('Ngày giao dịch không hợp lệ');
      return;
    }

    const trimmedTime = timeInput.trim();
    if (trimmedTime && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmedTime)) {
      setValidationError('Giờ giao dịch cần đúng định dạng HH:mm (ví dụ 12:30)');
      return;
    }

    // Quick Edit only updates the local draft (preserving draftId) and never writes to ledger
    onApply({
      ...draft,
      amount: numericAmount,
      categoryId,
      merchant: merchant.trim() || null,
      note: note.trim(),
      date: entryDate,
      time: trimmedTime || null,
      uncertainFields: [],
      hasLowConfidence: false,
    });
  };

  return (
    <Modal
      testID="quick-edit-modal"
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView accessibilityViewIsModal edges={['top', 'bottom']} style={styles.safeArea}>
        <Header
          title="Sửa nhanh khoản chi"
          subtitle="Chỉnh sửa bản nháp trước khi xác nhận"
          onBack={onClose}
          backAccessibilityLabel="Đóng sửa nhanh"
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount & Remaining Preview */}
          <View style={styles.amountSection}>
            <Text style={styles.sectionLabel}>SỐ TIỀN</Text>
            <Text testID="quick-edit-amount-value" style={styles.amountDisplay}>
              {formattedAmount} ₫
            </Text>
            <View
              testID="quick-edit-budget-badge"
              style={[
                styles.budgetBadge,
                remainingAfter < 0 ? styles.budgetBadgeDanger : styles.budgetBadgeSuccess,
              ]}
            >
              <Text style={styles.budgetBadgeText}>
                {remainingAfter >= 0
                  ? `Còn ${formatVND(remainingAfter)} sau khoản chi này`
                  : `Vượt ngân sách ${formatVND(Math.abs(remainingAfter))} sau khoản chi này`}
              </Text>
            </View>
            {validationError ? (
              <View
                testID="quick-edit-error"
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={styles.errorBanner}
              >
                <Text style={styles.errorBannerText}>{validationError}</Text>
              </View>
            ) : null}
          </View>

          {/* Editable Form Card */}
          <View style={[styles.formCard, shadows.sm]}>
            <Pressable
              testID="quick-edit-category-button"
              accessibilityRole="button"
              accessibilityLabel={`Danh mục hiện tại: ${selectedCategory.name}. Chạm để đổi.`}
              onPress={() => setIsCategoryPickerOpen(true)}
              style={({ pressed }) => [styles.formRow, pressed && styles.pressed]}
            >
              <View
                style={[styles.iconBox, { backgroundColor: selectedCategory.backgroundColor }]}
              >
                <Text style={styles.iconText}>{selectedCategory.iconSymbol}</Text>
              </View>
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>Danh mục</Text>
                <Text testID="quick-edit-category-value" style={styles.fieldValue}>
                  {selectedCategory.name}
                </Text>
              </View>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>

            <View style={styles.divider} />

            <View style={styles.formRow}>
              <View style={[styles.iconBox, styles.neutralIconBox]}>
                <Text style={styles.iconText}>🏪</Text>
              </View>
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>Cửa hàng / Nơi chi</Text>
                <TextInput
                  testID="quick-edit-merchant-input"
                  accessibilityLabel="Cửa hàng hoặc nơi chi"
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="Nhập tên cửa hàng..."
                  placeholderTextColor={colors.muted}
                  style={styles.textInput}
                />
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.formRow}>
              <View style={[styles.iconBox, styles.neutralIconBox]}>
                <Text style={styles.iconText}>📝</Text>
              </View>
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>Ghi chú</Text>
                <TextInput
                  testID="quick-edit-note-input"
                  accessibilityLabel="Ghi chú khoản chi"
                  value={note}
                  onChangeText={setNote}
                  placeholder="Nhập mô tả khoản chi..."
                  placeholderTextColor={colors.muted}
                  style={styles.textInput}
                />
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.formRow}>
              <View style={[styles.iconBox, styles.neutralIconBox]}>
                <Text style={styles.iconText}>🕒</Text>
              </View>
              <View style={styles.fieldInfo}>
                <Text style={styles.fieldLabel}>Giờ (HH:mm, tùy chọn)</Text>
                <TextInput
                  testID="quick-edit-time-input"
                  accessibilityLabel="Giờ giao dịch định dạng HH:mm"
                  value={timeInput}
                  onChangeText={(val) => {
                    setValidationError(null);
                    setTimeInput(val);
                  }}
                  placeholder="Ví dụ: 12:30"
                  placeholderTextColor={colors.muted}
                  style={styles.textInput}
                  maxLength={5}
                />
              </View>
            </View>
          </View>

          {/* Date Steppers */}
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Ngày giao dịch</Text>
            <View style={styles.dateControls}>
              <Pressable
                testID="quick-edit-prev-date"
                accessibilityRole="button"
                accessibilityLabel="Ngày trước"
                onPress={() => setEntryDate((prev) => shiftIsoDate(prev, -1))}
                style={({ pressed }) => [styles.dateStepButton, pressed && styles.pressed]}
              >
                <Text style={styles.dateStepIcon}>‹</Text>
              </Pressable>
              <Text testID="quick-edit-date-value" style={styles.dateValue}>
                {formatVietnameseDate(entryDate)}
              </Text>
              <Pressable
                testID="quick-edit-next-date"
                accessibilityRole="button"
                accessibilityLabel="Ngày sau"
                onPress={() => setEntryDate((prev) => shiftIsoDate(prev, 1))}
                style={({ pressed }) => [styles.dateStepButton, pressed && styles.pressed]}
              >
                <Text style={styles.dateStepIcon}>›</Text>
              </Pressable>
            </View>
          </View>

          {/* Shared Virtual Numpad */}
          <VirtualNumpad
            onDigitPress={handleDigitPress}
            onTripleZeroPress={handleTripleZeroPress}
            onDeletePress={handleDeletePress}
          />

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Button
              testID="quick-edit-cancel-button"
              title="Hủy"
              variant="outline"
              size="lg"
              onPress={onClose}
              style={styles.actionButton}
            />
            <Button
              testID="quick-edit-apply-button"
              title="Áp dụng chỉnh sửa"
              variant="primary"
              size="lg"
              onPress={handleApply}
              style={styles.actionButton}
            />
          </View>
        </ScrollView>

        <CategoryPickerModal
          visible={isCategoryPickerOpen}
          selectedCategoryId={categoryId}
          onSelectCategory={(cat) => setCategoryId(cat.id)}
          onClose={() => setIsCategoryPickerOpen(false)}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.captionBold,
    color: colors.muted,
    letterSpacing: 0.6,
  },
  amountDisplay: {
    ...typography.heroAmount,
    color: colors.text,
  },
  budgetBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  budgetBadgeSuccess: {
    backgroundColor: colors.successSoft,
  },
  budgetBadgeDanger: {
    backgroundColor: colors.dangerSoft,
  },
  budgetBadgeText: {
    ...typography.captionBold,
    color: colors.text,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    width: '100%',
  },
  errorBannerText: {
    ...typography.captionBold,
    color: colors.text,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neutralIconBox: {
    backgroundColor: colors.surfaceAlt,
  },
  iconText: {
    ...typography.heading,
  },
  fieldInfo: {
    flex: 1,
    gap: 2,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.muted,
  },
  fieldValue: {
    ...typography.bodyBold,
    color: colors.text,
  },
  textInput: {
    ...typography.bodyBold,
    color: colors.text,
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
  },
  chevron: {
    ...typography.heading,
    color: colors.muted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dateLabel: {
    ...typography.bodyBold,
    color: colors.muted,
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  dateStepButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateStepIcon: {
    ...typography.heading,
    color: colors.text,
  },
  dateValue: {
    ...typography.captionBold,
    color: colors.text,
    flexShrink: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  actionButton: {
    flex: 1,
  },
  pressed: {
    opacity: 0.85,
  },
});

export default QuickEditModal;
