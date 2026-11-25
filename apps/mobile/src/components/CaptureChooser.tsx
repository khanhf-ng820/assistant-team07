import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLedger } from '../context/LedgerContext';
import { colors, type } from '../theme';

interface CaptureChooserProps {
  visible: boolean;
  onClose: () => void;
  onManualSelect?: () => void;
}

export function CaptureChooser({ visible, onClose, onManualSelect }: CaptureChooserProps) {
  let openManualEntryFromContext: (() => void) | undefined;
  try {
    // Safe lookup if rendered within LedgerProvider
    const ledger = useLedger();
    openManualEntryFromContext = ledger.openManualEntry;
  } catch {
    // Graceful fallback when rendered in isolated test environments
  }

  const handleManualPress = () => {
    onClose();
    if (onManualSelect) {
      onManualSelect();
    } else if (openManualEntryFromContext) {
      openManualEntryFromContext();
    }
  };

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
            <Text accessibilityRole="header" style={styles.heading}>
              Chọn cách ghi giao dịch
            </Text>
            <Text style={styles.body}>
              Chọn phương thức để ghi nhận khoản chi tiêu mới.
            </Text>

            {/* Manual Entry Option */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nhập thủ công"
              style={({ pressed }) => [styles.option, styles.optionActive, pressed && styles.pressed]}
              onPress={handleManualPress}
              testID="capture-option-manual"
            >
              <View style={styles.optionHeader}>
                <Text style={styles.optionIcon}>✍️</Text>
                <Text style={styles.method}>Nhập thủ công</Text>
              </View>
              <Text style={styles.subtext}>
                Nhập số tiền bằng bàn phím số chuyển khoản ngân hàng
              </Text>
            </Pressable>

            {/* OCR Option (Phase 2) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quét hóa đơn — Chưa triển khai"
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.option, styles.optionDisabled]}
            >
              <View style={styles.optionHeader}>
                <Text style={styles.optionIcon}>📷</Text>
                <Text style={styles.methodDisabled}>Quét hóa đơn</Text>
              </View>
              <Text style={styles.subtextDisabled}>Chưa triển khai (Phase 2)</Text>
            </Pressable>

            {/* Voice Option (Phase 2) */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ghi âm — Chưa triển khai"
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.option, styles.optionDisabled]}
            >
              <View style={styles.optionHeader}>
                <Text style={styles.optionIcon}>🎙️</Text>
                <Text style={styles.methodDisabled}>Ghi âm</Text>
              </View>
              <Text style={styles.subtextDisabled}>Chưa triển khai (Phase 2)</Text>
            </Pressable>

            {/* Close Button */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng lựa chọn"
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
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
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    padding: 24,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  heading: {
    ...type.heading,
    color: colors.text,
  },
  body: {
    ...type.body,
    color: colors.muted,
  },
  option: {
    minHeight: 64,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: '#F0FDFA',
  },
  optionDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionIcon: {
    fontSize: 18,
  },
  method: {
    ...type.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  methodDisabled: {
    ...type.body,
    fontWeight: '600',
    color: colors.subtle,
  },
  subtext: {
    ...type.caption,
    color: colors.muted,
  },
  subtextDisabled: {
    ...type.caption,
    color: colors.subtle,
  },
  close: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 14,
  },
  closeText: {
    ...type.bodyBold,
    color: colors.surface,
  },
  pressed: {
    opacity: 0.8,
  },
});
