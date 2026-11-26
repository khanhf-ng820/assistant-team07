import React, { useEffect } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const TOAST_BADGE_CONFIG: Record<
  ToastType,
  { bg: string; fg: string; icon: string; label: string }
> = {
  success: {
    bg: colors.successSoft,
    fg: colors.text,
    icon: '✓',
    label: 'Thành công',
  },
  warning: {
    bg: colors.warningSoft,
    fg: colors.text,
    icon: '!',
    label: 'Cảnh báo',
  },
  error: {
    bg: colors.dangerSoft,
    fg: colors.text,
    icon: '✕',
    label: 'Lỗi',
  },
  info: {
    bg: colors.primaryLight,
    fg: colors.text,
    icon: 'ℹ',
    label: 'Thông báo',
  },
};

export function Toast({
  visible,
  message,
  type = 'info',
  duration = 3000,
  onDismiss,
  style,
  testID = 'toast',
}: ToastProps) {
  useEffect(() => {
    if (visible && duration > 0 && onDismiss) {
      const timer = setTimeout(() => {
        onDismiss();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  const typeConfig = TOAST_BADGE_CONFIG[type];

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${typeConfig.label}: ${message}`}
      style={[styles.container, shadows.lg, style]}
    >
      <View
        testID={`${testID}-badge`}
        style={[styles.badge, { backgroundColor: typeConfig.bg }]}
      >
        <Text style={[styles.badgeText, { color: typeConfig.fg }]}>
          {typeConfig.icon}
        </Text>
      </View>
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng thông báo"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={onDismiss}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: spacing.lg,
    right: spacing.lg,
    minHeight: 52,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    ...typography.body,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 20,
    color: colors.muted,
    lineHeight: 22,
  },
});

export default Toast;
