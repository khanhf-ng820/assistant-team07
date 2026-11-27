import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CapturePermissionKind } from '../../capture/permissions';
import { useCapture } from '../../context/CaptureContext';
import { colors, type } from '../../theme';

const PERMISSION_COPY: Record<
  CapturePermissionKind,
  { icon: string; title: string; reason: string }
> = {
  camera: {
    icon: '📷',
    title: 'Cần quyền truy cập Camera',
    reason: 'CARENTA cần quyền camera để chụp hóa đơn hoặc ảnh chuyển khoản.',
  },
  media_library: {
    icon: '🖼️',
    title: 'Cần quyền truy cập Thư viện ảnh',
    reason: 'CARENTA cần quyền thư viện ảnh để bạn chọn ảnh hóa đơn có sẵn.',
  },
  microphone: {
    icon: '🎙️',
    title: 'Cần quyền truy cập Micro',
    reason: 'CARENTA cần quyền micro để ghi âm mô tả khoản chi tiêu của bạn.',
  },
};

export function PermissionPromptModal() {
  const {
    captureFlow,
    permissionResult,
    retryPermission,
    openSettingsForPermission,
    dismissPermissionPrompt,
    fallbackToManualEntry,
  } = useCapture();

  const isVisible = captureFlow === 'permission_prompt' && permissionResult !== null;
  const kind: CapturePermissionKind = permissionResult?.kind ?? 'camera';
  const outcome = permissionResult?.outcome ?? 'denied';
  const copy = PERMISSION_COPY[kind];

  const statusLabel =
    outcome === 'blocked'
      ? 'Đã tắt trong Cài đặt'
      : outcome === 'unavailable'
        ? 'Thiết bị không hỗ trợ'
        : 'Chưa được cấp quyền';

  const getGuidanceText = (): string => {
    if (outcome === 'blocked') {
      return 'Quyền này đã bị tắt vĩnh viễn. Vui lòng mở Cài đặt hệ thống để bật lại hoặc dùng Nhập thủ công.';
    }
    if (outcome === 'unavailable') {
      return 'Thiết bị hoặc môi trường hiện tại chưa hỗ trợ quyền phần cứng này. Bạn vẫn có thể ghi chi tiêu bằng Nhập thủ công.';
    }
    return 'Bạn đã từ chối cấp quyền. Hãy thử cấp quyền lại hoặc chuyển sang Nhập thủ công.';
  };

  return (
    <Modal
      testID="permission-prompt-modal"
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={dismissPermissionPrompt}
    >
      <SafeAreaView style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng thông báo quyền"
          onPress={dismissPermissionPrompt}
          style={StyleSheet.absoluteFill}
        />

        <View accessibilityViewIsModal style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>{copy.icon}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
          </View>

          <Text accessibilityRole="header" style={styles.title}>
            {copy.title}
          </Text>
          <Text style={styles.reason}>{copy.reason}</Text>
          <Text style={styles.guidance} testID="permission-guidance-text">
            {getGuidanceText()}
          </Text>

          <View style={styles.actions}>
            {outcome === 'denied' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Thử cấp quyền lại"
                onPress={() => void retryPermission()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                testID="permission-retry-button"
              >
                <Text style={styles.primaryButtonText}>Thử cấp quyền lại</Text>
              </Pressable>
            ) : null}

            {outcome === 'blocked' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mở Cài đặt"
                onPress={() => void openSettingsForPermission()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                testID="permission-open-settings-button"
              >
                <Text style={styles.primaryButtonText}>Mở Cài đặt</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nhập thủ công thay thế"
              onPress={fallbackToManualEntry}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              testID="permission-fallback-manual-button"
            >
              <Text style={styles.secondaryButtonText}>Nhập thủ công thay thế</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={dismissPermissionPrompt}
              style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
              testID="permission-close-button"
            >
              <Text style={styles.ghostButtonText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayBackdropDark,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  statusPill: {
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    ...type.captionBold,
    color: colors.dangerText,
  },
  title: {
    ...type.heading,
    color: colors.text,
    fontWeight: '700',
  },
  reason: {
    ...type.body,
    color: colors.text,
  },
  guidance: {
    ...type.caption,
    color: colors.muted,
    backgroundColor: colors.surfaceSubtle,
    padding: 12,
    borderRadius: 12,
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    ...type.bodyBold,
    color: colors.surface,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    ...type.bodyBold,
    color: colors.primary,
  },
  ghostButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  ghostButtonText: {
    ...type.bodyBold,
    color: colors.muted,
  },
  pressed: {
    opacity: 0.8,
  },
});
