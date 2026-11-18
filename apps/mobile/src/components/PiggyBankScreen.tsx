import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SavingsSnapshot } from '../savings/demoData';
import { formatVnd, progressPercent } from '../savings/goal';
import { colors, type } from '../theme';
import { GoalEditorModal, type GoalDraft } from './GoalEditorModal';

type Props = { initialSnapshot: SavingsSnapshot; today: string; isSampleData?: boolean };

/** Piggy Bank savings screen ("Heo tiết kiệm"). */
export function PiggyBankScreen({ initialSnapshot, today, isSampleData = false }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [editing, setEditing] = useState(false);
  const { goal, savedVnd } = snapshot;
  const percent = progressPercent(goal.targetVnd, savedVnd);

  function saveGoal(next: GoalDraft) {
    // Only target and deadline change; cash and saved amount are preserved.
    setSnapshot((current) => ({ ...current, goal: { ...current.goal, ...next } }));
    setEditing(false);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Heo tiết kiệm</Text>
        {isSampleData ? <Text style={styles.caption}>Dữ liệu mẫu — chưa kết nối máy chủ</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Con heo đất ${percent}%. Chạm để thay đổi mục tiêu`}
          onPress={() => setEditing(true)}
          style={styles.pigCard}
        >
          <View style={styles.pig}>
            <Text style={styles.pigEmoji} importantForAccessibility="no" accessibilityElementsHidden>🐷</Text>
          </View>
          <Text style={styles.saved}>{formatVnd(savedVnd)}</Text>
          <Text style={styles.body}>trên mục tiêu {formatVnd(goal.targetVnd)} · hạn {goal.deadline}</Text>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Tiến độ tiết kiệm"
            accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%` }}
            style={styles.track}
          >
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.percent}>{percent}%</Text>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Đặt/Thay đổi mục tiêu" onPress={() => setEditing(true)} style={styles.editButton}>
          <Text style={styles.editText}>Đặt/Thay đổi mục tiêu</Text>
        </Pressable>

        <View style={styles.metrics}>
          <Metric label="Tiền còn lại (Safe-to-Spend)" value={snapshot.safeToSpendVnd} />
          <Metric label="Tiền đã chi hôm nay" value={snapshot.spentTodayVnd} />
          <Metric label="Hạn mức trong ngày" value={snapshot.dailyBudgetVnd} />
        </View>

        <Text accessibilityRole="header" style={styles.heading}>Lịch sử đút heo</Text>
        {snapshot.history.length === 0 ? (
          <Text style={styles.body}>Chưa có lần đút heo nào.</Text>
        ) : (
          snapshot.history.map((entry) => {
            const signed = entry.kind === 'allocation' ? `+${formatVnd(entry.amountVnd)}` : `-${formatVnd(entry.amountVnd)}`;
            const label = entry.kind === 'allocation' ? 'Đút heo' : 'Rút heo';
            return (
              <View key={entry.id} accessibilityLabel={`${label} ${signed} ngày ${entry.date}`} style={styles.historyRow}>
                <View>
                  <Text style={styles.historyKind}>{label}</Text>
                  <Text style={styles.caption}>{entry.date}</Text>
                </View>
                <Text style={[styles.historyAmount, entry.kind === 'release' && styles.release]}>{signed}</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {editing ? (
        <GoalEditorModal
          goal={{ targetVnd: goal.targetVnd, deadline: goal.deadline }}
          savedVnd={savedVnd}
          cashVnd={snapshot.cashVnd}
          today={today}
          onCancel={() => setEditing(false)}
          onSave={saveGoal}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View accessibilityLabel={`${label}: ${formatVnd(value)}`} style={styles.metric}>
      <Text style={styles.caption}>{label}</Text>
      <Text style={styles.metricValue}>{formatVnd(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16, paddingBottom: 32 },
  title: { ...type.title, color: colors.text },
  heading: { ...type.heading, color: colors.text, marginTop: 8 },
  body: { ...type.body, color: colors.muted, textAlign: 'center' },
  caption: { ...type.caption, color: colors.muted },
  pigCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border },
  pig: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#FFE4E6', alignItems: 'center', justifyContent: 'center' },
  pigEmoji: { fontSize: 64, lineHeight: 76 },
  saved: { ...type.title, color: colors.savings },
  track: { alignSelf: 'stretch', height: 12, borderRadius: 6, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.savings },
  percent: { ...type.body, fontWeight: '600', color: colors.text },
  editButton: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.savings, alignItems: 'center', justifyContent: 'center' },
  editText: { ...type.body, fontWeight: '600', color: colors.savings },
  metrics: { gap: 12 },
  metric: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 4, borderWidth: 1, borderColor: colors.border },
  metricValue: { ...type.heading, color: colors.text },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 12, minHeight: 56 },
  historyKind: { ...type.body, fontWeight: '600', color: colors.text },
  historyAmount: { ...type.body, fontWeight: '600', color: colors.primary },
  release: { color: colors.savings },
});
