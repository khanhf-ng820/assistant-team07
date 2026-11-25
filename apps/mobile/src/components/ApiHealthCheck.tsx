import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HealthResponse } from '../api/contracts';
import { useOptionalAuth } from '../auth/AuthContext';
import { colors, type } from '../theme';

type ConnectionState = 'idle' | 'checking' | 'connected' | 'error';

const messages: Record<ConnectionState, string> = {
  idle: 'Chưa kiểm tra kết nối',
  checking: 'Đang kiểm tra…',
  connected: 'API đã kết nối',
  error: 'Không kết nối được API',
};

export interface ApiHealthCheckProps {
  readonly checkHealth?: (signal?: AbortSignal) => Promise<HealthResponse>;
}

export function ApiHealthCheck({ checkHealth }: ApiHealthCheckProps = {}) {
  const auth = useOptionalAuth();
  const [state, setState] = useState<ConnectionState>('idle');
  const pending = useRef<AbortController | null>(null);

  const runHealthProbe =
    checkHealth ??
    (auth?.isApiConfigured
      ? (signal?: AbortSignal) => auth.apiClient.checkHealth({ signal })
      : undefined);
  const isConfigured = Boolean(runHealthProbe);

  useEffect(() => () => {
    pending.current?.abort();
    pending.current = null;
  }, []);

  async function runCheck() {
    if (!runHealthProbe || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setState('checking');
    try {
      await runHealthProbe(controller.signal);
      if (pending.current === controller) setState('connected');
    } catch {
      if (pending.current === controller) setState('error');
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  const disabled = !isConfigured || state === 'checking';
  return (
    <View style={styles.panel}>
      <Text accessibilityRole="header" style={styles.heading}>Kết nối máy chủ</Text>
      <Text accessibilityLiveRegion="polite" style={styles.body}>
        {isConfigured ? messages[state] : 'Chưa cấu hình API'}
      </Text>
      {!isConfigured ? (
        <Text style={styles.body}>Đặt EXPO_PUBLIC_API_URL trong .env rồi khởi động lại Expo.</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: state === 'checking' }}
        disabled={disabled}
        onPress={() => { void runCheck(); }}
        style={[styles.button, disabled ? styles.disabled : null]}
      >
        <Text style={styles.buttonText}>{state === 'error' ? 'Thử lại' : 'Kiểm tra kết nối'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, gap: 16, borderWidth: 1, borderColor: colors.border },
  heading: { ...type.heading, color: colors.text },
  body: { ...type.body, color: colors.muted },
  button: { minHeight: 48, backgroundColor: colors.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 12 },
  disabled: { opacity: 0.5 },
  buttonText: { ...type.body, color: colors.surface, fontWeight: '600', textAlign: 'center' },
});
