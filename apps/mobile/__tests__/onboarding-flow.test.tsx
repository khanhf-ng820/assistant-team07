import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text, View } from 'react-native';
import { FinancialOnboardingScreen } from '../src/components/onboarding/FinancialOnboardingScreen';
import { LedgerProvider, useLedger } from '../src/context/LedgerContext';
import { OnboardingProfile } from '../src/onboarding/financialOnboarding';

function OnboardingHarness({
  today,
  onComplete,
}: {
  today: string;
  onComplete: (profile: OnboardingProfile) => void;
}) {
  const { availableBalance, dailyBudgetLimit, onboardingProfile } = useLedger();

  return (
    <View>
      <Text testID="ledger-balance">{String(availableBalance)}</Text>
      <Text testID="ledger-daily-limit">{String(dailyBudgetLimit)}</Text>
      <Text testID="ledger-goal-title">{onboardingProfile?.goal.title ?? 'none'}</Text>
      <FinancialOnboardingScreen today={today} onComplete={onComplete} />
    </View>
  );
}

describe('FinancialOnboardingScreen Flow (Slice 4 #54)', () => {
  it('completes 3-step onboarding, preserves deadline on cancel, applies picked date, and syncs LedgerContext', async () => {
    const onComplete = jest.fn();

    await render(
      <LedgerProvider>
        <OnboardingHarness today="2026-07-12" onComplete={onComplete} />
      </LedgerProvider>
    );

    // Step 1: Allowance + boundary guard + zero food/pantry/recipe copy
    expect(screen.getByTestId('onboarding-step-allowance')).toBeVisible();
    expect(screen.queryByText(/pantry|recipe|dietary|thực đơn|tủ lạnh|ăn kiêng/i)).toBeNull();

    await fireEvent.changeText(screen.getByTestId('onboarding-allowance-input'), '0');
    await fireEvent.press(screen.getByTestId('onboarding-next-step-button'));
    expect(screen.getByTestId('onboarding-allowance-error')).toBeVisible();

    await fireEvent.changeText(screen.getByTestId('onboarding-allowance-input'), '4.500.000');
    await fireEvent.press(screen.getByTestId('onboarding-next-step-button'));

    // Step 2: Commitments + validation + add & remove
    expect(screen.getByTestId('onboarding-step-commitments')).toBeVisible();
    expect(screen.queryByText(/pantry|recipe|dietary|thực đơn|tủ lạnh|ăn kiêng/i)).toBeNull();

    await fireEvent.press(screen.getByTestId('onboarding-add-commitment-button'));
    expect(screen.getByTestId('onboarding-commitment-error')).toBeVisible();

    await fireEvent.press(screen.getByTestId('commitment-preset-Tiền trọ'));
    expect(screen.getByTestId('onboarding-commitments-total')).toHaveTextContent('1.500.000 ₫');

    await fireEvent.changeText(screen.getByTestId('onboarding-commitment-title-input'), 'Internet');
    await fireEvent.changeText(screen.getByTestId('onboarding-commitment-amount-input'), '200000');
    await fireEvent.press(screen.getByTestId('onboarding-add-commitment-button'));
    expect(screen.getByTestId('onboarding-commitments-total')).toHaveTextContent('1.700.000 ₫');

    // Remove the newly added Internet item
    const removeButtons = screen.getAllByRole('button', { name: /^Xóa / });
    await fireEvent.press(removeButtons[1]);
    expect(screen.getByTestId('onboarding-commitments-total')).toHaveTextContent('1.500.000 ₫');

    await fireEvent.press(screen.getByTestId('onboarding-next-step-button'));

    // Step 3: Goal setup ("Đặt Goal") + GoalDeadlinePickerModal cancel vs confirm
    expect(screen.getByTestId('onboarding-step-goal')).toBeVisible();
    expect(screen.queryByText(/pantry|recipe|dietary|thực đơn|tủ lạnh|ăn kiêng/i)).toBeNull();

    await fireEvent.changeText(screen.getByTestId('onboarding-goal-title-input'), 'Laptop học tập');
    await fireEvent.changeText(screen.getByTestId('onboarding-goal-target-input'), '2000000');
    await fireEvent.changeText(screen.getByTestId('onboarding-goal-saved-input'), '1250000');

    // Default deadline from 2026-07-12 + 3 months = 2026-10-12
    expect(screen.getByTestId('onboarding-goal-deadline-text')).toHaveTextContent(/2026-10-12/);

    // Open calendar picker, move back to August 2026, select 2026-08-11, then Cancel -> restores 2026-10-12
    await fireEvent.press(screen.getByTestId('onboarding-open-deadline-picker'));
    expect(screen.getByTestId('goal-deadline-picker-modal')).toBeVisible();
    await fireEvent.press(screen.getByTestId('deadline-picker-prev-month'));
    await fireEvent.press(screen.getByTestId('deadline-picker-prev-month'));
    await fireEvent.press(screen.getByTestId('deadline-day-2026-08-11'));
    await fireEvent.press(screen.getByTestId('deadline-picker-cancel'));
    expect(screen.getByTestId('onboarding-goal-deadline-text')).toHaveTextContent(/2026-10-12/);

    // Open again, pick 2026-08-11, and Confirm -> 30 saving days -> 750.000 ₫ / tháng
    await fireEvent.press(screen.getByTestId('onboarding-open-deadline-picker'));
    await fireEvent.press(screen.getByTestId('deadline-picker-prev-month'));
    await fireEvent.press(screen.getByTestId('deadline-picker-prev-month'));
    await fireEvent.press(screen.getByTestId('deadline-day-2026-08-11'));
    await fireEvent.press(screen.getByTestId('deadline-picker-confirm'));

    expect(screen.getByTestId('onboarding-goal-deadline-text')).toHaveTextContent(/2026-08-11/);
    expect(screen.getByTestId('onboarding-monthly-deduction')).toHaveTextContent(
      '750.000 ₫ / tháng (30 ngày)'
    );
    expect(screen.getByTestId('onboarding-daily-deduction')).toHaveTextContent(
      /25\.000 ₫ \/ ngày/
    );

    await fireEvent.press(screen.getByTestId('onboarding-finish-button'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const savedProfile = onComplete.mock.calls[0][0] as OnboardingProfile;
    expect(savedProfile.monthlyAllowanceVnd).toBe(4_500_000);
    expect(savedProfile.commitments).toHaveLength(1);
    expect(savedProfile.goal).toEqual({
      title: 'Laptop học tập',
      targetVnd: 2_000_000,
      deadline: '2026-08-11',
      initialSavedVnd: 1_250_000,
    });
    expect(screen.getByTestId('ledger-balance')).toHaveTextContent('4500000');
    expect(screen.getByTestId('ledger-goal-title')).toHaveTextContent('Laptop học tập');
  });

  it('surfaces explicit shortfall banner and preserves 0 VND daily allowance when finished', async () => {
    const onComplete = jest.fn();

    await render(
      <LedgerProvider>
        <OnboardingHarness today="2026-07-12" onComplete={onComplete} />
      </LedgerProvider>
    );

    await fireEvent.press(screen.getByTestId('allowance-preset-2000000'));
    await fireEvent.press(screen.getByTestId('onboarding-next-step-button'));

    await fireEvent.press(screen.getByTestId('commitment-preset-Tiền trọ'));
    await fireEvent.press(screen.getByTestId('commitment-preset-Học phí / Tài liệu'));
    await fireEvent.press(screen.getByTestId('onboarding-next-step-button'));

    await fireEvent.press(screen.getByTestId('deadline-preset-1m'));
    expect(screen.getByTestId('onboarding-shortfall-banner')).toBeVisible();
    expect(screen.getByTestId('onboarding-daily-allowance')).toHaveTextContent('0 ₫');

    await fireEvent.press(screen.getByTestId('onboarding-finish-button'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ledger-daily-limit')).toHaveTextContent('0');
    expect(screen.getByTestId('ledger-balance')).toHaveTextContent('2000000');
  });
});
