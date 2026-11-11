import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, type } from '../theme';

type Props = PropsWithChildren<{ title: string; description: string }>;

export function PlaceholderScreen({ title, description, children }: Props) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.brand}>CARENTA</Text>
          <Text style={styles.caption}>Bản mẫu ứng dụng</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.body}>{description}</Text>
        <View style={styles.notice}>
          <Text style={styles.body}>Chưa có dữ liệu tài chính. Các tính năng đang được phát triển.</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 20, paddingBottom: 32 },
  header: { gap: 4, marginBottom: 20 },
  brand: { ...type.heading, color: colors.primary },
  caption: { ...type.caption, color: colors.muted },
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.muted },
  notice: { borderLeftWidth: 3, borderLeftColor: colors.border, paddingLeft: 16 },
});
