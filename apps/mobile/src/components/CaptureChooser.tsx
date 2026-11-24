import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './Button';
import { colors, radius, shadows, spacing, typography } from '../theme';

export interface CaptureChooserProps {
  visible: boolean;
  onClose: () => void;
  onSelectManual?: () => void;
  onSelectMethod?: (method: string) => void;
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

export function CaptureChooser({
  visible,
  onClose,
  onSelectManual,
  onSelectMethod,
}: CaptureChooserProps) {
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
              {ACTION_OPTIONS.map(({ method, icon, description }) => {
                const isManual = method === 'Nhập thủ công';
                const isEnabled = isManual && Boolean(onSelectManual);
                const label = isEnabled ? method : `${method} — Chưa triển khai`;

                return (
                  <Pressable
                    key={method}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ disabled: !isEnabled }}
                    disabled={!isEnabled}
                    style={[styles.option, isEnabled && styles.optionEnabled]}
                    onPress={() => {
                      if (isEnabled) {
                        onClose();
                        onSelectManual?.();
                        onSelectMethod?.(method);
                      }
                    }}
                  >
                    <View style={styles.iconCircle}>
                      <Text style={styles.iconText}>{icon}</Text>
                    </View>
                    <View style={styles.optionContent}>
                      <Text style={styles.methodTitle}>{method}</Text>
                      <Text style={styles.optionDescription}>{description}</Text>
                    </View>
                    <View style={[styles.badge, isEnabled && styles.badgeEnabled]}>
                      <Text style={[styles.badgeText, isEnabled && styles.badgeTextEnabled]}>
                        {isEnabled ? 'Sẵn sàng' : 'Chưa triển khai'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Button
              title="Đóng"
              variant="primary"
              accessibilityLabel="Đóng lựa chọn"
              onPress={onClose}
              style={styles.closeButton}
            />
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
    // Platform web blur backdrop filter; native platforms use translucent dimmed scrim colors.overlay
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      },
    }),
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
  optionEnabled: {
    opacity: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
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
  badgeEnabled: {
    backgroundColor: colors.primaryLight,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  badgeTextEnabled: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  closeButton: {
    marginTop: spacing.xs,
    width: '100%',
  },
});

export default CaptureChooser;
