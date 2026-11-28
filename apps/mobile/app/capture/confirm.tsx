import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Header } from '../../src/components/Header';
import { AiConfirmationFlow } from '../../src/components/ai-confirmation/AiConfirmationModal';
import { useLedger } from '../../src/context/LedgerContext';
import { colors, spacing, typography } from '../../src/theme';

export default function CaptureConfirmScreen() {
  const router = useRouter();
  const { pendingAiDraft, closeAiConfirmation } = useLedger();

  const goToStats = () => {
    router.replace('/');
  };

  if (!pendingAiDraft) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <Header
          title="Kiểm tra giao dịch AI"
          onBack={goToStats}
          backAccessibilityLabel="Quay lại Thống kê"
        />
        <View style={styles.emptyContainer}>
          <Card variant="elevated" padding="xl" style={styles.emptyCard}>
            <Text accessibilityRole="header" style={styles.emptyTitle}>
              Chưa có bản nháp cần xác nhận
            </Text>
            <Text style={styles.emptyBody}>
              Hãy quét hóa đơn hoặc ghi âm giao dịch trước khi mở màn hình xác nhận.
            </Text>
            <Button
              testID="confirm-empty-back-button"
              title="Về trang Thống kê"
              variant="primary"
              onPress={goToStats}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <AiConfirmationFlow
        draft={pendingAiDraft}
        backAccessibilityLabel="Quay lại"
        onClose={() => {
          closeAiConfirmation();
          goToStats();
        }}
        onNavigateToStats={goToStats}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  emptyCard: {
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text,
  },
  emptyBody: {
    ...typography.body,
    color: colors.muted,
  },
});
