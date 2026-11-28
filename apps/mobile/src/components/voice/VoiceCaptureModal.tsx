import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLedger } from '../../context/LedgerContext';
import { useOptionalVoiceCapture } from '../../context/VoiceCaptureContext';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import {
  useExpoVoiceRecorderAdapter,
  type VoicePermissionResult,
  type VoiceRecorderAdapter,
  type VoiceRecordingResult,
} from '../../voice/voiceRecorderAdapter';
import { Button } from '../Button';
import { VoiceRecordingBar } from './VoiceRecordingBar';

export type VoiceCaptureStage =
  | 'requesting_permission'
  | 'permission_denied'
  | 'permission_blocked'
  | 'recording'
  | 'captured'
  | 'error';

export interface VoiceCaptureModalProps {
  visible?: boolean;
  onClose?: () => void;
  adapter?: VoiceRecorderAdapter;
  onRecordingComplete?: (result: VoiceRecordingResult) => void;
  onOpenManualEntry?: () => void;
}

interface VoiceCaptureModalBodyProps {
  adapter: VoiceRecorderAdapter;
  onClose: () => void;
  onRecordingComplete?: (result: VoiceRecordingResult) => void;
  onOpenManualEntry?: () => void;
}

function useOptionalOpenManualEntry(): (() => void) | undefined {
  try {
    return useLedger().openManualEntry;
  } catch {
    return undefined;
  }
}

function resolvePermissionStage(
  result: VoicePermissionResult
): 'recording' | 'permission_denied' | 'permission_blocked' {
  if (result.granted) {
    return 'recording';
  }
  return result.canAskAgain ? 'permission_denied' : 'permission_blocked';
}

function VoiceCaptureModalBody({
  adapter,
  onClose,
  onRecordingComplete,
  onOpenManualEntry,
}: VoiceCaptureModalBodyProps) {
  const openManualFromLedger = useOptionalOpenManualEntry();
  const manualEntryHandler = onOpenManualEntry ?? openManualFromLedger;

  const [stage, setStage] = useState<VoiceCaptureStage>('requesting_permission');
  const [capturedRecording, setCapturedRecording] = useState<VoiceRecordingResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const adapterRef = useRef(adapter);
  const capturedRef = useRef<VoiceRecordingResult | null>(null);

  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  useEffect(() => {
    capturedRef.current = capturedRecording;
  }, [capturedRecording]);

  const cleanupCapturedTempFile = useCallback(() => {
    if (capturedRef.current) {
      adapterRef.current.deleteTempFile(capturedRef.current.uri);
      capturedRef.current = null;
      setCapturedRecording(null);
    }
  }, []);

  const ensurePermissionAndStart = useCallback(
    async (isRetry: boolean) => {
      if (isRetry) {
        setStage('requesting_permission');
        setErrorMessage(null);
      }
      try {
        const current = await adapterRef.current.getPermission();
        if (current.granted) {
          setStage('recording');
          return;
        }
        if (!current.canAskAgain && !isRetry) {
          setStage('permission_blocked');
          return;
        }
        const requested = await adapterRef.current.requestPermission();
        setStage(resolvePermissionStage(requested));
      } catch {
        setErrorMessage('Không thể kiểm tra quyền truy cập micro.');
        setStage('error');
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        const current = await adapterRef.current.getPermission();
        if (!active) return;
        if (current.granted) {
          setStage('recording');
          return;
        }
        if (!current.canAskAgain) {
          setStage('permission_blocked');
          return;
        }
        const requested = await adapterRef.current.requestPermission();
        if (!active) return;
        setStage(resolvePermissionStage(requested));
      } catch {
        if (!active) return;
        setErrorMessage('Không thể kiểm tra quyền truy cập micro.');
        setStage('error');
      }
    };
    void init();
    return () => {
      active = false;
      if (capturedRef.current) {
        adapterRef.current.deleteTempFile(capturedRef.current.uri);
        capturedRef.current = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    cleanupCapturedTempFile();
    onClose();
  }, [cleanupCapturedTempFile, onClose]);

  const handleManualFallback = useCallback(() => {
    cleanupCapturedTempFile();
    onClose();
    manualEntryHandler?.();
  }, [cleanupCapturedTempFile, manualEntryHandler, onClose]);

  const handleRecordingComplete = useCallback(
    (result: VoiceRecordingResult) => {
      setCapturedRecording(result);
      capturedRef.current = result;
      setStage('captured');
      onRecordingComplete?.(result);
    },
    [onRecordingComplete]
  );

  const handleRecorderError = useCallback((error: Error) => {
    setErrorMessage(error.message || 'Không thể ghi âm lúc này.');
    setStage('error');
  }, []);

  const handleRetryRecording = useCallback(() => {
    cleanupCapturedTempFile();
    void ensurePermissionAndStart(true);
  }, [cleanupCapturedTempFile, ensurePermissionAndStart]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return (
    <SafeAreaView accessibilityViewIsModal style={styles.overlay}>
      <Pressable
        testID="voice-capture-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Đóng ghi âm"
        style={StyleSheet.absoluteFill}
        onPress={handleClose}
      />

      <View
        testID="voice-capture-sheet"
        onStartShouldSetResponder={() => true}
        style={styles.sheetWrapper}
      >
        {stage === 'recording' ? (
          <View style={[styles.recordingContainer, shadows.lg]}>
            <Text style={styles.recordingHint}>
              Nói khoản chi của bạn (tối đa 30 giây)
            </Text>
            <VoiceRecordingBar
              adapter={adapter}
              onCancel={handleClose}
              onRecordingComplete={handleRecordingComplete}
              onError={handleRecorderError}
            />
          </View>
        ) : (
          <View style={[styles.card, shadows.lg]}>
            {stage === 'requesting_permission' && (
              <View style={styles.section}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.title}>Đang kiểm tra quyền micro…</Text>
                <Text style={styles.body}>
                  Vui lòng cho phép CARENTA sử dụng micro để ghi âm khoản chi.
                </Text>
                <Button title="Hủy" variant="outline" onPress={handleClose} />
              </View>
            )}

            {stage === 'permission_denied' && (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.title}>
                  Cần quyền truy cập micro
                </Text>
                <Text style={styles.body}>
                  CARENTA cần quyền micro để ghi âm khoản chi bằng giọng nói. Bạn có thể thử lại hoặc nhập thủ công.
                </Text>
                <View style={styles.actions}>
                  <Button title="Thử lại" variant="primary" onPress={handleRetryRecording} />
                  {manualEntryHandler ? (
                    <Button
                      title="Nhập thủ công"
                      variant="outline"
                      onPress={handleManualFallback}
                    />
                  ) : null}
                  <Button title="Đóng" variant="ghost" onPress={handleClose} />
                </View>
              </View>
            )}

            {stage === 'permission_blocked' && (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.title}>
                  Quyền micro đã bị chặn
                </Text>
                <Text style={styles.body}>
                  Hãy mở Cài đặt thiết bị để cấp quyền micro cho CARENTA, hoặc chuyển sang nhập thủ công.
                </Text>
                <View style={styles.actions}>
                  <Button
                    title="Mở cài đặt"
                    variant="primary"
                    onPress={handleOpenSettings}
                  />
                  <Button
                    title="Thử lại"
                    variant="secondary"
                    onPress={handleRetryRecording}
                  />
                  {manualEntryHandler ? (
                    <Button
                      title="Nhập thủ công"
                      variant="outline"
                      onPress={handleManualFallback}
                    />
                  ) : null}
                  <Button title="Đóng" variant="ghost" onPress={handleClose} />
                </View>
              </View>
            )}

            {stage === 'captured' && (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.title}>
                  Đã ghi âm xong
                </Text>
                <Text style={styles.body}>
                  Bản ghi âm đã sẵn sàng để phân tích ở bước tiếp theo.
                </Text>
                <View style={styles.actions}>
                  <Button title="Ghi lại" variant="primary" onPress={handleRetryRecording} />
                  {manualEntryHandler ? (
                    <Button
                      title="Nhập thủ công"
                      variant="outline"
                      onPress={handleManualFallback}
                    />
                  ) : null}
                  <Button title="Đóng" variant="ghost" onPress={handleClose} />
                </View>
              </View>
            )}

            {stage === 'error' && (
              <View style={styles.section}>
                <Text accessibilityRole="header" style={styles.title}>
                  Không thể ghi âm lúc này
                </Text>
                <Text style={styles.body}>
                  {errorMessage ?? 'Đã xảy ra lỗi khi khởi động micro.'}
                </Text>
                <View style={styles.actions}>
                  <Button title="Thử lại" variant="primary" onPress={handleRetryRecording} />
                  {manualEntryHandler ? (
                    <Button
                      title="Nhập thủ công"
                      variant="outline"
                      onPress={handleManualFallback}
                    />
                  ) : null}
                  <Button title="Đóng" variant="ghost" onPress={handleClose} />
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function ExpoVoiceCaptureModalBody(props: Omit<VoiceCaptureModalBodyProps, 'adapter'>) {
  const adapter = useExpoVoiceRecorderAdapter();
  return <VoiceCaptureModalBody adapter={adapter} {...props} />;
}

export function VoiceCaptureModal({
  visible,
  onClose,
  adapter,
  onRecordingComplete,
  onOpenManualEntry,
}: VoiceCaptureModalProps) {
  const voiceContext = useOptionalVoiceCapture();
  const isModalVisible = visible ?? voiceContext?.isVoiceCaptureOpen ?? false;
  const handleClose = onClose ?? voiceContext?.closeVoiceCapture ?? (() => {});

  return (
    <Modal
      testID="voice-capture-modal"
      visible={isModalVisible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      {isModalVisible ? (
        adapter ? (
          <VoiceCaptureModalBody
            adapter={adapter}
            onClose={handleClose}
            onRecordingComplete={onRecordingComplete}
            onOpenManualEntry={onOpenManualEntry}
          />
        ) : (
          <ExpoVoiceCaptureModalBody
            onClose={handleClose}
            onRecordingComplete={onRecordingComplete}
            onOpenManualEntry={onOpenManualEntry}
          />
        )
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  sheetWrapper: {
    width: '100%',
  },
  recordingContainer: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  recordingHint: {
    ...typography.captionBold,
    color: colors.muted,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  body: {
    ...typography.body,
    color: colors.muted,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

export default VoiceCaptureModal;
