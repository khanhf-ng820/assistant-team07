import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { ApiHealthCheck } from '../../src/components/ApiHealthCheck';
import { PlaceholderScreen } from '../../src/components/PlaceholderScreen';
import { apiBaseUrl } from '../../src/config';
import { colors, type } from '../../src/theme';

function SessionStatusBar() {
  const { status, session, signOut } = useAuth();
  if (status === 'local_dev') {
    return (
      <Text style={styles.localNote}>
        Chế độ LAN cục bộ (chưa cấu hình Supabase)
      </Text>
    );
  }
  if (status === 'authenticated' && session) {
    return (
      <View style={styles.sessionRow}>
        <Text style={styles.userText}>{session.user.email ?? session.user.id}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đăng xuất"
          onPress={() => {
            void signOut();
          }}
          style={styles.logoutButton}
        >
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </Pressable>
      </View>
    );
  }
  return null;
}

export default function StatsScreen() {
  return (
    <PlaceholderScreen title="Thống kê" description="Chi tiêu và báo cáo sẽ xuất hiện tại đây.">
      <ApiHealthCheck baseUrl={apiBaseUrl} />
      <SessionStatusBar />
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  localNote: { ...type.caption, color: colors.muted },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 4,
  },
  userText: { ...type.caption, color: colors.text, flexShrink: 1 },
  logoutButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  logoutText: { ...type.caption, color: colors.savings, fontWeight: '600' },
});
