import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCapture } from '../../context/CaptureContext';
import { colors, type } from '../../theme';

interface ReceiptCameraShellModalProps {
  renderViewfinder?: () => React.ReactNode;
}

/**
 * Launch shell for the Receipt OCR camera viewfinder (#48).
 * Camera permission is already verified before this modal opens.
 */
export function ReceiptCameraShellModal({ renderViewfinder }: ReceiptCameraShellModalProps = {}) {
  const {
    captureFlow,
    cancelCapture,
    fallbackToManualEntry,
    requestGalleryPermission,
  } = useCapture();
  const [galleryStatus, setGalleryStatus] = useState<string | null>(null);

  const isVisible = captureFlow === 'camera_preview';

  useEffect(() => {
    if (!isVisible) {
      setGalleryStatus(null);
    }
  }, [isVisible]);

  const handlePickFromGallery = async () => {
    const result = await requestGalleryPermission();
    if (result.outcome === 'granted') {
      setGalleryStatus('Đã cấp quyền thư viện ảnh — sẵn sàng chọn hóa đơn');
    }
  };

  return (
    <Modal
      testID="receipt-camera-shell-modal"
      visible={isVisible}
      animationType="slide"
      onRequestClose={cancelCapture}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng camera hóa đơn"
            onPress={cancelCapture}
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            testID="ocr-shell-close"
          >
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Quét hóa đơn
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {renderViewfinder ? (
          renderViewfinder()
        ) : (
          <View style={styles.viewfinderFrame}>
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={styles.viewfinderTitle}>Camera đã sẵn sàng</Text>
            <Text style={styles.viewfinderSubtitle}>
              Đặt hóa đơn hoặc ảnh chuyển khoản vào khung hình để trích xuất tự động (Issue #48).
            </Text>
            {galleryStatus ? (
              <Text style={styles.galleryStatusText} testID="ocr-gallery-status">
                {galleryStatus}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.footerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chọn ảnh từ thư viện"
            onPress={() => void handlePickFromGallery()}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            testID="ocr-pick-gallery-button"
          >
            <Text style={styles.primaryButtonText}>Chọn ảnh từ thư viện</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nhập thủ công thay thế"
            onPress={fallbackToManualEntry}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            testID="ocr-fallback-manual-button"
          >
            <Text style={styles.secondaryButtonText}>Nhập thủ công</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.text,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.muted,
  },
  backText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.surface,
  },
  headerTitle: {
    ...type.heading,
    color: colors.surface,
    fontWeight: '700',
  },
  headerSpacer: {
    width: 48,
  },
  viewfinderFrame: {
    flex: 1,
    marginVertical: 20,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  cameraIcon: {
    fontSize: 40,
  },
  viewfinderTitle: {
    ...type.heading,
    color: colors.surface,
    textAlign: 'center',
  },
  viewfinderSubtitle: {
    ...type.body,
    color: colors.borderStrong,
    textAlign: 'center',
  },
  galleryStatusText: {
    ...type.captionBold,
    color: colors.primaryLight,
    textAlign: 'center',
  },
  footerActions: {
    gap: 12,
    paddingBottom: 16,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...type.bodyBold,
    color: colors.surface,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...type.bodyBold,
    color: colors.text,
  },
  pressed: {
    opacity: 0.8,
  },
});
