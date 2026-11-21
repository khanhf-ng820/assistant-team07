import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../theme';

export interface CaptureChooserProps {
  visible: boolean;
  onClose: () => void;
}

interface ActionOption {
  method: string;
  icon: string;
  description: string;
}

const ACTION_OPTIONS: ActionOption[] = [
  { method: 'Nhập thủ công', icon: '⌨️', description: 'Gõ số tiền và phân loại' },
  { method: 'Quét hóa đơn', icon: '📷', description: 'Chụp hoặc tải ảnh hóa đơn' },
  { method: 'Ghi âm', icon: '🎙️', description: 'Nói khoản chi bằng giọng nói' },
];

export function CaptureChooser({ visible, onClose }: CaptureChooserProps) {
  return (
    <Modal
      testID="capture-modal"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.overlay}>
        {/* Backdrop dismiss pressable */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng bằng cách nhấn ngoài"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View
            accessibilityViewIsModal
            style={[styles.sheet, shadows.lg]}
          >
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.heading}>
                Chọn cách ghi giao dịch
              </Text>
              <Text style={styles.body}>
                Bản mẫu chưa hỗ trợ ghi giao dịch.
              </Text>
            </View>

            <View style={styles.optionsList}>
              {ACTION_OPTIONS.map(({ method, icon, description }) => (
                <Pressable
                  key={method}
                  accessibilityRole="button"
                  accessibilityLabel={`${method} — Chưa triển khai`}
                  accessibilityState={{ disabled: true }}
                  disabled
                  style={styles.option}
                >
                  <View style={styles.iconCircle}>
                    <Text style={styles.iconText}>{icon}</Text>
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={styles.methodTitle}>{method}</Text>
                    <Text style={styles.optionDescription}>{description}</Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Chưa triển khai</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng lựa chọn"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closePressed,
              ]}
            >
              <Text style={styles.closeText}>Đóng</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  heading: {
    ...typography.heading,
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.muted,
  },
  optionsList: {
    gap: spacing.md,
  },
  option: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    opacity: 0.75,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconText: {
    fontSize: 20,
  },
  optionContent: {
    flex: 1,
  },
  methodTitle: {
    ...typography.bodyBold,
    color: colors.text,
  },
  optionDescription: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.border,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  closeButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  closePressed: {
    opacity: 0.88,
  },
  closeText: {
    ...typography.bodyBold,
    color: colors.surface,
  },
});

export default CaptureChooser;
