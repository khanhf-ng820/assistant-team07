import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaptureChooser } from '../../src/components/CaptureChooser';
import { useOptionalCapture } from '../../src/context/CaptureContext';
import { colors, type } from '../../src/theme';

function TemplateTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const capture = useOptionalCapture();
  const isCaptureBusy = capture?.isCaptureBusy ?? false;

  const handleOpenChooser = () => {
    if (isCaptureBusy || captureOpen) return;
    setCaptureOpen(true);
  };

  return (
    <>
      <View
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}
        accessibilityElementsHidden={captureOpen}
        importantForAccessibility={captureOpen ? 'no-hide-descendants' : 'auto'}
      >
        {state.routes.map((route, index) => {
          const selected = state.index === index;
          const color = selected ? (route.name === 'savings' ? colors.savings : colors.primary) : colors.muted;
          const label = descriptors[route.key].options.title ?? route.name;
          return (
            <Fragment key={route.key}>
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                style={styles.tab}
                onPress={() => {
                  const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!selected && !event.defaultPrevented) navigateToTab(route.key);
                }}
              >
                <Text style={[styles.tabText, { color }]}>{label}</Text>
              </Pressable>
              {index === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thêm giao dịch"
                  accessibilityState={{ disabled: isCaptureBusy }}
                  disabled={isCaptureBusy}
                  style={[styles.plus, isCaptureBusy && styles.plusDisabled]}
                  onPress={handleOpenChooser}
                >
                  <Text style={styles.plusText}>+</Text>
                </Pressable>
              ) : null}
            </Fragment>
          );
        })}
      </View>
      <CaptureChooser visible={captureOpen} onClose={() => setCaptureOpen(false)} />
    </>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TemplateTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Thống kê' }} />
      <Tabs.Screen name="savings" options={{ title: 'Tiết kiệm' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, paddingHorizontal: 12 },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  tabText: { ...type.body, fontWeight: '600', textAlign: 'center' },
  plus: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  plusDisabled: { opacity: 0.5 },
  plusText: { fontSize: 30, lineHeight: 36, color: colors.surface },
});
