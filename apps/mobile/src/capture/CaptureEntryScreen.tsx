import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, type } from '../theme';
import { PlaceholderScreen } from '../components/PlaceholderScreen';
import type { CaptureKind } from './routes';

const COPY: Record<CaptureKind, { title: string; description: string }> = {
  ocr: { title: 'Quét hóa đơn', description: 'Lối tắt mở nhanh chức năng quét hóa đơn.' },
  voice: { title: 'Ghi âm', description: 'Lối tắt mở nhanh chức năng ghi chi tiêu bằng giọng nói.' },
  manual: { title: 'Nhập thủ công', description: 'Lối tắt mở nhanh chức năng nhập giao dịch thủ công.' },
};

/**
 * Entry point for `carenta://capture/<kind>`.
 *
 * Only the routing and shortcut hooks live here (issue #53). The OCR, voice and
 * manual-entry screens belong to other issues; when one lands, replace the body
 * of the matching `app/capture/<kind>.tsx` with that screen. Until then this
 * screen states plainly that the capture method is not implemented, and never
 * records a transaction.
 */
export function CaptureEntryScreen({ kind }: { kind: CaptureKind }) {
  const router = useRouter();
  const { title, description } = COPY[kind];

  return (
    <PlaceholderScreen title={title} description={description}>
      <Text testID={`capture-entry-${kind}`} style={styles.status}>
        Chưa triển khai
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Về trang chủ"
        onPress={() => router.replace('/')}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Về trang chủ</Text>
      </Pressable>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  status: { ...type.body, fontWeight: '600', color: colors.muted },
  button: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  buttonText: { ...type.body, fontWeight: '600', color: colors.surface },
});
