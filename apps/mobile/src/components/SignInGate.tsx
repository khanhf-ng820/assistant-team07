import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { colors, type } from '../theme';

export function SignInGate() {
  const { signIn, error, canRetryRestore, retryRestore } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError('Vui lòng nhập đầy đủ email và mật khẩu.');
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    try {
      await signIn(trimmedEmail, password);
    } catch {
      // AuthContext populates error banner state.
    } finally {
      setSubmitting(false);
    }
  }

  const displayError = localError ?? error;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.card}>
        <Text style={styles.brand}>CARENTA</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Đăng nhập CARENTA
        </Text>
        <Text style={styles.subtitle}>
          Đăng nhập để đồng bộ ngân sách an toàn với máy chủ.
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="sinhvien@example.edu.vn"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Mật khẩu</Text>
          <TextInput
            accessibilityLabel="Mật khẩu"
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {displayError ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {displayError}
          </Text>
        ) : null}

        {canRetryRestore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thử khôi phục phiên"
            disabled={submitting}
            onPress={() => {
              void retryRestore();
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Thử khôi phục phiên</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đăng nhập"
          accessibilityState={{ disabled: submitting, busy: submitting }}
          disabled={submitting}
          onPress={() => {
            void handleSubmit();
          }}
          style={[styles.button, submitting ? styles.buttonDisabled : null]}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brand: { ...type.heading, color: colors.primary },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.body, color: colors.muted },
  fieldGroup: { gap: 6 },
  label: { ...type.caption, color: colors.text, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    ...type.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  errorText: { ...type.caption, color: colors.danger, fontWeight: '600' },
  retryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  retryButtonText: { ...type.body, color: colors.primary, fontWeight: '600' },
  button: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...type.body, color: colors.surface, fontWeight: '600' },
});
