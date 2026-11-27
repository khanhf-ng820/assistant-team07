import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppState, AppStateStatus, Pressable, Text } from 'react-native';
import { DayTransactionsSheet } from '../src/components/calendar/DayTransactionsSheet';
import { ManualEntryModal } from '../src/components/manual-entry/ManualEntryModal';
import { BudgetRecoveryModal } from '../src/components/notifications/BudgetRecoveryModal';
import { NotificationSettingsModal } from '../src/components/notifications/NotificationSettingsModal';
import { ProactiveAlertBannerList } from '../src/components/notifications/ProactiveAlertBannerList';
import { LedgerProvider, useLedger } from '../src/context/LedgerContext';
import { NotificationProvider, useNotifications } from '../src/context/NotificationContext';
import {
  EVENING_CHECKIN_MESSAGE,
  GENERIC_SCHEDULED_REMINDER_BODY,
  OVERSPENDING_PRIVATE_PUSH_MESSAGE,
  ReminderPreferences,
  ServerBudgetRecoveryInput,
} from '../src/notifications/alertEngine';
import {
  NotificationAdapter,
  NotificationResponseEvent,
  ReminderPreferencesStorage,
} from '../src/notifications/localNotifications';

function createMemoryStorage(
  initial: ReminderPreferences | null = null
): ReminderPreferencesStorage {
  let stored = initial;
  return {
    load: jest.fn(async () => stored),
    save: jest.fn(async (prefs: ReminderPreferences) => {
      stored = prefs;
    }),
  };
}

function createMockAdapter(
  overrides: Partial<NotificationAdapter> = {}
): {
  adapter: NotificationAdapter;
  emitResponse: (event: NotificationResponseEvent) => void;
} {
  let responseListener: ((event: NotificationResponseEvent) => void) | null = null;

  const adapter: NotificationAdapter = {
    getPermissions: jest.fn(async () => ({ outcome: 'granted' as const, canAskAgain: true })),
    requestPermissions: jest.fn(async () => ({ outcome: 'granted' as const, canAskAgain: true })),
    configureAndroidChannel: jest.fn(async () => {}),
    presentLocalNotification: jest.fn(async () => 'notif-1'),
    scheduleDailyCheckInReminder: jest.fn(async () => 'daily-1'),
    cancelScheduledNotification: jest.fn(async () => {}),
    subscribeNotificationResponse: jest.fn((listener) => {
      responseListener = listener;
      return () => {
        responseListener = null;
      };
    }),
    openSettings: jest.fn(async () => true),
    ...overrides,
  };

  return {
    adapter,
    emitResponse: (event) => {
      responseListener?.(event);
    },
  };
}

function HarnessControls() {
  const { setSelectedDate, addTransaction } = useLedger();
  const { lastPushDispatch } = useNotifications();

  return (
    <>
      <Text testID="last-push-body">{lastPushDispatch?.payload.body ?? 'none'}</Text>
      <Pressable
        testID="select-day-9"
        onPress={() => setSelectedDate('2024-07-09')}
      >
        <Text>Day 9</Text>
      </Pressable>
      <Pressable
        testID="select-empty-day-16"
        onPress={() => setSelectedDate('2024-07-16')}
      >
        <Text>Day 16</Text>
      </Pressable>
      <Pressable
        testID="log-overspending-on-day-9"
        onPress={() =>
          addTransaction({
            amount: 165000,
            categoryId: 'food',
            note: 'Bữa tối phát sinh',
            date: '2024-07-09',
            time: '19:30',
          })
        }
      >
        <Text>Add 165k on Day 9</Text>
      </Pressable>
      <Pressable
        testID="log-expense-on-day-16"
        onPress={() =>
          addTransaction({
            amount: 35000,
            categoryId: 'food',
            note: 'Bánh mì tối',
            date: '2024-07-16',
            time: '20:15',
          })
        }
      >
        <Text>Add 35k on Day 16</Text>
      </Pressable>
    </>
  );
}

const DEFAULT_TEST_NOW = () => new Date(2024, 6, 10, 20, 15);

function TestApp({
  adapter,
  storage,
  nowProvider = DEFAULT_TEST_NOW,
  serverBudgetSummary,
}: {
  adapter: NotificationAdapter;
  storage?: ReminderPreferencesStorage;
  nowProvider?: () => Date;
  serverBudgetSummary?: ServerBudgetRecoveryInput | null;
}) {
  const resolvedStorage = React.useMemo(
    () => storage ?? createMemoryStorage(),
    [storage]
  );

  return (
    <LedgerProvider>
      <NotificationProvider
        adapter={adapter}
        preferencesStorage={resolvedStorage}
        nowProvider={nowProvider}
        serverBudgetSummary={serverBudgetSummary}
      >
        <HarnessControls />
        <ProactiveAlertBannerList />
        <BudgetRecoveryModal />
        <NotificationSettingsModal />
        <DayTransactionsSheet />
        <ManualEntryModal />
      </NotificationProvider>
    </LedgerProvider>
  );
}

describe('Phase 3 proactive push notifications & overspending alert UI', () => {
  it('shows overspending banner on overspent day and opens read-only BudgetRecoveryModal', async () => {
    const { adapter } = createMockAdapter();

    await render(<TestApp adapter={adapter} />);

    // Day 10 fixture spends 290,000 vs 280,000 limit => 10,000 over
    expect(await screen.findByTestId('alert-banner-overspending')).toBeVisible();
    expect(screen.getByTestId('alert-message-overspending')).toHaveTextContent(
      'Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức 10.000đ!'
    );

    await fireEvent.press(screen.getByTestId('alert-primary-action-overspending'));
    expect(screen.getByTestId('budget-recovery-modal')).toBeVisible();
    expect(screen.getByTestId('recovery-overspent-amount')).toHaveTextContent('10.000 ₫');

    // Navigate from recovery preview to DayTransactionsSheet
    await fireEvent.press(screen.getByTestId('recovery-view-transactions-button'));
    expect(screen.queryByTestId('budget-recovery-modal')).toBeNull();
    expect(screen.getByTestId('day-transactions-modal')).toBeVisible();
  });

  it('dispatches exact 45.000đ local push notification when confirmed expense exceeds daily budget limit', async () => {
    const { adapter } = createMockAdapter();
    const storage = createMemoryStorage({
      enabled: true,
      eveningHour: 20,
      eveningMinute: 0,
      overspendingAlertsEnabled: true,
      hideAmountOnPush: false,
    });

    await render(<TestApp adapter={adapter} storage={storage} />);

    // Select Day 9 (160,000 spent vs 280,000 limit => 120,000 remaining)
    await fireEvent.press(screen.getByTestId('select-day-9'));
    await waitFor(() => {
      expect(screen.queryByTestId('alert-banner-overspending')).toBeNull();
    });

    // Adding 165,000 pushes Day 9 to 325,000 => 45,000đ over 280,000 limit
    await fireEvent.press(screen.getByTestId('log-overspending-on-day-9'));

    await waitFor(() => {
      expect(screen.getByTestId('alert-message-overspending')).toHaveTextContent(
        'Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức 45.000đ!'
      );
    });

    await waitFor(() => {
      expect(adapter.presentLocalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức 45.000đ!',
          data: expect.objectContaining({
            kind: 'overspending',
            actionTarget: 'open_budget_recovery',
            date: '2024-07-09',
          }),
        })
      );
    });
  });

  it('surfaces evening check-in banner & push when no expenses logged, then cancels reminder on entry', async () => {
    const { adapter } = createMockAdapter({
      presentLocalNotification: jest.fn(async () => 'evening-notif-16'),
    });
    const storage = createMemoryStorage({
      enabled: true,
      eveningHour: 20,
      eveningMinute: 0,
      overspendingAlertsEnabled: true,
      hideAmountOnPush: false,
    });

    await render(<TestApp adapter={adapter} storage={storage} />);

    // Day 16 has zero transactions and mock clock is 20:15 >= 20:00
    await fireEvent.press(screen.getByTestId('select-empty-day-16'));

    await waitFor(() => {
      expect(screen.getByTestId('alert-banner-evening_checkin')).toBeVisible();
    });
    expect(screen.getByTestId('alert-message-evening_checkin')).toHaveTextContent(
      EVENING_CHECKIN_MESSAGE
    );

    await waitFor(() => {
      expect(adapter.presentLocalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: EVENING_CHECKIN_MESSAGE,
          data: expect.objectContaining({
            kind: 'evening_checkin',
            actionTarget: 'open_manual_entry',
            date: '2024-07-16',
          }),
        })
      );
    });

    // Recording an expense clears the evening alert and cancels same-day notification
    await fireEvent.press(screen.getByTestId('log-expense-on-day-16'));

    await waitFor(() => {
      expect(screen.queryByTestId('alert-banner-evening_checkin')).toBeNull();
    });
    await waitFor(() => {
      expect(adapter.cancelScheduledNotification).toHaveBeenCalledWith('evening-notif-16');
    });
  });

  it('handles opt-in settings scheduling, blocked OS settings fallback, and AppState resume', async () => {
    let appStateHandler: ((state: AppStateStatus) => void) | undefined;
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateHandler = listener;
        return { remove: jest.fn() };
      });

    const getPermissions = jest
      .fn()
      .mockResolvedValueOnce({ outcome: 'blocked', canAskAgain: false })
      .mockResolvedValueOnce({ outcome: 'granted', canAskAgain: true });
    const requestPermissions = jest
      .fn()
      .mockResolvedValueOnce({ outcome: 'blocked', canAskAgain: false })
      .mockResolvedValueOnce({ outcome: 'granted', canAskAgain: true });

    const { adapter } = createMockAdapter({
      getPermissions,
      requestPermissions,
    });
    const storage = createMemoryStorage();

    await render(<TestApp adapter={adapter} storage={storage} />);

    await fireEvent.press(screen.getByTestId('open-notification-settings-button'));
    expect(screen.getByTestId('notification-settings-modal')).toBeVisible();
    expect(screen.getByText(new RegExp(GENERIC_SCHEDULED_REMINDER_BODY))).toBeTruthy();

    // Blocked permission shows OS settings button and keeps opt-in disabled
    expect(screen.getByTestId('notification-open-os-settings-button')).toBeVisible();
    await fireEvent.press(screen.getByTestId('toggle-notifications-button'));
    await waitFor(() => {
      expect(screen.getByTestId('toggle-notifications-button')).toHaveTextContent(/Đang tắt/);
    });

    await fireEvent.press(screen.getByTestId('notification-open-os-settings-button'));
    expect(adapter.openSettings).toHaveBeenCalledTimes(1);

    await act(async () => {
      appStateHandler?.('active');
    });

    await waitFor(() => {
      expect(screen.getByTestId('notification-permission-status')).toHaveTextContent(
        /Đã cấp quyền thông báo/
      );
    });

    // Enable notifications & update reminder time to 21:00
    await fireEvent.press(screen.getByTestId('toggle-notifications-button'));
    await waitFor(() => {
      expect(adapter.scheduleDailyCheckInReminder).toHaveBeenCalledWith(20, 0);
    });

    await fireEvent.press(screen.getByTestId('preset-time-21:00'));
    await waitFor(() => {
      expect(adapter.scheduleDailyCheckInReminder).toHaveBeenLastCalledWith(21, 0);
    });

    // Test manual trigger button dispatches local push safely
    await fireEvent.press(screen.getByTestId('test-overspending-push-button'));
    await waitFor(() => {
      expect(adapter.presentLocalNotification).toHaveBeenCalled();
    });

    appStateSpy.mockRestore();
  });

  it('routes allowlisted notification tap responses and ignores unknown targets', async () => {
    const { adapter, emitResponse } = createMockAdapter();

    await render(<TestApp adapter={adapter} />);

    await act(async () => {
      emitResponse({ actionTarget: null, alertId: 'malicious' });
    });
    expect(screen.queryByTestId('budget-recovery-modal')).toBeNull();
    expect(screen.queryByTestId('manual-entry-modal')).toBeNull();

    await act(async () => {
      emitResponse({ actionTarget: 'open_budget_recovery', alertId: 'a1' });
    });
    expect(screen.getByTestId('budget-recovery-modal')).toBeVisible();

    await act(async () => {
      emitResponse({ actionTarget: 'open_manual_entry', alertId: 'a2' });
    });
    expect(screen.queryByTestId('budget-recovery-modal')).toBeNull();
    expect(screen.getByText('Thêm khoản chi')).toBeVisible();
  });

  it('allows dismissing an active alert banner without mutating ledger data', async () => {
    const { adapter } = createMockAdapter();

    await render(<TestApp adapter={adapter} />);
    expect(await screen.findByTestId('alert-banner-overspending')).toBeVisible();

    await fireEvent.press(screen.getByTestId('alert-dismiss-overspending'));
    expect(screen.queryByTestId('alert-banner-overspending')).toBeNull();
  });

  it('re-evaluates evening check-in threshold when returning to foreground', async () => {
    let appStateHandler: ((state: AppStateStatus) => void) | undefined;
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateHandler = listener;
        return { remove: jest.fn() };
      });

    let currentMockTime = new Date(2024, 6, 16, 19, 55);
    const { adapter } = createMockAdapter();

    await render(<TestApp adapter={adapter} nowProvider={() => currentMockTime} />);
    await fireEvent.press(screen.getByTestId('select-empty-day-16'));

    expect(screen.queryByTestId('alert-banner-evening_checkin')).toBeNull();

    // Advance wall-clock past 20:00 and resume app to foreground
    currentMockTime = new Date(2024, 6, 16, 20, 5);
    await act(async () => {
      appStateHandler?.('active');
    });

    expect(await screen.findByTestId('alert-banner-evening_checkin')).toBeVisible();
    appStateSpy.mockRestore();
  });

  it('dispatches overspending push for cross-date confirmed transaction even while viewing another day', async () => {
    const { adapter } = createMockAdapter();
    const storage = createMemoryStorage({
      enabled: true,
      eveningHour: 20,
      eveningMinute: 0,
      overspendingAlertsEnabled: true,
      hideAmountOnPush: false,
    });

    await render(<TestApp adapter={adapter} storage={storage} />);

    // Keep selectedDate on Day 10 while adding an overspending transaction for Day 9
    await fireEvent.press(screen.getByTestId('log-overspending-on-day-9'));

    await waitFor(() => {
      expect(adapter.presentLocalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức 45.000đ!',
          data: expect.objectContaining({
            kind: 'overspending',
            date: '2024-07-09',
          }),
        })
      );
    });
  });

  it('surfaces Vietnamese feedback on denied permission and guards concurrent toggle taps', async () => {
    let resolvePrompt!: (res: { outcome: 'denied'; canAskAgain: boolean }) => void;
    const requestPermissions = jest.fn(
      () =>
        new Promise<{ outcome: 'denied'; canAskAgain: boolean }>((resolve) => {
          resolvePrompt = resolve;
        })
    );
    const { adapter } = createMockAdapter({
      getPermissions: jest.fn(async () => ({ outcome: 'denied' as const, canAskAgain: true })),
      requestPermissions,
    });

    await render(<TestApp adapter={adapter} />);
    await fireEvent.press(screen.getByTestId('open-notification-settings-button'));

    // Rapid double-tap should trigger only a single OS permission request
    await fireEvent.press(screen.getByTestId('toggle-notifications-button'));
    await fireEvent.press(screen.getByTestId('toggle-notifications-button'));
    expect(requestPermissions).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePrompt({ outcome: 'denied', canAskAgain: true });
    });

    expect(await screen.findByTestId('notification-settings-error')).toHaveTextContent(
      /Bạn chưa cấp quyền thông báo/
    );
  });

  it('hides exact VND amount on lock-screen push when hideAmountOnPush is enabled while keeping in-app banner exact', async () => {
    const { adapter } = createMockAdapter();
    const storage = createMemoryStorage({
      enabled: true,
      eveningHour: 20,
      eveningMinute: 0,
      overspendingAlertsEnabled: true,
      hideAmountOnPush: false,
    });

    await render(<TestApp adapter={adapter} storage={storage} />);

    // Enable lock-screen amount hiding inside NotificationSettingsModal
    await fireEvent.press(screen.getByTestId('open-notification-settings-button'));
    await fireEvent.press(screen.getByTestId('toggle-hide-amount-push-button'));
    await waitFor(() => {
      expect(screen.getByTestId('toggle-hide-amount-push-button')).toHaveTextContent(/Đang ẩn/);
    });
    await fireEvent.press(screen.getByTestId('notification-settings-close'));

    // Trigger overspending on Day 9
    await fireEvent.press(screen.getByTestId('select-day-9'));
    await fireEvent.press(screen.getByTestId('log-overspending-on-day-9'));

    await waitFor(() => {
      expect(adapter.presentLocalNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          body: OVERSPENDING_PRIVATE_PUSH_MESSAGE,
        })
      );
    });
    // Unlocked in-app banner still shows exact VND amount
    expect(screen.getByTestId('alert-message-overspending')).toHaveTextContent(/45\.000đ/);
  });

  it('uses server /budget/summary subsequent_daily_budget in BudgetRecoveryModal when provided', async () => {
    const { adapter } = createMockAdapter();

    await render(
      <TestApp
        adapter={adapter}
        serverBudgetSummary={{
          daily_budget: 280000,
          spent_today: 290000,
          overspent_amount_today: 10000,
          days_remaining: 21,
          subsequent_daily_budget: 279500,
        }}
      />
    );

    await fireEvent.press(await screen.findByTestId('alert-primary-action-overspending'));
    expect(screen.getByTestId('budget-recovery-modal')).toBeVisible();
    expect(screen.getByTestId('recovery-adjusted-allowance')).toHaveTextContent('279.500 ₫');
    expect(screen.getByTestId('recovery-source-label')).toHaveTextContent(
      'Nguồn tính toán: /budget/summary'
    );
  });
});
