import { useRouter } from 'expo-router';
import React from 'react';
import { FinancialOnboardingScreen } from '../src/components/onboarding/FinancialOnboardingScreen';

export default function OnboardingRoute() {
  const router = useRouter();

  return (
    <FinancialOnboardingScreen
      onBack={() => router.back()}
      onComplete={() => router.replace('/')}
    />
  );
}
