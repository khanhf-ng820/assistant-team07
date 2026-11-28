import {
  DEFAULT_STUDENT_COMMITMENT_PRESETS,
  STUDENT_GOAL_TITLE_PRESETS,
  addMonthsClamped,
  calculateOnboardingBudgetPreview,
  daysRemainingInMonth,
  validateCommitmentDraft,
  validateOnboardingGoal,
} from '../src/onboarding/financialOnboarding';

describe('Financial Onboarding Calculator & Boundary Safeguards (Slice 1 #54)', () => {
  it('calculates inclusive remaining days in month including last day and leap February', () => {
    expect(daysRemainingInMonth('2026-07-12')).toBe(20);
    expect(daysRemainingInMonth('2026-07-31')).toBe(1);
    expect(daysRemainingInMonth('2028-02-28')).toBe(2);
    expect(daysRemainingInMonth('2028-02-29')).toBe(1);
  });

  it('clamps month additions across end-of-month and leap years', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-11-28', 3)).toBe('2027-02-28');
  });

  it('computes feasible student budget and recommended monthly/daily savings deductions', () => {
    const preview = calculateOnboardingBudgetPreview({
      monthlyAllowanceVnd: 5_250_000,
      commitments: [{ amountVnd: 1_500_000 }],
      goal: {
        title: 'Laptop học tập',
        targetVnd: 2_000_000,
        deadline: '2026-08-11',
        initialSavedVnd: 1_250_000,
      },
      today: '2026-07-12',
    });

    expect(preview.remainingDaysInMonth).toBe(20);
    expect(preview.recommendedDailySavingVnd).toBe(25_000);
    expect(preview.recommendedMonthlyDeductionVnd).toBe(750_000);
    expect(preview.periodSavingsReserveVnd).toBe(500_000);
    expect(preview.protectedVnd).toBe(3_250_000);
    expect(preview.safeToSpendVnd).toBe(2_000_000);
    expect(preview.fundingShortfallVnd).toBe(0);
    expect(preview.dailyAllowanceVnd).toBe(100_000);
    expect(preview.isFeasible).toBe(true);
  });

  it('surfaces funding shortfall explicitly without hiding it behind zero when infeasible', () => {
    const preview = calculateOnboardingBudgetPreview({
      monthlyAllowanceVnd: 2_000_000,
      commitments: [{ amountVnd: 1_800_000 }],
      goal: {
        title: 'Quỹ dự phòng',
        targetVnd: 1_200_000,
        deadline: '2026-08-11',
        initialSavedVnd: 0,
      },
      today: '2026-07-12',
    });

    expect(preview.safeToSpendVnd).toBe(0);
    expect(preview.fundingShortfallVnd).toBe(600_000);
    expect(preview.dailyAllowanceVnd).toBe(0);
    expect(preview.isFeasible).toBe(false);
  });

  it('validates commitment and goal boundaries (0, negative, past deadline, due day bounds)', () => {
    expect(validateCommitmentDraft({ title: 'A', amountText: '500000', dueDay: 5 }).ok).toBe(false);
    expect(validateCommitmentDraft({ title: 'Tiền trọ', amountText: '0', dueDay: 5 }).ok).toBe(false);
    expect(validateCommitmentDraft({ title: 'Tiền trọ', amountText: '500000', dueDay: 32 }).ok).toBe(false);
    expect(validateCommitmentDraft({ title: 'Tiền trọ', amountText: '1.500.000', dueDay: 5 })).toEqual({
      ok: true,
      title: 'Tiền trọ',
      amountVnd: 1_500_000,
      dueDay: 5,
    });

    expect(
      validateOnboardingGoal({
        title: 'Quỹ dự phòng',
        targetText: '0',
        savedText: '0',
        deadline: '2026-08-11',
        today: '2026-07-12',
      }).ok
    ).toBe(false);

    expect(
      validateOnboardingGoal({
        title: 'Quỹ dự phòng',
        targetText: '2.000.000',
        savedText: '0',
        deadline: '2026-07-11',
        today: '2026-07-12',
      }).ok
    ).toBe(false);

    expect(
      validateOnboardingGoal({
        title: 'Quỹ dự phòng',
        targetText: '2.000.000',
        savedText: '500.000',
        deadline: '2026-08-11',
        today: '2026-07-12',
      })
    ).toEqual({
      ok: true,
      goal: {
        title: 'Quỹ dự phòng',
        targetVnd: 2_000_000,
        deadline: '2026-08-11',
        initialSavedVnd: 500_000,
      },
    });
  });

  it('contains zero food, pantry, recipe, or dietary presets', () => {
    const allLabels = [
      ...DEFAULT_STUDENT_COMMITMENT_PRESETS.map((p) => p.title),
      ...STUDENT_GOAL_TITLE_PRESETS,
    ].join(' ');
    expect(allLabels).not.toMatch(/pantry|recipe|dietary|thực đơn|tủ lạnh|ăn kiêng|nấu ăn/i);
  });
});
