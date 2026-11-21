import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { SignInGate } from '../src/components/SignInGate';
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
  return <Slot />;
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
