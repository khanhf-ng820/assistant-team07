import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { VoiceDraftLike } from '../../api/contracts';
import { formatVnd } from '../../format';
import { colors, radius, spacing, typography } from '../../theme';
import { CATEGORIES, formatVietnameseDate } from '../../types/transaction';
import { Button } from '../Button';

export interface VoiceDraftReviewSheetProps {
  draft: VoiceDraftLike;
  onConfirm: (draft: VoiceDraftLike) => void;
  onEditManual?: () => void;
  onCancel: () => void;
}

const UNCERTAIN_FIELD_LABELS: Record<string, string> = {
  amount: 'Số tiền',
  category: 'Danh mục',
  merchant: 'Địa điểm',
  description: 'Ghi chú',
  occurred_on: 'Ngày chi',
  timestamp: 'Thời gian',
  recognized_text: 'Nội dung giọng nói',
};

export function hasValidConfirmableDraft(draft: VoiceDraftLike): boolean {
  return (
    draft.amount !== null &&
    Number.isSafeInteger(draft.amount) &&
    draft.amount > 0 &&
    draft.category !== null
  );
}

function formatUncertainFields(fields: string[]): string {
  const labels = fields.map((field) => UNCERTAIN_FIELD_LABELS[field] ?? field);
  return labels.join(', ');
}

export function VoiceDraftReviewSheet({
  draft,
  onConfirm,
  onEditManual,
  onCancel,
}: VoiceDraftReviewSheetProps) {
  const canConfirm = hasValidConfirmableDraft(draft);
  const categoryInfo = draft.category ? CATEGORIES[draft.category] : null;
  const noteText = draft.description?.trim() || draft.merchant?.trim() || 'Chưa có ghi chú';
  const showWarning = draft.has_low_confidence || draft.uncertain_fields.length > 0 || !canConfirm;

  return (
    <View testID="voice-draft-review-sheet" style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Xác nhận khoản chi
      </Text>

      <View style={styles.transcriptBox}>
        <Text style={styles.transcriptLabel}>Nội dung nhận diện</Text>
        <Text testID="voice-draft-recognized-text" style={styles.transcriptText}>
          {draft.recognized_text?.trim()
            ? `“${draft.recognized_text.trim()}”`
            : 'Không nhận diện được lời nói rõ ràng'}
        </Text>
      </View>

      {showWarning ? (
        <View testID="voice-draft-warning" accessibilityRole="alert" style={styles.warningBox}>
          <Text style={styles.warningTitle}>Thông tin chưa chắc chắn</Text>
          <Text style={styles.warningBody}>
            {draft.uncertain_fields.length > 0
              ? `Vui lòng kiểm tra lại: ${formatUncertainFields(draft.uncertain_fields)}.`
              : 'Một số thông tin chưa rõ ràng, hãy kiểm tra hoặc sửa thủ công trước khi lưu.'}
          </Text>
        </View>
      ) : null}

      <View style={styles.detailsCard}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Số tiền</Text>
          <Text
            testID="voice-draft-amount"
            style={[styles.amountValue, !canConfirm && draft.amount === null && styles.missingValue]}
          >
            {draft.amount !== null && Number.isSafeInteger(draft.amount) && draft.amount > 0
              ? formatVnd(draft.amount)
              : 'Chưa rõ số tiền'}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Danh mục</Text>
          <Text
            testID="voice-draft-category"
            style={[styles.detailValue, !categoryInfo && styles.missingValue]}
          >
            {categoryInfo ? `${categoryInfo.iconSymbol} ${categoryInfo.name}` : 'Chưa rõ danh mục'}
          </Text>
        </View>

        {draft.merchant?.trim() ? (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Địa điểm</Text>
            <Text testID="voice-draft-merchant" style={styles.detailValue}>
              {draft.merchant.trim()}
            </Text>
          </View>
        ) : null}

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Ghi chú</Text>
          <Text testID="voice-draft-note" style={styles.detailValue}>
            {noteText}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Ngày</Text>
          <Text testID="voice-draft-date" style={styles.detailValue}>
            {draft.occurred_on ? formatVietnameseDate(draft.occurred_on) : 'Hôm nay'}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          testID="voice-draft-confirm-button"
          title="Xác nhận"
          variant="primary"
          disabled={!canConfirm}
          onPress={() => onConfirm(draft)}
        />
        {onEditManual ? (
          <Button
            testID="voice-draft-manual-button"
            title="Sửa thủ công"
            variant="outline"
            onPress={onEditManual}
          />
        ) : null}
        <Button
          testID="voice-draft-cancel-button"
          title="Hủy"
          variant="ghost"
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  transcriptBox: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  transcriptLabel: {
    ...typography.captionBold,
    color: colors.primaryDark,
  },
  transcriptText: {
    ...typography.body,
    color: colors.text,
  },
  warningBox: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  warningTitle: {
    ...typography.captionBold,
    color: colors.text,
  },
  warningBody: {
    ...typography.caption,
    color: colors.text,
  },
  detailsCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailLabel: {
    ...typography.caption,
    color: colors.muted,
  },
  detailValue: {
    ...typography.bodyBold,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
  },
  amountValue: {
    ...typography.subheading,
    color: colors.primaryDark,
    fontVariant: ['tabular-nums'],
  },
  missingValue: {
    color: colors.dangerText,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

export default VoiceDraftReviewSheet;
