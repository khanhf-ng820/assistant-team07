import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { HabitSuggestion } from '../api/contracts';
import { isApiError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { useLedger } from '../context/LedgerContext';
import { formatVnd } from '../format';
import { colors, type } from '../theme';
import { CATEGORIES, type CategoryId, formatVietnameseDate } from '../types/transaction';
import {
  cancelHabitReminder, readHabitReminders, scheduleHabitReminder, setHabitReminders,
} from './reminders';

export function HabitPrompt() {
  const { isApiConfigured, status, student } = useAuth();
  const owner = status === 'local_dev' ? 'local-dev' : student?.id;
  return isApiConfigured && owner ? <HabitCard key={owner} owner={owner} /> : null;
}

function HabitCard({ owner }: { owner: string }) {
  const { apiClient } = useAuth();
  const pathname = usePathname();
  const { addConfirmedExpense, openManualEntry, transactions } = useLedger();
  const [suggestion, setSuggestion] = useState<HabitSuggestion | null>(null);
  const [reminders, setReminders] = useState(false);
  const [changingReminders, setChangingReminders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const acting = useRef(false);

  useEffect(() => {
    if (pathname !== '/') return;
    let request: AbortController | undefined;
    const refresh = async () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const { suggestion: current } = await apiClient.getHabitSuggestion({ signal: controller.signal });
        if (controller.signal.aborted || acting.current) return;
        setSuggestion(current);
        if (!current) {
          void cancelHabitReminder().catch(() => {});
        }
      } catch {
        if (!controller.signal.aborted && !acting.current) setSuggestion(null);
      }
    };
    void refresh();
    void readHabitReminders(owner)
      .then((enabled) => {
        if (request && !request.signal.aborted) setReminders(enabled);
      })
      .catch(() => {});
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      request?.abort();
      subscription.remove();
    };
  }, [apiClient, owner, pathname, transactions]);

  useEffect(() => {
    if (suggestion && reminders && !acting.current) {
      void scheduleHabitReminder(owner, suggestion.date).catch(() => {});
    }
  }, [owner, reminders, suggestion]);

  async function resolveSuggestion(confirm: boolean) {
    if (!suggestion || acting.current) return;
    acting.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (confirm) {
        const transaction = await apiClient.confirmHabit(suggestion.id);
        addConfirmedExpense(transaction);
        setMessage(`Đã ghi khoản chi ${formatVnd(transaction.amount)}.`);
      } else {
        await apiClient.dismissHabit(suggestion.id);
        setMessage('Đã bỏ qua gợi ý.');
      }
      setSuggestion(null);
      void cancelHabitReminder().catch(() => {});
    } catch (error) {
      if (isApiError(error) && error.code === 'HABIT_STALE') {
        setSuggestion(null);
        void cancelHabitReminder().catch(() => {});
      }
      setMessage(isApiError(error) ? error.userMessage : 'Không thể xử lý gợi ý. Vui lòng thử lại.');
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  async function toggleReminders(enabled: boolean) {
    setChangingReminders(true);
    setReminderMessage('');
    try {
      const allowed = await setHabitReminders(owner, enabled);
      setReminders(allowed);
      if (enabled && !allowed) {
        setReminderMessage('Hãy cho phép thông báo trong cài đặt của thiết bị.');
      }
    } catch {
      setReminderMessage('Không thể cập nhật nhắc nhở. Vui lòng thử lại.');
    } finally {
      setChangingReminders(false);
    }
  }

  const categoryId = suggestion && Object.hasOwn(CATEGORIES, suggestion.category)
    ? suggestion.category as CategoryId
    : null;
  const category = categoryId ? CATEGORIES[categoryId].name : suggestion?.category;

  return (
    <View style={styles.card}>
      {suggestion ? (
        <>
          <Text style={styles.heading}>Gợi ý khoản chi hôm nay</Text>
          <Text style={styles.amount}>{formatVnd(suggestion.amount)}</Text>
          <Text style={styles.body}>{suggestion.note} · {category}</Text>
          <Text style={styles.detail}>
            {formatVietnameseDate(suggestion.date)} · Lặp lại {suggestion.matching_days}/7 ngày
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              onPress={() => void resolveSuggestion(true)}
              style={[styles.button, styles.primary]}
            >
              <Text style={styles.primaryText}>Duyệt 1 chạm</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => openManualEntry({
                amount: suggestion.amount,
                categoryId: categoryId ?? 'other',
                date: suggestion.date,
                note: suggestion.note,
              })}
              style={styles.button}
            >
              <Text style={styles.secondaryText}>Chỉnh sửa</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void resolveSuggestion(false)}
              style={styles.button}
            >
              <Text style={styles.secondaryText}>Bỏ qua</Text>
            </Pressable>
          </View>
        </>
      ) : null}
      {message ? <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text> : null}
      <View style={styles.preference}>
        <Text style={styles.body}>Nhắc gợi ý thói quen</Text>
        <Switch
          accessibilityLabel="Nhắc gợi ý thói quen"
          disabled={changingReminders}
          value={reminders}
          onValueChange={(enabled) => void toggleReminders(enabled)}
        />
      </View>
      {reminderMessage ? (
        <Text accessibilityLiveRegion="polite" style={styles.detail}>{reminderMessage}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8, marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface,
  },
  heading: { ...type.subheading, color: colors.primaryDark },
  amount: { ...type.amountDisplay, color: colors.text },
  body: { ...type.body, color: colors.text, flexShrink: 1 },
  detail: { ...type.caption, color: colors.muted },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10 },
  primary: { backgroundColor: colors.primaryButton },
  primaryText: { ...type.bodyBold, color: colors.surface },
  secondaryText: { ...type.bodyBold, color: colors.muted },
  preference: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
