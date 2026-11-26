import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import type { HttpTransport } from '../src/api/transport';
import { AuthProvider } from '../src/auth/AuthContext';
import { GreetingHeader } from '../src/components/dashboard/GreetingHeader';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { LedgerProvider } from '../src/context/LedgerContext';
import { HabitPrompt } from '../src/habits/HabitPrompt';
import { readHabitReminders, scheduleHabitReminder, setHabitReminders } from '../src/habits/reminders';
import { createCarentaRuntime } from '../src/runtime/carentaRuntime';

jest.mock('expo-router', () => ({
  usePathname: () => '/',
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
});

const suggestion = {
  id: 'a'.repeat(64), date: '2026-11-26', amount: 30_000,
  category: 'food', note: 'Trà sữa', confidence: 0.8, matching_days: 5,
};
const transaction = {
  id: 'expense-1', kind: 'expense', amount: 30_000, category: 'food', date: suggestion.date,
  note: suggestion.note, idempotency_key: 'habit-1', created_at: '2026-11-26T10:20:00Z',
};
const permission = (granted: boolean) =>
  ({ granted, canAskAgain: true }) as Notifications.NotificationPermissionsStatus;

it('previews the purchase and writes only after explicit approval', async () => {
  let confirmed = false;
  const send = jest.fn<ReturnType<HttpTransport['send']>, Parameters<HttpTransport['send']>>(async ({ url }) => {
    if (url.endsWith('/confirm')) {
      confirmed = true;
      return { status: 200, ok: true, body: { ok: true, data: transaction } };
    }
    return { status: 200, ok: true, body: { ok: true, data: { suggestion: confirmed ? null : suggestion } } };
  });
  const runtime = createCarentaRuntime({
    apiBaseUrl: 'http://example.test', authMode: { kind: 'local_dev' }, httpTransport: { send },
  });
  await render(
    <AuthProvider runtime={runtime}>
      <LedgerProvider>
        <HabitPrompt />
        <GreetingHeader userName="Minh" />
        <ManualEntryModal />
      </LedgerProvider>
    </AuthProvider>
  );
  await screen.findByText('Trà sữa · Ăn uống');
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].method).toBe('GET');
  await fireEvent.press(screen.getByRole('button', { name: 'Chỉnh sửa' }));
  expect(screen.getByDisplayValue('Trà sữa')).toBeVisible();
  expect(screen.getByTestId('amount-display-value')).toHaveTextContent('30.000');
  await fireEvent.press(screen.getByTestId('manual-entry-back'));
  expect(send).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Duyệt 1 chạm' }));
  expect(await screen.findByText('Đã ghi khoản chi 30.000 ₫.')).toBeTruthy();
  expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.470.000 ₫');
  expect(screen.queryByRole('button', { name: 'Duyệt 1 chạm' })).toBeNull();
  expect(send.mock.calls.filter(([request]) => request.method === 'POST')).toHaveLength(1);
});

it('saves manual entries through the same API and reuses the key after an uncertain response', async () => {
  const send = jest.fn<ReturnType<HttpTransport['send']>, Parameters<HttpTransport['send']>>()
    .mockResolvedValueOnce({ status: 503, ok: false, body: { ok: false } })
    .mockResolvedValueOnce({ status: 201, ok: true, body: { ok: true, data: transaction } });
  const runtime = createCarentaRuntime({
    apiBaseUrl: 'http://example.test', authMode: { kind: 'local_dev' }, httpTransport: { send },
  });
  const onClose = jest.fn();
  await render(
    <AuthProvider runtime={runtime}>
      <LedgerProvider><ManualEntryModal visible onClose={onClose} /></LedgerProvider>
    </AuthProvider>
  );
  for (const digit of ['4', '5', '000']) {
    await fireEvent.press(screen.getByTestId(`numpad-key-${digit}`));
  }
  await fireEvent.changeText(screen.getByTestId('manual-entry-note-input'), 'Trà sữa');
  await fireEvent.press(screen.getByTestId('submit-expense-button'));
  expect(await screen.findByText('Máy chủ đang bận, vui lòng thử lại sau.')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('submit-expense-button'));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[1][0]).toEqual(expect.objectContaining({
    url: 'http://example.test/api/v1/transactions',
    method: 'POST',
    body: send.mock.calls[0][0].body,
  }));
});

it('schedules generic opt-in reminders at most once per day on the device', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-26T09:00:00Z'));
  try {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(true));
    expect(await readHabitReminders('student-1')).toBe(false);
    await scheduleHabitReminder('student-1', suggestion.date);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(await setHabitReminders('student-1', true)).toBe(true);
    await Promise.all([
      scheduleHabitReminder('student-1', suggestion.date),
      scheduleHabitReminder('student-1', suggestion.date),
    ]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
      content: {
        title: 'CARENTA',
        body: 'Bạn có gợi ý thói quen mới. Mở ứng dụng để kiểm tra.',
        data: { kind: 'carenta-habit' },
      },
      trigger: expect.objectContaining({ date: new Date('2026-11-26T11:00:00Z'), delivery: 'bestEffort' }),
    }));
    expect(await setHabitReminders('student-1', false)).toBe(false);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('habit.enabled.student-1', 'false');
  } finally {
    jest.useRealTimers();
  }
});

it('keeps reminders disabled when the user declines the permission prompt', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(false));
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue(permission(false));
  expect(await setHabitReminders('student-2', true)).toBe(false);
  expect(await readHabitReminders('student-2')).toBe(false);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});
