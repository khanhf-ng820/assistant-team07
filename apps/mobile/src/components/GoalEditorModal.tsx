import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatVnd, parseLocalDate, parseVnd, recommendSavings } from '../savings/goal';
import { colors, type } from '../theme';

export type GoalDraft = { targetVnd: number; deadline: string };

type Props = {
  goal: GoalDraft;
  savedVnd: number;
  cashVnd: number;
  today: string;
  onCancel: () => void;
  onSave: (goal: GoalDraft) => void;
};

/** Set/Edit Goal ("Đặt/Thay đổi Goal"). Cancelling discards the draft. */
export function GoalEditorModal({ goal, savedVnd, cashVnd, today, onCancel, onSave }: Props) {
  const [targetText, setTargetText] = useState(String(goal.targetVnd));
  const [deadline, setDeadline] = useState(goal.deadline);

  const targetVnd = parseVnd(targetText);
  const deadlineDay = parseLocalDate(deadline);
  const todayDay = parseLocalDate(today);
  const targetError = targetVnd === null ? 'Nhập số tiền mục tiêu hợp lệ (VND).' : null;
  const deadlineError =
    deadlineDay === null
      ? 'Nhập ngày theo dạng YYYY-MM-DD.'
      : todayDay !== null && deadlineDay < todayDay
        ? 'Hạn mục tiêu không được trước hôm nay.'
        : null;
  const valid = !targetError && !deadlineError;
  const plan = valid ? recommendSavings({ targetVnd: targetVnd!, savedVnd, today, deadline }) : null;

  return (
    <Modal testID="goal-editor" visible transparent animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View accessibilityViewIsModal style={styles.sheet}>
            <Text accessibilityRole="header" style={styles.heading}>Đặt/Thay đổi mục tiêu</Text>

            <View style={styles.readOnly}>
              <Text style={styles.label}>Số tiền thực tế</Text>
              <Text accessibilityLabel={`Số tiền thực tế ${formatVnd(cashVnd)}, chỉ đọc`} style={styles.value}>
                {formatVnd(cashVnd)}
              </Text>
              <Text style={styles.label}>Đã tiết kiệm: {formatVnd(savedVnd)}</Text>
            </View>

            <Text style={styles.label}>Số tiền mục tiêu (₫)</Text>
            <TextInput
              accessibilityLabel="Số tiền mục tiêu"
              keyboardType="number-pad"
              value={targetText}
              onChangeText={setTargetText}
              style={styles.input}
            />
            {targetError ? <Text style={styles.error}>{targetError}</Text> : null}

            <Text style={styles.label}>Hạn mục tiêu</Text>
            <TextInput
              accessibilityLabel="Hạn mục tiêu"
              placeholder="YYYY-MM-DD"
              value={deadline}
              onChangeText={setDeadline}
              autoCapitalize="none"
              style={styles.input}
            />
            {deadlineError ? <Text style={styles.error}>{deadlineError}</Text> : null}

            {plan ? <Recommendation plan={plan} /> : null}

            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Hủy" onPress={onCancel} style={[styles.button, styles.secondary]}>
                <Text style={styles.secondaryText}>Hủy</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Lưu mục tiêu"
                accessibilityState={{ disabled: !valid }}
                disabled={!valid}
                onPress={() => onSave({ targetVnd: targetVnd!, deadline: deadline.trim() })}
                style={[styles.button, styles.primary, !valid && styles.disabled]}
              >
                <Text style={styles.primaryText}>Lưu mục tiêu</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Recommendation({ plan }: { plan: ReturnType<typeof recommendSavings> }) {
  return (
    <View style={styles.recommendation}>
      <Text style={styles.label}>Mức tiết kiệm đề xuất</Text>
      {plan.status === 'completed' ? (
        <Text style={styles.value}>Đã đạt mục tiêu</Text>
      ) : plan.status === 'due_today' ? (
        <Text style={styles.value}>Cần {formatVnd(plan.remainingVnd)} trong hôm nay</Text>
      ) : (
        <>
          <Text style={styles.value}>{formatVnd(plan.dailyVnd!)} / ngày</Text>
          <Text style={styles.body}>
            {formatVnd(plan.thirtyDayVnd!)} / tháng (30 ngày) · còn {plan.savingDays} ngày
          </Text>
        </>
      )}
      <Text style={styles.caption}>Tính từ các giao dịch đã xác nhận</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  scrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 10 },
  heading: { ...type.heading, color: colors.text, marginBottom: 6 },
  readOnly: { backgroundColor: colors.background, borderRadius: 12, padding: 12, gap: 4 },
  label: { ...type.caption, color: colors.muted },
  value: { ...type.heading, color: colors.text },
  body: { ...type.body, color: colors.text },
  caption: { ...type.caption, color: colors.muted },
  input: { ...type.body, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, color: colors.text },
  error: { ...type.caption, color: '#EF4444' },
  recommendation: { borderLeftWidth: 3, borderLeftColor: colors.savings, paddingLeft: 12, gap: 2, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 10 },
  button: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: colors.savings },
  secondary: { borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.5 },
  primaryText: { ...type.body, fontWeight: '600', color: colors.surface },
  secondaryText: { ...type.body, fontWeight: '600', color: colors.text },
});
