import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  VoiceRecordingBar,
  WAVEFORM_BAR_COUNT,
} from '../src/components/voice/VoiceRecordingBar';
import type {
  VoiceRecorderAdapter,
  VoiceRecorderStatus,
  VoiceRecordingResult,
} from '../src/voice/voiceRecorderAdapter';

function createFakeAdapter(overrides?: Partial<VoiceRecorderAdapter>): {
  adapter: VoiceRecorderAdapter;
  setStatus: (next: Partial<VoiceRecorderStatus>) => void;
} {
  let status: VoiceRecorderStatus = {
    isRecording: true,
    durationMillis: 0,
    meteringDb: -30,
  };

  const adapter: VoiceRecorderAdapter = {
    requestPermission: jest.fn(async () => ({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    })),
    getPermission: jest.fn(async () => ({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    })),
    start: jest.fn(async () => {}),
    stop: jest.fn(
      async (): Promise<VoiceRecordingResult> => ({
        uri: 'file:///tmp/recording.m4a',
        durationMillis: status.durationMillis || 2400,
        mimeType: 'audio/m4a',
      })
    ),
    cancel: jest.fn(async () => {}),
    deleteTempFile: jest.fn(),
    readAudioBase64: jest.fn(async () => 'AAAA'),
    get status() {
      return status;
    },
    ...overrides,
  };

  return {
    adapter,
    setStatus: (next) => {
      status = { ...status, ...next };
    },
  };
}

describe('VoiceRecordingBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders trash cancel, waveform, 0:00 / 0:30 timer, and red stop button with >= 48dp targets and starts recording', async () => {
    const { adapter } = createFakeAdapter();
    const onComplete = jest.fn();
    const onCancel = jest.fn();

    await render(
      <VoiceRecordingBar
        adapter={adapter}
        onRecordingComplete={onComplete}
        onCancel={onCancel}
      />
    );

    await waitFor(() => {
      expect(adapter.start).toHaveBeenCalledTimes(1);
    });

    const cancelBtn = screen.getByRole('button', { name: 'Hủy ghi âm' });
    const stopBtn = screen.getByRole('button', { name: 'Dừng ghi âm' });
    expect(screen.getByTestId('voice-waveform')).toBeTruthy();
    expect(screen.getByTestId('voice-recording-timer')).toHaveTextContent('0:00 / 0:30');

    const cancelStyle = StyleSheet.flatten(cancelBtn.props.style);
    const stopStyle = StyleSheet.flatten(stopBtn.props.style);
    expect(cancelStyle.minWidth ?? cancelStyle.width).toBeGreaterThanOrEqual(48);
    expect(cancelStyle.minHeight ?? cancelStyle.height).toBeGreaterThanOrEqual(48);
    expect(stopStyle.minWidth ?? stopStyle.width).toBeGreaterThanOrEqual(48);
    expect(stopStyle.minHeight ?? stopStyle.height).toBeGreaterThanOrEqual(48);
  });

  it('samples dBFS metering every 100ms, falls back to subtle pulse when undefined, and advances timer', async () => {
    const { adapter, setStatus } = createFakeAdapter();
    setStatus({ meteringDb: 0, durationMillis: 0 });
    const onComplete = jest.fn();
    const onCancel = jest.fn();

    await render(
      <VoiceRecordingBar
        adapter={adapter}
        onRecordingComplete={onComplete}
        onCancel={onCancel}
      />
    );

    await waitFor(() => {
      expect(adapter.start).toHaveBeenCalledTimes(1);
    });

    const lastBarIndex = WAVEFORM_BAR_COUNT - 1;

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    const loudBarStyle = StyleSheet.flatten(
      screen.getByTestId(`voice-waveform-bar-${lastBarIndex}`).props.style
    );
    expect(loudBarStyle.height).toBe(28);

    setStatus({ meteringDb: -60 });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    const quietBarStyle = StyleSheet.flatten(
      screen.getByTestId(`voice-waveform-bar-${lastBarIndex}`).props.style
    );
    expect(quietBarStyle.height).toBe(6);

    setStatus({ meteringDb: undefined });
    await act(async () => {
      jest.advanceTimersByTime(800);
    });
    const pulseBarStyle = StyleSheet.flatten(
      screen.getByTestId(`voice-waveform-bar-${lastBarIndex}`).props.style
    );
    expect(pulseBarStyle.height).toBeGreaterThan(6);
    expect(pulseBarStyle.height).toBeLessThan(28);
    expect(screen.getByTestId('voice-recording-timer')).toHaveTextContent('0:01 / 0:30');
  });

  it('stops idempotently on repeated stop taps without duplicate submissions', async () => {
    const { adapter } = createFakeAdapter();
    const onComplete = jest.fn();
    const onCancel = jest.fn();

    await render(
      <VoiceRecordingBar
        adapter={adapter}
        onRecordingComplete={onComplete}
        onCancel={onCancel}
      />
    );
    await waitFor(() => expect(adapter.start).toHaveBeenCalledTimes(1));

    const stopBtn = screen.getByRole('button', { name: 'Dừng ghi âm' });
    await fireEvent.press(stopBtn);
    await fireEvent.press(stopBtn);

    await waitFor(() => {
      expect(adapter.stop).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('auto-stops once at 30 seconds across both JS timer and durationMillis guard', async () => {
    const { adapter, setStatus } = createFakeAdapter();
    const onComplete = jest.fn();
    const onCancel = jest.fn();

    const { rerender } = await render(
      <VoiceRecordingBar
        adapter={adapter}
        onRecordingComplete={onComplete}
        onCancel={onCancel}
      />
    );
    await waitFor(() => expect(adapter.start).toHaveBeenCalledTimes(1));

    setStatus({ durationMillis: 30_000 });
    await rerender(
      <VoiceRecordingBar
        adapter={adapter}
        onRecordingComplete={onComplete}
        onCancel={onCancel}
      />
    );

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => {
      expect(adapter.stop).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('cancels recording on trash press and on unmount without calling onRecordingComplete', async () => {
    const { adapter } = createFakeAdapter();
    const onComplete = jest.fn();
    const onCancel = jest.fn();

    const { unmount } = await render(
      <VoiceRecordingBar
        adapter={adapter}
        onRecordingComplete={onComplete}
        onCancel={onCancel}
      />
    );
    await waitFor(() => expect(adapter.start).toHaveBeenCalledTimes(1));

    await fireEvent.press(screen.getByRole('button', { name: 'Hủy ghi âm' }));
    await waitFor(() => {
      expect(adapter.cancel).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
    expect(onComplete).not.toHaveBeenCalled();

    // Unmounting after settlement should not cancel a second time
    await unmount();
    expect(adapter.cancel).toHaveBeenCalledTimes(1);

    // Unmounting mid-recording cancels and cleans up once
    const second = createFakeAdapter();
    const secondRender = await render(
      <VoiceRecordingBar
        adapter={second.adapter}
        onRecordingComplete={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    await waitFor(() => expect(second.adapter.start).toHaveBeenCalledTimes(1));
    await secondRender.unmount();
    expect(second.adapter.cancel).toHaveBeenCalledTimes(1);
  });
});
