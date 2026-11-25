import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PermissionAdapters } from '../src/capture/permissions';
import { CaptureChooser } from '../src/components/CaptureChooser';
import { PermissionPromptModal } from '../src/components/capture/PermissionPromptModal';
import { ReceiptCameraShellModal } from '../src/components/capture/ReceiptCameraShellModal';
import { VoiceRecorderShellModal } from '../src/components/capture/VoiceRecorderShellModal';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { CaptureProvider, useCapture } from '../src/context/CaptureContext';
import { LedgerProvider } from '../src/context/LedgerContext';
import { Pressable, Text } from 'react-native';

function CaptureHarness({ adapters }: { adapters?: PermissionAdapters }) {
  const [chooserVisible, setChooserVisible] = React.useState(false);

  return (
    <LedgerProvider>
      <CaptureProvider permissionAdapters={adapters}>
        <HarnessControls onOpenChooser={() => setChooserVisible(true)} />
        <CaptureChooser
          visible={chooserVisible}
          onClose={() => setChooserVisible(false)}
        />
        <PermissionPromptModal />
        <ReceiptCameraShellModal />
        <VoiceRecorderShellModal />
        <ManualEntryModal />
      </CaptureProvider>
    </LedgerProvider>
  );
}

function HarnessControls({ onOpenChooser }: { onOpenChooser: () => void }) {
  const { captureFlow, startCapture } = useCapture();
  return (
    <>
      <Text testID="capture-flow-state">{captureFlow}</Text>
      <Pressable testID="open-chooser" onPress={onOpenChooser}>
        <Text>Open</Text>
      </Pressable>
      <Pressable testID="trigger-voice-directly" onPress={() => void startCapture('voice')}>
        <Text>Voice</Text>
      </Pressable>
    </>
  );
}

describe('Phase 2 capture flow & hardware permissions', () => {
  it('launches receipt camera shell when camera permission is granted and checks gallery permission', async () => {
    const adapters: PermissionAdapters = {
      getCamera: jest.fn().mockResolvedValue({ status: 'undetermined', granted: false }),
      requestCamera: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
      getMediaLibrary: jest.fn().mockResolvedValue({ status: 'undetermined', granted: false }),
      requestMediaLibrary: jest
        .fn()
        .mockResolvedValue({ status: 'denied', granted: false, canAskAgain: true }),
    };

    await render(<CaptureHarness adapters={adapters} />);
    await fireEvent.press(screen.getByTestId('open-chooser'));
    await fireEvent.press(screen.getByTestId('capture-option-ocr'));

    await waitFor(() => {
      expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('camera_preview');
    });
    expect(screen.getByText('Camera đã sẵn sàng')).toBeTruthy();

    // Tapping gallery picker with denied media_library permission opens PermissionPromptModal
    await fireEvent.press(screen.getByTestId('ocr-pick-gallery-button'));
    await waitFor(() => {
      expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('permission_prompt');
    });
    expect(screen.getByText('Cần quyền truy cập Thư viện ảnh')).toBeTruthy();
  });

  it('handles denied permission with retry recovery to camera shell', async () => {
    const requestCamera = jest
      .fn()
      .mockResolvedValueOnce({ status: 'denied', granted: false, canAskAgain: true })
      .mockResolvedValueOnce({ status: 'granted', granted: true, canAskAgain: true });

    const adapters: PermissionAdapters = {
      getCamera: jest.fn().mockResolvedValue({ status: 'undetermined', granted: false }),
      requestCamera,
    };

    await render(<CaptureHarness adapters={adapters} />);
    await fireEvent.press(screen.getByTestId('open-chooser'));
    await fireEvent.press(screen.getByTestId('capture-option-ocr'));

    await waitFor(() => {
      expect(screen.getByTestId('permission-retry-button')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('permission-retry-button'));
    await waitFor(() => {
      expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('camera_preview');
    });
    expect(requestCamera).toHaveBeenCalledTimes(2);
  });

  it('handles permanently blocked microphone permission with OS settings and manual fallback', async () => {
    const openSettings = jest.fn();
    const adapters: PermissionAdapters = {
      getMicrophone: jest
        .fn()
        .mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false }),
      openSettings,
    };

    await render(<CaptureHarness adapters={adapters} />);
    await fireEvent.press(screen.getByTestId('open-chooser'));
    await fireEvent.press(screen.getByTestId('capture-option-voice'));

    await waitFor(() => {
      expect(screen.getByTestId('permission-open-settings-button')).toBeTruthy();
    });
    expect(screen.queryByTestId('permission-retry-button')).toBeNull();

    await fireEvent.press(screen.getByTestId('permission-open-settings-button'));
    expect(openSettings).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('permission-fallback-manual-button'));
    expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('idle');
    expect(screen.getByText('Thêm khoản chi')).toBeTruthy();
  });

  it('prevents launching a second capture flow while one session is active', async () => {
    const requestMicrophone = jest.fn();
    const adapters: PermissionAdapters = {
      getCamera: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
      getMicrophone: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
      requestMicrophone,
    };

    await render(<CaptureHarness adapters={adapters} />);
    await fireEvent.press(screen.getByTestId('open-chooser'));
    await fireEvent.press(screen.getByTestId('capture-option-ocr'));

    await waitFor(() => {
      expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('camera_preview');
    });

    // Attempt to start voice flow while camera_preview is active
    await fireEvent.press(screen.getByTestId('trigger-voice-directly'));
    expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('camera_preview');
    expect(adapters.getMicrophone).not.toHaveBeenCalled();
    expect(requestMicrophone).not.toHaveBeenCalled();
  });

  it('opens voice recorder shell when microphone permission is granted and cancels cleanly', async () => {
    const adapters: PermissionAdapters = {
      getMicrophone: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
    };

    await render(<CaptureHarness adapters={adapters} />);
    await fireEvent.press(screen.getByTestId('open-chooser'));
    await fireEvent.press(screen.getByTestId('capture-option-voice'));

    await waitFor(() => {
      expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('recording');
    });
    expect(screen.getByText('Micro đã sẵn sàng')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('voice-shell-cancel'));
    expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('idle');
  });
});
