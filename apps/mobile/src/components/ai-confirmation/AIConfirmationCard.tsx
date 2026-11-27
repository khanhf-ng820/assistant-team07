import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';
import {
  AiExpenseDraft,
  findDuplicateTransaction,
  validateAiDraft,
} from '../../types/aiDraft';
import {
  CATEGORIES,
  formatVietnameseDate,
  formatVND,
  Transaction,
} from '../../types/transaction';
import { Button } from '../Button';
import { Card } from '../Card';

export interface AIConfirmationCardProps {
  draft: AiExpenseDraft;
  priorDaySpent: number;
  dailyBudgetLimit: number;
  existingTransactions: Transaction[];
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onQuickEdit: () => void;
  onCancel?: () => void;
}

const SOURCE_LABELS: Record<AiExpenseDraft['source'], { badge: string; title: string }> = {
  ocr: { badge: 'Quét hóa đơn', title: 'Xác nhận hóa đơn AI' },
  voice: { badge: 'Ghi âm giọng nói', title: 'Xác nhận ghi âm AI' },
};

export function AIConfirmationCard({
  draft,
  priorDaySpent,
  dailyBudgetLimit,
  existingTransactions,
  isSubmitting = false,
  errorMessage = null,
  onConfirm,
  onQuickEdit,
  onCancel,
}: AIConfirmationCardProps) {
  const validation = validateAiDraft(draft);
  const category = draft.categoryId ? CATEGORIES[draft.categoryId] : null;
  const duplicateMatch = findDuplicateTransaction(draft, existingTransactions);
  const sourceMeta = SOURCE_LABELS[draft.source];

  const draftAmount = draft.amount ?? 0;
  const priorRemaining = dailyBudgetLimit - priorDaySpent;
  const remainingAfterPurchase = priorRemaining - draftAmount;
  const isOverBudgetAfter = remainingAfterPurchase < 0;

  const missingLabels: string[] = [];
  if (validation.missingFields.includes('amount')) missingLabels.push('số tiền');
  if (validation.missingFields.includes('categoryId')) missingLabels.push('danh mục');
  if (validation.invalidDate) missingLabels.push('ngày giao dịch hợp lệ');

  const timestampDisplay = draft.time
    ? `${formatVietnameseDate(draft.date)} • ${draft.time}`
    : `${formatVietnameseDate(draft.date)} (chưa rõ giờ)`;

  const canConfirm = validation.isValid && !isSubmitting;

  return (
    <Card testID="ai-confirmation-card" variant="elevated" padding="xl" style={styles.card}>
      {/* Source badge & heading */}
      <View style={styles.headerRow}>
        <View style={styles.sourceBadge}>
          <Text style={styles.sourceBadgeText}>{sourceMeta.badge}</Text>
        </View>
        <Text style={styles.draftHint}>Bản nháp chờ xác nhận</Text>
      </View>

      <Text accessibilityRole="header" style={styles.title}>
        {sourceMeta.title}
      </Text>

      {/* Extracted Amount */}
      <View style={styles.amountBox}>
        <Text style={styles.sectionLabel}>SỐ TIỀN TRÍCH XUẤT</Text>
        {draft.amount !== null && draft.amount > 0 ? (
          <Text testID="ai-confirm-amount" style={styles.amountValue}>
            {formatVND(draft.amount)}
          </Text>
        ) : (
          <Text testID="ai-confirm-amount-missing" style={styles.amountMissing}>
            Chưa xác định số tiền
          </Text>
        )}

        {/* Deterministic affordability preview (plan §4 line 120 & UC08) */}
        {draft.amount !== null && draft.amount > 0 ? (
          <View
            testID="ai-confirm-budget-preview"
            style={[
              styles.budgetPill,
              isOverBudgetAfter ? styles.budgetPillDanger : styles.budgetPillSuccess,
            ]}
          >
            <Text style={styles.budgetPillText}>
              {isOverBudgetAfter
                ? `Vượt ngân sách ${formatVND(Math.abs(remainingAfterPurchase))} sau khoản chi này`
                : `Còn ${formatVND(remainingAfterPurchase)} sau khoản chi này`}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Recognized voice transcript / source text if present */}
      {draft.recognizedText ? (
        <View testID="ai-confirm-recognized-text" style={styles.transcriptBox}>
          <Text style={styles.fieldLabel}>Nội dung AI nghe được</Text>
          <Text style={styles.transcriptText}>“{draft.recognizedText}”</Text>
        </View>
      ) : null}

      {/* Extracted Details: Category, Merchant, Note, Timestamp */}
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: category ? category.backgroundColor : colors.surfaceAlt },
            ]}
          >
            <Text style={styles.iconEmoji}>{category ? category.iconSymbol : '❓'}</Text>
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.fieldLabel}>Danh mục</Text>
            <Text testID="ai-confirm-category" style={styles.fieldValue}>
              {category ? category.name : 'Chưa phân loại — cần bổ sung'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <View style={[styles.iconBox, styles.neutralIconBox]}>
            <Text style={styles.iconEmoji}>🏪</Text>
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.fieldLabel}>Cửa hàng / Nơi chi</Text>
            <Text testID="ai-confirm-merchant" style={styles.fieldValue}>
              {draft.merchant?.trim() || 'Chưa rõ cửa hàng'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <View style={[styles.iconBox, styles.neutralIconBox]}>
            <Text style={styles.iconEmoji}>📝</Text>
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.fieldLabel}>Ghi chú giao dịch</Text>
            <Text testID="ai-confirm-note" style={styles.fieldValue}>
              {draft.note.trim() || 'Chưa có ghi chú'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <View style={[styles.iconBox, styles.neutralIconBox]}>
            <Text style={styles.iconEmoji}>🕒</Text>
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.fieldLabel}>Thời gian giao dịch</Text>
            <Text testID="ai-confirm-timestamp" style={styles.fieldValue}>
              {timestampDisplay}
            </Text>
          </View>
        </View>
      </View>

      {/* Missing Required Fields Alert */}
      {!validation.isValid ? (
        <View
          testID="ai-confirm-missing-banner"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[styles.alertBanner, styles.dangerBanner]}
        >
          <Text style={styles.alertTitle}>Thiếu thông tin bắt buộc</Text>
          <Text style={styles.alertBody}>
            Vui lòng bấm “Sửa nhanh” để bổ sung {missingLabels.join(' và ')} trước khi xác nhận.
          </Text>
        </View>
      ) : null}

      {/* Low-Confidence / Uncertain Fields Warning (qualitative only per plan §10) */}
      {validation.isValid && (draft.hasLowConfidence || (draft.uncertainFields?.length ?? 0) > 0) ? (
        <View
          testID="ai-confirm-uncertain-banner"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.alertBanner, styles.warningBanner]}
        >
          <Text style={styles.alertTitle}>Cần kiểm tra lại thông tin</Text>
          <Text style={styles.alertBody}>
            {draft.uncertainFields && draft.uncertainFields.length > 0
              ? `AI chưa chắc chắn ở mục: ${draft.uncertainFields.join(', ')}. Bạn có thể bấm “Sửa nhanh” để chỉnh lại.`
              : 'Một số thông tin AI trích xuất chưa chắc chắn — vui lòng kiểm tra trước khi xác nhận.'}
          </Text>
        </View>
      ) : null}

      {/* Potential Duplicate Warning (informational, still confirmable per plan §10) */}
      {duplicateMatch ? (
        <View
          testID="ai-confirm-duplicate-banner"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.alertBanner, styles.warningBanner]}
        >
          <Text style={styles.alertTitle}>Phát hiện khoản chi tương tự trong ngày</Text>
          <Text style={styles.alertBody}>
            Đã có giao dịch “{duplicateMatch.note}” ({formatVND(duplicateMatch.amount)}) trong ngày này. Nếu đây là giao dịch mới hợp lệ, bạn vẫn có thể bấm Xác nhận.
          </Text>
        </View>
      ) : null}

      {/* Submission Error */}
      {errorMessage ? (
        <View
          testID="ai-confirm-error-banner"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[styles.alertBanner, styles.dangerBanner]}
        >
          <Text style={styles.alertBody}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Action Buttons: [Sửa nhanh] & [Xác nhận] */}
      <View style={styles.actionsRow}>
        <Button
          testID="ai-quick-edit-button"
          title="Sửa nhanh"
          variant="outline"
          size="lg"
          disabled={isSubmitting}
          onPress={onQuickEdit}
          accessibilityLabel="Sửa nhanh thông tin giao dịch"
          style={styles.actionButton}
        />
        <Button
          testID="ai-confirm-submit-button"
          title={isSubmitting ? 'Đang lưu...' : 'Xác nhận'}
          variant="primary"
          size="lg"
          disabled={!canConfirm}
          loading={isSubmitting}
          onPress={onConfirm}
          accessibilityLabel="Xác nhận lưu giao dịch"
          style={styles.actionButton}
        />
      </View>

      {onCancel ? (
        <Button
          testID="ai-confirm-cancel-button"
          title="Hủy bản nháp"
          variant="ghost"
          size="md"
          disabled={isSubmitting}
          onPress={onCancel}
          accessibilityLabel="Hủy bản nháp không lưu"
          style={styles.cancelButton}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sourceBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  sourceBadgeText: {
    ...typography.captionBold,
    color: colors.primaryDark,
  },
  draftHint: {
    ...typography.caption,
    color: colors.muted,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  amountBox: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.captionBold,
    color: colors.muted,
    letterSpacing: 0.6,
  },
  amountValue: {
    ...typography.heroAmount,
    color: colors.text,
  },
  amountMissing: {
    ...typography.heading,
    color: colors.text,
  },
  budgetPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  budgetPillSuccess: {
    backgroundColor: colors.successSoft,
  },
  budgetPillDanger: {
    backgroundColor: colors.dangerSoft,
  },
  budgetPillText: {
    ...typography.captionBold,
    color: colors.text,
    textAlign: 'center',
  },
  transcriptBox: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    gap: spacing.xs,
  },
  transcriptText: {
    ...typography.body,
    color: colors.text,
    fontStyle: 'italic',
  },
  detailsContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceCard,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
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
  iconEmoji: {
    ...typography.heading,
  },
  detailContent: {
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
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  alertBanner: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  warningBanner: {
    backgroundColor: colors.warningSoft,
  },
  dangerBanner: {
    backgroundColor: colors.dangerSoft,
  },
  alertTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  alertBody: {
    ...typography.caption,
    color: colors.text,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  actionButton: {
    flex: 1,
  },
  cancelButton: {
    width: '100%',
  },
});

export default AIConfirmationCard;
