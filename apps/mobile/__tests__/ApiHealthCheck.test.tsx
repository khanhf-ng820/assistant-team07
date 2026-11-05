import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ApiHealthCheck } from '../src/components/ApiHealthCheck';

const validResponse = {
  ok: true,
  json: async () => ({ status: 'ok', service: 'carenta-api' }),
};

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('explains missing configuration without making a request', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch');
  await render(<ApiHealthCheck />);
  expect(screen.getByText('Chưa cấu hình API')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Kiểm tra kết nối' })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});

it('checks only on demand and reports a validated success', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(validResponse as Response);
  await render(<ApiHealthCheck baseUrl="http://example.test" />);
  expect(fetch).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  expect(await screen.findByText('API đã kết nối')).toBeVisible();
});

it('disables repeat checks while pending and permits retry after failure', async () => {
  let fail!: (reason: Error) => void;
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise((_resolve, reject) => {
    fail = reject;
  })).mockResolvedValue(validResponse as Response);
  await render(<ApiHealthCheck baseUrl="http://example.test" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  expect(screen.getByText('Đang kiểm tra…')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Kiểm tra kết nối' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => fail(new Error('Network unavailable')));
  expect(screen.getByText('Không kết nối được API')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
  expect(await screen.findByText('API đã kết nối')).toBeVisible();
});

it('cancels the pending request when unmounted', async () => {
  let signal: AbortSignal | undefined;
  jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
    signal = options?.signal ?? undefined;
    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
  });
  const result = await render(<ApiHealthCheck baseUrl="http://example.test" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  await result.unmount();
  expect(signal?.aborted).toBe(true);
});

it('times out after five seconds and offers retry', async () => {
  jest.useFakeTimers();
  jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  }));
  await render(<ApiHealthCheck baseUrl="http://example.test" />);
  await fireEvent.press(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
  await act(async () => jest.advanceTimersByTime(5000));
  expect(screen.getByText('Không kết nối được API')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeEnabled();
});
