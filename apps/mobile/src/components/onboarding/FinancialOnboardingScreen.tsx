import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLedger } from '../../context/LedgerContext';
import {
  CommitmentItem,
  OnboardingProfile,
  addMonthsClamped,
  calculateOnboardingBudgetPreview,
  validateCommitmentDraft,
  validateOnboardingGoal,
} from '../../onboarding/financialOnboarding';
import { parseVnd, todayInVietnam } from '../../savings/goal';
import { colors, radius, spacing } from '../../theme';
import { Button } from '../Button';
import { Header } from '../Header';
import { GoalDeadlinePickerModal } from './GoalDeadlinePickerModal';
import { AllowanceStep, CommitmentsStep, GoalSetupStep } from './OnboardingSteps';

export interface FinancialOnboardingScreenProps {
  today?: string;
  onComplete?: (profile: OnboardingProfile) => void;
  onBack?: () => void;
}

type OnboardingStep = 1 | 2 | 3;

const STEP_SUBTITLES: Record<OnboardingStep, string> = {
  1: 'Bước 1/3 — Thu nhập & trợ cấp tháng',
  2: 'Bước 2/3 — Khoản chi cố định',
  3: 'Bước 3/3 — Đặt Goal tiết kiệm',
};

export function FinancialOnboardingScreen({
  today,
  onComplete,
  onBack,
}: FinancialOnboardingScreenProps) {
  const { applyOnboardingProfile, onboardingProfile } = useLedger();
  const activeToday = useMemo(() => today ?? todayInVietnam(), [today]);

  const [step, setStep] = useState<OnboardingStep>(1);

  // Step 1: Monthly allowance / current funds
  const [allowanceText, setAllowanceText] = useState<string>(
    onboardingProfile ? String(onboardingProfile.monthlyAllowanceVnd) : '4500000'
  );
  const [allowanceError, setAllowanceError] = useState<string | null>(null);

  // Step 2: Recurring fixed commitments
  const [commitments, setCommitments] = useState<CommitmentItem[]>(
    onboardingProfile?.commitments ?? []
  );
  const [commitTitle, setCommitTitle] = useState<string>('');
  const [commitAmountText, setCommitAmountText] = useState<string>('');
  const [commitDueDayText, setCommitDueDayText] = useState<string>('5');
  const [commitError, setCommitError] = useState<string | null>(null);

  // Step 3: Savings goal ("Đặt Goal")
  const [goalTitle, setGoalTitle] = useState<string>(
    onboardingProfile?.goal.title ?? 'Quỹ dự phòng sinh viên'
  );
  const [goalTargetText, setGoalTargetText] = useState<string>(
    onboardingProfile ? String(onboardingProfile.goal.targetVnd) : '2000000'
  );
  const [goalSavedText, setGoalSavedText] = useState<string>(
    onboardingProfile ? String(onboardingProfile.goal.initialSavedVnd) : '0'
  );
  const [goalDeadline, setGoalDeadline] = useState<string>(
    onboardingProfile?.goal.deadline ?? addMonthsClamped(activeToday, 3)
  );
  const [goalError, setGoalError] = useState<string | null>(null);
  const [isDeadlinePickerOpen, setIsDeadlinePickerOpen] = useState<boolean>(false);

  const parsedAllowanceVnd = parseVnd(allowanceText) ?? 0;

  const validatedGoalPreview = useMemo(() => {
    const goalCheck = validateOnboardingGoal({
      title: goalTitle,
      targetText: goalTargetText,
      savedText: goalSavedText,
      deadline: goalDeadline,
      today: activeToday,
    });
    if (!goalCheck.ok || parsedAllowanceVnd <= 0) return null;

    return calculateOnboardingBudgetPreview({
      monthlyAllowanceVnd: parsedAllowanceVnd,
      commitments,
      goal: goalCheck.goal,
      today: activeToday,
    });
  }, [
    goalTitle,
    goalTargetText,
    goalSavedText,
    goalDeadline,
    activeToday,
    parsedAllowanceVnd,
    commitments,
  ]);

  const handleHeaderBack = () => {
    if (step > 1) {
      setStep((prev) => (prev === 3 ? 2 : 1));
      return;
    }
    onBack?.();
  };

  const handleNext = () => {
    if (step === 1) {
      const validAllowance = parseVnd(allowanceText);
      if (validAllowance === null) {
        setAllowanceError('Vui lòng nhập ngân sách tháng lớn hơn 0 VND.');
        return;
      }
      setAllowanceError(null);
      setStep(2);
      return;
    }

    if (step === 2) {
      setCommitError(null);
      setStep(3);
    }
  };

  const handleAddPresetCommitment = (preset: {
    title: string;
    amountVnd: number;
    dueDay: number;
  }) => {
    setCommitError(null);
    setCommitments((prev) => [
      ...prev,
      {
        id: `commit-${Date.now()}-${prev.length + 1}`,
        title: preset.title,
        amountVnd: preset.amountVnd,
        dueDay: preset.dueDay,
      },
    ]);
  };

  const handleAddCustomCommitment = () => {
    const dueDayNum = parseInt(commitDueDayText.trim() || '0', 10);
    const result = validateCommitmentDraft({
      title: commitTitle,
      amountText: commitAmountText,
      dueDay: dueDayNum,
    });
    if (!result.ok) {
      setCommitError(result.error);
      return;
    }

    setCommitError(null);
    setCommitments((prev) => [
      ...prev,
      {
        id: `commit-${Date.now()}-${prev.length + 1}`,
        title: result.title,
        amountVnd: result.amountVnd,
        dueDay: result.dueDay,
      },
    ]);
    setCommitTitle('');
    setCommitAmountText('');
  };

  const handleRemoveCommitment = (id: string) => {
    setCommitments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleFinish = () => {
    const validAllowance = parseVnd(allowanceText);
    if (validAllowance === null) {
      setStep(1);
      setAllowanceError('Vui lòng nhập ngân sách tháng lớn hơn 0 VND.');
      return;
    }

    const goalCheck = validateOnboardingGoal({
      title: goalTitle,
      targetText: goalTargetText,
      savedText: goalSavedText,
      deadline: goalDeadline,
      today: activeToday,
    });
    if (!goalCheck.ok) {
      setGoalError(goalCheck.error);
      return;
    }

    setGoalError(null);
    const profile: OnboardingProfile = {
      monthlyAllowanceVnd: validAllowance,
      commitments,
      goal: goalCheck.goal,
      completedAt: new Date().toISOString(),
    };
    applyOnboardingProfile(profile, activeToday);
    onComplete?.(profile);
  };

  const progressWidthPercent = `${Math.round((step / 3) * 100)}%` as `${number}%`;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <Header
        testID="onboarding-header"
        title="Thiết lập tài chính"
        subtitle={STEP_SUBTITLES[step]}
        onBack={step > 1 || onBack ? handleHeaderBack : undefined}
        backAccessibilityLabel={step > 1 ? 'Quay lại bước trước' : 'Quay lại'}
      />

      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Tiến độ thiết lập tài chính"
        accessibilityValue={{ min: 1, max: 3, now: step }}
        style={styles.progressTrack}
      >
        <View style={[styles.progressFill, { width: progressWidthPercent }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 ? (
          <AllowanceStep
            allowanceText={allowanceText}
            onChangeAllowance={(text) => {
              setAllowanceError(null);
              setAllowanceText(text);
            }}
            errorMessage={allowanceError}
          />
        ) : null}

        {step === 2 ? (
          <CommitmentsStep
            allowanceVnd={parsedAllowanceVnd}
            commitments={commitments}
            titleText={commitTitle}
            amountText={commitAmountText}
            dueDayText={commitDueDayText}
            errorMessage={commitError}
            onChangeTitle={(text) => {
              setCommitError(null);
              setCommitTitle(text);
            }}
            onChangeAmount={(text) => {
              setCommitError(null);
              setCommitAmountText(text);
            }}
            onChangeDueDay={(text) => {
              setCommitError(null);
              setCommitDueDayText(text);
            }}
            onAddPreset={handleAddPresetCommitment}
            onAddCommitment={handleAddCustomCommitment}
            onRemoveCommitment={handleRemoveCommitment}
          />
        ) : null}

        {step === 3 ? (
          <GoalSetupStep
            today={activeToday}
            goalTitle={goalTitle}
            targetText={goalTargetText}
            savedText={goalSavedText}
            deadline={goalDeadline}
            preview={validatedGoalPreview}
            errorMessage={goalError}
            onChangeTitle={(text) => {
              setGoalError(null);
              setGoalTitle(text);
            }}
            onChangeTarget={(text) => {
              setGoalError(null);
              setGoalTargetText(text);
            }}
            onChangeSaved={(text) => {
              setGoalError(null);
              setGoalSavedText(text);
            }}
            onChangeDeadline={(date) => {
              setGoalError(null);
              setGoalDeadline(date);
            }}
            onOpenDeadlinePicker={() => setIsDeadlinePickerOpen(true)}
          />
        ) : null}

        <View style={styles.footerActions}>
          {step > 1 ? (
            <Button
              testID="onboarding-prev-step-button"
              title="Quay lại"
              variant="outline"
              size="lg"
              onPress={handleHeaderBack}
              style={styles.footerButton}
            />
          ) : null}
          {step < 3 ? (
            <Button
              testID="onboarding-next-step-button"
              title="Tiếp tục"
              variant="primary"
              size="lg"
              onPress={handleNext}
              style={styles.footerButton}
            />
          ) : (
            <Button
              testID="onboarding-finish-button"
              title="Hoàn tất thiết lập"
              variant="primary"
              size="lg"
              onPress={handleFinish}
              style={styles.footerButton}
            />
          )}
        </View>
      </ScrollView>

      <GoalDeadlinePickerModal
        visible={isDeadlinePickerOpen}
        selectedDate={goalDeadline}
        today={activeToday}
        onCancel={() => setIsDeadlinePickerOpen(false)}
        onConfirm={(pickedDate) => {
          setGoalError(null);
          setGoalDeadline(pickedDate);
          setIsDeadlinePickerOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  progressTrack: {
    height: 4,
    marginHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  footerButton: {
    flex: 1,
  },
});

export default FinancialOnboardingScreen;
