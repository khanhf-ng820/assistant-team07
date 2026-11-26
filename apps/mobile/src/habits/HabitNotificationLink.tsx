import { clearLastNotificationResponse, useLastNotificationResponse } from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { cancelHabitReminder, HABIT_NOTIFICATION } from './reminders';

export function HabitNotificationLink() {
  const { isApiConfigured } = useAuth();
  return isApiConfigured ? <NotificationListener /> : null;
}

function NotificationListener() {
  const { status, student } = useAuth();
  const owner = status === 'local_dev' ? 'local-dev' : student?.id;
  const previousOwner = useRef(owner);
  const router = useRouter();
  const navigationKey = useRootNavigationState()?.key;
  const response = useLastNotificationResponse();

  useEffect(() => {
    if (status === 'restoring') return;
    if (!owner || (previousOwner.current && previousOwner.current !== owner)) {
      void cancelHabitReminder().catch(() => {});
    }
    previousOwner.current = owner;
  }, [owner, status]);

  useEffect(() => {
    if (!owner || !navigationKey || response?.notification.request.content.data?.kind !== HABIT_NOTIFICATION) {
      return;
    }
    clearLastNotificationResponse();
    router.navigate('/');
  }, [navigationKey, owner, response, router]);
  return null;
}
