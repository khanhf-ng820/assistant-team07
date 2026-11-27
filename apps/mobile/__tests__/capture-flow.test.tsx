import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppState, AppStateStatus, Pressable, Text } from 'react-native';
import { PermissionAdapters, RawPermissionResponse } from '../src/capture/permissions';
import { CaptureChooser } from '../src/components/CaptureChooser';
import { PermissionPromptModal } from '../src/components/capture/PermissionPromptModal';
import { ReceiptCameraShellModal } from '../src/components/capture/ReceiptCameraShellModal';
import { VoiceRecorderShellModal } from '../src/components/capture/VoiceRecorderShellModal';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { CaptureProvider, useCapture } from '../src/context/CaptureContext';
import { LedgerProvider } from '../src/context/LedgerContext';

function CaptureHarness({
  adapters,
  onOcrGranted,
  onVoiceGranted,
}: {
  adapters?: PermissionAdapters;
  onOcrGranted?: () => void;
  onVoiceGranted?: () => void;
}) {
  const [chooserVisible, setChooserVisible] = React.useState(false);

  return (
    <LedgerProvider>
      <CaptureProvider
        permissionAdapters={adapters}
        onOcrGranted={onOcrGranted}
        onVoiceGranted={onVoiceGranted}
      >
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
  const { captureFlow, startCapture, retryPermission } = useCapture();
  return (
    <>
      <Text testID="capture-flow-state">{captureFlow}</Text>
      <Pressable testID="open-chooser" onPress={onOpenChooser}>
        <Text>Open</Text>
      </Pressable>
      <Pressable testID="trigger-voice-directly" onPress={() => void startCapture('voice')}>
        <Text>Voice</Text>
      </Pressable>
      <Pressable testID="trigger-retry-directly" onPress={() => void retryPermission()}>
        <Text>Retry</Text>
      </Pressable>
    </>
  );
}

describe('Phase 2 capture flow & hardware permissions', () => {
  it('launches receipt camera shell when camera permission is granted and keeps camera open if optional gallery prompt is dismissed', async () => {
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

    // Dismissing gallery prompt returns user cleanly to the camera viewfinder
    await fireEvent.press(screen.getByTestId('permission-close-button'));
    expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('camera_preview');
  });

  it('handles denied permission with retry recovery and guards against concurrent retry taps', async () => {
    let resolveSecondAttempt!: (value: RawPermissionResponse) => void;
    const secondAttemptPromise = new Promise<RawPermissionResponse>((resolve) => {
      resolveSecondAttempt = resolve;
    });

    const requestCamera = jest
      .fn()
      .mockResolvedValueOnce({ status: 'denied', granted: false, canAskAgain: true })
      .mockReturnValueOnce(secondAttemptPromise);

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

    // Pressing retry enters requesting_permission and blocks any concurrent retry invocation
    await fireEvent.press(screen.getByTestId('permission-retry-button'));
    expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('requesting_permission');
    await fireEvent.press(screen.getByTestId('trigger-retry-directly'));
    expect(requestCamera).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecondAttempt({ status: 'granted', granted: true, canAskAgain: true });
    });

    await waitFor(() => {
      expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('camera_preview');
    });
  });

  it('handles permanently blocked microphone permission with OS settings auto-resume and manual fallback', async () => {
    let appStateHandler: ((state: AppStateStatus) => void) | undefined;
    const addEventListenerSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateHandler = listener;
        return { remove: jest.fn() };
      });

    const getMicrophone = jest
      .fn()
      .mockResolvedValueOnce({ status: 'denied', granted: false, canAskAgain: false })
      .mockResolvedValueOnce({ status: 'granted', granted: true, canAskAgain: true });

    const openSettings = jest.fn();
    const adapters: PermissionAdapters = {
      getMicrophone,
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

    // Simulating returning from OS settings after user enables Microphone permission
    await act(async () => {
      appStateHandler?.('active');
    });

    await waitFor(() => {
      expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('recording');
    });

    // Manual fallback from voice shell still opens ManualEntryModal cleanly
    await fireEvent.press(screen.getByTestId('voice-fallback-manual-button'));
    expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('idle');
    expect(screen.getByText('Thêm khoản chi')).toBeTruthy();

    addEventListenerSpy.mockRestore();
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

  it('hands off directly to external OCR/Voice screen callbacks when granted without opening shell modals', async () => {
    const onOcrGranted = jest.fn();
    const onVoiceGranted = jest.fn();
    const adapters: PermissionAdapters = {
      getCamera: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
      getMicrophone: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
    };

    await render(
      <CaptureHarness
        adapters={adapters}
        onOcrGranted={onOcrGranted}
        onVoiceGranted={onVoiceGranted}
      />
    );
    await fireEvent.press(screen.getByTestId('open-chooser'));
    await fireEvent.press(screen.getByTestId('capture-option-ocr'));

    await waitFor(() => {
      expect(onOcrGranted).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('idle');
    expect(screen.queryByText('Camera đã sẵn sàng')).toBeNull();

    await fireEvent.press(screen.getByTestId('trigger-voice-directly'));
    await waitFor(() => {
      expect(onVoiceGranted).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('capture-flow-state')).toHaveTextContent('idle');
    expect(screen.queryByText('Micro đã sẵn sàng')).toBeNull();
  });
});
