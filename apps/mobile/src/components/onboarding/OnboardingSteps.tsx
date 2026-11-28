import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CommitmentItem,
  DEFAULT_STUDENT_COMMITMENT_PRESETS,
  OnboardingBudgetPreview,
  STUDENT_ALLOWANCE_PRESETS,
  STUDENT_GOAL_TITLE_PRESETS,
  addMonthsClamped,
} from '../../onboarding/financialOnboarding';
import { formatVnd } from '../../savings/goal';
import { colors, radius, spacing, typography } from '../../theme';
import { formatVietnameseDate } from '../../types/transaction';
import { Button } from '../Button';
import { Card } from '../Card';

interface AllowanceStepProps {
  allowanceText: string;
  onChangeAllowance: (text: string) => void;
  errorMessage: string | null;
}

export function AllowanceStep({
  allowanceText,
  onChangeAllowance,
  errorMessage,
}: AllowanceStepProps) {
  return (
    <Card testID="onboarding-step-allowance" variant="elevated" padding="xl" style={styles.card}>
      <Text accessibilityRole="header" style={styles.stepTitle}>
        Ngân sách thực tế tháng này
      </Text>
      <Text style={styles.stepSubtitle}>
        Nhập số tiền hiện có hoặc trợ cấp đã nhận (không tính thu nhập dự kiến chưa về ví).
      </Text>

      <Text style={styles.inputLabel}>Tổng tiền hiện có / trợ cấp tháng (₫)</Text>
      <TextInput
        testID="onboarding-allowance-input"
        accessibilityLabel="Tổng tiền hiện có hoặc trợ cấp tháng"
        keyboardType="number-pad"
        value={allowanceText}
        onChangeText={onChangeAllowance}
        placeholder="Ví dụ: 4500000"
        placeholderTextColor={colors.muted}
        style={styles.textInput}
      />

      <Text style={styles.presetHeading}>Chọn nhanh mức phổ biến</Text>
      <View style={styles.chipWrap}>
        {STUDENT_ALLOWANCE_PRESETS.map((amount) => (
          <Pressable
            key={amount}
            testID={`allowance-preset-${amount}`}
            accessibilityRole="button"
            accessibilityLabel={`Chọn nhanh ${formatVnd(amount)}`}
            onPress={() => onChangeAllowance(String(amount))}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <Text style={styles.chipText}>{formatVnd(amount)}</Text>
          </Pressable>
        ))}
      </View>

      {errorMessage ? (
        <View
          testID="onboarding-allowance-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[styles.banner, styles.dangerBanner]}
        >
          <Text style={styles.bannerText}>{errorMessage}</Text>
        </View>
      ) : null}
    </Card>
  );
}

interface CommitmentsStepProps {
  allowanceVnd: number;
  commitments: CommitmentItem[];
  titleText: string;
  amountText: string;
  dueDayText: string;
  errorMessage: string | null;
  onChangeTitle: (text: string) => void;
  onChangeAmount: (text: string) => void;
  onChangeDueDay: (text: string) => void;
  onAddPreset: (preset: { title: string; amountVnd: number; dueDay: number }) => void;
  onAddCommitment: () => void;
  onRemoveCommitment: (id: string) => void;
}

export function CommitmentsStep({
  allowanceVnd,
  commitments,
  titleText,
  amountText,
  dueDayText,
  errorMessage,
  onChangeTitle,
  onChangeAmount,
  onChangeDueDay,
  onAddPreset,
  onAddCommitment,
  onRemoveCommitment,
}: CommitmentsStepProps) {
  const totalCommitmentsVnd = commitments.reduce((sum, item) => sum + item.amountVnd, 0);
  const exceedsAllowance = totalCommitmentsVnd > allowanceVnd;

  return (
    <Card testID="onboarding-step-commitments" variant="elevated" padding="xl" style={styles.card}>
      <Text accessibilityRole="header" style={styles.stepTitle}>
        Khoản chi cố định hằng tháng
      </Text>
      <Text style={styles.stepSubtitle}>
        Giữ riêng tiền trọ, điện nước, học phí để không tiêu lẹm vào các hóa đơn sắp tới.
      </Text>

      <Text style={styles.presetHeading}>Thêm nhanh khoản chi sinh viên</Text>
      <View style={styles.chipWrap}>
        {DEFAULT_STUDENT_COMMITMENT_PRESETS.map((preset) => (
          <Pressable
            key={preset.title}
            testID={`commitment-preset-${preset.title}`}
            accessibilityRole="button"
            accessibilityLabel={`Thêm ${preset.title} ${formatVnd(preset.amountVnd)}`}
            onPress={() => onAddPreset(preset)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <Text style={styles.chipText}>
              + {preset.title} ({formatVnd(preset.amountVnd)})
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.formBox}>
        <Text style={styles.inputLabel}>Tên khoản cố định</Text>
        <TextInput
          testID="onboarding-commitment-title-input"
          accessibilityLabel="Tên khoản chi cố định"
          value={titleText}
          onChangeText={onChangeTitle}
          placeholder="Ví dụ: Tiền trọ"
          placeholderTextColor={colors.muted}
          style={styles.textInput}
        />

        <View style={styles.splitRow}>
          <View style={styles.splitMain}>
            <Text style={styles.inputLabel}>Số tiền (₫)</Text>
            <TextInput
              testID="onboarding-commitment-amount-input"
              accessibilityLabel="Số tiền khoản cố định"
              keyboardType="number-pad"
              value={amountText}
              onChangeText={onChangeAmount}
              placeholder="1500000"
              placeholderTextColor={colors.muted}
              style={styles.textInput}
            />
          </View>
          <View style={styles.splitSide}>
            <Text style={styles.inputLabel}>Ngày đến hạn</Text>
            <TextInput
              testID="onboarding-commitment-dueday-input"
              accessibilityLabel="Ngày đến hạn trong tháng"
              keyboardType="number-pad"
              value={dueDayText}
              onChangeText={onChangeDueDay}
              placeholder="5"
              placeholderTextColor={colors.muted}
              maxLength={2}
              style={styles.textInput}
            />
          </View>
        </View>

        <Button
          testID="onboarding-add-commitment-button"
          title="Thêm khoản cố định"
          variant="outline"
          size="md"
          onPress={onAddCommitment}
        />
      </View>

      {errorMessage ? (
        <View
          testID="onboarding-commitment-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[styles.banner, styles.dangerBanner]}
        >
          <Text style={styles.bannerText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Tổng khoản cố định đã giữ:</Text>
        <Text testID="onboarding-commitments-total" style={styles.summaryValue}>
          {formatVnd(totalCommitmentsVnd)}
        </Text>
      </View>

      {exceedsAllowance ? (
        <View
          testID="onboarding-commitments-shortfall-banner"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.banner, styles.warningBanner]}
        >
          <Text style={styles.bannerText}>
            Tổng khoản cố định đang vượt quá ngân sách tháng hiện có (thiếu{' '}
            {formatVnd(totalCommitmentsVnd - allowanceVnd)}).
          </Text>
        </View>
      ) : null}

      {commitments.length === 0 ? (
        <Text style={styles.emptyHint}>
          Chưa có khoản cố định nào. Bạn có thể thêm ở trên hoặc chuyển sang bước đặt mục tiêu.
        </Text>
      ) : (
        <View style={styles.list}>
          {commitments.map((item) => (
            <View key={item.id} style={styles.listRow}>
              <View style={styles.listInfo}>
                <Text style={styles.listTitle}>{item.title}</Text>
                <Text style={styles.listSub}>
                  {formatVnd(item.amountVnd)} · Ngày {item.dueDay} hằng tháng
                </Text>
              </View>
              <Pressable
                testID={`onboarding-remove-commitment-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Xóa ${item.title}`}
                onPress={() => onRemoveCommitment(item.id)}
                style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
              >
                <Text style={styles.removeButtonText}>Xóa</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

interface GoalSetupStepProps {
  today: string;
  goalTitle: string;
  targetText: string;
  savedText: string;
  deadline: string;
  preview: OnboardingBudgetPreview | null;
  errorMessage: string | null;
  onChangeTitle: (text: string) => void;
  onChangeTarget: (text: string) => void;
  onChangeSaved: (text: string) => void;
  onChangeDeadline: (date: string) => void;
  onOpenDeadlinePicker: () => void;
}

export function GoalSetupStep({
  today,
  goalTitle,
  targetText,
  savedText,
  deadline,
  preview,
  errorMessage,
  onChangeTitle,
  onChangeTarget,
  onChangeSaved,
  onChangeDeadline,
  onOpenDeadlinePicker,
}: GoalSetupStepProps) {
  return (
    <Card testID="onboarding-step-goal" variant="elevated" padding="xl" style={styles.card}>
      <View style={styles.goalHeaderRow}>
        <View style={styles.goalBadge}>
          <Text style={styles.goalBadgeText}>Đặt Goal</Text>
        </View>
        <Text style={styles.stepMeta}>Mục tiêu tiết kiệm</Text>
      </View>

      <Text accessibilityRole="header" style={styles.stepTitle}>
        Thiết lập mục tiêu tiết kiệm
      </Text>
      <Text style={styles.stepSubtitle}>
        CARENTA tự động tính mức trích mỗi tháng để đạt mục tiêu đúng hạn.
      </Text>

      <Text style={styles.inputLabel}>Tên mục tiêu</Text>
      <TextInput
        testID="onboarding-goal-title-input"
        accessibilityLabel="Tên mục tiêu tiết kiệm"
        value={goalTitle}
        onChangeText={onChangeTitle}
        placeholder="Ví dụ: Laptop học tập"
        placeholderTextColor={colors.muted}
        style={styles.textInput}
      />

      <View style={styles.chipWrap}>
        {STUDENT_GOAL_TITLE_PRESETS.map((preset) => (
          <Pressable
            key={preset}
            testID={`goal-title-preset-${preset}`}
            accessibilityRole="button"
            accessibilityLabel={`Chọn mục tiêu ${preset}`}
            onPress={() => onChangeTitle(preset)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <Text style={styles.chipText}>{preset}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.inputLabel}>Số tiền mục tiêu (₫)</Text>
      <TextInput
        testID="onboarding-goal-target-input"
        accessibilityLabel="Số tiền mục tiêu"
        keyboardType="number-pad"
        value={targetText}
        onChangeText={onChangeTarget}
        placeholder="2000000"
        placeholderTextColor={colors.muted}
        style={styles.textInput}
      />

      <Text style={styles.inputLabel}>Đã tiết kiệm sẵn trong mục tiêu (₫, tùy chọn)</Text>
      <TextInput
        testID="onboarding-goal-saved-input"
        accessibilityLabel="Số tiền đã tiết kiệm sẵn"
        keyboardType="number-pad"
        value={savedText}
        onChangeText={onChangeSaved}
        placeholder="0"
        placeholderTextColor={colors.muted}
        style={styles.textInput}
      />

      <Text style={styles.inputLabel}>Hạn hoàn thành</Text>
      <View style={styles.deadlineRow}>
        <View style={styles.deadlineDisplay}>
          <Text testID="onboarding-goal-deadline-text" style={styles.deadlineValue}>
            {formatVietnameseDate(deadline)} ({deadline})
          </Text>
        </View>
        <Button
          testID="onboarding-open-deadline-picker"
          title="Chọn trên lịch"
          variant="outline"
          size="md"
          onPress={onOpenDeadlinePicker}
        />
      </View>

      <View style={styles.chipWrap}>
        {[1, 3, 6, 12].map((months) => {
          const nextDeadline = addMonthsClamped(today, months);
          return (
            <Pressable
              key={months}
              testID={`deadline-preset-${months}m`}
              accessibilityRole="button"
              accessibilityLabel={`Chọn hạn ${months} tháng tới`}
              onPress={() => onChangeDeadline(nextDeadline)}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            >
              <Text style={styles.chipText}>+{months} tháng</Text>
            </Pressable>
          );
        })}
      </View>

      {errorMessage ? (
        <View
          testID="onboarding-goal-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[styles.banner, styles.dangerBanner]}
        >
          <Text style={styles.bannerText}>{errorMessage}</Text>
        </View>
      ) : null}

      {preview ? (
        <View testID="onboarding-goal-preview-card" style={styles.previewBox}>
          <Text style={styles.previewTitle}>Mức trích tiết kiệm đề xuất</Text>
          <Text testID="onboarding-monthly-deduction" style={styles.previewHero}>
            {formatVnd(preview.recommendedMonthlyDeductionVnd)} / tháng (30 ngày)
          </Text>
          <Text testID="onboarding-daily-deduction" style={styles.previewSub}>
            Tương đương {formatVnd(preview.recommendedDailySavingVnd)} / ngày · Còn{' '}
            {preview.goalRecommendation.savingDays} ngày
          </Text>

          <View style={styles.previewDivider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Có thể chi đến cuối tháng:</Text>
            <Text testID="onboarding-safe-to-spend" style={styles.summaryValue}>
              {formatVnd(preview.safeToSpendVnd)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Hạn mức chi mỗi ngày:</Text>
            <Text testID="onboarding-daily-allowance" style={styles.summaryValue}>
              {formatVnd(preview.dailyAllowanceVnd)}
            </Text>
          </View>

          {!preview.isFeasible ? (
            <View
              testID="onboarding-shortfall-banner"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[styles.banner, styles.warningBanner]}
            >
              <Text style={styles.bannerText}>
                Ngân sách tháng hiện thiếu {formatVnd(preview.fundingShortfallVnd)} để giữ đủ khoản
                cố định và mục tiêu này. Bạn có thể kéo dài hạn hoặc giảm bớt mục tiêu.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalBadge: {
    backgroundColor: colors.savingsTint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  goalBadgeText: {
    ...typography.captionBold,
    color: colors.text,
  },
  stepMeta: {
    ...typography.caption,
    color: colors.muted,
  },
  stepTitle: {
    ...typography.title,
    color: colors.text,
  },
  stepSubtitle: {
    ...typography.body,
    color: colors.muted,
  },
  inputLabel: {
    ...typography.captionBold,
    color: colors.muted,
  },
  textInput: {
    ...typography.bodyBold,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceCard,
    color: colors.text,
  },
  presetHeading: {
    ...typography.captionBold,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
  },
  chipText: {
    ...typography.captionBold,
    color: colors.text,
  },
  formBox: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  splitRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  splitMain: {
    flex: 2,
    gap: spacing.xs,
  },
  splitSide: {
    flex: 1,
    gap: spacing.xs,
  },
  banner: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  dangerBanner: {
    backgroundColor: colors.dangerSoft,
  },
  warningBanner: {
    backgroundColor: colors.warningSoft,
  },
  bannerText: {
    ...typography.captionBold,
    color: colors.text,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryLabel: {
    ...typography.body,
    color: colors.muted,
    flex: 1,
  },
  summaryValue: {
    ...typography.bodyBold,
    color: colors.text,
  },
  emptyHint: {
    ...typography.caption,
    color: colors.muted,
  },
  list: {
    gap: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCard,
  },
  listInfo: {
    flex: 1,
    gap: 2,
  },
  listTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  listSub: {
    ...typography.caption,
    color: colors.muted,
  },
  removeButton: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    ...typography.captionBold,
    color: colors.text,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deadlineDisplay: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  deadlineValue: {
    ...typography.captionBold,
    color: colors.text,
  },
  previewBox: {
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  previewTitle: {
    ...typography.captionBold,
    color: colors.primaryDark,
  },
  previewHero: {
    ...typography.heading,
    color: colors.text,
  },
  previewSub: {
    ...typography.caption,
    color: colors.muted,
  },
  previewDivider: {
    height: 1,
    backgroundColor: colors.primaryLight,
    marginVertical: spacing.xs,
  },
  pressed: {
    opacity: 0.85,
  },
});
