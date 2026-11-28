import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import {
  formatRecordingTimer,
  MAX_RECORDING_DURATION_MS,
  METERING_POLL_INTERVAL_MS,
  normalizeMeteringDb,
  useExpoVoiceRecorderAdapter,
  type VoiceRecorderAdapter,
  type VoiceRecordingResult,
} from '../../voice/voiceRecorderAdapter';

export const WAVEFORM_BAR_COUNT = 20;
const MIN_BAR_HEIGHT = 6;
const MAX_BAR_HEIGHT = 28;
const PULSE_FALLBACK_LEVELS = [0.22, 0.34, 0.28, 0.4, 0.26, 0.32];

export interface VoiceRecordingBarProps {
  adapter?: VoiceRecorderAdapter;
  onRecordingComplete: (result: VoiceRecordingResult) => void;
  onCancel: () => void;
  onError?: (error: Error) => void;
  maxDurationMs?: number;
  autoStart?: boolean;
}

interface VoiceRecordingBarContentProps {
  adapter: VoiceRecorderAdapter;
  onRecordingComplete: (result: VoiceRecordingResult) => void;
  onCancel: () => void;
  onError?: (error: Error) => void;
  maxDurationMs: number;
  autoStart: boolean;
}

function createInitialBars(): number[] {
  return Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0.12);
}

function VoiceRecordingBarContent({
  adapter,
  onRecordingComplete,
  onCancel,
  onError,
  maxDurationMs,
  autoStart,
}: VoiceRecordingBarContentProps) {
  const [bars, setBars] = useState<number[]>(createInitialBars);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const adapterRef = useRef(adapter);
  const onCompleteRef = useRef(onRecordingComplete);
  const onCancelRef = useRef(onCancel);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  useEffect(() => {
    onCompleteRef.current = onRecordingComplete;
  }, [onRecordingComplete]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const settledRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTickRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (capTimeoutRef.current !== null) {
      clearTimeout(capTimeoutRef.current);
      capTimeoutRef.current = null;
    }
  }, []);

  const handleStop = useCallback(async () => {
    if (settledRef.current) {
      return;
    }
    settledRef.current = true;
    clearTimers();

    try {
      const result = await adapterRef.current.stop();
      if (result) {
        onCompleteRef.current(result);
      } else {
        onCancelRef.current();
      }
    } catch (error) {
      if (onErrorRef.current) {
        onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
      } else {
        onCancelRef.current();
      }
    }
  }, [clearTimers]);

  const handleCancel = useCallback(async () => {
    if (settledRef.current) {
      return;
    }
    settledRef.current = true;
    clearTimers();

    try {
      await adapterRef.current.cancel();
    } finally {
      onCancelRef.current();
    }
  }, [clearTimers]);

  useEffect(() => {
    if (!autoStart) {
      return;
    }

    let isMounted = true;

    const beginRecording = async () => {
      try {
        await adapterRef.current.start();
        if (!isMounted || settledRef.current) {
          return;
        }

        pollIntervalRef.current = setInterval(() => {
          if (settledRef.current) {
            return;
          }
          const normalized = normalizeMeteringDb(adapterRef.current.status.meteringDb);
          const nextLevel =
            normalized !== null
              ? normalized
              : PULSE_FALLBACK_LEVELS[pulseTickRef.current % PULSE_FALLBACK_LEVELS.length];
          pulseTickRef.current += 1;

          setBars((prev) => [...prev.slice(1), nextLevel]);
          setElapsedMs((prev) => Math.min(maxDurationMs, prev + METERING_POLL_INTERVAL_MS));
        }, METERING_POLL_INTERVAL_MS);

        capTimeoutRef.current = setTimeout(() => {
          void handleStop();
        }, maxDurationMs);
      } catch (error) {
        if (!isMounted || settledRef.current) {
          return;
        }
        settledRef.current = true;
        clearTimers();
        if (onErrorRef.current) {
          onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
        } else {
          onCancelRef.current();
        }
      }
    };

    void beginRecording();

    return () => {
      isMounted = false;
      clearTimers();
      if (!settledRef.current) {
        settledRef.current = true;
        void adapterRef.current.cancel();
      }
    };
  }, [autoStart, clearTimers, handleStop, maxDurationMs]);

  useEffect(() => {
    if (adapter.status.durationMillis >= maxDurationMs) {
      void handleStop();
    }
  }, [adapter.status.durationMillis, handleStop, maxDurationMs]);

  const displayedDurationMs = Math.min(
    maxDurationMs,
    Math.max(adapter.status.durationMillis, elapsedMs)
  );

  return (
    <View testID="voice-recording-bar" style={[styles.container, shadows.md]}>
      <Pressable
        testID="voice-cancel-button"
        accessibilityRole="button"
        accessibilityLabel="Hủy ghi âm"
        onPress={() => {
          void handleCancel();
        }}
        style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
      >
        <Text style={styles.cancelIcon}>🗑️</Text>
      </Pressable>

      <View style={styles.centerTrack}>
        <View
          testID="voice-waveform"
          accessibilityLabel="Sóng âm thanh trực tiếp"
          style={styles.waveform}
        >
          {bars.map((level, index) => {
            const barHeight = Math.round(
              MIN_BAR_HEIGHT + level * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT)
            );
            return (
              <View
                key={index}
                testID={`voice-waveform-bar-${index}`}
                style={[styles.waveformBar, { height: barHeight }]}
              />
            );
          })}
        </View>
        <Text testID="voice-recording-timer" style={styles.timerText}>
          {formatRecordingTimer(displayedDurationMs, maxDurationMs)}
        </Text>
      </View>

      <Pressable
        testID="voice-stop-button"
        accessibilityRole="button"
        accessibilityLabel="Dừng ghi âm"
        onPress={() => {
          void handleStop();
        }}
        style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
      >
        <View style={styles.stopSquare} />
      </Pressable>
    </View>
  );
}

function ExpoVoiceRecordingBar(props: Omit<VoiceRecordingBarProps, 'adapter'>) {
  const adapter = useExpoVoiceRecorderAdapter();
  return (
    <VoiceRecordingBarContent
      adapter={adapter}
      onRecordingComplete={props.onRecordingComplete}
      onCancel={props.onCancel}
      onError={props.onError}
      maxDurationMs={props.maxDurationMs ?? MAX_RECORDING_DURATION_MS}
      autoStart={props.autoStart ?? true}
    />
  );
}

/**
 * Reusable Messenger-style bottom recording bar compatible standalone or inside VoiceRecorderShellModal's renderRecorder slot.
 */
export function VoiceRecordingBar({
  adapter,
  onRecordingComplete,
  onCancel,
  onError,
  maxDurationMs = MAX_RECORDING_DURATION_MS,
  autoStart = true,
}: VoiceRecordingBarProps) {
  if (adapter) {
    return (
      <VoiceRecordingBarContent
        adapter={adapter}
        onRecordingComplete={onRecordingComplete}
        onCancel={onCancel}
        onError={onError}
        maxDurationMs={maxDurationMs}
        autoStart={autoStart}
      />
    );
  }

  return (
    <ExpoVoiceRecordingBar
      onRecordingComplete={onRecordingComplete}
      onCancel={onCancel}
      onError={onError}
      maxDurationMs={maxDurationMs}
      autoStart={autoStart}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  cancelButton: {
    minWidth: 48,
    minHeight: 48,
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelIcon: {
    fontSize: 18,
  },
  centerTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryTint,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    gap: spacing.sm,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: MAX_BAR_HEIGHT,
  },
  waveformBar: {
    width: 3,
    borderRadius: radius.xs,
    backgroundColor: colors.primary,
  },
  timerText: {
    ...typography.captionBold,
    color: colors.primaryDark,
    fontVariant: ['tabular-nums'],
  },
  stopButton: {
    minWidth: 48,
    minHeight: 48,
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});

export default VoiceRecordingBar;
