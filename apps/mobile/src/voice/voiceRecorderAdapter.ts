import type { PermissionResponse } from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useMemo, useRef } from 'react';

type ExpoAudioModule = typeof import('expo-audio');

function getExpoAudio(): ExpoAudioModule {
  // Loaded lazily so Jest tests injecting a fake VoiceRecorderAdapter or mounting RootLayout
  // do not evaluate expo-audio's native prototype shims unless the native adapter hook runs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-audio') as ExpoAudioModule;
}

export interface VoicePermissionResult {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

export interface VoiceRecorderStatus {
  isRecording: boolean;
  durationMillis: number;
  meteringDb: number | undefined;
}

export interface VoiceRecordingResult {
  uri: string;
  durationMillis: number;
  mimeType: string;
}

export interface VoiceRecorderAdapter {
  requestPermission: () => Promise<VoicePermissionResult>;
  getPermission: () => Promise<VoicePermissionResult>;
  start: () => Promise<void>;
  stop: () => Promise<VoiceRecordingResult | null>;
  cancel: () => Promise<void>;
  deleteTempFile: (uri: string | null | undefined) => void;
  readAudioBase64: (uri: string) => Promise<string>;
  status: VoiceRecorderStatus;
}

export const MAX_RECORDING_SECONDS = 30;
export const MAX_RECORDING_DURATION_MS = MAX_RECORDING_SECONDS * 1000;
export const METERING_POLL_INTERVAL_MS = 100;
export const METERING_MIN_DB = -60;
export const METERING_MAX_DB = 0;

/**
 * Normalizes a dBFS metering reading from [-60, 0] into [0, 1].
 * Returns null when metering is unavailable or non-finite.
 */
export function normalizeMeteringDb(meteringDb: number | undefined): number | null {
  if (meteringDb === undefined || !Number.isFinite(meteringDb)) {
    return null;
  }
  const clamped = Math.min(METERING_MAX_DB, Math.max(METERING_MIN_DB, meteringDb));
  return (clamped - METERING_MIN_DB) / (METERING_MAX_DB - METERING_MIN_DB);
}

function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Formats recording progress as `m:ss / m:ss` clamped to `[0, maxMs]`.
 */
export function formatRecordingTimer(
  durationMs: number,
  maxMs: number = MAX_RECORDING_DURATION_MS
): string {
  const safeMaxMs = Math.max(0, maxMs);
  const clampedMs = Math.min(safeMaxMs, Math.max(0, durationMs));
  return `${formatSeconds(clampedMs / 1000)} / ${formatSeconds(safeMaxMs / 1000)}`;
}

/**
 * Deletes a temporary local recording file using SDK 58's modern File API.
 */
export function deleteTempRecording(uri: string | null | undefined): void {
  if (!uri) {
    return;
  }
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Best-effort temp cleanup: ignore missing or already-purged files.
  }
}

/**
 * Reads a recorded audio file as base64 using SDK 58's File API.
 */
export async function readRecordingBase64(uri: string): Promise<string> {
  const file = new File(uri);
  return file.base64();
}

function toPermissionResult(response: PermissionResponse): VoicePermissionResult {
  return {
    granted: Boolean(response.granted),
    canAskAgain: response.canAskAgain ?? true,
    status: String(response.status ?? (response.granted ? 'granted' : 'denied')),
  };
}

function inferMimeTypeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/m4a';
}

function getVoiceRecordingOptions() {
  const { RecordingPresets } = getExpoAudio();
  return {
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  };
}

/**
 * Wraps `expo-audio` recording hooks and SDK 58 `File` cleanup behind `VoiceRecorderAdapter`.
 */
export function useExpoVoiceRecorderAdapter(): VoiceRecorderAdapter {
  const {
    getRecordingPermissionsAsync,
    requestRecordingPermissionsAsync,
    setAudioModeAsync,
    useAudioRecorder,
    useAudioRecorderState,
  } = getExpoAudio();

  const recordingOptions = useMemo(() => getVoiceRecordingOptions(), []);
  const recorder = useAudioRecorder(recordingOptions);
  const recorderState = useAudioRecorderState(recorder, METERING_POLL_INTERVAL_MS);

  const recorderRef = useRef(recorder);
  const recorderStateRef = useRef(recorderState);
  const activeSessionRef = useRef(false);

  useEffect(() => {
    recorderRef.current = recorder;
  }, [recorder]);

  useEffect(() => {
    recorderStateRef.current = recorderState;
  }, [recorderState]);

  const requestPermission = useCallback(async () => {
    const response = await requestRecordingPermissionsAsync();
    return toPermissionResult(response);
  }, [requestRecordingPermissionsAsync]);

  const getPermission = useCallback(async () => {
    const response = await getRecordingPermissionsAsync();
    return toPermissionResult(response);
  }, [getRecordingPermissionsAsync]);

  const start = useCallback(async () => {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    try {
      await recorderRef.current.prepareToRecordAsync(getVoiceRecordingOptions());
      activeSessionRef.current = true;
      recorderRef.current.record({ forDuration: MAX_RECORDING_SECONDS });
    } catch (error) {
      activeSessionRef.current = false;
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      throw error;
    }
  }, [setAudioModeAsync]);

  const stop = useCallback(async (): Promise<VoiceRecordingResult | null> => {
    try {
      await recorderRef.current.stop();
    } finally {
      activeSessionRef.current = false;
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }

    const uri = recorderRef.current.uri ?? recorderStateRef.current.url;
    if (!uri) {
      return null;
    }

    return {
      uri,
      durationMillis: recorderStateRef.current.durationMillis,
      mimeType: inferMimeTypeFromUri(uri),
    };
  }, [setAudioModeAsync]);

  const cancel = useCallback(async () => {
    const currentRecorder = recorderRef.current;
    const isActive =
      activeSessionRef.current ||
      currentRecorder.isRecording ||
      recorderStateRef.current.isRecording;

    try {
      if (isActive) {
        await currentRecorder.stop().catch(() => {});
      }
    } finally {
      activeSessionRef.current = false;
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      const uri = currentRecorder.uri ?? recorderStateRef.current.url;
      deleteTempRecording(uri);
    }
  }, [setAudioModeAsync]);

  useEffect(() => {
    return () => {
      const currentRecorder = recorderRef.current;
      const isActive =
        activeSessionRef.current ||
        currentRecorder.isRecording ||
        recorderStateRef.current.isRecording;

      if (!isActive) {
        return;
      }

      activeSessionRef.current = false;
      const uri = currentRecorder.uri ?? recorderStateRef.current.url;
      void Promise.resolve(currentRecorder.stop())
        .catch(() => {})
        .finally(() => {
          void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
          deleteTempRecording(uri);
        });
    };
  }, [setAudioModeAsync]);

  const status = useMemo<VoiceRecorderStatus>(
    () => ({
      isRecording: recorderState.isRecording,
      durationMillis: recorderState.durationMillis,
      meteringDb: recorderState.metering,
    }),
    [recorderState.durationMillis, recorderState.isRecording, recorderState.metering]
  );

  return useMemo<VoiceRecorderAdapter>(
    () => ({
      requestPermission,
      getPermission,
      start,
      stop,
      cancel,
      deleteTempFile: deleteTempRecording,
      readAudioBase64: readRecordingBase64,
      status,
    }),
    [cancel, getPermission, requestPermission, start, status, stop]
  );
}
