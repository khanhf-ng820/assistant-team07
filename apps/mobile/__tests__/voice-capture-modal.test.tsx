import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { CaptureChooser } from '../src/components/CaptureChooser';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { VoiceCaptureModal } from '../src/components/voice/VoiceCaptureModal';
import { LedgerProvider } from '../src/context/LedgerContext';
import { VoiceCaptureProvider, useVoiceCapture } from '../src/context/VoiceCaptureContext';
import type {
  VoicePermissionResult,
  VoiceRecorderAdapter,
  VoiceRecordingResult,
} from '../src/voice/voiceRecorderAdapter';

function createMockVoiceAdapter(initial?: {
  getPermission?: () => Promise<VoicePermissionResult>;
  requestPermission?: () => Promise<VoicePermissionResult>;
}): VoiceRecorderAdapter {
  return {
    getPermission: jest.fn(
      initial?.getPermission ??
        (async () => ({ granted: false, canAskAgain: true, status: 'undetermined' }))
    ),
    requestPermission: jest.fn(
      initial?.requestPermission ??
        (async () => ({ granted: true, canAskAgain: true, status: 'granted' }))
    ),
    start: jest.fn(async () => {}),
    stop: jest.fn(
      async (): Promise<VoiceRecordingResult> => ({
        uri: 'file:///tmp/modal-recording.m4a',
        durationMillis: 1500,
        mimeType: 'audio/m4a',
      })
    ),
    cancel: jest.fn(async () => {}),
    deleteTempFile: jest.fn(),
    readAudioBase64: jest.fn(async () => 'AAAA'),
    status: {
      isRecording: false,
      durationMillis: 0,
      meteringDb: -25,
    },
  };
}

function VoiceHarness({ adapter }: { adapter: VoiceRecorderAdapter }) {
  const [chooserOpen, setChooserOpen] = React.useState(true);
  return (
    <>
      <CaptureChooser visible={chooserOpen} onClose={() => setChooserOpen(false)} />
      <VoiceCaptureModal adapter={adapter} />
      <ManualEntryModal />
    </>
  );
}

describe('VoiceCaptureModal & VoiceCaptureContext flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens from CaptureChooser Ghi âm, records when granted, hands off URI, and deletes temp file on close', async () => {
    const adapter = createMockVoiceAdapter();
    const onComplete = jest.fn();

    await render(
      <LedgerProvider>
        <VoiceCaptureProvider>
          <CaptureChooser visible onClose={jest.fn()} />
          <VoiceCaptureModal adapter={adapter} onRecordingComplete={onComplete} />
        </VoiceCaptureProvider>
      </LedgerProvider>
    );

    const voiceOption = screen.getByRole('button', { name: 'Ghi âm' });
    expect(voiceOption).toBeEnabled();
    await fireEvent.press(voiceOption);

    await waitFor(() => {
      expect(screen.getByTestId('voice-recording-bar')).toBeTruthy();
      expect(adapter.start).toHaveBeenCalledTimes(1);
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Dừng ghi âm' }));
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({
        uri: 'file:///tmp/modal-recording.m4a',
        durationMillis: 1500,
        mimeType: 'audio/m4a',
      });
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }));
    expect(adapter.deleteTempFile).toHaveBeenCalledWith('file:///tmp/modal-recording.m4a');
  });

  it('supports retry after permission denial and opens recording once granted', async () => {
    const requestPermission = jest
      .fn<Promise<VoicePermissionResult>, []>()
      .mockResolvedValueOnce({ granted: false, canAskAgain: true, status: 'denied' })
      .mockResolvedValueOnce({ granted: true, canAskAgain: true, status: 'granted' });
    const adapter = createMockVoiceAdapter({ requestPermission });

    await render(
      <LedgerProvider>
        <VoiceCaptureProvider>
          <VoiceCaptureModal visible onClose={jest.fn()} adapter={adapter} />
        </VoiceCaptureProvider>
      </LedgerProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Cần quyền truy cập micro')).toBeVisible();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => {
      expect(screen.getByTestId('voice-recording-bar')).toBeTruthy();
    });
    expect(requestPermission).toHaveBeenCalledTimes(2);
  });

  it('offers OS settings link and Manual Entry fallback when permission is blocked', async () => {
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const adapter = createMockVoiceAdapter({
      getPermission: async () => ({ granted: false, canAskAgain: false, status: 'denied' }),
    });

    try {
      await render(
        <LedgerProvider>
          <VoiceCaptureProvider>
            <VoiceHarness adapter={adapter} />
          </VoiceCaptureProvider>
        </LedgerProvider>
      );

      await fireEvent.press(screen.getByRole('button', { name: 'Ghi âm' }));
      await waitFor(() => {
        expect(screen.getByText('Quyền micro đã bị chặn')).toBeVisible();
      });

      await fireEvent.press(screen.getByRole('button', { name: 'Mở cài đặt' }));
      expect(openSettingsSpy).toHaveBeenCalledTimes(1);

      await fireEvent.press(screen.getByRole('button', { name: 'Nhập thủ công' }));
      await waitFor(() => {
        expect(screen.getByText('Thêm khoản chi')).toBeVisible();
      });
    } finally {
      openSettingsSpy.mockRestore();
    }
  });

  it('throws when useVoiceCapture is called outside VoiceCaptureProvider', async () => {
    function BrokenConsumer() {
      useVoiceCapture();
      return null;
    }

    await expect(render(<BrokenConsumer />)).rejects.toThrow(
      'useVoiceCapture must be used within a VoiceCaptureProvider'
    );
  });
});
