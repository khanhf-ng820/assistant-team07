import { useMemo } from 'react';
import { PiggyBankScreen } from '../../src/components/PiggyBankScreen';
import { createDemoSnapshot } from '../../src/savings/demoData';
import { todayInVietnam } from '../../src/savings/goal';

export default function SavingsScreen() {
  const today = useMemo(() => todayInVietnam(), []);
  const snapshot = useMemo(() => createDemoSnapshot(today), [today]);
  return <PiggyBankScreen initialSnapshot={snapshot} today={today} isSampleData />;
}
