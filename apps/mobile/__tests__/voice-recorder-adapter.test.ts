import { act, renderHook } from '@testing-library/react-native';
import {
  deleteTempRecording,
  formatRecordingTimer,
  normalizeMeteringDb,
  readRecordingBase64,
  useExpoVoiceRecorderAdapter,
} from '../src/voice/voiceRecorderAdapter';

const mockRecord = jest.fn();
const mockStop = jest.fn<Promise<void>, []>();
const mockPrepareToRecordAsync = jest.fn<Promise<void>, [unknown?]>();
const mockRecorder: {
  uri: string | null;
  isRecording: boolean;
  record: jest.Mock;
  stop: jest.Mock<Promise<void>, []>;
  prepareToRecordAsync: jest.Mock<Promise<void>, [unknown?]>;
} = {
  uri: 'file:///tmp/voice-capture.m4a',
  isRecording: false,
  record: mockRecord,
  stop: mockStop,
  prepareToRecordAsync: mockPrepareToRecordAsync,
};

let mockRecorderState = {
  canRecord: true,
  isRecording: false,
  durationMillis: 0,
  fileSize: 0,
  mediaServicesDidReset: false,
  metering: undefined as number | undefined,
  url: 'file:///tmp/voice-capture.m4a' as string | null,
};

const mockSetAudioModeAsync = jest.fn<Promise<void>, [unknown]>();
const mockRequestRecordingPermissionsAsync = jest.fn();
const mockGetRecordingPermissionsAsync = jest.fn();
const mockUseAudioRecorder = jest.fn<typeof mockRecorder, [unknown]>(() => mockRecorder);
const mockUseAudioRecorderState = jest.fn<typeof mockRecorderState, [unknown, number?]>(
  () => mockRecorderState
);

jest.mock('expo-audio', () => ({
  RecordingPresets: {
    HIGH_QUALITY: {
      extension: '.m4a',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
      ios: { outputFormat: 'aac ', audioQuality: 127 },
      web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
    },
  },
  useAudioRecorder: (options: unknown) => mockUseAudioRecorder(options),
  useAudioRecorderState: (recorder: unknown, interval?: number) =>
    mockUseAudioRecorderState(recorder, interval),
  setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode),
  requestRecordingPermissionsAsync: () => mockRequestRecordingPermissionsAsync(),
  getRecordingPermissionsAsync: () => mockGetRecordingPermissionsAsync(),
}));

const mockFileInstances = new Map<
  string,
  { uri: string; exists: boolean; delete: jest.Mock; base64: jest.Mock<Promise<string>, []> }
>();

function mockCreateFile(uri: string) {
  const existing = mockFileInstances.get(uri);
  if (existing) {
    return existing;
  }
  const instance = {
    uri,
    exists: true,
    delete: jest.fn(),
    base64: jest.fn(async () => 'AAAA'),
  };
  mockFileInstances.set(uri, instance);
  return instance;
}

jest.mock('expo-file-system', () => ({
  File: jest.fn((uri: string) => mockCreateFile(uri)),
}));

describe('voiceRecorderAdapter helpers', () => {
  beforeEach(() => {
    mockFileInstances.clear();
    mockRecorder.uri = 'file:///tmp/voice-capture.m4a';
    mockRecorder.isRecording = false;
    mockRecorderState = {
      canRecord: true,
      isRecording: false,
      durationMillis: 0,
      fileSize: 0,
      mediaServicesDidReset: false,
      metering: undefined,
      url: 'file:///tmp/voice-capture.m4a',
    };
  });

  it('normalizes dBFS metering clamped to [-60, 0] and returns null when undefined', () => {
    expect(normalizeMeteringDb(undefined)).toBeNull();
    expect(normalizeMeteringDb(Number.NaN)).toBeNull();
    expect(normalizeMeteringDb(-60)).toBe(0);
    expect(normalizeMeteringDb(-90)).toBe(0);
    expect(normalizeMeteringDb(-30)).toBe(0.5);
    expect(normalizeMeteringDb(0)).toBe(1);
    expect(normalizeMeteringDb(6)).toBe(1);
  });

  it('formats recording duration against max 30s cap as m:ss / m:ss', () => {
    expect(formatRecordingTimer(0)).toBe('0:00 / 0:30');
    expect(formatRecordingTimer(5400)).toBe('0:05 / 0:30');
    expect(formatRecordingTimer(30_000)).toBe('0:30 / 0:30');
    expect(formatRecordingTimer(35_000)).toBe('0:30 / 0:30');
    expect(formatRecordingTimer(-500)).toBe('0:00 / 0:30');
  });

  it('deletes existing temp file via SDK 58 File API and ignores missing or empty URIs', () => {
    const existingUri = 'file:///tmp/exists.m4a';
    const missingUri = 'file:///tmp/missing.m4a';
    const missingFile = mockCreateFile(missingUri);
    missingFile.exists = false;

    deleteTempRecording(existingUri);
    deleteTempRecording(missingUri);
    deleteTempRecording(null);
    deleteTempRecording(undefined);

    expect(mockFileInstances.get(existingUri)?.delete).toHaveBeenCalledTimes(1);
    expect(missingFile.delete).not.toHaveBeenCalled();
  });

  it('reads base64 content via SDK 58 File API', async () => {
    const uri = 'file:///tmp/voice-capture.m4a';
    const base64 = await readRecordingBase64(uri);
    expect(base64).toBe('AAAA');
    expect(mockFileInstances.get(uri)?.base64).toHaveBeenCalledTimes(1);
  });
});

describe('useExpoVoiceRecorderAdapter', () => {
  beforeEach(() => {
    mockFileInstances.clear();
    mockRecorder.uri = 'file:///tmp/voice-capture.m4a';
    mockRecorder.isRecording = false;
    mockStop.mockResolvedValue(undefined);
    mockPrepareToRecordAsync.mockResolvedValue(undefined);
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockRequestRecordingPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    });
    mockGetRecordingPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    });
    mockRecorderState = {
      canRecord: true,
      isRecording: false,
      durationMillis: 0,
      fileSize: 0,
      mediaServicesDidReset: false,
      metering: -24,
      url: 'file:///tmp/voice-capture.m4a',
    };
  });

  it('configures metering upfront, polls at 100ms, and records with forDuration 30', async () => {
    const { result } = await renderHook(() => useExpoVoiceRecorderAdapter());

    expect(mockUseAudioRecorder).toHaveBeenCalledWith(
      expect.objectContaining({ isMeteringEnabled: true })
    );
    expect(mockUseAudioRecorderState).toHaveBeenCalledWith(mockRecorder, 100);
    expect(result.current.status).toEqual({
      isRecording: false,
      durationMillis: 0,
      meteringDb: -24,
    });

    await act(async () => {
      await result.current.start();
    });

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    expect(mockPrepareToRecordAsync).toHaveBeenCalledWith(
      expect.objectContaining({ isMeteringEnabled: true })
    );
    expect(mockRecord).toHaveBeenCalledWith({ forDuration: 30 });
  });

  it('delegates permission checks and requests to expo-audio', async () => {
    const { result } = await renderHook(() => useExpoVoiceRecorderAdapter());

    const current = await result.current.getPermission();
    const requested = await result.current.requestPermission();

    expect(mockGetRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockRequestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(current.granted).toBe(true);
    expect(requested.granted).toBe(true);
  });

  it('always resets allowsRecording to false in finally on stop even if stop rejects', async () => {
    mockRecorderState.isRecording = true;
    mockRecorderState.durationMillis = 4200;
    const { result } = await renderHook(() => useExpoVoiceRecorderAdapter());

    await act(async () => {
      await result.current.start();
    });

    let recording: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      recording = await result.current.stop();
    });

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
    expect(recording).toEqual({
      uri: 'file:///tmp/voice-capture.m4a',
      durationMillis: 4200,
      mimeType: 'audio/m4a',
    });

    mockStop.mockRejectedValueOnce(new Error('native stop failed'));
    await expect(result.current.stop()).rejects.toThrow('native stop failed');
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
  });

  it('cancels recording, resets audio mode, and deletes temp file via File API', async () => {
    mockRecorder.isRecording = true;
    const { result } = await renderHook(() => useExpoVoiceRecorderAdapter());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.cancel();
    });

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
    expect(mockFileInstances.get('file:///tmp/voice-capture.m4a')?.delete).toHaveBeenCalledTimes(1);
  });

  it('cleans up active recording, audio mode, and temp file on unmount', async () => {
    mockRecorder.isRecording = true;
    const { result, unmount } = await renderHook(() => useExpoVoiceRecorderAdapter());

    await act(async () => {
      await result.current.start();
    });

    await unmount();

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockSetAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
    expect(mockFileInstances.get('file:///tmp/voice-capture.m4a')?.delete).toHaveBeenCalledTimes(1);
  });

  it('falls back to JS elapsed duration on fast stop (durationMillis: 0) and clamps overshoot past 30s to 30_000', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-11-28T10:00:00.000Z'));
      const { result } = await renderHook(() => useExpoVoiceRecorderAdapter());

      mockRecorderState.isRecording = true;
      mockRecorderState.durationMillis = 0;
      await act(async () => {
        await result.current.start();
      });
      await act(async () => {
        jest.advanceTimersByTime(45);
      });

      let fastStopResult: Awaited<ReturnType<typeof result.current.stop>> = null;
      await act(async () => {
        fastStopResult = await result.current.stop();
      });
      expect(fastStopResult).toEqual({
        uri: 'file:///tmp/voice-capture.m4a',
        durationMillis: 45,
        mimeType: 'audio/m4a',
      });

      await act(async () => {
        await result.current.start();
      });
      let zeroElapsedResult: Awaited<ReturnType<typeof result.current.stop>> = null;
      await act(async () => {
        zeroElapsedResult = await result.current.stop();
      });
      expect(zeroElapsedResult).toEqual({
        uri: 'file:///tmp/voice-capture.m4a',
        durationMillis: 1,
        mimeType: 'audio/m4a',
      });

      mockRecorderState.durationMillis = 30_080;
      await act(async () => {
        await result.current.start();
      });
      let overshootResult: Awaited<ReturnType<typeof result.current.stop>> = null;
      await act(async () => {
        overshootResult = await result.current.stop();
      });
      expect(overshootResult).toEqual({
        uri: 'file:///tmp/voice-capture.m4a',
        durationMillis: 30_000,
        mimeType: 'audio/m4a',
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
