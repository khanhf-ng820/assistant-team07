import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type AiDraftPersistFn, useLedger } from '../../context/LedgerContext';
import { colors, spacing } from '../../theme';
import { AiExpenseDraft, validateAiDraft } from '../../types/aiDraft';
import { Header } from '../Header';
import { AIConfirmationCard } from './AIConfirmationCard';
import { QuickEditModal } from './QuickEditModal';

export interface AiConfirmationFlowProps {
  draft: AiExpenseDraft;
  onDraftChange?: (updated: AiExpenseDraft) => void;
  onConfirmDraft?: AiDraftPersistFn;
  onClose?: () => void;
  onNavigateToStats?: () => void;
  backAccessibilityLabel?: string;
}

/**
 * Shared human-in-the-loop confirmation view reused by both the root modal
 * and the `/capture/confirm` Expo Router screen without duplicating state logic.
 */
export function AiConfirmationFlow({
  draft,
  onDraftChange,
  onConfirmDraft,
  onClose,
  onNavigateToStats,
  backAccessibilityLabel = 'Đóng xác nhận AI',
}: AiConfirmationFlowProps) {
  const {
    updatePendingAiDraft,
    closeAiConfirmation,
    confirmAiDraft,
    transactions,
    dailyBudgetLimit,
    getSummaryForDate,
  } = useLedger();

  const [localDraft, setLocalDraft] = useState<AiExpenseDraft>(draft);
  const [isQuickEditOpen, setIsQuickEditOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submitGuardRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setLocalDraft(draft);
    setIsQuickEditOpen(false);
    setIsSubmitting(false);
    setErrorMessage(null);
    submitGuardRef.current = false;
  }, [draft]);

  const handleClose = () => {
    if (submitGuardRef.current) return;
    setIsQuickEditOpen(false);
    setErrorMessage(null);
    if (onClose) {
      onClose();
    } else {
      closeAiConfirmation();
    }
  };

  const handleApplyQuickEdit = (updatedDraft: AiExpenseDraft) => {
    setLocalDraft(updatedDraft);
    setIsQuickEditOpen(false);
    setErrorMessage(null);
    if (onDraftChange) {
      onDraftChange(updatedDraft);
    } else {
      updatePendingAiDraft(updatedDraft);
    }
  };

  const handleConfirm = async () => {
    if (submitGuardRef.current) return;

    const validation = validateAiDraft(localDraft);
    if (!validation.isValid) {
      setErrorMessage('Vui lòng bổ sung đầy đủ số tiền và danh mục trước khi xác nhận.');
      return;
    }

    submitGuardRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await confirmAiDraft(
        localDraft,
        onConfirmDraft ? { persist: onConfirmDraft } : undefined
      );
      if (!result.ok) {
        if (isMountedRef.current) {
          setErrorMessage(result.error);
          setIsSubmitting(false);
        }
        return;
      }

      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
      if (onClose) {
        onClose();
      }
      onNavigateToStats?.();
    } finally {
      submitGuardRef.current = false;
    }
  };

  return (
    <>
      <Header
        title="Kiểm tra giao dịch AI"
        subtitle="Xem lại hoặc sửa nhanh trước khi lưu"
        onBack={handleClose}
        backAccessibilityLabel={backAccessibilityLabel}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AIConfirmationCard
          draft={localDraft}
          priorDaySpent={getSummaryForDate(localDraft.date).totalSpent}
          dailyBudgetLimit={dailyBudgetLimit}
          existingTransactions={transactions}
          isSubmitting={isSubmitting}
          errorMessage={errorMessage}
          onConfirm={() => {
            void handleConfirm();
          }}
          onQuickEdit={() => setIsQuickEditOpen(true)}
          onCancel={handleClose}
        />
      </ScrollView>

      <QuickEditModal
        visible={isQuickEditOpen}
        draft={localDraft}
        dailyBudgetLimit={dailyBudgetLimit}
        getSpentForDate={(date) => getSummaryForDate(date).totalSpent}
        onApply={handleApplyQuickEdit}
        onClose={() => setIsQuickEditOpen(false)}
      />
    </>
  );
}

export interface AiConfirmationModalProps {
  visible?: boolean;
  draft?: AiExpenseDraft | null;
  onClose?: () => void;
  onConfirmDraft?: AiDraftPersistFn;
  onNavigateToStats?: () => void;
}

export function AiConfirmationModal({
  visible,
  draft: draftProp,
  onClose,
  onConfirmDraft,
  onNavigateToStats,
}: AiConfirmationModalProps) {
  const { isAiConfirmationOpen, pendingAiDraft, closeAiConfirmation } = useLedger();

  const isVisible = visible !== undefined ? visible : isAiConfirmationOpen;
  const activeDraft = draftProp !== undefined ? draftProp : pendingAiDraft;

  if (!isVisible || !activeDraft) {
    return null;
  }

  const handleRequestClose = () => {
    if (onClose) {
      onClose();
    } else {
      closeAiConfirmation();
    }
  };

  return (
    <Modal
      testID="ai-confirmation-modal"
      visible={isVisible}
      animationType="slide"
      onRequestClose={handleRequestClose}
    >
      <SafeAreaView accessibilityViewIsModal edges={['top', 'bottom']} style={styles.safeArea}>
        <AiConfirmationFlow
          draft={activeDraft}
          onConfirmDraft={onConfirmDraft}
          onClose={onClose}
          onNavigateToStats={onNavigateToStats}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});

export default AiConfirmationModal;
