import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backAccessibilityLabel?: string;
  rightAction?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Header({
  title,
  subtitle,
  onBack,
  backAccessibilityLabel = 'Quay lại',
  rightAction,
  style,
  testID,
}: HeaderProps) {
  return (
    <View testID={testID} style={[styles.container, style]}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backAccessibilityLabel}
            onPress={onBack}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
        ) : null}
        <View style={styles.titleContainer}>
          <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {rightAction ? <View style={styles.right}>{rightAction}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.muted,
    marginTop: 2,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backIcon: {
    fontSize: 20,
    color: colors.text,
    lineHeight: 24,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});

export default Header;
