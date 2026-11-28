import {
  AiExpenseDraft,
  MAX_DRAFT_AMOUNT_VND,
  findDuplicateTransaction,
  formatVietnamTimeFromTimestamp,
  fromReceiptOcrDraft,
  fromVoiceDraft,
  isValidIsoDate,
  resolveDraftNote,
  todayInVietnamIso,
  validateAiDraft,
} from '../src/types/aiDraft';
import { Transaction } from '../src/types/transaction';

describe('AI Draft Contract & Boundary Safeguards (Slice 1 #50)', () => {
  it('validates real calendar ISO dates and rejects invalid leap/month dates', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2023-02-29')).toBe(false);
    expect(isValidIsoDate('2024-02-30')).toBe(false);
    expect(isValidIsoDate('2024-13-01')).toBe(false);
    expect(isValidIsoDate('not-a-date')).toBe(false);
  });

  it('converts UTC timestamps to Asia/Ho_Chi_Minh without inventing time for date-only values', () => {
    expect(formatVietnamTimeFromTimestamp('2024-07-10')).toBeNull();
    expect(formatVietnamTimeFromTimestamp('2024-07-10T05:30:00Z')).toBe('12:30');
    expect(formatVietnamTimeFromTimestamp('08:15')).toBe('08:15');
    expect(formatVietnamTimeFromTimestamp('25:99')).toBeNull();
    expect(todayInVietnamIso(new Date('2024-07-10T18:30:00Z'))).toBe('2024-07-11');
  });

  it('adapts OCR draft with qualitative low-confidence fields and upper-bound guard', () => {
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
      { draftId: 'draft-ocr-1' }
    );

    expect(adapted.draftId).toBe('draft-ocr-1');
    expect(adapted.amount).toBe(65000);
    expect(adapted.time).toBeNull();
    expect(adapted.note).toBe('Bún bò Huế');
    expect(adapted.hasLowConfidence).toBe(true);
    expect(adapted.uncertainFields).toEqual(['Cửa hàng', 'Thời gian']);

    const overflow = fromReceiptOcrDraft(
      {
        amount: MAX_DRAFT_AMOUNT_VND + 1,
        merchant: 'Test',
        description: null,
        category: 'food',
        occurred_on: '2024-02-30',
        timestamp: null,
      },
      { draftId: 'draft-overflow', fallbackDate: '2024-07-10' }
    );
    expect(overflow.amount).toBeNull();
    expect(overflow.date).toBe('2024-07-10');
  });

  it('adapts Voice draft preserving recognized_text and uncertain fields', () => {
    const voiceDraft = fromVoiceDraft(
      {
        amount: 35000,
        category: 'food',
        description: 'Trà sữa',
        recognized_text: 'Chiều nay uống trà sữa 35k',
        occurred_on: '2024-07-09',
        timestamp: '2024-07-09T08:15:00Z',
        uncertain_fields: ['Danh mục'],
      },
      { draftId: 'draft-voice-1' }
    );

    expect(voiceDraft.source).toBe('voice');
    expect(voiceDraft.amount).toBe(35000);
    expect(voiceDraft.time).toBe('15:15');
    expect(voiceDraft.recognizedText).toBe('Chiều nay uống trà sữa 35k');
    expect(voiceDraft.hasLowConfidence).toBe(true);
    expect(voiceDraft.uncertainFields).toEqual(['Danh mục']);
  });

  it('rejects 0, negative, float, overflow amounts, missing category, and invalid dates in validateAiDraft', () => {
    const base: AiExpenseDraft = {
      draftId: 'd1',
      source: 'ocr',
      amount: 50000,
      categoryId: 'food',
      merchant: null,
      note: 'Cơm',
      date: '2024-07-10',
      time: null,
    };

    expect(validateAiDraft(base).isValid).toBe(true);
    expect(validateAiDraft({ ...base, amount: 0 }).missingFields).toEqual(['amount']);
    expect(validateAiDraft({ ...base, amount: -5000 }).missingFields).toEqual(['amount']);
    expect(validateAiDraft({ ...base, amount: 12.5 }).missingFields).toEqual(['amount']);
    expect(validateAiDraft({ ...base, amount: MAX_DRAFT_AMOUNT_VND + 1 }).missingFields).toEqual([
      'amount',
    ]);
    expect(validateAiDraft({ ...base, categoryId: null }).missingFields).toEqual(['categoryId']);
    expect(validateAiDraft({ ...base, date: '2024-02-30' }).invalidDate).toBe(true);
  });

  it('detects same-day potential duplicates and formats fallback draft notes cleanly', () => {
    const existing: Transaction[] = [
      {
        id: 'tx-1',
        amount: 45000,
        categoryId: 'food',
        note: 'Cơm trưa',
        date: '2024-07-10',
        time: '12:00',
        createdAt: '2024-07-10T12:00:00Z',
      },
    ];

    const draft: AiExpenseDraft = {
      draftId: 'd2',
      source: 'ocr',
      amount: 45000,
      categoryId: 'food',
      merchant: 'Highlands',
      note: 'Cơm trưa',
      date: '2024-07-10',
      time: '12:30',
    };

    expect(findDuplicateTransaction(draft, existing)?.id).toBe('tx-1');
    expect(findDuplicateTransaction({ ...draft, date: '2024-07-11' }, existing)).toBeNull();
    expect(resolveDraftNote(draft)).toBe('Highlands - Cơm trưa');
    expect(resolveDraftNote({ ...draft, merchant: null, note: '' })).toBe('Ăn uống');
  });
});
