import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DayTransactionsSheet } from '../src/components/calendar/DayTransactionsSheet';
import { PermissionPromptModal } from '../src/components/capture/PermissionPromptModal';
import { ReceiptCameraShellModal } from '../src/components/capture/ReceiptCameraShellModal';
import { VoiceRecorderShellModal } from '../src/components/capture/VoiceRecorderShellModal';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { CaptureProvider } from '../src/context/CaptureContext';
import { LedgerProvider } from '../src/context/LedgerContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LedgerProvider>
        <CaptureProvider>
          <StatusBar style="dark" />
          <Slot />
          {/* Mount shared modal sheets at root layout so they are accessible from all tabs and routes */}
          <DayTransactionsSheet />
          <ManualEntryModal />
          <PermissionPromptModal />
          <ReceiptCameraShellModal />
          <VoiceRecorderShellModal />
        </CaptureProvider>
      </LedgerProvider>
    </SafeAreaProvider>
  );
}
