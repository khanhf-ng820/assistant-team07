import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DayTransactionsSheet } from '../src/components/calendar/DayTransactionsSheet';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { LedgerProvider } from '../src/context/LedgerContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LedgerProvider>
        <StatusBar style="dark" />
        <Slot />
        {/* Mount shared modal sheets at root layout so they are accessible from all tabs and routes */}
        <DayTransactionsSheet />
        <ManualEntryModal />
      </LedgerProvider>
    </SafeAreaProvider>
  );
}
