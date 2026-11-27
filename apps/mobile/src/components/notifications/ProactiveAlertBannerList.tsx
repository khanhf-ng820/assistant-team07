import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useOptionalNotifications } from '../../context/NotificationContext';
import { formatReminderTime, ProactiveAlert } from '../../notifications/alertEngine';
import { colors, type } from '../../theme';

const AlertBannerCard = React.memo(function AlertBannerCard({
  alert,
  onPrimaryPress,
  onDismiss,
}: {
  alert: ProactiveAlert;
  onPrimaryPress: (alert: ProactiveAlert) => void;
  onDismiss: (alertId: string) => void;
}) {
  const isDanger = alert.severity === 'danger';
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    let anim: Animated.CompositeAnimation | null = null;

    const runEntrance = async () => {
      let reduceMotion = false;
      try {
        reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        reduceMotion = false;
      }

      if (cancelled) {
        return;
      }

      if (reduceMotion) {
        fadeAnim.setValue(1);
        return;
      }

      fadeAnim.setValue(0.2);
      anim = Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      });
      anim.start();
    };

    void runEntrance();

    return () => {
      cancelled = true;
      anim?.stop();
    };
  }, [alert.id, fadeAnim]);

  return (
    <Animated.View
      style={[
        styles.bannerCard,
        isDanger ? styles.dangerCard : styles.warningCard,
        { opacity: fadeAnim },
      ]}
      testID={`alert-banner-${alert.kind}`}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.bannerHeader}>
        <View
          style={[
            styles.badgeIconCircle,
            isDanger ? styles.dangerIconCircle : styles.warningIconCircle,
          ]}
        >
          <Text style={styles.badgeIconText}>{isDanger ? '⚠️' : '🌙'}</Text>
        </View>
        <View style={styles.bannerCopy}>
          <Text
            style={[
              styles.bannerTitle,
              isDanger ? styles.dangerTitle : styles.warningTitle,
            ]}
          >
            {alert.title}
          </Text>
          <Text style={styles.bannerMessage} testID={`alert-message-${alert.kind}`}>
            {alert.message}
          </Text>
        </View>
      </View>

      <View style={styles.bannerActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={alert.primaryActionLabel}
          onPress={() => onPrimaryPress(alert)}
          style={({ pressed }) => [
            styles.primaryAction,
            isDanger ? styles.dangerButton : styles.warningButton,
            pressed && styles.pressed,
          ]}
          testID={`alert-primary-action-${alert.kind}`}
        >
          <Text style={styles.primaryActionText}>{alert.primaryActionLabel}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Bỏ qua ${alert.title}`}
          onPress={() => onDismiss(alert.id)}
          style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
          testID={`alert-dismiss-${alert.kind}`}
        >
          <Text style={styles.dismissButtonText}>Bỏ qua</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
});

export function ProactiveAlertBannerList() {
  const notifications = useOptionalNotifications();

  if (!notifications) {
    return null;
  }

  const {
    activeAlerts,
    preferences,
    permissionStatus,
    handleAlertPrimaryAction,
    dismissAlert,
    openSettingsModal,
  } = notifications;

  const reminderSummary =
    preferences.enabled && permissionStatus === 'granted'
      ? `Đang bật • Nhắc ${formatReminderTime(preferences.eveningHour, preferences.eveningMinute)}`
      : preferences.enabled
        ? 'Cần cấp quyền thông báo'
        : 'Chưa bật — Nhấn để cài đặt';

  return (
    <View style={styles.container} testID="proactive-alert-banner-list">
      {activeAlerts.map((alert) => (
        <AlertBannerCard
          key={alert.id}
          alert={alert}
          onPrimaryPress={handleAlertPrimaryAction}
          onDismiss={dismissAlert}
        />
      ))}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Nhắc nhở thông minh: ${reminderSummary}`}
        onPress={openSettingsModal}
        style={({ pressed }) => [styles.settingsBar, pressed && styles.pressed]}
        testID="open-notification-settings-button"
      >
        <View style={styles.settingsBarLeft}>
          <Text style={styles.settingsBellIcon}>🔔</Text>
          <View style={styles.settingsBarTextGroup}>
            <Text style={styles.settingsBarTitle}>Nhắc nhở thông minh</Text>
            <Text style={styles.settingsBarSubtitle} testID="notification-settings-summary">
              {reminderSummary}
            </Text>
          </View>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 10,
  },
  bannerCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  dangerCard: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.dangerSoft,
  },
  warningCard: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warningBorder,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  badgeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerIconCircle: {
    backgroundColor: colors.dangerSoft,
  },
  warningIconCircle: {
    backgroundColor: colors.warningSoft,
  },
  badgeIconText: {
    fontSize: 18,
  },
  bannerCopy: {
    flex: 1,
    gap: 4,
  },
  bannerTitle: {
    ...type.captionBold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dangerTitle: {
    color: colors.dangerText,
  },
  warningTitle: {
    color: colors.warningText,
  },
  bannerMessage: {
    ...type.bodyBold,
    color: colors.text,
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dangerButton: {
    backgroundColor: colors.dangerText,
  },
  warningButton: {
    backgroundColor: colors.warningText,
  },
  primaryActionText: {
    ...type.captionBold,
    color: colors.surface,
    fontSize: 13,
  },
  dismissButton: {
    minHeight: 48,
    minWidth: 76,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  dismissButtonText: {
    ...type.captionBold,
    color: colors.muted,
    fontSize: 13,
  },
  settingsBar: {
    minHeight: 52,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  settingsBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsBellIcon: {
    fontSize: 18,
  },
  settingsBarTextGroup: {
    flex: 1,
    gap: 2,
  },
  settingsBarTitle: {
    ...type.bodyBold,
    color: colors.text,
  },
  settingsBarSubtitle: {
    ...type.caption,
    color: colors.muted,
  },
  settingsChevron: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.subtle,
  },
  pressed: {
    opacity: 0.8,
  },
});
