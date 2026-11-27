import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'savings' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  icon?: React.ReactNode;
  testID?: string;
}

export type ButtonSize = NonNullable<ButtonProps['size']>;
export type ButtonVariant = NonNullable<ButtonProps['variant']>;

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
  textStyle,
  icon,
  testID,
}: ButtonProps) {
  const isInteractive = !disabled && !loading;

  // Sizing maps (maintaining >= 48x48dp touch target)
  const sizeStyles: Record<ButtonSize, ViewStyle> = {
    sm: { minWidth: 48, minHeight: 48, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
    md: { minWidth: 48, minHeight: 48, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
    lg: { minWidth: 48, minHeight: 56, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  };

  // Backgrounds & borders by variant
  const variantStyles: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: colors.primary, borderWidth: 0 },
    secondary: { backgroundColor: colors.surfaceAlt, borderWidth: 0 },
    savings: { backgroundColor: colors.savings, borderWidth: 0 },
    outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
    danger: { backgroundColor: colors.danger, borderWidth: 0 },
    ghost: { backgroundColor: 'transparent', borderWidth: 0 },
  };

  // Text color by variant
  const textColors: Record<ButtonVariant, string> = {
    primary: colors.surface,
    secondary: colors.text,
    savings: colors.text,
    outline: colors.text,
    danger: colors.text,
    ghost: colors.primary,
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      disabled={!isInteractive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        disabled && styles.disabled,
        pressed && isInteractive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={textColors[variant] ?? colors.surface}
          testID={`${testID ?? 'button'}-loading`}
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              typography.bodyBold,
              { color: textColors[variant] },
              disabled && styles.disabledText,
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.5,
  },
  disabledText: {
    color: colors.muted,
  },
});

export default Button;
