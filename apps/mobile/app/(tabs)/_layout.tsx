import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaptureChooser } from '../../src/components/CaptureChooser';
import { colors, radius, shadows, spacing, typography } from '../../src/theme';

function TemplateTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const [captureOpen, setCaptureOpen] = useState(false);

  // Identify routes dynamically
  const statsIndex = state.routes.findIndex((r) => r.name === 'index');
  const savingsIndex = state.routes.findIndex((r) => r.name === 'savings');

  const statsRoute = statsIndex >= 0 ? state.routes[statsIndex] : state.routes[0];
  const savingsRoute = savingsIndex >= 0 ? state.routes[savingsIndex] : state.routes[1];

  const renderTab = (route: typeof statsRoute, index: number) => {
    if (!route) return null;
    const isSelected = state.index === index;
    const color = isSelected
      ? route.name === 'savings'
        ? colors.savings
        : colors.primary
      : colors.muted;
    const label = descriptors[route.key]?.options?.title ?? route.name;

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: isSelected }}
        style={styles.tab}
        onPress={() => {
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isSelected && !event.defaultPrevented) {
            navigateToTab(route.key);
          }
        }}
      >
        <Text style={[styles.tabIcon, { color }]}>
          {route.name === 'savings' ? '🐷' : '📊'}
        </Text>
        <Text style={[styles.tabText, { color }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <>
      <View
        style={[
          styles.bar,
          {
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
        accessibilityElementsHidden={captureOpen}
        importantForAccessibility={captureOpen ? 'no-hide-descendants' : 'auto'}
      >
        {/* Slot 1: Thống kê */}
        <View style={styles.tabSlot}>
          {renderTab(statsRoute, statsIndex >= 0 ? statsIndex : 0)}
        </View>

        {/* Slot 2: Floating 56x56 + Button raised 12px */}
        <View style={styles.plusSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thêm giao dịch"
            style={({ pressed }) => [
              styles.plus,
              shadows.floating,
              pressed && styles.plusPressed,
            ]}
            onPress={() => setCaptureOpen(true)}
          >
            <Text style={styles.plusText}>+</Text>
          </Pressable>
        </View>

        {/* Slot 3: Tiết kiệm */}
        <View style={styles.tabSlot}>
          {renderTab(savingsRoute, savingsIndex >= 0 ? savingsIndex : 1)}
        </View>
      </View>

      <CaptureChooser visible={captureOpen} onClose={() => setCaptureOpen(false)} />
    </>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TemplateTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Thống kê' }} />
      <Tabs.Screen name="savings" options={{ title: 'Tiết kiệm' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 84, // Fixed reference bar height 84 including safe area per docs/carenta-implementation-plan.md §4
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    ...shadows.md,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    gap: 2,
  },
  tabIcon: {
    fontSize: 18,
  },
  tabText: {
    ...typography.captionBold,
    textAlign: 'center',
  },
  plusSlot: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -12 }],
  },
  plusPressed: {
    opacity: 0.9,
    transform: [{ translateY: -10 }],
  },
  plusText: {
    fontSize: 32,
    lineHeight: 36,
    color: colors.surface,
    fontWeight: '400',
    marginTop: -2,
  },
});
