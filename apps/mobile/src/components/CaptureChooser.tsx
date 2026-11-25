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
import { useLedger } from '../context/LedgerContext';
import { Button } from './Button';
import { colors, radius, shadows, spacing, typography } from '../theme';

export type CaptureMethodId = 'manual' | 'ocr' | 'voice';

export interface CaptureChooserProps {
  visible: boolean;
  onClose: () => void;
  onSelectManual?: () => void;
  onManualSelect?: () => void;
  /**
   * Observer/telemetry callback fired when any capture method is tapped.
   * Runs alongside the active manual handler (`onSelectManual` or `LedgerContext.openManualEntry`).
   */
  onSelectMethod?: (method: CaptureMethodId) => void;
}

interface ActionOption {
  id: CaptureMethodId;
  method: string;
  icon: string;
  description: string;
}

const ACTION_OPTIONS: ActionOption[] = [
  { id: 'manual', method: 'Nhập thủ công', icon: '⌨️', description: 'Gõ số tiền và phân loại' },
  { id: 'ocr', method: 'Quét hóa đơn', icon: '📷', description: 'Chụp hoặc tải ảnh hóa đơn' },
  { id: 'voice', method: 'Ghi âm', icon: '🎙️', description: 'Nói khoản chi bằng giọng nói' },
];

export function CaptureChooser({
  visible,
  onClose,
  onSelectManual,
  onManualSelect,
  onSelectMethod,
}: CaptureChooserProps) {
  let openManualEntryFromContext: (() => void) | undefined;
  try {
    // Safe lookup when rendered inside LedgerProvider
    const ledger = useLedger();
    openManualEntryFromContext = ledger.openManualEntry;
  } catch {
    // Graceful fallback when rendered in isolated test environments
  }

  const manualHandler = onSelectManual ?? onManualSelect ?? openManualEntryFromContext;
  const hasManualSupport = Boolean(manualHandler || onSelectMethod);

  return (
    <Modal
      testID="capture-modal"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView accessibilityViewIsModal style={styles.overlay}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Backdrop dismiss sits inside ScrollView content so touches outside the sheet are not intercepted */}
          <Pressable
            testID="capture-backdrop"
            accessibilityRole="button"
            accessibilityLabel="Đóng bằng cách nhấn ngoài"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />

          <View
            testID="capture-sheet"
            onStartShouldSetResponder={() => true}
            style={[styles.sheet, shadows.lg]}
          >
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.heading}>
                Chọn cách ghi giao dịch
              </Text>
              <Text style={styles.body}>
                {hasManualSupport
                  ? 'Chọn phương thức để ghi nhận khoản chi tiêu mới.'
                  : 'Bản mẫu chưa hỗ trợ ghi giao dịch.'}
              </Text>
            </View>

            <View style={styles.optionsList}>
              {ACTION_OPTIONS.map(({ id, method, icon, description }) => {
                const isEnabled = id === 'manual' && hasManualSupport;
                const label = isEnabled ? method : `${method} — Chưa triển khai`;

                return (
                  <Pressable
                    key={id}
                    testID={id === 'manual' ? 'capture-option-manual' : `capture-option-${id}`}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ disabled: !isEnabled }}
                    disabled={!isEnabled}
                    style={[styles.option, isEnabled && styles.optionEnabled]}
                    onPress={() => {
                      if (!isEnabled) return;
                      onClose();
                      // Trigger manual entry handler (prop override or LedgerContext.openManualEntry)
                      manualHandler?.();
                      // Notify method selection observer if registered
                      onSelectMethod?.(id);
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
    padding: spacing.xl,
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
