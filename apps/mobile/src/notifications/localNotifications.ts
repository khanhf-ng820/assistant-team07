import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';
import {
  clampReminderTime,
  GENERIC_SCHEDULED_REMINDER_BODY,
  GENERIC_SCHEDULED_REMINDER_TITLE,
  NotificationActionTarget,
  parseNotificationActionTarget,
  ProactiveAlertKind,
  ReminderPreferences,
} from './alertEngine';

export type NotificationPermissionOutcome =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'unavailable';

export interface NotificationPermissionResult {
  outcome: NotificationPermissionOutcome;
  canAskAgain: boolean;
}

export interface RawNotificationPermissionResponse {
  status?: string;
  granted?: boolean;
  canAskAgain?: boolean;
}

export interface LocalNotificationPayload {
  title: string;
  body: string;
  data: {
    alertId: string;
    kind: ProactiveAlertKind | 'scheduled_daily_checkin';
    actionTarget: NotificationActionTarget;
    date?: string;
  };
}

export interface NotificationResponseEvent {
  actionTarget: NotificationActionTarget | null;
  alertId?: string;
}

export interface NotificationAdapter {
  getPermissions: () => Promise<NotificationPermissionResult>;
  requestPermissions: () => Promise<NotificationPermissionResult>;
  configureAndroidChannel: () => Promise<void>;
  presentLocalNotification: (payload: LocalNotificationPayload) => Promise<string | null>;
  scheduleDailyCheckInReminder: (hour: number, minute: number) => Promise<string | null>;
  cancelScheduledNotification: (identifier: string) => Promise<void>;
  subscribeNotificationResponse: (
    listener: (event: NotificationResponseEvent) => void
  ) => () => void;
  openSettings: () => Promise<boolean>;
}

export type ReminderStorageErrorCode = 'STORAGE_READ_FAILED' | 'STORAGE_WRITE_FAILED';

export class ReminderStorageError extends Error {
  readonly code: ReminderStorageErrorCode;
  readonly userMessage: string;

  constructor(code: ReminderStorageErrorCode, message: string, userMessage: string) {
    super(message);
    this.name = 'ReminderStorageError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

export interface ReminderPreferencesStorage {
  load: () => Promise<ReminderPreferences | null>;
  save: (prefs: ReminderPreferences) => Promise<void>;
}

export const CARENTA_ALERT_CHANNEL_ID = 'carenta-alerts';
export const REMINDER_PREFS_STORAGE_KEY = 'carenta.notifications.preferences.v1';

/** Normalizes raw Expo notification permission responses into deterministic states. */
export function normalizeNotificationPermission(
  response: RawNotificationPermissionResponse | null | undefined
): NotificationPermissionResult {
  if (!response) {
    return { outcome: 'unavailable', canAskAgain: false };
  }

  if (response.granted === true || response.status === 'granted') {
    return { outcome: 'granted', canAskAgain: true };
  }

  if (response.canAskAgain === false) {
    return { outcome: 'blocked', canAskAgain: false };
  }

  return {
    outcome: 'denied',
    canAskAgain: response.canAskAgain ?? true,
  };
}

async function loadExpoNotificationsModule(): Promise<typeof import('expo-notifications') | null> {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

let foregroundHandlerConfigured = false;

function ensureForegroundNotificationHandler(
  notificationsModule: typeof import('expo-notifications')
): void {
  if (foregroundHandlerConfigured || typeof notificationsModule.setNotificationHandler !== 'function') {
    return;
  }
  foregroundHandlerConfigured = true;
  notificationsModule.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Creates the production Expo Notifications adapter with graceful degradation
 * when running in environments without native notification modules.
 */
export function createExpoNotificationAdapter(): NotificationAdapter {
  return {
    async getPermissions() {
      const mod = await loadExpoNotificationsModule();
      if (!mod?.getPermissionsAsync) {
        return { outcome: 'unavailable', canAskAgain: false };
      }
      try {
        const raw = await mod.getPermissionsAsync();
        return normalizeNotificationPermission(raw);
      } catch {
        return { outcome: 'unavailable', canAskAgain: false };
      }
    },

    async requestPermissions() {
      const mod = await loadExpoNotificationsModule();
      if (!mod?.requestPermissionsAsync) {
        return { outcome: 'unavailable', canAskAgain: false };
      }
      try {
        if (mod.getPermissionsAsync) {
          const current = normalizeNotificationPermission(await mod.getPermissionsAsync());
          if (current.outcome === 'granted' || current.outcome === 'blocked') {
            return current;
          }
        }
        const raw = await mod.requestPermissionsAsync();
        return normalizeNotificationPermission(raw);
      } catch {
        return { outcome: 'unavailable', canAskAgain: false };
      }
    },

    async configureAndroidChannel() {
      if (Platform.OS !== 'android') {
        return;
      }
      const mod = await loadExpoNotificationsModule();
      if (!mod?.setNotificationChannelAsync) {
        return;
      }
      try {
        await mod.setNotificationChannelAsync(CARENTA_ALERT_CHANNEL_ID, {
          name: 'Cảnh báo & Nhắc nhở CARENTA',
          importance: mod.AndroidImportance.HIGH,
          ...(mod.AndroidNotificationVisibility
            ? { lockscreenVisibility: mod.AndroidNotificationVisibility.PRIVATE }
            : {}),
        });
      } catch {
        // Ignore channel setup failure on unsupported runtimes
      }
    },

    async presentLocalNotification(payload) {
      const mod = await loadExpoNotificationsModule();
      if (!mod?.scheduleNotificationAsync) {
        return null;
      }
      try {
        ensureForegroundNotificationHandler(mod);
        return await mod.scheduleNotificationAsync({
          content: {
            title: payload.title,
            body: payload.body,
            data: payload.data,
            sound: true,
          },
          trigger: null,
        });
      } catch {
        return null;
      }
    },

    async scheduleDailyCheckInReminder(hour, minute) {
      const mod = await loadExpoNotificationsModule();
      if (!mod?.scheduleNotificationAsync || !mod?.SchedulableTriggerInputTypes) {
        return null;
      }
      const { eveningHour, eveningMinute } = clampReminderTime(hour, minute);
      try {
        ensureForegroundNotificationHandler(mod);
        return await mod.scheduleNotificationAsync({
          content: {
            title: GENERIC_SCHEDULED_REMINDER_TITLE,
            body: GENERIC_SCHEDULED_REMINDER_BODY,
            data: {
              alertId: 'scheduled_daily_checkin',
              kind: 'scheduled_daily_checkin',
              actionTarget: 'open_manual_entry',
            },
            sound: true,
          },
          trigger: {
            type: mod.SchedulableTriggerInputTypes.DAILY,
            hour: eveningHour,
            minute: eveningMinute,
            ...(Platform.OS === 'android' ? { channelId: CARENTA_ALERT_CHANNEL_ID } : {}),
          },
        });
      } catch {
        return null;
      }
    },

    async cancelScheduledNotification(identifier) {
      if (!identifier) {
        return;
      }
      const mod = await loadExpoNotificationsModule();
      if (!mod?.cancelScheduledNotificationAsync) {
        return;
      }
      try {
        await mod.cancelScheduledNotificationAsync(identifier);
      } catch {
        // Ignore cancellation failures when identifier no longer exists
      }
    },

    subscribeNotificationResponse(listener) {
      let disposed = false;
      let subscription: { remove?: () => void } | null = null;

      void loadExpoNotificationsModule().then((mod) => {
        if (disposed || !mod?.addNotificationResponseReceivedListener) {
          return;
        }
        subscription = mod.addNotificationResponseReceivedListener((response) => {
          const rawData = response?.notification?.request?.content?.data as
            | Record<string, unknown>
            | undefined;
          const actionTarget = parseNotificationActionTarget(rawData?.actionTarget);
          const alertId = typeof rawData?.alertId === 'string' ? rawData.alertId : undefined;
          listener({ actionTarget, alertId });
        });
      });

      return () => {
        disposed = true;
        try {
          subscription?.remove?.();
        } catch {
          // Ignore cleanup failure in environments with partial native mocks
        }
      };
    },

    async openSettings() {
      try {
        await Linking.openSettings();
        return true;
      } catch {
        return false;
      }
    },
  };
}

function validateStoredPreferences(raw: unknown): ReminderPreferences {
  if (!raw || typeof raw !== 'object') {
    throw new ReminderStorageError(
      'STORAGE_READ_FAILED',
      'Corrupt reminder preferences payload',
      'Không thể đọc cài đặt nhắc nhở đã lưu.'
    );
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.enabled !== 'boolean' ||
    typeof obj.eveningHour !== 'number' ||
    typeof obj.eveningMinute !== 'number' ||
    typeof obj.overspendingAlertsEnabled !== 'boolean' ||
    (obj.hideAmountOnPush !== undefined && typeof obj.hideAmountOnPush !== 'boolean')
  ) {
    throw new ReminderStorageError(
      'STORAGE_READ_FAILED',
      'Invalid reminder preferences schema',
      'Dữ liệu cài đặt nhắc nhở không hợp lệ.'
    );
  }
  const clamped = clampReminderTime(obj.eveningHour, obj.eveningMinute);
  return {
    enabled: obj.enabled,
    eveningHour: clamped.eveningHour,
    eveningMinute: clamped.eveningMinute,
    overspendingAlertsEnabled: obj.overspendingAlertsEnabled,
    hideAmountOnPush: obj.hideAmountOnPush ?? false,
  };
}

/**
 * Persists opt-in reminder preferences in expo-secure-store.
 * Fails closed on read/parse corruption instead of silently resetting preferences.
 */
export function createSecureReminderPreferencesStorage(
  key: string = REMINDER_PREFS_STORAGE_KEY
): ReminderPreferencesStorage {
  return {
    async load() {
      let rawJson: string | null;
      try {
        rawJson = await SecureStore.getItemAsync(key);
      } catch (err) {
        throw new ReminderStorageError(
          'STORAGE_READ_FAILED',
          err instanceof Error ? err.message : 'Failed reading reminder preferences',
          'Không thể đọc cài đặt nhắc nhở từ bộ nhớ bảo mật.'
        );
      }

      if (rawJson === null) {
        return null;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        throw new ReminderStorageError(
          'STORAGE_READ_FAILED',
          'Corrupt JSON in reminder preferences',
          'Cài đặt nhắc nhở bị lỗi định dạng.'
        );
      }

      return validateStoredPreferences(parsed);
    },

    async save(prefs) {
      const clamped = clampReminderTime(prefs.eveningHour, prefs.eveningMinute);
      const serialized = JSON.stringify({
        enabled: Boolean(prefs.enabled),
        eveningHour: clamped.eveningHour,
        eveningMinute: clamped.eveningMinute,
        overspendingAlertsEnabled: Boolean(prefs.overspendingAlertsEnabled),
        hideAmountOnPush: Boolean(prefs.hideAmountOnPush),
      });
      try {
        await SecureStore.setItemAsync(key, serialized);
      } catch (err) {
        throw new ReminderStorageError(
          'STORAGE_WRITE_FAILED',
          err instanceof Error ? err.message : 'Failed writing reminder preferences',
          'Không thể lưu cài đặt nhắc nhở vào bộ nhớ bảo mật.'
        );
      }
    },
  };
}
