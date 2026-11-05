import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, type } from '../theme';

export function CaptureChooser({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal
      testID="capture-modal"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.heading}>Chọn cách ghi giao dịch</Text>
          <Text style={styles.body}>Bản mẫu chưa hỗ trợ ghi giao dịch.</Text>
          {['Nhập thủ công', 'Quét hóa đơn', 'Ghi âm'].map((method) => (
            <Pressable
              key={method}
              accessibilityRole="button"
              accessibilityLabel={`${method} — Chưa triển khai`}
              accessibilityState={{ disabled: true }}
              disabled
              style={styles.option}
            >
              <Text style={styles.method}>{method}</Text>
              <Text style={styles.body}>Chưa triển khai</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng lựa chọn" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Đóng</Text>
          </Pressable>
        </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: 24 },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  sheet: { backgroundColor: colors.surface, borderRadius: 24, padding: 24, gap: 16 },
  heading: { ...type.heading, color: colors.text },
  body: { ...type.body, color: colors.muted },
  method: { ...type.body, fontWeight: '600', color: colors.text },
  option: { minHeight: 64, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  close: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 12 },
  closeText: { ...type.body, fontWeight: '600', color: colors.surface },
});
