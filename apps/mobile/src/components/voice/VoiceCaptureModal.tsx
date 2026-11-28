import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  VoiceCaptureDraft,
  VoiceCaptureRequest,
  VoiceDraftLike,
} from '../../api/contracts';
import { isApiError, isOfflineFallbackError } from '../../api/errors';
import { useOptionalAuth } from '../../auth/AuthContext';
import { useOptionalLedger } from '../../context/LedgerContext';
import {
  useOptionalVoiceCapture,
  type VoiceCaptureFlowState,
} from '../../context/VoiceCaptureContext';
import type { RequestOptions } from '../../runtime/carentaRuntime';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { CATEGORIES, formatIsoDate, type CategoryId } from '../../types/transaction';
import {
  clampRecordingDurationMs,
  useExpoVoiceRecorderAdapter,
  type VoicePermissionResult,
  type VoiceRecorderAdapter,
  type VoiceRecordingResult,
} from '../../voice/voiceRecorderAdapter';
import { Button } from '../Button';
import { hasValidConfirmableDraft, VoiceDraftReviewSheet } from './VoiceDraftReviewSheet';
import { VoiceRecordingBar } from './VoiceRecordingBar';

export type VoiceCaptureStage = VoiceCaptureFlowState;

export type ParseVoiceCaptureFn = (
  payload: VoiceCaptureRequest,
  options?: RequestOptions
) => Promise<VoiceCaptureDraft>;

export interface VoiceCaptureModalProps {
  visible?: boolean;
  onClose?: () => void;
  adapter?: VoiceRecorderAdapter;
  parseVoiceCapture?: ParseVoiceCaptureFn;
  onRecordingComplete?: (result: VoiceRecordingResult) => void;
  onDraftReady?: (draft: VoiceDraftLike) => void;
  onOpenManualEntry?: () => void;
}

interface VoiceCaptureModalBodyProps {
  adapter: VoiceRecorderAdapter;
  parseVoiceCapture?: ParseVoiceCaptureFn;
  onClose: () => void;
  onRecordingComplete?: (result: VoiceRecordingResult) => void;
  onDraftReady?: (draft: VoiceDraftLike) => void;
  onOpenManualEntry?: () => void;
}

type ErrorSubstate = 'permission_denied' | 'permission_blocked' | 'api_or_recorder';

type PermissionOutcome =
  | { kind: 'granted' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'error'; message: string };

const REVEAL_STEP_MS = 40;
const REVEAL_HOLD_MS = 80;

function buildRevealSteps(recognizedText: string | null): string[] {
  const clean = recognizedText?.trim() ?? '';
  if (!clean) {
    return [];
  }
  const words = clean.split(/\s+/);
  if (words.length >= 2) {
    return words.map((_, index) => words.slice(0, index + 1).join(' '));
  }
  if (clean.length >= 4) {
    return [clean.slice(0, Math.ceil(clean.length / 2)), clean];
  }
  return [clean];
}

function resolveVoiceError(error: unknown): { message: string; isOffline: boolean } {
  if (isOfflineFallbackError(error)) {
    return {
      message: `${error.userMessage} Bản ghi chưa được lưu; hãy thử lại khi có mạng hoặc nhập thủ công.`,
      isOffline: true,
    };
  }
  if (isApiError(error)) {
    return {
      message: error.userMessage,
      isOffline: false,
    };
  }
  if (error instanceof Error && error.message) {
    return {
      message: error.message,
      isOffline: false,
    };
  }
  return {
    message: 'Không thể xử lý giọng nói lúc này. Vui lòng thử lại hoặc nhập thủ công.',
    isOffline: false,
  };
}

function extractTimeFromDraft(draft: VoiceDraftLike): string {
  if (draft.timestamp) {
    const match = /T(\d{2}:\d{2})/.exec(draft.timestamp);
    if (match?.[1]) {
      return match[1];
    }
  }
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function formatCurrentIsoDate(): string {
  const now = new Date();
  return formatIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

async function ensureMicPermission(
  adapter: VoiceRecorderAdapter,
  isRetry: boolean
): Promise<PermissionOutcome> {
  try {
    const current = await adapter.getPermission();
    if (current.granted) {
      return { kind: 'granted' };
    }
    if (!current.canAskAgain && !isRetry) {
      return { kind: 'denied', canAskAgain: false };
    }
    const requested: VoicePermissionResult = await adapter.requestPermission();
    if (requested.granted) {
      return { kind: 'granted' };
    }
    return { kind: 'denied', canAskAgain: requested.canAskAgain };
  } catch {
    return { kind: 'error', message: 'Không thể kiểm tra quyền truy cập micro.' };
  }
}

function draftToTransactionInput(
  draft: VoiceDraftLike,
  fallbackDate: string
): {
  amount: number;
  categoryId: CategoryId;
  note: string;
  date: string;
  time: string;
} {
  const categoryId = draft.category ?? 'other';
  const categoryInfo = CATEGORIES[categoryId] ?? CATEGORIES.other;
  const resolvedNote =
    draft.description?.trim() ||
    draft.merchant?.trim() ||
    draft.recognized_text?.trim() ||
    categoryInfo.name;

  return {
    amount: draft.amount as number,
    categoryId,
    note: resolvedNote,
    date: draft.occurred_on ?? fallbackDate,
    time: extractTimeFromDraft(draft),
  };
}

function VoiceCaptureModalBody({
  adapter,
  parseVoiceCapture,
  onClose,
  onRecordingComplete,
  onDraftReady,
  onOpenManualEntry,
}: VoiceCaptureModalBodyProps) {
  const auth = useOptionalAuth();
  const ledger = useOptionalLedger();
  const voiceContext = useOptionalVoiceCapture();
  const manualEntryHandler = onOpenManualEntry ?? ledger?.openManualEntry;
  const effectiveParseVoiceCapture = parseVoiceCapture ?? auth?.apiClient.parseVoiceCapture;

  const [fallbackState, setFallbackState] = useState<{
    flowState: VoiceCaptureFlowState;
    draft: VoiceDraftLike | null;
    errorMessage: string | null;
  }>({
    flowState: 'requesting_permission',
    draft: null,
    errorMessage: null,
  });

  const flowState = voiceContext ? voiceContext.flowState : fallbackState.flowState;
  const activeDraft = voiceContext ? voiceContext.draft : fallbackState.draft;
  const activeErrorMessage = voiceContext ? voiceContext.errorMessage : fallbackState.errorMessage;

  const voiceContextRef = useRef(voiceContext);
  useEffect(() => {
    voiceContextRef.current = voiceContext;
  }, [voiceContext]);

  const setFlowState = useCallback((next: VoiceCaptureFlowState) => {
    if (voiceContextRef.current) {
      voiceContextRef.current.setFlowState(next);
    } else {
      setFallbackState((prev) => ({ ...prev, flowState: next }));
    }
  }, []);

  const setActiveDraft = useCallback((next: VoiceDraftLike | null) => {
    if (voiceContextRef.current) {
      voiceContextRef.current.setDraft(next);
    } else {
      setFallbackState((prev) => ({ ...prev, draft: next }));
    }
  }, []);

  const setActiveError = useCallback((message: string | null) => {
    if (voiceContextRef.current) {
      voiceContextRef.current.setErrorMessage(message);
    } else {
      setFallbackState((prev) => ({ ...prev, errorMessage: message }));
    }
  }, []);

  const [errorSubstate, setErrorSubstate] = useState<ErrorSubstate>('api_or_recorder');
  const [isOfflineError, setIsOfflineError] = useState<boolean>(false);
  const [isCapturedFallback, setIsCapturedFallback] = useState<boolean>(false);
  const [revealedText, setRevealedText] = useState<string>('');
  const [capturedRecording, setCapturedRecording] = useState<VoiceRecordingResult | null>(null);

  const adapterRef = useRef(adapter);
  const parseRef = useRef(effectiveParseVoiceCapture);
  const onDraftReadyRef = useRef(onDraftReady);
  const capturedRef = useRef<VoiceRecordingResult | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartedAtMsRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  useEffect(() => {
    parseRef.current = effectiveParseVoiceCapture;
  }, [effectiveParseVoiceCapture]);

  useEffect(() => {
    onDraftReadyRef.current = onDraftReady;
  }, [onDraftReady]);

  useEffect(() => {
    capturedRef.current = capturedRecording;
  }, [capturedRecording]);

  useEffect(() => {
    if (flowState === 'recording') {
      if (recordingStartedAtMsRef.current === null) {
        recordingStartedAtMsRef.current = Date.now();
      }
    } else {
      recordingStartedAtMsRef.current = null;
    }
  }, [flowState]);

  const clearRevealTimer = useCallback(() => {
    if (revealTimeoutRef.current !== null) {
      clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }
  }, []);

  const abortInFlightUpload = useCallback(() => {
    if (uploadAbortRef.current) {
      uploadAbortRef.current.abort();
      uploadAbortRef.current = null;
    }
  }, []);

  const cleanupCapturedTempFile = useCallback(() => {
    if (capturedRef.current) {
      adapterRef.current.deleteTempFile(capturedRef.current.uri);
      capturedRef.current = null;
      setCapturedRecording(null);
    }
  }, []);

  const handleClose = useCallback(() => {
    abortInFlightUpload();
    clearRevealTimer();
    cleanupCapturedTempFile();
    setIsCapturedFallback(false);
    setRevealedText('');
    setActiveDraft(null);
    setActiveError(null);
    setFlowState('idle');
    onClose();
  }, [
    abortInFlightUpload,
    cleanupCapturedTempFile,
    clearRevealTimer,
    onClose,
    setActiveDraft,
    setActiveError,
    setFlowState,
  ]);

  const applyPermissionOutcome = useCallback(
    (outcome: PermissionOutcome) => {
      if (outcome.kind === 'granted') {
        setErrorSubstate('api_or_recorder');
        setFlowState('recording');
      } else if (outcome.kind === 'denied') {
        setErrorSubstate(outcome.canAskAgain ? 'permission_denied' : 'permission_blocked');
        setFlowState('error');
      } else {
        setErrorSubstate('api_or_recorder');
        setActiveError(outcome.message);
        setFlowState('error');
      }
    },
    [setActiveError, setFlowState]
  );

  useEffect(() => {
    isMountedRef.current = true;
    void ensureMicPermission(adapterRef.current, false).then((outcome) => {
      if (isMountedRef.current) {
        applyPermissionOutcome(outcome);
      }
    });

    return () => {
      isMountedRef.current = false;
      abortInFlightUpload();
      clearRevealTimer();
      if (capturedRef.current) {
        adapterRef.current.deleteTempFile(capturedRef.current.uri);
        capturedRef.current = null;
      }
    };
  }, [abortInFlightUpload, applyPermissionOutcome, clearRevealTimer]);

  const startProgressiveReveal = useCallback(
    (parsedDraft: VoiceCaptureDraft) => {
      clearRevealTimer();
      const steps = buildRevealSteps(parsedDraft.recognized_text);
      setFlowState('revealing');

      const finishReveal = () => {
        if (!isMountedRef.current) return;
        const externalDraftHandler = onDraftReadyRef.current;
        if (externalDraftHandler) {
          handleClose();
          externalDraftHandler(parsedDraft);
          return;
        }
        setActiveDraft(parsedDraft);
        setFlowState('review');
      };

      if (steps.length === 0) {
        setRevealedText('');
        revealTimeoutRef.current = setTimeout(finishReveal, REVEAL_HOLD_MS);
        return;
      }

      setRevealedText(steps[0]);
      let stepIndex = 1;

      const scheduleNext = () => {
        if (!isMountedRef.current) return;
        if (stepIndex < steps.length) {
          const nextValue = steps[stepIndex];
          stepIndex += 1;
          revealTimeoutRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            setRevealedText(nextValue);
            scheduleNext();
          }, REVEAL_STEP_MS);
        } else {
          revealTimeoutRef.current = setTimeout(finishReveal, REVEAL_HOLD_MS);
        }
      };

      scheduleNext();
    },
    [clearRevealTimer, handleClose, setActiveDraft, setFlowState]
  );

  const handleManualFallback = useCallback(() => {
    handleClose();
    manualEntryHandler?.();
  }, [handleClose, manualEntryHandler]);

  const handleRecordingComplete = useCallback(
    async (result: VoiceRecordingResult) => {
      const elapsedMs =
        recordingStartedAtMsRef.current !== null
          ? Math.max(1, Date.now() - recordingStartedAtMsRef.current)
          : 1;
      recordingStartedAtMsRef.current = null;

      onRecordingComplete?.(result);

      const parseFn = parseRef.current;
      if (!parseFn && onRecordingComplete) {
        setCapturedRecording(result);
        capturedRef.current = result;
        setIsCapturedFallback(true);
        return;
      }

      abortInFlightUpload();
      clearRevealTimer();
      const abortController = new AbortController();
      uploadAbortRef.current = abortController;

      setIsOfflineError(false);
      setActiveError(null);
      setErrorSubstate('api_or_recorder');
      setFlowState('uploading');

      try {
        const audioBase64 = await adapterRef.current.readAudioBase64(result.uri);
        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        if (!parseFn) {
          throw new Error('Dịch vụ phân tích giọng nói hiện chưa khả dụng.');
        }

        setFlowState('processing');
        const parsedDraft = await parseFn(
          {
            audio_base64: audioBase64,
            mime_type: result.mimeType || 'audio/m4a',
            duration_ms: clampRecordingDurationMs(result.durationMillis, elapsedMs),
          },
          { signal: abortController.signal }
        );

        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        startProgressiveReveal(parsedDraft);
      } catch (err) {
        if (
          abortController.signal.aborted ||
          !isMountedRef.current ||
          (isApiError(err) && err.code === 'ABORTED')
        ) {
          return;
        }
        const resolved = resolveVoiceError(err);
        setIsOfflineError(resolved.isOffline);
        setErrorSubstate('api_or_recorder');
        setActiveError(resolved.message);
        setFlowState('error');
      } finally {
        if (uploadAbortRef.current === abortController) {
          uploadAbortRef.current = null;
        }
        adapterRef.current.deleteTempFile(result.uri);
      }
    },
    [
      abortInFlightUpload,
      clearRevealTimer,
      onRecordingComplete,
      setActiveError,
      setFlowState,
      startProgressiveReveal,
    ]
  );

  const handleRecorderError = useCallback(
    (error: Error) => {
      setIsOfflineError(false);
      setErrorSubstate('api_or_recorder');
      setActiveError(error.message || 'Không thể ghi âm lúc này.');
      setFlowState('error');
    },
    [setActiveError, setFlowState]
  );

  const handleRetryRecording = useCallback(() => {
    cleanupCapturedTempFile();
    abortInFlightUpload();
    clearRevealTimer();
    setIsCapturedFallback(false);
    setIsOfflineError(false);
    setRevealedText('');
    setActiveDraft(null);
    setFlowState('requesting_permission');
    setActiveError(null);
    setErrorSubstate('api_or_recorder');
    void ensureMicPermission(adapterRef.current, true).then((outcome) => {
      if (isMountedRef.current) {
        applyPermissionOutcome(outcome);
      }
    });
  }, [
    abortInFlightUpload,
    applyPermissionOutcome,
    cleanupCapturedTempFile,
    clearRevealTimer,
    setActiveDraft,
    setActiveError,
    setFlowState,
  ]);

  const handleConfirmDraft = useCallback(
    (draftToSave: VoiceDraftLike) => {
      if (!hasValidConfirmableDraft(draftToSave)) {
        return;
      }

      const fallbackDate = ledger?.selectedDate ?? formatCurrentIsoDate();
      ledger?.addTransaction(draftToTransactionInput(draftToSave, fallbackDate));
      handleClose();
    },
    [handleClose, ledger]
  );

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
        {flowState === 'recording' && !isCapturedFallback ? (
          <View style={[styles.recordingContainer, shadows.lg]}>
            <Text style={styles.recordingHint}>
              Nói khoản chi của bạn (tối đa 30 giây)
            </Text>
            <VoiceRecordingBar
              adapter={adapter}
              onCancel={handleClose}
              onRecordingComplete={(result) => {
                void handleRecordingComplete(result);
              }}
              onError={handleRecorderError}
            />
          </View>
        ) : (
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.cardScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.card, shadows.lg]}>
              {isCapturedFallback && (
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

              {!isCapturedFallback && flowState === 'requesting_permission' && (
                <View style={styles.section}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.title}>Đang kiểm tra quyền micro…</Text>
                  <Text style={styles.body}>
                    Vui lòng cho phép CARENTA sử dụng micro để ghi âm khoản chi.
                  </Text>
                  <Button title="Hủy" variant="outline" onPress={handleClose} />
                </View>
              )}

              {!isCapturedFallback && (flowState === 'uploading' || flowState === 'processing') && (
                <View testID="voice-processing-view" style={styles.section}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text accessibilityRole="header" style={styles.title}>
                    Đang xử lý giọng nói…
                  </Text>
                  <Text style={styles.body}>
                    CARENTA đang chuyển giọng nói thành bản nháp khoản chi. Âm thanh sẽ được xóa ngay sau khi xử lý.
                  </Text>
                  <Button title="Hủy" variant="outline" onPress={handleClose} />
                </View>
              )}

              {!isCapturedFallback && flowState === 'revealing' && (
                <View testID="voice-revealing-view" style={styles.section}>
                  <Text accessibilityRole="header" style={styles.title}>
                    Đã nhận diện giọng nói
                  </Text>
                  <View style={styles.revealBox}>
                    <Text testID="voice-revealing-transcript" style={styles.revealText}>
                      {revealedText || 'Đang hoàn tất bản nháp…'}
                    </Text>
                  </View>
                  <Button title="Hủy" variant="outline" onPress={handleClose} />
                </View>
              )}

              {!isCapturedFallback && !onDraftReady && flowState === 'review' && activeDraft && (
                <VoiceDraftReviewSheet
                  draft={activeDraft}
                  onConfirm={handleConfirmDraft}
                  onEditManual={manualEntryHandler ? handleManualFallback : undefined}
                  onCancel={handleClose}
                />
              )}

              {!isCapturedFallback &&
                flowState === 'error' &&
                errorSubstate === 'permission_denied' && (
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

              {!isCapturedFallback &&
                flowState === 'error' &&
                errorSubstate === 'permission_blocked' && (
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

              {!isCapturedFallback &&
                flowState === 'error' &&
                errorSubstate === 'api_or_recorder' && (
                  <View testID="voice-error-view" style={styles.section}>
                    <Text accessibilityRole="header" style={styles.title}>
                      {isOfflineError
                        ? 'Không có kết nối mạng'
                        : 'Không thể xử lý giọng nói'}
                    </Text>
                    <Text testID="voice-error-message" style={styles.body}>
                      {activeErrorMessage ?? 'Đã xảy ra lỗi khi xử lý giọng nói.'}
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
          </ScrollView>
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
  parseVoiceCapture,
  onRecordingComplete,
  onDraftReady,
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
            parseVoiceCapture={parseVoiceCapture}
            onClose={handleClose}
            onRecordingComplete={onRecordingComplete}
            onDraftReady={onDraftReady}
            onOpenManualEntry={onOpenManualEntry}
          />
        ) : (
          <ExpoVoiceCaptureModalBody
            parseVoiceCapture={parseVoiceCapture}
            onClose={handleClose}
            onRecordingComplete={onRecordingComplete}
            onDraftReady={onDraftReady}
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
    maxHeight: '90%',
  },
  cardScrollContent: {
    flexGrow: 0,
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
  revealBox: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  revealText: {
    ...typography.subheading,
    color: colors.text,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

export default VoiceCaptureModal;
