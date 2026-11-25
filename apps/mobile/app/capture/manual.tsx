import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLedger } from '../../src/context/LedgerContext';

/**
 * Entry route for `carenta://capture/manual` (issue #53).
 *
 * Opens the root-mounted ManualEntryModal (from issue #45) and transitions
 * underneath to the home tab so closing or saving restores the dashboard cleanly.
 */
export default function CaptureManualRoute() {
  const router = useRouter();
  const { openManualEntry, closeDaySheet } = useLedger();
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    closeDaySheet();
    openManualEntry();
    router.replace('/');
  }, [closeDaySheet, openManualEntry, router]);

  return <View testID="capture-manual-redirect" />;
}
