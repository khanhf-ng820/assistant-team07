import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CaptureMethod, useOptionalCapture } from '../context/CaptureContext';
import { useOptionalLedger } from '../context/LedgerContext';
import { colors, type } from '../theme';

interface CaptureChooserProps {
  visible: boolean;
  onClose: () => void;
  onManualSelect?: () => void;
  onSelectManual?: () => void;
  onSelectOcr?: () => void;
  onSelectVoice?: () => void;
  onSelectMethod?: (method: CaptureMethod) => void;
}

export function CaptureChooser({
  visible,
  onClose,
  onManualSelect,
  onSelectManual,
  onSelectOcr,
  onSelectVoice,
  onSelectMethod,
}: CaptureChooserProps) {
  const capture = useOptionalCapture();
  const ledger = useOptionalLedger();
  const startCaptureFromContext = capture?.startCapture;
  const openManualFromLedger = ledger?.openManualEntry;

  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(visible ? 0 : 20)).current;

  useEffect(() => {
    if (!visible) {
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      return;
    }

    let cancelled = false;
    let runningAnimation: Animated.CompositeAnimation | null = null;

    const startEntrance = async () => {
      let reduceMotion = false;
      try {
        reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        reduceMotion = false;
      }

      if (cancelled) return;

      if (reduceMotion) {
        fadeAnim.setValue(1);
        slideAnim.setValue(0);
        return;
      }

      fadeAnim.setValue(0);
      slideAnim.setValue(20);
      runningAnimation = Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]);
      runningAnimation.start();
    };

    void startEntrance();

    return () => {
      cancelled = true;
      runningAnimation?.stop();
    };
  }, [fadeAnim, slideAnim, visible]);

  const handleSelect = (method: CaptureMethod) => {
    onClose();

    if (onSelectMethod) {
      onSelectMethod(method);
      return;
    }

    if (method === 'manual') {
      const manualCallback = onSelectManual || onManualSelect;
      if (manualCallback) {
        manualCallback();
      } else if (startCaptureFromContext) {
        void startCaptureFromContext('manual');
      } else if (openManualFromLedger) {
        openManualFromLedger();
      }
      return;
    }

    if (method === 'ocr') {
      if (onSelectOcr) {
        onSelectOcr();
      } else if (startCaptureFromContext) {
        void startCaptureFromContext('ocr');
      }
      return;
    }

    if (onSelectVoice) {
      onSelectVoice();
    } else if (startCaptureFromContext) {
      void startCaptureFromContext('voice');
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
      <Animated.View style={[styles.backdropContainer, { opacity: fadeAnim }]}>
        <SafeAreaView style={styles.overlay}>
          {/* Dismiss on outside backdrop tap */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng lớp phủ"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
            testID="capture-backdrop"
          />

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View
              accessibilityViewIsModal
              style={[
                styles.sheet,
                { transform: [{ translateY: slideAnim }] },
              ]}
            >
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
                style={({ pressed }) => [
                  styles.option,
                  styles.optionActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => handleSelect('manual')}
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

              {/* OCR Receipt Scan Option */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quét hóa đơn"
                style={({ pressed }) => [
                  styles.option,
                  styles.optionActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => handleSelect('ocr')}
                testID="capture-option-ocr"
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionIcon}>📷</Text>
                  <Text style={styles.method}>Quét hóa đơn</Text>
                </View>
                <Text style={styles.subtext}>
                  Chụp hóa đơn hoặc chọn ảnh chuyển khoản từ thư viện
                </Text>
              </Pressable>

              {/* Voice Capture Option */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ghi âm"
                style={({ pressed }) => [
                  styles.option,
                  styles.optionActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => handleSelect('voice')}
                testID="capture-option-voice"
              >
                <View style={styles.optionHeader}>
                  <Text style={styles.optionIcon}>🎙️</Text>
                  <Text style={styles.method}>Ghi âm</Text>
                </View>
                <Text style={styles.subtext}>
                  Nói nhanh khoản chi bằng tiếng Việt (tối đa 30 giây)
                </Text>
              </Pressable>

              {/* Close Button (>= 48dp touch target) */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng lựa chọn"
                onPress={onClose}
                style={({ pressed }) => [styles.close, pressed && styles.pressed]}
                testID="capture-close-button"
              >
                <Text style={styles.closeText}>Đóng</Text>
              </Pressable>
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropContainer: {
    flex: 1,
    backgroundColor: colors.overlayBackdropDark,
  },
  overlay: {
    flex: 1,
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
    shadowColor: colors.shadow,
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
    backgroundColor: colors.primaryTint,
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
  subtext: {
    ...type.caption,
    color: colors.muted,
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
