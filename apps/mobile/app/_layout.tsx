import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { DayTransactionsSheet } from '../src/components/calendar/DayTransactionsSheet';
import { PermissionPromptModal } from '../src/components/capture/PermissionPromptModal';
import { ReceiptCameraShellModal } from '../src/components/capture/ReceiptCameraShellModal';
import { VoiceRecorderShellModal } from '../src/components/capture/VoiceRecorderShellModal';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { CaptureProvider } from '../src/context/CaptureContext';
import { SignInGate } from '../src/components/SignInGate';
import { LedgerProvider } from '../src/context/LedgerContext';
import { colors, type } from '../src/theme';

function AuthGate() {
  const { status } = useAuth();
  if (status === 'restoring') {
    return (
      <View style={styles.center}>
        <Text accessibilityLiveRegion="polite" style={styles.restoringText}>
          Đang khôi phục phiên đăng nhập…
        </Text>
      </View>
    );
  }
  if (status === 'signed_out') {
    return <SignInGate />;
  }
  return (
    <LedgerProvider>
      <CaptureProvider>
        <Slot />
        {/* Mount shared modal sheets at root layout so they are accessible from all tabs and routes */}
        <DayTransactionsSheet />
        <ManualEntryModal />
        <PermissionPromptModal />
        <ReceiptCameraShellModal />
        <VoiceRecorderShellModal />
      </CaptureProvider>
    </LedgerProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  restoringText: { ...type.body, color: colors.muted },
});
