import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LedgerProvider } from '../src/context/LedgerContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LedgerProvider>
        <StatusBar style="dark" />
        <Slot />
      </LedgerProvider>
    </SafeAreaProvider>
  );
}
