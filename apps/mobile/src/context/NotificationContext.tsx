import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import {
  BudgetRecoveryPlan,
  buildBudgetRecoveryPlan,
  clampReminderTime,
  DEFAULT_REMINDER_PREFERENCES,
  evaluateEveningCheckInAlert,
  evaluateOverspendingAlert,
  EVENING_CHECKIN_MESSAGE,
  EVENING_CHECKIN_TITLE,
  formatOverspendingAlertMessage,
  OVERSPENDING_ALERT_TITLE,
  ProactiveAlert,
  ProactiveAlertKind,
  ReminderPreferences,
} from '../notifications/alertEngine';
import {
  createExpoNotificationAdapter,
  createSecureReminderPreferencesStorage,
  LocalNotificationPayload,
  NotificationAdapter,
  NotificationPermissionOutcome,
  ReminderPreferencesStorage,
  ReminderStorageError,
} from '../notifications/localNotifications';
import { useLedger } from './LedgerContext';

export interface PushDispatchRecord {
  identifier: string | null;
  payload: LocalNotificationPayload;
  dispatchedAtIso: string;
}

export interface NotificationContextType {
  preferences: ReminderPreferences;
  permissionStatus: NotificationPermissionOutcome;
  activeAlerts: ProactiveAlert[];
  isRecoveryModalOpen: boolean;
  recoveryPlan: BudgetRecoveryPlan | null;
  isSettingsModalOpen: boolean;
  lastPushDispatch: PushDispatchRecord | null;
  settingsError: string | null;
  toggleNotifications: (nextEnabled: boolean) => Promise<boolean>;
  toggleOverspendingAlerts: (nextEnabled: boolean) => Promise<void>;
  updateEveningTime: (hour: number, minute: number) => Promise<void>;
  dismissAlert: (alertId: string) => void;
  handleAlertPrimaryAction: (alert: ProactiveAlert) => void;
  openRecoveryPreview: (date?: string) => void;
  closeRecoveryPreview: () => void;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  openOsNotificationSettings: () => Promise<boolean>;
  triggerLocalTestNotification: (kind: ProactiveAlertKind) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: React.ReactNode;
  adapter?: NotificationAdapter;
  preferencesStorage?: ReminderPreferencesStorage;
  nowProvider?: () => Date;
}

export function NotificationProvider({
  children,
  adapter: providedAdapter,
  preferencesStorage: providedStorage,
  nowProvider = () => new Date(),
}: NotificationProviderProps) {
  const {
    selectedDate,
    dailyBudgetLimit,
    transactions,
    getSummaryForDate,
    openManualEntry,
    closeDaySheet,
    closeManualEntry,
  } = useLedger();

  const adapter = useMemo(
    () => providedAdapter ?? createExpoNotificationAdapter(),
    [providedAdapter]
  );
  const storage = useMemo(
    () => providedStorage ?? createSecureReminderPreferencesStorage(),
    [providedStorage]
  );

  const [preferences, setPreferences] = useState<ReminderPreferences>(
    DEFAULT_REMINDER_PREFERENCES
  );
  const [permissionStatus, setPermissionStatus] =
    useState<NotificationPermissionOutcome>('denied');
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Record<string, true>>({});
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState<boolean>(false);
  const [recoveryDate, setRecoveryDate] = useState<string>(selectedDate);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [lastPushDispatch, setLastPushDispatch] = useState<PushDispatchRecord | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [, setClockTick] = useState<number>(0);

  const isMountedRef = useRef<boolean>(true);
  const scheduledDailyIdRef = useRef<string | null>(null);
  const eveningCheckInNotificationByDateRef = useRef<Record<string, string>>({});
  const dispatchedEveningDatesRef = useRef<Record<string, true>>({});
  const lastOverspentByDateRef = useRef<Record<string, number>>({});
  const lastSeenTxIdRef = useRef<string | null>(transactions[0]?.id ?? null);
  const awaitingSettingsReturnRef = useRef<boolean>(false);
  const togglingRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const syncDailySchedule = useCallback(
    async (nextPrefs: ReminderPreferences, permOutcome: NotificationPermissionOutcome) => {
      if (scheduledDailyIdRef.current) {
        await adapter.cancelScheduledNotification(scheduledDailyIdRef.current);
        scheduledDailyIdRef.current = null;
      }

      if (nextPrefs.enabled && permOutcome === 'granted') {
        await adapter.configureAndroidChannel();
        const identifier = await adapter.scheduleDailyCheckInReminder(
          nextPrefs.eveningHour,
          nextPrefs.eveningMinute
        );
        if (isMountedRef.current) {
          scheduledDailyIdRef.current = identifier;
        }
      }
    },
    [adapter]
  );

  // Hydrate persisted opt-in preferences and current OS permission on mount
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const [perm, loadedPrefs] = await Promise.all([
        adapter.getPermissions(),
        storage.load().catch((err) => {
          if (!cancelled && isMountedRef.current) {
            setSettingsError(
              err instanceof ReminderStorageError
                ? err.userMessage
                : 'Không thể đọc cài đặt nhắc nhở đã lưu.'
            );
          }
          return null;
        }),
      ]);

      if (cancelled || !isMountedRef.current) {
        return;
      }

      setPermissionStatus(perm.outcome);
      if (loadedPrefs) {
        setPreferences(loadedPrefs);
        await syncDailySchedule(loadedPrefs, perm.outcome);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [adapter, storage, syncDailySchedule]);

  // Refresh time evaluation and re-check OS permission when returning to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      setClockTick((prev) => prev + 1);

      if (!awaitingSettingsReturnRef.current) {
        return;
      }
      awaitingSettingsReturnRef.current = false;

      void adapter.getPermissions().then(async (perm) => {
        if (!isMountedRef.current) {
          return;
        }
        setPermissionStatus(perm.outcome);
        if (perm.outcome === 'granted') {
          setSettingsError(null);
          if (preferences.enabled) {
            await syncDailySchedule(preferences, perm.outcome);
          }
        }
      });
    });

    return () => {
      subscription?.remove?.();
    };
  }, [adapter, preferences, syncDailySchedule]);

  const activeSummary = useMemo(
    () => getSummaryForDate(selectedDate),
    [getSummaryForDate, selectedDate]
  );

  const currentClock = nowProvider();
  const currentHour = currentClock.getHours();
  const currentMinute = currentClock.getMinutes();

  const overspendingAlert = useMemo(() => {
    if (!preferences.overspendingAlertsEnabled) {
      return null;
    }
    return evaluateOverspendingAlert(activeSummary, dailyBudgetLimit);
  }, [activeSummary, dailyBudgetLimit, preferences.overspendingAlertsEnabled]);

  const eveningCheckInAlert = useMemo(
    () =>
      evaluateEveningCheckInAlert(
        activeSummary,
        currentHour,
        currentMinute,
        preferences.eveningHour,
        preferences.eveningMinute
      ),
    [
      activeSummary,
      currentHour,
      currentMinute,
      preferences.eveningHour,
      preferences.eveningMinute,
    ]
  );

  const activeAlerts = useMemo(() => {
    const alerts: ProactiveAlert[] = [];
    if (overspendingAlert && !dismissedAlertIds[overspendingAlert.id]) {
      alerts.push(overspendingAlert);
    }
    if (eveningCheckInAlert && !dismissedAlertIds[eveningCheckInAlert.id]) {
      alerts.push(eveningCheckInAlert);
    }
    return alerts;
  }, [dismissedAlertIds, eveningCheckInAlert, overspendingAlert]);

  const dispatchLocalPush = useCallback(
    async (payload: LocalNotificationPayload): Promise<boolean> => {
      await adapter.configureAndroidChannel();
      const identifier = await adapter.presentLocalNotification(payload);
      if (!isMountedRef.current) {
        return false;
      }
      setLastPushDispatch({
        identifier,
        payload,
        dispatchedAtIso: new Date().toISOString(),
      });
      return identifier !== null;
    },
    [adapter]
  );

  // Seed baseline overspent tracking for the viewed date so switching dates does not falsely trigger pushes
  useEffect(() => {
    if (lastOverspentByDateRef.current[selectedDate] === undefined) {
      lastOverspentByDateRef.current[selectedDate] = overspendingAlert?.overspentAmount ?? 0;
    }
  }, [overspendingAlert, selectedDate]);

  // Evaluate overspending push & cancel same-day evening reminder for every confirmed transaction (including cross-date)
  useEffect(() => {
    const latestTx = transactions[0];
    if (!latestTx || latestTx.id === lastSeenTxIdRef.current) {
      return;
    }
    lastSeenTxIdRef.current = latestTx.id;

    const existingEveningId = eveningCheckInNotificationByDateRef.current[latestTx.date];
    if (existingEveningId) {
      delete eveningCheckInNotificationByDateRef.current[latestTx.date];
      void adapter.cancelScheduledNotification(existingEveningId);
    }

    const txSummary = getSummaryForDate(latestTx.date);
    const txOverspendingAlert = preferences.overspendingAlertsEnabled
      ? evaluateOverspendingAlert(txSummary, dailyBudgetLimit)
      : null;
    const prevOverspent = lastOverspentByDateRef.current[latestTx.date] ?? 0;
    const nextOverspent = txOverspendingAlert?.overspentAmount ?? 0;
    lastOverspentByDateRef.current[latestTx.date] = nextOverspent;

    if (
      !txOverspendingAlert ||
      nextOverspent <= prevOverspent ||
      !preferences.enabled ||
      permissionStatus !== 'granted'
    ) {
      return;
    }

    void dispatchLocalPush({
      title: txOverspendingAlert.title,
      body: txOverspendingAlert.message,
      data: {
        alertId: txOverspendingAlert.id,
        kind: 'overspending',
        actionTarget: 'open_budget_recovery',
        date: txOverspendingAlert.date,
      },
    });
  }, [
    adapter,
    dailyBudgetLimit,
    dispatchLocalPush,
    getSummaryForDate,
    permissionStatus,
    preferences.enabled,
    preferences.overspendingAlertsEnabled,
    transactions,
  ]);

  // Trigger or cancel same-day evening check-in notification based on live confirmed expenses
  useEffect(() => {
    if (activeSummary.transactions.length > 0) {
      const existingId = eveningCheckInNotificationByDateRef.current[selectedDate];
      if (existingId) {
        delete eveningCheckInNotificationByDateRef.current[selectedDate];
        void adapter.cancelScheduledNotification(existingId);
      }
      return;
    }

    if (
      !eveningCheckInAlert ||
      !preferences.enabled ||
      permissionStatus !== 'granted' ||
      dispatchedEveningDatesRef.current[selectedDate]
    ) {
      return;
    }

    dispatchedEveningDatesRef.current[selectedDate] = true;
    void adapter.configureAndroidChannel().then(async () => {
      const payload: LocalNotificationPayload = {
        title: eveningCheckInAlert.title,
        body: eveningCheckInAlert.message,
        data: {
          alertId: eveningCheckInAlert.id,
          kind: 'evening_checkin',
          actionTarget: 'open_manual_entry',
          date: eveningCheckInAlert.date,
        },
      };
      const identifier = await adapter.presentLocalNotification(payload);
      if (!isMountedRef.current) {
        return;
      }
      if (identifier) {
        eveningCheckInNotificationByDateRef.current[selectedDate] = identifier;
      }
      setLastPushDispatch({
        identifier,
        payload,
        dispatchedAtIso: new Date().toISOString(),
      });
    });
  }, [
    activeSummary.transactions.length,
    adapter,
    eveningCheckInAlert,
    permissionStatus,
    preferences.enabled,
    selectedDate,
  ]);

  const openRecoveryPreview = useCallback(
    (date?: string) => {
      setRecoveryDate(date ?? selectedDate);
      setIsRecoveryModalOpen(true);
    },
    [selectedDate]
  );

  const closeRecoveryPreview = useCallback(() => {
    setIsRecoveryModalOpen(false);
  }, []);

  const routeNotificationTarget = useCallback(
    (target: ProactiveAlert['primaryActionTarget'], date?: string) => {
      if (target === 'open_budget_recovery') {
        openRecoveryPreview(date);
        return;
      }
      if (target === 'open_manual_entry') {
        closeDaySheet();
        setIsRecoveryModalOpen(false);
        openManualEntry();
        return;
      }
      setIsRecoveryModalOpen(false);
      closeManualEntry();
    },
    [closeDaySheet, closeManualEntry, openManualEntry, openRecoveryPreview]
  );

  // Subscribe to OS notification tap responses using strict target allowlist
  useEffect(() => {
    const unsubscribe = adapter.subscribeNotificationResponse((event) => {
      if (!event.actionTarget) {
        return;
      }
      routeNotificationTarget(event.actionTarget, selectedDate);
    });
    return unsubscribe;
  }, [adapter, routeNotificationTarget, selectedDate]);

  const persistPreferences = useCallback(
    async (nextPrefs: ReminderPreferences): Promise<boolean> => {
      try {
        await storage.save(nextPrefs);
        if (isMountedRef.current) {
          setSettingsError(null);
        }
        return true;
      } catch (err) {
        if (isMountedRef.current) {
          setSettingsError(
            err instanceof ReminderStorageError
              ? err.userMessage
              : 'Không thể lưu cài đặt nhắc nhở.'
          );
        }
        return false;
      }
    },
    [storage]
  );

  const toggleNotifications = useCallback(
    async (nextEnabled: boolean): Promise<boolean> => {
      if (togglingRef.current) {
        return preferences.enabled;
      }
      togglingRef.current = true;
      setSettingsError(null);

      try {
        if (!nextEnabled) {
          const nextPrefs: ReminderPreferences = { ...preferences, enabled: false };
          setPreferences(nextPrefs);
          await syncDailySchedule(nextPrefs, permissionStatus);
          await persistPreferences(nextPrefs);
          return false;
        }

        const perm = await adapter.requestPermissions();
        if (!isMountedRef.current) {
          return false;
        }
        setPermissionStatus(perm.outcome);

        if (perm.outcome !== 'granted') {
          const disabledPrefs: ReminderPreferences = { ...preferences, enabled: false };
          setPreferences(disabledPrefs);
          await persistPreferences(disabledPrefs);
          setSettingsError(
            perm.outcome === 'blocked'
              ? 'Quyền thông báo đang bị chặn. Vui lòng mở Cài đặt hệ thống để bật lại.'
              : perm.outcome === 'unavailable'
                ? 'Thiết bị hoặc môi trường hiện tại chưa hỗ trợ thông báo cục bộ.'
                : 'Bạn chưa cấp quyền thông báo. Vui lòng thử lại để nhận nhắc nhở.'
          );
          return false;
        }

        const enabledPrefs: ReminderPreferences = { ...preferences, enabled: true };
        setPreferences(enabledPrefs);
        await syncDailySchedule(enabledPrefs, perm.outcome);
        await persistPreferences(enabledPrefs);
        return true;
      } finally {
        togglingRef.current = false;
      }
    },
    [adapter, permissionStatus, persistPreferences, preferences, syncDailySchedule]
  );

  const toggleOverspendingAlerts = useCallback(
    async (nextEnabled: boolean) => {
      const nextPrefs: ReminderPreferences = {
        ...preferences,
        overspendingAlertsEnabled: nextEnabled,
      };
      setPreferences(nextPrefs);
      await persistPreferences(nextPrefs);
    },
    [persistPreferences, preferences]
  );

  const updateEveningTime = useCallback(
    async (hour: number, minute: number) => {
      const clamped = clampReminderTime(hour, minute);
      const nextPrefs: ReminderPreferences = {
        ...preferences,
        eveningHour: clamped.eveningHour,
        eveningMinute: clamped.eveningMinute,
      };
      setPreferences(nextPrefs);
      await syncDailySchedule(nextPrefs, permissionStatus);
      await persistPreferences(nextPrefs);
    },
    [permissionStatus, persistPreferences, preferences, syncDailySchedule]
  );

  const dismissAlert = useCallback((alertId: string) => {
    setDismissedAlertIds((prev) => ({ ...prev, [alertId]: true }));
  }, []);

  const handleAlertPrimaryAction = useCallback(
    (alert: ProactiveAlert) => {
      routeNotificationTarget(alert.primaryActionTarget, alert.date);
    },
    [routeNotificationTarget]
  );

  const openSettingsModal = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setIsSettingsModalOpen(false);
  }, []);

  const openOsNotificationSettings = useCallback(async () => {
    awaitingSettingsReturnRef.current = true;
    const opened = await adapter.openSettings();
    if (!opened) {
      awaitingSettingsReturnRef.current = false;
    }
    return opened;
  }, [adapter]);

  const triggerLocalTestNotification = useCallback(
    async (kind: ProactiveAlertKind): Promise<boolean> => {
      if (!preferences.enabled || permissionStatus !== 'granted') {
        setSettingsError(
          'Vui lòng bật nhắc nhở và cấp quyền thông báo trước khi thử nghiệm.'
        );
        return false;
      }
      setSettingsError(null);

      if (kind === 'overspending') {
        const sampleAmount = overspendingAlert?.overspentAmount ?? 45000;
        return dispatchLocalPush({
          title: OVERSPENDING_ALERT_TITLE,
          body: formatOverspendingAlertMessage(sampleAmount),
          data: {
            alertId: `overspending:${selectedDate}:${sampleAmount}`,
            kind: 'overspending',
            actionTarget: 'open_budget_recovery',
            date: selectedDate,
          },
        });
      }

      return dispatchLocalPush({
        title: EVENING_CHECKIN_TITLE,
        body: EVENING_CHECKIN_MESSAGE,
        data: {
          alertId: `evening_checkin:${selectedDate}`,
          kind: 'evening_checkin',
          actionTarget: 'open_manual_entry',
          date: selectedDate,
        },
      });
    },
    [
      dispatchLocalPush,
      overspendingAlert?.overspentAmount,
      permissionStatus,
      preferences.enabled,
      selectedDate,
    ]
  );

  const recoveryPlan = useMemo(() => {
    if (!isRecoveryModalOpen) {
      return null;
    }
    return buildBudgetRecoveryPlan(getSummaryForDate(recoveryDate), dailyBudgetLimit);
  }, [dailyBudgetLimit, getSummaryForDate, isRecoveryModalOpen, recoveryDate]);

  const value = useMemo<NotificationContextType>(
    () => ({
      preferences,
      permissionStatus,
      activeAlerts,
      isRecoveryModalOpen,
      recoveryPlan,
      isSettingsModalOpen,
      lastPushDispatch,
      settingsError,
      toggleNotifications,
      toggleOverspendingAlerts,
      updateEveningTime,
      dismissAlert,
      handleAlertPrimaryAction,
      openRecoveryPreview,
      closeRecoveryPreview,
      openSettingsModal,
      closeSettingsModal,
      openOsNotificationSettings,
      triggerLocalTestNotification,
    }),
    [
      activeAlerts,
      closeRecoveryPreview,
      closeSettingsModal,
      dismissAlert,
      handleAlertPrimaryAction,
      isRecoveryModalOpen,
      isSettingsModalOpen,
      lastPushDispatch,
      openOsNotificationSettings,
      openRecoveryPreview,
      openSettingsModal,
      permissionStatus,
      preferences,
      recoveryPlan,
      settingsError,
      toggleNotifications,
      toggleOverspendingAlerts,
      triggerLocalTestNotification,
      updateEveningTime,
    ]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useOptionalNotifications(): NotificationContextType | null {
  return useContext(NotificationContext) ?? null;
}

export function useNotifications(): NotificationContextType {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}
