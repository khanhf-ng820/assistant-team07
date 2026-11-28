import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthProvider } from '../src/auth/AuthContext';
import { Toast } from '../src/components/Toast';
import { AiConfirmationModal } from '../src/components/ai-confirmation/AiConfirmationModal';
import { GreetingHeader } from '../src/components/dashboard/GreetingHeader';
import { type AiDraftPersistFn, LedgerProvider, useLedger } from '../src/context/LedgerContext';
import type { CarentaApiClient, CarentaRuntime } from '../src/runtime/carentaRuntime';
import {
  AiExpenseDraft,
  formatVietnamTimeFromTimestamp,
  fromReceiptOcrDraft,
} from '../src/types/aiDraft';

function AiFlowTestHarness({
  initialDraft,
  onConfirmDraft,
  onNavigateToStats,
}: {
  initialDraft: AiExpenseDraft;
  onConfirmDraft?: AiDraftPersistFn;
  onNavigateToStats?: () => void;
}) {
  const { openAiConfirmation, toastMessage, dismissToast, transactions } = useLedger();

  return (
    <View>
      <GreetingHeader userName="Minh" />
      <Text testID="harness-tx-count">{String(transactions.length)}</Text>
      <Pressable
        testID="open-ai-confirm-trigger"
        onPress={() => openAiConfirmation(initialDraft)}
      >
        <Text>Mở xác nhận AI</Text>
      </Pressable>
      <AiConfirmationModal
        onConfirmDraft={onConfirmDraft}
        onNavigateToStats={onNavigateToStats}
      />
      <Toast
        visible={Boolean(toastMessage)}
        message={toastMessage ?? ''}
        type="success"
        onDismiss={dismissToast}
      />
    </View>
  );
}

const sampleOcrDraft: AiExpenseDraft = {
  draftId: 'draft-ocr-01',
  source: 'ocr',
  amount: 45000,
  categoryId: 'food',
  merchant: 'Highlands Coffee',
  note: 'Cà phê sữa đá',
  date: '2024-07-09',
  time: '12:30',
  uncertainFields: [],
  hasLowConfidence: false,
};

describe('AI Draft Helpers & OCR Adapter', () => {
  it('adapts ReceiptOcrDraft with low-confidence flags and preserves date-only timestamps', () => {
    const adapted = fromReceiptOcrDraft(
      {
        amount: 65000,
        merchant: 'Bún bò Huế',
        description: null,
        category: 'food',
        occurred_on: '2024-07-10',
        timestamp: '2024-07-10',
        confidence: {
          amount: 0.95,
          merchant: 0.62,
          description: 0.5,
          category: 0.9,
          timestamp: 0.7,
        },
      },
      { draftId: 'draft-adapter-1' }
    );

    expect(adapted.draftId).toBe('draft-adapter-1');
    expect(adapted.amount).toBe(65000);
    expect(adapted.time).toBeNull();
    expect(adapted.note).toBe('Bún bò Huế');
    expect(adapted.hasLowConfidence).toBe(true);
    expect(adapted.uncertainFields).toEqual(['Cửa hàng', 'Thời gian']);
  });

  it('converts UTC ISO timestamp to Asia/Ho_Chi_Minh HH:mm without shifting date-only values', () => {
    expect(formatVietnamTimeFromTimestamp('2024-07-10')).toBeNull();
    expect(formatVietnamTimeFromTimestamp('2024-07-10T05:30:00Z')).toBe('12:30');
    expect(formatVietnamTimeFromTimestamp('08:15')).toBe('08:15');
  });
});

describe('AiConfirmationModal & QuickEditModal (Issue #50)', () => {
  it('renders extracted amount, category, merchant, timestamp, and remaining-budget preview', async () => {
    await render(
      <LedgerProvider>
        <AiFlowTestHarness initialDraft={sampleOcrDraft} />
      </LedgerProvider>
    );

    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));

    expect(screen.getByTestId('ai-confirmation-card')).toBeVisible();
    expect(screen.getByTestId('ai-confirm-amount')).toHaveTextContent('45.000 ₫');
    expect(screen.getByTestId('ai-confirm-category')).toHaveTextContent('Ăn uống');
    expect(screen.getByTestId('ai-confirm-merchant')).toHaveTextContent('Highlands Coffee');
    expect(screen.getByTestId('ai-confirm-note')).toHaveTextContent('Cà phê sữa đá');
    expect(screen.getByTestId('ai-confirm-timestamp')).toHaveTextContent(
      'Thứ Ba, 9 tháng 7, 2024 • 12:30'
    );
    // Day 2024-07-09 already spent 160,000 ₫ out of 280,000 ₫ -> 120,000 - 45,000 = 75,000 ₫
    expect(screen.getByTestId('ai-confirm-budget-preview')).toHaveTextContent(
      'Còn 75.000 ₫ sau khoản chi này'
    );
    // Preview must not modify ledger before Confirm
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.500.000 ₫');
  });

  it('blocks confirmation when required fields are missing until fixed via Quick Edit', async () => {
    const incompleteVoiceDraft: AiExpenseDraft = {
      draftId: 'draft-voice-missing',
      source: 'voice',
      amount: null,
      categoryId: null,
      merchant: null,
      note: '',
      date: '2024-07-09',
      time: null,
      recognizedText: 'Sáng nay mua trà sữa nhưng quên nói giá',
    };

    await render(
      <LedgerProvider>
        <AiFlowTestHarness initialDraft={incompleteVoiceDraft} />
      </LedgerProvider>
    );

    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));

    expect(screen.getByTestId('ai-confirm-recognized-text')).toHaveTextContent(
      /Sáng nay mua trà sữa nhưng quên nói giá/
    );
    expect(screen.getByTestId('ai-confirm-missing-banner')).toBeVisible();
    expect(screen.getByTestId('ai-confirm-submit-button')).toBeDisabled();

    // Open Quick Edit and verify cancel leaves draft incomplete
    await fireEvent.press(screen.getByTestId('ai-quick-edit-button'));
    expect(screen.getByTestId('quick-edit-modal')).toBeVisible();
    await fireEvent.press(screen.getByTestId('quick-edit-cancel-button'));
    expect(screen.getByTestId('ai-confirm-submit-button')).toBeDisabled();

    // Open Quick Edit again, validate 0 VND rejection, then enter 35.000 ₫
    await fireEvent.press(screen.getByTestId('ai-quick-edit-button'));
    await fireEvent.press(screen.getByTestId('quick-edit-apply-button'));
    expect(screen.getByTestId('quick-edit-error')).toHaveTextContent(
      'Vui lòng nhập số tiền lớn hơn 0'
    );

    await fireEvent.press(screen.getByTestId('numpad-key-3'));
    await fireEvent.press(screen.getByTestId('numpad-key-5'));
    await fireEvent.press(screen.getByTestId('numpad-key-000'));
    await fireEvent.changeText(screen.getByTestId('quick-edit-merchant-input'), 'Phúc Long');
    await fireEvent.changeText(screen.getByTestId('quick-edit-note-input'), 'Trà sữa ô long');
    await fireEvent.press(screen.getByTestId('quick-edit-apply-button'));

    // Quick Edit returns to Confirmation Card WITHOUT persisting to ledger
    expect(screen.getByTestId('ai-confirm-amount')).toHaveTextContent('35.000 ₫');
    expect(screen.getByTestId('ai-confirm-merchant')).toHaveTextContent('Phúc Long');
    expect(screen.getByTestId('ai-confirm-submit-button')).toBeEnabled();
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.500.000 ₫');
  });

  it('rejects invalid HH:mm time format in Quick Edit', async () => {
    await render(
      <LedgerProvider>
        <AiFlowTestHarness initialDraft={sampleOcrDraft} />
      </LedgerProvider>
    );

    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));
    await fireEvent.press(screen.getByTestId('ai-quick-edit-button'));
    await fireEvent.changeText(screen.getByTestId('quick-edit-time-input'), '25:99');
    await fireEvent.press(screen.getByTestId('quick-edit-apply-button'));

    expect(screen.getByTestId('quick-edit-error')).toHaveTextContent(
      'Giờ giao dịch cần đúng định dạng HH:mm (ví dụ 12:30)'
    );
  });

  it('shows duplicate warning for matching same-day expense while remaining confirmable', async () => {
    // 2024-07-10 fixture already has 65,000 ₫ 'Cơm trưa' (food)
    const duplicateDraft: AiExpenseDraft = {
      draftId: 'draft-dup-1',
      source: 'ocr',
      amount: 65000,
      categoryId: 'food',
      merchant: 'Quán cơm trưa',
      note: 'Cơm trưa',
      date: '2024-07-10',
      time: '12:45',
    };

    await render(
      <LedgerProvider>
        <AiFlowTestHarness initialDraft={duplicateDraft} />
      </LedgerProvider>
    );

    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));
    expect(screen.getByTestId('ai-confirm-duplicate-banner')).toBeVisible();
    expect(screen.getByTestId('ai-confirm-submit-button')).toBeEnabled();
  });

  it('persists once via shared confirmation path, shows Toast, and skips callback if confirmed draft is reopened', async () => {
    const onConfirmDraft = jest.fn().mockResolvedValue(undefined);
    const onNavigateToStats = jest.fn();

    await render(
      <LedgerProvider>
        <AiFlowTestHarness
          initialDraft={sampleOcrDraft}
          onConfirmDraft={onConfirmDraft}
          onNavigateToStats={onNavigateToStats}
        />
      </LedgerProvider>
    );

    const initialCount = Number(screen.getByTestId('harness-tx-count').props.children);
    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));
    await act(async () => {
      await fireEvent.press(screen.getByTestId('ai-confirm-submit-button'));
    });

    expect(onConfirmDraft).toHaveBeenCalledTimes(1);
    expect(onConfirmDraft).toHaveBeenCalledWith(sampleOcrDraft, 'ai-draft-draft-ocr-01');
    expect(Number(screen.getByTestId('harness-tx-count').props.children)).toBe(initialCount + 1);
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.455.000 ₫');
    expect(screen.getByText('Đã lưu khoản chi 45.000 ₫ vào sổ chi tiêu')).toBeVisible();
    expect(onNavigateToStats).toHaveBeenCalledTimes(1);

    // Reopening and confirming the already-confirmed draft must not invoke persistence again
    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));
    await act(async () => {
      await fireEvent.press(screen.getByTestId('ai-confirm-submit-button'));
    });
    expect(onConfirmDraft).toHaveBeenCalledTimes(1);
    expect(Number(screen.getByTestId('harness-tx-count').props.children)).toBe(initialCount + 1);
  });

  it('retains draft and reuses stable idempotency key when retrying after a failed save', async () => {
    const onConfirmDraft = jest
      .fn()
      .mockRejectedValueOnce(new Error('Mất kết nối máy chủ'))
      .mockResolvedValueOnce(undefined);
    const onNavigateToStats = jest.fn();

    await render(
      <LedgerProvider>
        <AiFlowTestHarness
          initialDraft={sampleOcrDraft}
          onConfirmDraft={onConfirmDraft}
          onNavigateToStats={onNavigateToStats}
        />
      </LedgerProvider>
    );

    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));
    await act(async () => {
      await fireEvent.press(screen.getByTestId('ai-confirm-submit-button'));
    });

    expect(screen.getByTestId('ai-confirm-error-banner')).toHaveTextContent(
      'Mất kết nối máy chủ'
    );
    expect(screen.getByTestId('ai-confirmation-modal')).toBeVisible();
    expect(onNavigateToStats).not.toHaveBeenCalled();
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.500.000 ₫');

    // Retry the retained draft: same idempotency key is passed and save succeeds once
    await act(async () => {
      await fireEvent.press(screen.getByTestId('ai-confirm-submit-button'));
    });
    expect(onConfirmDraft).toHaveBeenCalledTimes(2);
    expect(onConfirmDraft).toHaveBeenNthCalledWith(1, sampleOcrDraft, 'ai-draft-draft-ocr-01');
    expect(onConfirmDraft).toHaveBeenNthCalledWith(2, sampleOcrDraft, 'ai-draft-draft-ocr-01');
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.455.000 ₫');
    expect(screen.getByText('Đã lưu khoản chi 45.000 ₫ vào sổ chi tiêu')).toBeVisible();
    expect(onNavigateToStats).toHaveBeenCalledTimes(1);
  });

  it('persists via auth apiClient.createTransaction when API is configured and blocks duplicate reopen calls', async () => {
    const createTransaction = jest
      .fn()
      .mockRejectedValueOnce(new Error('Lỗi máy chủ tạm thời'))
      .mockResolvedValueOnce({
        id: 'tx-api-1',
        amount: 45000,
        kind: 'expense',
        category: 'food',
        date: '2024-07-09',
        note: 'Highlands Coffee - Cà phê sữa đá',
        idempotency_key: 'ai-draft-draft-ocr-01',
        created_at: '2024-07-09T05:30:00Z',
      });

    const mockApiClient = { createTransaction } as unknown as CarentaApiClient;
    const stableSnapshot = {
      status: 'authenticated' as const,
      student: { id: 'stu-1', email: 'minh@student.edu.vn', role: 'authenticated' },
      error: null,
      isApiConfigured: true,
      canRetryRestore: false,
    };
    const mockRuntime: CarentaRuntime = {
      getSnapshot: () => stableSnapshot,
      subscribe: () => () => {},
      restore: async () => {},
      signIn: async () => {},
      signOut: async () => {},
      apiClient: mockApiClient,
    };

    await render(
      <AuthProvider runtime={mockRuntime}>
        <LedgerProvider>
          <AiFlowTestHarness initialDraft={sampleOcrDraft} />
        </LedgerProvider>
      </AuthProvider>
    );

    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));
    await act(async () => {
      await fireEvent.press(screen.getByTestId('ai-confirm-submit-button'));
    });

    // Draft retained on error
    expect(screen.getByTestId('ai-confirm-error-banner')).toHaveTextContent('Lỗi máy chủ tạm thời');
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.500.000 ₫');

    // Retry succeeds with stable idempotency_key
    await act(async () => {
      await fireEvent.press(screen.getByTestId('ai-confirm-submit-button'));
    });
    expect(createTransaction).toHaveBeenCalledTimes(2);
    expect(createTransaction).toHaveBeenLastCalledWith({
      amount: 45000,
      kind: 'expense',
      category: 'food',
      date: '2024-07-09',
      note: 'Highlands Coffee - Cà phê sữa đá',
      idempotency_key: 'ai-draft-draft-ocr-01',
    });
    expect(screen.getByTestId('balance-amount-display')).toHaveTextContent('4.455.000 ₫');

    // Reopening confirmed draft cannot invoke createTransaction again
    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));
    await act(async () => {
      await fireEvent.press(screen.getByTestId('ai-confirm-submit-button'));
    });
    expect(createTransaction).toHaveBeenCalledTimes(2);
  });

  it('meets >= 48dp touch targets and modal accessibility requirements', async () => {
    await render(
      <LedgerProvider>
        <AiFlowTestHarness initialDraft={sampleOcrDraft} />
      </LedgerProvider>
    );

    await fireEvent.press(screen.getByTestId('open-ai-confirm-trigger'));

    for (const testID of [
      'ai-quick-edit-button',
      'ai-confirm-submit-button',
      'ai-confirm-cancel-button',
    ]) {
      const style = StyleSheet.flatten(screen.getByTestId(testID).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }

    await fireEvent.press(screen.getByTestId('ai-quick-edit-button'));
    for (const testID of ['quick-edit-prev-date', 'quick-edit-next-date']) {
      const style = StyleSheet.flatten(screen.getByTestId(testID).props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
  });
});
