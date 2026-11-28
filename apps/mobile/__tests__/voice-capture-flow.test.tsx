import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { VoiceCaptureDraft, VoiceCaptureRequest, VoiceDraftLike } from '../src/api/contracts';
import { ApiError, normalizeHttpError } from '../src/api/errors';
import { createFetchTransport } from '../src/api/transport';
import { AuthProvider } from '../src/auth/AuthContext';
import { CaptureChooser } from '../src/components/CaptureChooser';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { VoiceCaptureModal } from '../src/components/voice/VoiceCaptureModal';
import { LedgerProvider, useLedger } from '../src/context/LedgerContext';
import { VoiceCaptureProvider, useVoiceCapture } from '../src/context/VoiceCaptureContext';
import { createCarentaRuntime, type RequestOptions } from '../src/runtime/carentaRuntime';
import type { VoiceRecorderAdapter, VoiceRecordingResult } from '../src/voice/voiceRecorderAdapter';
import { createMemorySessionStorage } from './helpers/memorySessionStorage';

function createFakeVoiceAdapter(overrides?: Partial<VoiceRecorderAdapter>): VoiceRecorderAdapter {
  return {
    getPermission: jest.fn(async () => ({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    })),
    requestPermission: jest.fn(async () => ({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    })),
    start: jest.fn(async () => {}),
    stop: jest.fn(
      async (): Promise<VoiceRecordingResult> => ({
        uri: 'file:///tmp/voice-115.m4a',
        durationMillis: 2400,
        mimeType: 'audio/m4a',
      })
    ),
    cancel: jest.fn(async () => {}),
    deleteTempFile: jest.fn(),
    readAudioBase64: jest.fn(async () => 'UklGRg=='),
    status: {
      isRecording: true,
      durationMillis: 2400,
      meteringDb: -22,
    },
    ...overrides,
  };
}

function FlowObserver() {
  const { transactions, availableBalance } = useLedger();
  const { flowState } = useVoiceCapture();
  return (
    <>
      <VoiceCaptureTestMarker label="flow-state" value={flowState} />
      <VoiceCaptureTestMarker label="tx-count" value={String(transactions.length)} />
      <VoiceCaptureTestMarker label="balance" value={String(availableBalance)} />
    </>
  );
}

function VoiceCaptureTestMarker({ label, value }: { label: string; value: string }) {
  const { Text } = jest.requireActual('react-native');
  return <Text testID={label}>{value}</Text>;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Voice Capture end-to-end upload, reveal & review flow (#115)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uploads audio, displays loading without fake transcript, deletes temp file in finally, progressively reveals recognized_text, invokes onDraftReady, and closes without rendering built-in review sheet', async () => {
    const adapter = createFakeVoiceAdapter();
    const deferred = createDeferred<VoiceCaptureDraft>();
    const parseVoiceCapture = jest.fn(
      (_payload: VoiceCaptureRequest, _options?: RequestOptions) => deferred.promise
    );
    const onDraftReady = jest.fn<void, [VoiceDraftLike]>();

    await render(
      <LedgerProvider>
        <VoiceCaptureProvider>
          <FlowObserver />
          <CaptureChooser visible onClose={jest.fn()} />
          <VoiceCaptureModal
            adapter={adapter}
            parseVoiceCapture={parseVoiceCapture}
            onDraftReady={onDraftReady}
          />
          <ManualEntryModal />
        </VoiceCaptureProvider>
      </LedgerProvider>
    );

    const initialTxCount = Number(screen.getByTestId('tx-count').props.children);
    const initialBalance = Number(screen.getByTestId('balance').props.children);

    expect(screen.getByTestId('flow-state')).toHaveTextContent('idle');

    // Open Voice Capture from CaptureChooser
    await fireEvent.press(screen.getByRole('button', { name: 'Ghi âm' }));
    await waitFor(() => {
      expect(screen.getByTestId('voice-recording-bar')).toBeTruthy();
      expect(screen.getByTestId('flow-state')).toHaveTextContent('recording');
    });

    // Stop recording -> uploading / processing
    await fireEvent.press(screen.getByRole('button', { name: 'Dừng ghi âm' }));

    await waitFor(() => {
      expect(parseVoiceCapture).toHaveBeenCalledWith(
        {
          audio_base64: 'UklGRg==',
          mime_type: 'audio/m4a',
          duration_ms: 2400,
        },
        expect.objectContaining({ signal: expect.any(Object) })
      );
    });

    expect(screen.getByText('Đang xử lý giọng nói…')).toBeVisible();
    // Never fabricate live transcription text while in flight
    expect(screen.queryByText(/Cơm sườn/)).toBeNull();
    expect(onDraftReady).not.toHaveBeenCalled();

    const serverDraft: VoiceCaptureDraft = {
      amount: 35_000,
      currency: 'VND',
      category: 'food',
      merchant: 'Quán cơm Ba Ghiền',
      description: 'Cơm sườn 35k',
      recognized_text: 'Cơm sườn ba mươi lăm nghìn',
      occurred_on: '2026-11-28',
      timestamp: '2026-11-28T12:15:00+07:00',
      uncertain_fields: [],
      has_low_confidence: false,
    };

    await act(async () => {
      deferred.resolve(serverDraft);
    });

    // Temp file must be deleted in finally as soon as upload settles
    expect(adapter.deleteTempFile).toHaveBeenCalledWith('file:///tmp/voice-115.m4a');

    // Progressive reveal starts in 'revealing' before emitting onDraftReady
    expect(screen.getByTestId('flow-state')).toHaveTextContent('revealing');
    expect(onDraftReady).not.toHaveBeenCalled();

    const firstRevealText = screen.getByTestId('voice-revealing-transcript').props.children;
    expect(typeof firstRevealText).toBe('string');
    expect(firstRevealText.length).toBeGreaterThan(0);
    expect(firstRevealText.length).toBeLessThan(serverDraft.recognized_text!.length);
    expect(serverDraft.recognized_text!.startsWith(firstRevealText)).toBe(true);

    // Advance timers through progressive reveal to onDraftReady handoff
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(onDraftReady).toHaveBeenCalledTimes(1);
    });
    expect(onDraftReady).toHaveBeenCalledWith(serverDraft);
    expect(screen.getByTestId('flow-state')).toHaveTextContent('idle');
    expect(screen.queryByTestId('voice-draft-review-sheet')).toBeNull();
    expect(Number(screen.getByTestId('tx-count').props.children)).toBe(initialTxCount);
    expect(Number(screen.getByTestId('balance').props.children)).toBe(initialBalance);
  });

  it('renders built-in VoiceDraftReviewSheet fallback when onDraftReady is absent and only mutates ledger on explicit Xác nhận', async () => {
    const adapter = createFakeVoiceAdapter();
    const serverDraft: VoiceCaptureDraft = {
      amount: 35_000,
      currency: 'VND',
      category: 'food',
      merchant: 'Quán cơm Ba Ghiền',
      description: 'Cơm sườn 35k',
      recognized_text: 'Cơm sườn ba mươi lăm nghìn',
      occurred_on: '2026-11-28',
      timestamp: '2026-11-28T12:15:00+07:00',
      uncertain_fields: [],
      has_low_confidence: false,
    };
    const parseVoiceCapture = jest.fn(async () => serverDraft);

    await render(
      <LedgerProvider>
        <VoiceCaptureProvider>
          <FlowObserver />
          <CaptureChooser visible onClose={jest.fn()} />
          <VoiceCaptureModal adapter={adapter} parseVoiceCapture={parseVoiceCapture} />
        </VoiceCaptureProvider>
      </LedgerProvider>
    );

    const initialTxCount = Number(screen.getByTestId('tx-count').props.children);
    const initialBalance = Number(screen.getByTestId('balance').props.children);

    await fireEvent.press(screen.getByRole('button', { name: 'Ghi âm' }));
    await waitFor(() => expect(screen.getByTestId('voice-recording-bar')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Dừng ghi âm' }));

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('flow-state')).toHaveTextContent('review');
    });

    // Built-in review sheet displays draft details and has NOT mutated ledger yet
    expect(screen.getByTestId('voice-draft-review-sheet')).toBeVisible();
    expect(screen.getByText(/Cơm sườn ba mươi lăm nghìn/)).toBeVisible();
    expect(screen.getByText('35.000 ₫')).toBeVisible();
    expect(screen.getByText(/Ăn uống/)).toBeVisible();
    expect(Number(screen.getByTestId('tx-count').props.children)).toBe(initialTxCount);
    expect(Number(screen.getByTestId('balance').props.children)).toBe(initialBalance);

    // Explicit user tap on "Xác nhận" saves transaction once and updates Safe-to-Spend / balance
    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận' });
    expect(confirmBtn).toBeEnabled();
    await fireEvent.press(confirmBtn);

    expect(Number(screen.getByTestId('tx-count').props.children)).toBe(initialTxCount + 1);
    expect(Number(screen.getByTestId('balance').props.children)).toBe(initialBalance - 35_000);
    expect(screen.getByTestId('flow-state')).toHaveTextContent('idle');
  });

  it('clamps fast-stop (durationMillis: 0) and 30s overshoot (durationMillis: 30_080) duration_ms into [1, 30_000]', async () => {
    const parseVoiceCapture = jest.fn<
      Promise<VoiceCaptureDraft>,
      [VoiceCaptureRequest, RequestOptions?]
    >(
      async (): Promise<VoiceCaptureDraft> => ({
        amount: 20_000,
        currency: 'VND',
        category: 'food',
        merchant: null,
        description: 'Trà sữa 20k',
        recognized_text: 'Trà sữa hai mươi nghìn',
        occurred_on: '2026-11-28',
        timestamp: null,
        uncertain_fields: [],
        has_low_confidence: false,
      })
    );

    const stopResults: VoiceRecordingResult[] = [
      { uri: 'file:///tmp/fast.m4a', durationMillis: 0, mimeType: 'audio/m4a' },
      { uri: 'file:///tmp/overshoot.m4a', durationMillis: 30_080, mimeType: 'audio/m4a' },
    ];
    const adapter = createFakeVoiceAdapter({
      stop: jest.fn(async () => stopResults.shift()!),
    });

    await render(
      <LedgerProvider>
        <VoiceCaptureProvider>
          <VoiceCaptureModal
            visible
            adapter={adapter}
            parseVoiceCapture={parseVoiceCapture}
            onDraftReady={jest.fn()}
          />
        </VoiceCaptureProvider>
      </LedgerProvider>
    );

    await waitFor(() => expect(screen.getByTestId('voice-recording-bar')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Dừng ghi âm' }));

    await waitFor(() => {
      expect(parseVoiceCapture).toHaveBeenCalledTimes(1);
    });
    const firstDuration = parseVoiceCapture.mock.calls[0]?.[0].duration_ms;
    expect(firstDuration).toBeGreaterThanOrEqual(1);
    expect(firstDuration).toBeLessThanOrEqual(30_000);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    const secondRender = await render(
      <LedgerProvider>
        <VoiceCaptureProvider>
          <VoiceCaptureModal
            visible
            adapter={adapter}
            parseVoiceCapture={parseVoiceCapture}
            onDraftReady={jest.fn()}
          />
        </VoiceCaptureProvider>
      </LedgerProvider>
    );
    await waitFor(() => expect(secondRender.getByTestId('voice-recording-bar')).toBeTruthy());
    await fireEvent.press(secondRender.getByRole('button', { name: 'Dừng ghi âm' }));

    await waitFor(() => {
      expect(parseVoiceCapture).toHaveBeenCalledTimes(2);
    });
    const secondDuration = parseVoiceCapture.mock.calls[1]?.[0].duration_ms;
    expect(secondDuration).toBeGreaterThanOrEqual(1);
    expect(secondDuration).toBeLessThanOrEqual(30_000);
    expect(secondDuration).toBe(30_000);
  });

  it('disables Xác nhận for ambiguous/negation drafts (amount: null, has_low_confidence, uncertain_fields) and supports Sửa thủ công / Hủy without ledger mutation', async () => {
    const adapter = createFakeVoiceAdapter();
    const ambiguousDraft: VoiceCaptureDraft = {
      amount: null,
      currency: null,
      category: 'food',
      merchant: null,
      description: 'Không mua gì hết',
      recognized_text: 'Hôm nay không mua cơm sườn nữa',
      occurred_on: '2026-11-28',
      timestamp: null,
      uncertain_fields: ['amount'],
      has_low_confidence: true,
    };
    const parseVoiceCapture = jest.fn(async () => ambiguousDraft);

    await render(
      <LedgerProvider>
        <VoiceCaptureProvider>
          <FlowObserver />
          <VoiceCaptureModal visible adapter={adapter} parseVoiceCapture={parseVoiceCapture} />
          <ManualEntryModal />
        </VoiceCaptureProvider>
      </LedgerProvider>
    );

    const initialTxCount = Number(screen.getByTestId('tx-count').props.children);
    const initialBalance = Number(screen.getByTestId('balance').props.children);

    await waitFor(() => expect(screen.getByTestId('voice-recording-bar')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Dừng ghi âm' }));

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(screen.getByTestId('voice-draft-review-sheet')).toBeVisible();
    });

    expect(screen.getByText(/Hôm nay không mua cơm sườn nữa/)).toBeVisible();
    expect(screen.getByTestId('voice-draft-amount')).toHaveTextContent('Chưa rõ số tiền');
    expect(screen.getByTestId('voice-draft-warning')).toBeVisible();
    expect(screen.getByTestId('voice-draft-warning')).toHaveTextContent(/Số tiền/);

    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận' });
    expect(confirmBtn).toBeDisabled();
    await fireEvent.press(confirmBtn);

    expect(Number(screen.getByTestId('tx-count').props.children)).toBe(initialTxCount);
    expect(Number(screen.getByTestId('balance').props.children)).toBe(initialBalance);

    // Tapping "Sửa thủ công" discards draft cleanly and opens ManualEntryModal
    await fireEvent.press(screen.getByRole('button', { name: 'Sửa thủ công' }));
    await waitFor(() => {
      expect(screen.getByText('Thêm khoản chi')).toBeVisible();
    });
    expect(Number(screen.getByTestId('tx-count').props.children)).toBe(initialTxCount);
  });

  it('discards valid draft on Hủy with zero ledger mutation and disables Xác nhận when category is null', async () => {
    const adapter = createFakeVoiceAdapter();
    const missingCategoryDraft: VoiceCaptureDraft = {
      amount: 50_000,
      currency: 'VND',
      category: null,
      merchant: null,
      description: 'Chi tiêu chưa rõ',
      recognized_text: 'Chi năm mươi nghìn',
      occurred_on: '2026-11-28',
      timestamp: null,
      uncertain_fields: ['category'],
      has_low_confidence: true,
    };

    await render(
      <LedgerProvider>
        <VoiceCaptureProvider>
          <FlowObserver />
          <VoiceCaptureModal
            visible
            adapter={adapter}
            parseVoiceCapture={jest.fn(async () => missingCategoryDraft)}
          />
        </VoiceCaptureProvider>
      </LedgerProvider>
    );

    const initialTxCount = Number(screen.getByTestId('tx-count').props.children);
    await waitFor(() => expect(screen.getByTestId('voice-recording-bar')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Dừng ghi âm' }));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(screen.getByTestId('voice-draft-review-sheet')).toBeVisible());
    expect(screen.getByTestId('voice-draft-category')).toHaveTextContent('Chưa rõ danh mục');
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Hủy' }));
    expect(Number(screen.getByTestId('tx-count').props.children)).toBe(initialTxCount);
    expect(screen.getByTestId('flow-state')).toHaveTextContent('idle');
  });

  it.each([
    {
      label: '429 VOICE_RATE_LIMITED',
      error: normalizeHttpError(429, { error: { code: 'VOICE_RATE_LIMITED', message: 'Quota' } }),
      expectedText: /hết lượt ghi âm hôm nay/i,
    },
    {
      label: '504 VOICE_TIMEOUT',
      error: normalizeHttpError(504, { error: { code: 'VOICE_TIMEOUT', message: 'Timeout' } }),
      expectedText: /quá thời gian/i,
    },
    {
      label: '422 VOICE_INVALID_AUDIO',
      error: normalizeHttpError(422, { error: { code: 'VOICE_INVALID_AUDIO', message: 'Invalid' } }),
      expectedText: /không hợp lệ hoặc bị hỏng/i,
    },
    {
      label: '413 VOICE_AUDIO_TOO_LARGE',
      error: normalizeHttpError(413, { error: { code: 'VOICE_AUDIO_TOO_LARGE', message: 'Too large' } }),
      expectedText: /2 MB/i,
    },
    {
      label: 'Offline Fallback NETWORK_UNAVAILABLE',
      error: new ApiError({
        code: 'NETWORK_UNAVAILABLE',
        message: 'Offline',
        retryable: true,
        userMessage: 'Không thể kết nối máy chủ. Kiểm tra mạng LAN và thử lại.',
      }),
      expectedText: /Không thể kết nối máy chủ/i,
    },
  ])(
    'shows Vietnamese error recovery with Retry & Manual Entry, deletes temp file in finally, and never queues offline on $label',
    async ({ error, expectedText }) => {
      const adapter = createFakeVoiceAdapter();
      const parseVoiceCapture = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          amount: 25_000,
          currency: 'VND',
          category: 'food',
          merchant: null,
          description: 'Bánh mì 25k',
          recognized_text: 'Bánh mì 25k',
          occurred_on: '2026-11-28',
          timestamp: null,
          uncertain_fields: [],
          has_low_confidence: false,
        });

      await render(
        <LedgerProvider>
          <VoiceCaptureProvider>
            <FlowObserver />
            <VoiceCaptureModal visible adapter={adapter} parseVoiceCapture={parseVoiceCapture} />
            <ManualEntryModal />
          </VoiceCaptureProvider>
        </LedgerProvider>
      );

      await waitFor(() => expect(screen.getByTestId('voice-recording-bar')).toBeTruthy());
      await fireEvent.press(screen.getByRole('button', { name: 'Dừng ghi âm' }));

      await waitFor(() => {
        expect(screen.getByTestId('voice-error-view')).toBeVisible();
      });

      expect(screen.getByTestId('flow-state')).toHaveTextContent('error');
      expect(screen.getByTestId('voice-error-message')).toHaveTextContent(expectedText);
      expect(adapter.deleteTempFile).toHaveBeenCalledWith('file:///tmp/voice-115.m4a');

      const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
      const manualBtn = screen.getByRole('button', { name: 'Nhập thủ công' });
      expect(retryBtn).toBeEnabled();
      expect(manualBtn).toBeEnabled();

      // Retry starts a fresh recording without queuing failed audio
      await fireEvent.press(retryBtn);
      await waitFor(() => {
        expect(screen.getByTestId('voice-recording-bar')).toBeTruthy();
      });
      expect(parseVoiceCapture).toHaveBeenCalledTimes(1);

      // Manual Entry fallback opens ManualEntryModal
      await fireEvent.press(screen.getByRole('button', { name: 'Dừng ghi âm' }));
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      await waitFor(() => expect(screen.getByTestId('voice-draft-review-sheet')).toBeVisible());
      await fireEvent.press(screen.getByRole('button', { name: 'Sửa thủ công' }));
      await waitFor(() => expect(screen.getByText('Thêm khoản chi')).toBeVisible());
    }
  );

  it('auto-stops at 30s without duplicate upload and cleans up timers/abort on unmount during reveal', async () => {
    const adapter = createFakeVoiceAdapter();
    const parseVoiceCapture = jest.fn(
      async (): Promise<VoiceCaptureDraft> => ({
        amount: 40_000,
        currency: 'VND',
        category: 'food',
        merchant: null,
        description: 'Bún bò 40k',
        recognized_text: 'Bún bò bốn mươi nghìn đồng',
        occurred_on: '2026-11-28',
        timestamp: null,
        uncertain_fields: [],
        has_low_confidence: false,
      })
    );
    const onDraftReady = jest.fn();

    const { unmount } = await render(
      <LedgerProvider>
        <VoiceCaptureProvider>
          <VoiceCaptureModal
            visible
            adapter={adapter}
            parseVoiceCapture={parseVoiceCapture}
            onDraftReady={onDraftReady}
          />
        </VoiceCaptureProvider>
      </LedgerProvider>
    );

    await waitFor(() => expect(adapter.start).toHaveBeenCalledTimes(1));

    // Trigger 30s auto-stop
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => {
      expect(adapter.stop).toHaveBeenCalledTimes(1);
      expect(parseVoiceCapture).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('voice-revealing-view')).toBeVisible();
    });
    expect(adapter.deleteTempFile).toHaveBeenCalledWith('file:///tmp/voice-115.m4a');

    // Unmount mid-reveal: timer must be cleaned up and onDraftReady must NOT fire later
    await unmount();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(onDraftReady).not.toHaveBeenCalled();
  });

  it('connects to AuthProvider apiClient.parseVoiceCapture end-to-end when parseVoiceCapture prop is omitted', async () => {
    const adapter = createFakeVoiceAdapter();
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'srv-voice-1' },
      json: async () => ({
        amount: 35_000,
        currency: 'VND',
        category: 'food',
        merchant: 'Cơm tấm',
        description: 'Cơm sườn 35k',
        recognized_text: 'Cơm sườn 35k',
        occurred_on: '2026-11-28',
        timestamp: null,
        uncertain_fields: [],
        has_low_confidence: false,
      }),
    }));

    const runtime = createCarentaRuntime({
      apiBaseUrl: 'http://192.168.1.10:8000',
      authMode: {
        kind: 'authenticated',
        storage: createMemorySessionStorage({
          accessToken: 'jwt-voice-1',
          refreshToken: 'refresh-1',
          expiresAt: 1_900_000_000,
          user: { id: 'student-1', email: 'sv@hcmus.edu.vn', role: 'authenticated' },
        }),
        authGateway: {
          signInWithPassword: jest.fn(),
          refreshSession: jest.fn(),
          signOut: jest.fn(),
        },
      },
      httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
      now: () => 1_700_000_000_000,
    });

    await render(
      <AuthProvider runtime={runtime}>
        <LedgerProvider>
          <VoiceCaptureProvider>
            <VoiceCaptureModal visible adapter={adapter} />
          </VoiceCaptureProvider>
        </LedgerProvider>
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('voice-recording-bar')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Dừng ghi âm' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://192.168.1.10:8000/api/v1/capture/voice',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-voice-1',
          }),
        })
      );
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(screen.getByTestId('voice-draft-review-sheet')).toBeVisible());
    expect(screen.getByText('35.000 ₫')).toBeVisible();
  });
});
