import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { HealthResponse } from '../src/api/contracts';
import { createFetchTransport } from '../src/api/transport';
import { AuthProvider } from '../src/auth/AuthContext';
import { ApiHealthCheck } from '../src/components/ApiHealthCheck';
import { createCarentaRuntime } from '../src/runtime/carentaRuntime';

const validResponse = {
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ status: 'ok', service: 'carenta-api' }),
} as unknown as Response;

const okHealth: HealthResponse = { status: 'ok', service: 'carenta-api' };

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('explains missing configuration outside AuthProvider and when apiBaseUrl is unset', async () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');

  await render(<ApiHealthCheck />);
  expect(screen.getByText('Chưa cấu hình API')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Kiểm tra kết nối' })).toBeDisabled();

  const unconfiguredRuntime = createCarentaRuntime({ authMode: { kind: 'local_dev' } });
  await render(
    <AuthProvider runtime={unconfiguredRuntime}>
      <ApiHealthCheck />
    </AuthProvider>
  );
  expect(screen.getByText('Chưa cấu hình API')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Kiểm tra kết nối' })).toBeDisabled();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('checks only on demand and reports a validated success via checkHealth prop override', async () => {
  const checkHealth = jest.fn(async () => okHealth);
  await render(<ApiHealthCheck checkHealth={checkHealth} />);
  expect(checkHealth).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  expect(await screen.findByText('API đã kết nối')).toBeVisible();
});

it('disables repeat checks while pending and permits retry after failure', async () => {
  let fail!: (reason: Error) => void;
  const checkHealth = jest
    .fn<Promise<HealthResponse>, [AbortSignal | undefined]>()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        })
    )
    .mockResolvedValueOnce(okHealth);

  await render(<ApiHealthCheck checkHealth={checkHealth} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  expect(screen.getByText('Đang kiểm tra…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Kiểm tra kết nối' })).toBeDisabled();

  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  expect(checkHealth).toHaveBeenCalledTimes(1);

  await act(async () => fail(new Error('Network unavailable')));
  expect(screen.getByText('Không kết nối được API')).toBeVisible();

  await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('API đã kết nối')).toBeVisible();
});

it('cancels the pending request when unmounted', async () => {
  let capturedSignal: AbortSignal | undefined;
  const checkHealth = jest.fn((signal?: AbortSignal) => {
    capturedSignal = signal;
    return new Promise<HealthResponse>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
  });

  const result = await render(<ApiHealthCheck checkHealth={checkHealth} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  await result.unmount();
  expect(capturedSignal?.aborted).toBe(true);
});

it('uses shared AuthProvider runtime headers without Authorization and handles 5s timeout + retry', async () => {
  jest.useFakeTimers();
  const fetchMock = jest
    .fn()
    .mockImplementationOnce(
      (_url: RequestInfo | URL, options?: RequestInit) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true,
          });
        })
    )
    .mockResolvedValueOnce(validResponse);

  const runtime = createCarentaRuntime({
    apiBaseUrl: 'http://example.test',
    authMode: { kind: 'local_dev' },
    httpTransport: createFetchTransport({ fetchImpl: fetchMock as unknown as typeof fetch }),
  });

  await render(
    <AuthProvider runtime={runtime}>
      <ApiHealthCheck />
    </AuthProvider>
  );

  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  await act(async () => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Không kết nối được API')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeEnabled();

  jest.useRealTimers();
  await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('API đã kết nối')).toBeVisible();

  const [, init] = fetchMock.mock.calls[1];
  expect(init?.headers).toMatchObject({
    Accept: 'application/json',
    'X-Request-ID': expect.any(String),
  });
  expect(init?.headers).not.toEqual(expect.objectContaining({ Authorization: expect.any(String) }));
});
