import {
  createExpoNotificationAdapter,
  createSecureReminderPreferencesStorage,
  normalizeNotificationPermission,
  ReminderStorageError,
} from '../src/notifications/localNotifications';

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}));

describe('localNotifications permission & storage boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes granted, denied, blocked, and unavailable permission responses', () => {
    expect(normalizeNotificationPermission({ status: 'granted', granted: true })).toEqual({
      outcome: 'granted',
      canAskAgain: true,
    });
    expect(
      normalizeNotificationPermission({ status: 'denied', granted: false, canAskAgain: true })
    ).toEqual({
      outcome: 'denied',
      canAskAgain: true,
    });
    expect(
      normalizeNotificationPermission({ status: 'denied', granted: false, canAskAgain: false })
    ).toEqual({
      outcome: 'blocked',
      canAskAgain: false,
    });
    expect(normalizeNotificationPermission(null)).toEqual({
      outcome: 'unavailable',
      canAskAgain: false,
    });
  });

  it('degrades gracefully when expo-notifications native module is missing', async () => {
    jest.isolateModules(() => {
      jest.doMock('expo-notifications', () => {
        throw new Error('Native module missing');
      });
    });

    const adapter = createExpoNotificationAdapter();
    // In Jest default environment without mocked expo-notifications native methods,
    // adapter methods never throw uncaught errors
    await expect(adapter.getPermissions()).resolves.toHaveProperty('outcome');
    await expect(
      adapter.presentLocalNotification({
        title: 'Test',
        body: 'Body',
        data: {
          alertId: 'a1',
          kind: 'overspending',
          actionTarget: 'open_budget_recovery',
        },
      })
    ).resolves.toBeDefined();
  });

  it('fails closed on corrupt reminder preferences storage and saves valid values', async () => {
    const storage = createSecureReminderPreferencesStorage('test.prefs');

    mockGetItemAsync.mockResolvedValueOnce(null);
    await expect(storage.load()).resolves.toBeNull();

    mockGetItemAsync.mockResolvedValueOnce('{not-valid-json');
    await expect(storage.load()).rejects.toThrow(ReminderStorageError);

    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ enabled: 'yes' }));
    await expect(storage.load()).rejects.toMatchObject({ code: 'STORAGE_READ_FAILED' });

    mockGetItemAsync.mockResolvedValueOnce(
      JSON.stringify({
        enabled: true,
        eveningHour: 20,
        eveningMinute: 0,
        overspendingAlertsEnabled: true,
        hideAmountOnPush: 'bad',
      })
    );
    await expect(storage.load()).rejects.toMatchObject({ code: 'STORAGE_READ_FAILED' });

    // Backwards-compatible load when hideAmountOnPush was omitted in older payloads
    mockGetItemAsync.mockResolvedValueOnce(
      JSON.stringify({
        enabled: true,
        eveningHour: 20,
        eveningMinute: 30,
        overspendingAlertsEnabled: true,
      })
    );
    await expect(storage.load()).resolves.toEqual({
      enabled: true,
      eveningHour: 20,
      eveningMinute: 30,
      overspendingAlertsEnabled: true,
      hideAmountOnPush: false,
    });

    mockSetItemAsync.mockRejectedValueOnce(new Error('Keychain locked'));
    await expect(
      storage.save({
        enabled: true,
        eveningHour: 20,
        eveningMinute: 30,
        overspendingAlertsEnabled: true,
        hideAmountOnPush: false,
      })
    ).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' });

    mockSetItemAsync.mockResolvedValueOnce(undefined);
    await storage.save({
      enabled: true,
      eveningHour: 21,
      eveningMinute: 15,
      overspendingAlertsEnabled: false,
      hideAmountOnPush: true,
    });
    expect(mockSetItemAsync).toHaveBeenLastCalledWith(
      'test.prefs',
      JSON.stringify({
        enabled: true,
        eveningHour: 21,
        eveningMinute: 15,
        overspendingAlertsEnabled: false,
        hideAmountOnPush: true,
      })
    );
  });
});
