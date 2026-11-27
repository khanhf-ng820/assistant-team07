import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNotifications } from '../../context/NotificationContext';
import {
  formatReminderTime,
  GENERIC_SCHEDULED_REMINDER_BODY,
} from '../../notifications/alertEngine';
import { colors, type } from '../../theme';

const PRESET_TIMES: ReadonlyArray<{ hour: number; minute: number; label: string }> = [
  { hour: 19, minute: 0, label: '19:00' },
  { hour: 20, minute: 0, label: '20:00' },
  { hour: 21, minute: 0, label: '21:00' },
  { hour: 22, minute: 0, label: '22:00' },
];

export function NotificationSettingsModal() {
  const {
    preferences,
    permissionStatus,
    isSettingsModalOpen,
    settingsError,
    closeSettingsModal,
    toggleNotifications,
    toggleOverspendingAlerts,
    updateEveningTime,
    openOsNotificationSettings,
    triggerLocalTestNotification,
  } = useNotifications();

  const shiftMinutes = (deltaMinutes: number) => {
    const currentTotal = preferences.eveningHour * 60 + preferences.eveningMinute;
    const bounded = Math.min(23 * 60 + 45, Math.max(17 * 60, currentTotal + deltaMinutes));
    const nextHour = Math.floor(bounded / 60);
    const nextMinute = bounded % 60;
    void updateEveningTime(nextHour, nextMinute);
  };

  const permissionLabel =
    permissionStatus === 'granted'
      ? 'Đã cấp quyền thông báo'
      : permissionStatus === 'blocked'
        ? 'Đã chặn trong Cài đặt'
        : permissionStatus === 'unavailable'
          ? 'Thiết bị không hỗ trợ'
          : 'Chưa cấp quyền';

  const canSendTestPush = preferences.enabled && permissionStatus === 'granted';

  return (
    <Modal
      testID="notification-settings-modal"
      visible={isSettingsModalOpen}
      transparent
      animationType="slide"
      onRequestClose={closeSettingsModal}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng cài đặt thông báo"
          onPress={closeSettingsModal}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.title}>
                Cài đặt nhắc nhở thông minh
              </Text>
              <Text style={styles.subtitle} testID="notification-permission-status">
                Trạng thái quyền: {permissionLabel}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng"
              onPress={closeSettingsModal}
              hitSlop={8}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              testID="notification-settings-close"
            >
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {settingsError ? (
              <View style={styles.errorBanner} testID="notification-settings-error">
                <Text style={styles.errorBannerText}>{settingsError}</Text>
              </View>
            ) : null}

            {/* Primary Opt-In Toggle */}
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Bật nhắc nhở thông báo cục bộ"
              accessibilityState={{ checked: preferences.enabled }}
              onPress={() => void toggleNotifications(!preferences.enabled)}
              style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
              testID="toggle-notifications-button"
            >
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>Thông báo cục bộ (Opt-in)</Text>
                <Text style={styles.toggleSubtitle}>
                  Nhắc kiểm tra chi tiêu buổi tối và cảnh báo khi vượt hạn mức ngày
                </Text>
              </View>
              <View
                style={[
                  styles.switchPill,
                  preferences.enabled ? styles.switchPillOn : styles.switchPillOff,
                ]}
              >
                <Text
                  style={[
                    styles.switchPillText,
                    preferences.enabled ? styles.switchTextOn : styles.switchTextOff,
                  ]}
                >
                  {preferences.enabled ? 'Đang bật' : 'Đang tắt'}
                </Text>
              </View>
            </Pressable>

            {/* Overspending Toggle */}
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Bật cảnh báo vượt hạn mức ngày"
              accessibilityState={{ checked: preferences.overspendingAlertsEnabled }}
              onPress={() =>
                void toggleOverspendingAlerts(!preferences.overspendingAlertsEnabled)
              }
              style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
              testID="toggle-overspending-alerts-button"
            >
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>Cảnh báo vượt hạn mức ngày</Text>
                <Text style={styles.toggleSubtitle}>
                  Hiển thị cảnh báo ngay khi khoản chi xác nhận vượt hạn mức hôm nay
                </Text>
              </View>
              <View
                style={[
                  styles.switchPill,
                  preferences.overspendingAlertsEnabled
                    ? styles.switchPillOn
                    : styles.switchPillOff,
                ]}
              >
                <Text
                  style={[
                    styles.switchPillText,
                    preferences.overspendingAlertsEnabled
                      ? styles.switchTextOn
                      : styles.switchTextOff,
                  ]}
                >
                  {preferences.overspendingAlertsEnabled ? 'Bật' : 'Tắt'}
                </Text>
              </View>
            </Pressable>

            {/* Blocked permission recovery */}
            {permissionStatus === 'blocked' ? (
              <View style={styles.blockedBox}>
                <Text style={styles.blockedText}>
                  Quyền thông báo đã bị tắt trong Cài đặt hệ thống. Mở Cài đặt để bật lại thông báo cho CARENTA.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mở Cài đặt hệ thống"
                  onPress={() => void openOsNotificationSettings()}
                  style={({ pressed }) => [styles.settingsLinkButton, pressed && styles.pressed]}
                  testID="notification-open-os-settings-button"
                >
                  <Text style={styles.settingsLinkButtonText}>Mở Cài đặt hệ thống</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Evening Time Picker */}
            <View style={styles.sectionCard}>
              <View style={styles.timeHeaderRow}>
                <Text style={styles.sectionHeading}>Giờ nhắc nhở buổi tối</Text>
                <Text style={styles.selectedTimeText} testID="evening-time-value">
                  {formatReminderTime(preferences.eveningHour, preferences.eveningMinute)}
                </Text>
              </View>

              <View style={styles.presetRow}>
                {PRESET_TIMES.map((preset) => {
                  const isActive =
                    preferences.eveningHour === preset.hour &&
                    preferences.eveningMinute === preset.minute;
                  return (
                    <Pressable
                      key={preset.label}
                      accessibilityRole="button"
                      accessibilityLabel={`Chọn giờ ${preset.label}`}
                      accessibilityState={{ selected: isActive }}
                      onPress={() => void updateEveningTime(preset.hour, preset.minute)}
                      style={({ pressed }) => [
                        styles.presetChip,
                        isActive && styles.presetChipActive,
                        pressed && styles.pressed,
                      ]}
                      testID={`preset-time-${preset.label}`}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          isActive && styles.presetChipTextActive,
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.stepperRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Giảm 15 phút"
                  onPress={() => shiftMinutes(-15)}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
                  testID="evening-time-minus-15"
                >
                  <Text style={styles.stepperButtonText}>-15 phút</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tăng 15 phút"
                  onPress={() => shiftMinutes(15)}
                  style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
                  testID="evening-time-plus-15"
                >
                  <Text style={styles.stepperButtonText}>+15 phút</Text>
                </Pressable>
              </View>

              <Text style={styles.genericCopyNote}>
                Thông báo nền định kỳ sử dụng nội dung an toàn: &quot;{GENERIC_SCHEDULED_REMINDER_BODY}&quot;.
              </Text>
            </View>

            {/* Safe Demo Test Push Triggers */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeading}>Kiểm tra nhanh thông báo cục bộ</Text>
              <View style={styles.testButtonsRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thử thông báo vượt mức"
                  accessibilityState={{ disabled: !canSendTestPush }}
                  disabled={!canSendTestPush}
                  onPress={() => void triggerLocalTestNotification('overspending')}
                  style={({ pressed }) => [
                    styles.testPushButton,
                    !canSendTestPush && styles.testPushDisabled,
                    pressed && styles.pressed,
                  ]}
                  testID="test-overspending-push-button"
                >
                  <Text style={styles.testPushText}>Thử thông báo vượt mức</Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thử nhắc buổi tối"
                  accessibilityState={{ disabled: !canSendTestPush }}
                  disabled={!canSendTestPush}
                  onPress={() => void triggerLocalTestNotification('evening_checkin')}
                  style={({ pressed }) => [
                    styles.testPushButton,
                    !canSendTestPush && styles.testPushDisabled,
                    pressed && styles.pressed,
                  ]}
                  testID="test-evening-push-button"
                >
                  <Text style={styles.testPushText}>Thử nhắc buổi tối</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlayBackdrop,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    gap: 14,
    maxHeight: '88%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...type.heading,
    color: colors.text,
    fontWeight: '700',
  },
  subtitle: {
    ...type.caption,
    color: colors.muted,
  },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.muted,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 12,
  },
  errorBanner: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.dangerSoft,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorBannerText: {
    ...type.captionBold,
    color: colors.dangerText,
  },
  toggleRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  toggleCopy: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    ...type.bodyBold,
    color: colors.text,
  },
  toggleSubtitle: {
    ...type.caption,
    color: colors.muted,
  },
  switchPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  switchPillOn: {
    backgroundColor: colors.primary,
  },
  switchPillOff: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  switchPillText: {
    ...type.captionBold,
  },
  switchTextOn: {
    color: colors.surface,
  },
  switchTextOff: {
    color: colors.muted,
  },
  blockedBox: {
    backgroundColor: colors.warningLight,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  blockedText: {
    ...type.caption,
    color: colors.warningText,
  },
  settingsLinkButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.warningText,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  settingsLinkButtonText: {
    ...type.bodyBold,
    color: colors.surface,
  },
  sectionCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  timeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeading: {
    ...type.bodyBold,
    color: colors.text,
  },
  selectedTimeText: {
    ...type.heading,
    color: colors.primary,
    fontWeight: '700',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetChipText: {
    ...type.bodyBold,
    color: colors.text,
  },
  presetChipTextActive: {
    color: colors.surface,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stepperButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    ...type.captionBold,
    color: colors.primary,
    fontSize: 13,
  },
  genericCopyNote: {
    ...type.caption,
    color: colors.muted,
  },
  testButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  testPushButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  testPushDisabled: {
    opacity: 0.45,
  },
  testPushText: {
    ...type.captionBold,
    color: colors.primary,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
