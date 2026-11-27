import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCapture } from '../../context/CaptureContext';
import { colors, type } from '../../theme';

interface VoiceRecorderShellModalProps {
  renderRecorder?: () => React.ReactNode;
}

/**
 * Launch shell for the Voice AI recorder bar (#49).
 * Microphone permission is already verified before this modal opens.
 */
export function VoiceRecorderShellModal({ renderRecorder }: VoiceRecorderShellModalProps = {}) {
  const { captureFlow, cancelCapture, fallbackToManualEntry } = useCapture();

  const isVisible = captureFlow === 'recording';

  return (
    <Modal
      testID="voice-recorder-shell-modal"
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={cancelCapture}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng ghi âm"
          onPress={cancelCapture}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text accessibilityRole="header" style={styles.title}>
              Ghi âm khoản chi
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng ghi âm"
              onPress={cancelCapture}
              hitSlop={8}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              testID="voice-shell-close"
            >
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          {renderRecorder ? (
            renderRecorder()
          ) : (
            <View style={styles.statusCard}>
              <Text style={styles.micIcon}>🎙️</Text>
              <Text style={styles.statusTitle}>Micro đã sẵn sàng</Text>
              <Text style={styles.statusBody}>
                Nói ngắn gọn một khoản chi, ví dụ: &quot;Cơm trưa ba mươi lăm nghìn&quot; (tối đa 30 giây, tích hợp pipeline #49).
              </Text>
            </View>
          )}

          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Hủy ghi âm"
              onPress={cancelCapture}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              testID="voice-shell-cancel"
            >
              <Text style={styles.cancelButtonText}>Hủy</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chuyển sang nhập thủ công"
              onPress={fallbackToManualEntry}
              style={({ pressed }) => [styles.manualButton, pressed && styles.pressed]}
              testID="voice-fallback-manual-button"
            >
              <Text style={styles.manualButtonText}>Nhập thủ công</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlayBackdrop,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...type.heading,
    color: colors.text,
    fontWeight: '700',
  },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.muted,
  },
  statusCard: {
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  micIcon: {
    fontSize: 32,
  },
  statusTitle: {
    ...type.bodyBold,
    color: colors.primary,
    fontSize: 16,
  },
  statusBody: {
    ...type.caption,
    color: colors.muted,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    ...type.bodyBold,
    color: colors.dangerText,
  },
  manualButton: {
    flex: 2,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualButtonText: {
    ...type.bodyBold,
    color: colors.surface,
  },
  pressed: {
    opacity: 0.8,
  },
});
