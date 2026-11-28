import {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { todayInVietnam } from '../savings/goal';

export const HABIT_NOTIFICATION = 'carenta-habit';
const CHANNEL = 'habit-reminders';
const REMINDER_ID = 'carenta-habit-reminder';
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => {});
  return result;
}

function prefKey(owner: string) {
  return `habit.enabled.${owner}`;
}

function lastScheduledDateKey(owner: string) {
  return `habit.last-scheduled-date.${owner}`;
}

export async function readHabitReminders(owner: string): Promise<boolean> {
  return (
    await SecureStore.getItemAsync(prefKey(owner)) === 'true' &&
    (await getPermissionsAsync()).granted
  );
}

export function setHabitReminders(owner: string, enabled: boolean): Promise<boolean> {
  return serialize(async () => {
    if (enabled) {
      await setNotificationChannelAsync(CHANNEL, {
        name: 'Gợi ý thói quen',
        importance: AndroidImportance.DEFAULT,
      });
      const current = await getPermissionsAsync();
      if (!current.granted && !current.canAskAgain) return false;
      if (!current.granted && !(await requestPermissionsAsync()).granted) return false;
    }
    await SecureStore.setItemAsync(prefKey(owner), String(enabled));
    if (!enabled) {
      await cancelScheduledNotificationAsync(REMINDER_ID);
      await SecureStore.deleteItemAsync(lastScheduledDateKey(owner));
    }
    return enabled;
  });
}

export function scheduleHabitReminder(owner: string, date: string): Promise<void> {
  return serialize(async () => {
    const now = new Date();
    if (date !== todayInVietnam(now) || !(await readHabitReminders(owner))) return;
    const lastDateKey = lastScheduledDateKey(owner);
    if (await SecureStore.getItemAsync(lastDateKey) === date) return;

    const evening = new Date(`${date}T18:00:00+07:00`).getTime();
    const midnight = new Date(`${date}T00:00:00+07:00`).getTime() + 86_400_000;
    const target = Math.max(evening, now.getTime() + 60_000);
    if (target >= midnight) return;

    await cancelScheduledNotificationAsync(REMINDER_ID);
    await scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: 'CARENTA',
        body: 'Bạn có gợi ý thói quen mới. Mở ứng dụng để kiểm tra.',
        data: { kind: HABIT_NOTIFICATION },
      },
      trigger: {
        type: SchedulableTriggerInputTypes.DATE,
        date: new Date(target),
        channelId: CHANNEL,
        delivery: 'bestEffort',
      },
    });
    await SecureStore.setItemAsync(lastDateKey, date);
  });
}

export function cancelHabitReminder(): Promise<void> {
  return serialize(() => cancelScheduledNotificationAsync(REMINDER_ID));
}
