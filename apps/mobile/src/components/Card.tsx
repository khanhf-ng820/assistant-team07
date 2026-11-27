import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { colors, radius, shadows, spacing } from '../theme';

export interface CardProps extends ViewProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'elevated' | 'outlined' | 'flat';
  padding?: keyof typeof spacing | number;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function Card({
  children,
  style,
  variant = 'elevated',
  padding = 'lg',
  onPress,
  accessibilityLabel,
  testID,
  ...rest
}: CardProps) {
  const padValue = typeof padding === 'number' ? padding : (spacing[padding] ?? spacing.lg);

  const cardStyle: ViewStyle = {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    padding: padValue,
    ...(variant === 'elevated' ? shadows.sm : {}),
    ...(variant === 'outlined' ? { borderWidth: 1, borderColor: colors.border } : {}),
  };

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          styles.base,
          cardStyle,
          pressed && styles.pressed,
          style,
        ]}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[styles.base, cardStyle, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.92,
  },
});

export default Card;
