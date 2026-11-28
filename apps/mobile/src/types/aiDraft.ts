import { CATEGORIES, CategoryId, Transaction } from './transaction';

export type AiCaptureSource = 'ocr' | 'voice';

/** Matches backend/PostgreSQL transaction upper bound (10^12 VND). */
export const MAX_DRAFT_AMOUNT_VND = 1_000_000_000_000;

const LOW_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Shared human-in-the-loop draft produced by OCR or Voice capture
 * before an explicit user confirmation writes to the ledger.
 */
export interface AiExpenseDraft {
  draftId: string;
  source: AiCaptureSource;
  amount: number | null;
  categoryId: CategoryId | null;
  merchant: string | null;
  note: string;
  /** Local ISO date in Asia/Ho_Chi_Minh ('YYYY-MM-DD'). */
  date: string;
  /** Optional 'HH:mm' timestamp; null for date-only receipt evidence (plan §7). */
  time: string | null;
  recognizedText?: string | null;
  uncertainFields?: string[];
  hasLowConfidence?: boolean;
}

/** Structural subset of ReceiptOcrDraft (PR #48) so OCR flows converge cleanly. */
export interface ReceiptOcrDraftLike {
  amount: number | null;
  merchant: string | null;
  description: string | null;
  category: CategoryId | null;
  occurred_on: string | null;
  timestamp: string | null;
  confidence?: {
    amount: number;
    merchant: number;
    description: number;
    category: number;
    timestamp: number;
  };
}

/** Structural subset of Voice extraction drafts (Issue #49) for shared review convergence. */
export interface VoiceDraftLike {
  amount: number | null;
  category: CategoryId | null;
  merchant?: string | null;
  description?: string | null;
  note?: string | null;
  recognized_text?: string | null;
  occurred_on?: string | null;
  timestamp?: string | null;
  uncertain_fields?: string[];
  has_low_confidence?: boolean;
}

export interface AiDraftValidation {
  isValid: boolean;
  missingFields: ('amount' | 'categoryId')[];
  invalidDate: boolean;
}

/** Validates both YYYY-MM-DD format and real calendar existence (e.g. rejects 2024-02-30). */
export function isValidIsoDate(isoDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() + 1 === month &&
    probe.getUTCDate() === day
  );
}

/** Returns today's YYYY-MM-DD date in Asia/Ho_Chi_Minh. */
export function todayInVietnamIso(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback below if Intl timeZone data is unavailable
  }
  const utcPlus7 = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = utcPlus7.getUTCFullYear();
  const m = String(utcPlus7.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcPlus7.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Extracts HH:mm in Asia/Ho_Chi_Minh when a timestamp includes a clock time. */
export function formatVietnamTimeFromTimestamp(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const trimmed = timestamp.trim();
  if (!trimmed) return null;

  // Date-only evidence must not invent a precise purchase time (plan §7 line 183)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const plainTimeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (plainTimeMatch) {
    return `${plainTimeMatch[1]}:${plainTimeMatch[2]}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(parsed);
    const hour = parts.find((p) => p.type === 'hour')?.value;
    const minute = parts.find((p) => p.type === 'minute')?.value;
    if (hour && minute) {
      return `${hour}:${minute}`;
    }
  } catch {
    // Fallback to UTC+7 math
  }
  const utcPlus7 = new Date(parsed.getTime() + 7 * 60 * 60 * 1000);
  return `${String(utcPlus7.getUTCHours()).padStart(2, '0')}:${String(utcPlus7.getUTCMinutes()).padStart(2, '0')}`;
}

function normalizePositiveVnd(amount: number | null | undefined): number | null {
  if (
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > MAX_DRAFT_AMOUNT_VND
  ) {
    return null;
  }
  return amount;
}

function normalizeCategory(category: CategoryId | null | undefined): CategoryId | null {
  return category && Object.hasOwn(CATEGORIES, category) ? category : null;
}

/** Adapts an OCR extraction response into the shared AiExpenseDraft contract. */
export function fromReceiptOcrDraft(
  ocr: ReceiptOcrDraftLike,
  options: { draftId?: string; fallbackDate?: string } = {}
): AiExpenseDraft {
  const uncertainFields: string[] = [];
  const scores = ocr.confidence;
  if (scores) {
    if (scores.amount < LOW_CONFIDENCE_THRESHOLD) uncertainFields.push('Số tiền');
    if (scores.category < LOW_CONFIDENCE_THRESHOLD) uncertainFields.push('Danh mục');
    if (scores.merchant < LOW_CONFIDENCE_THRESHOLD) uncertainFields.push('Cửa hàng');
    if (scores.timestamp < LOW_CONFIDENCE_THRESHOLD) uncertainFields.push('Thời gian');
  }

  const merchant = ocr.merchant?.trim() || null;
  const description = ocr.description?.trim() || '';
  const date =
    ocr.occurred_on && isValidIsoDate(ocr.occurred_on)
      ? ocr.occurred_on
      : options.fallbackDate ?? todayInVietnamIso();

  return {
    draftId: options.draftId ?? `draft-ocr-${Date.now()}`,
    source: 'ocr',
    amount: normalizePositiveVnd(ocr.amount),
    categoryId: normalizeCategory(ocr.category),
    merchant,
    note: description || merchant || '',
    date,
    time: formatVietnamTimeFromTimestamp(ocr.timestamp),
    uncertainFields,
    hasLowConfidence: uncertainFields.length > 0,
  };
}

/** Adapts a Voice AI extraction response into the shared AiExpenseDraft contract. */
export function fromVoiceDraft(
  voice: VoiceDraftLike,
  options: { draftId?: string; fallbackDate?: string } = {}
): AiExpenseDraft {
  const merchant = voice.merchant?.trim() || null;
  const note = voice.note?.trim() || voice.description?.trim() || merchant || '';
  const date =
    voice.occurred_on && isValidIsoDate(voice.occurred_on)
      ? voice.occurred_on
      : options.fallbackDate ?? todayInVietnamIso();
  const uncertainFields = (voice.uncertain_fields ?? []).filter((f) => f.trim().length > 0);

  return {
    draftId: options.draftId ?? `draft-voice-${Date.now()}`,
    source: 'voice',
    amount: normalizePositiveVnd(voice.amount),
    categoryId: normalizeCategory(voice.category),
    merchant,
    note,
    date,
    time: formatVietnamTimeFromTimestamp(voice.timestamp),
    recognizedText: voice.recognized_text?.trim() || null,
    uncertainFields,
    hasLowConfidence: Boolean(voice.has_low_confidence || uncertainFields.length > 0),
  };
}

/** Checks required fields & bounds before [Xác nhận] can persist a transaction (plan §10). */
export function validateAiDraft(draft: AiExpenseDraft): AiDraftValidation {
  const missingFields: ('amount' | 'categoryId')[] = [];
  if (normalizePositiveVnd(draft.amount) === null) {
    missingFields.push('amount');
  }
  if (normalizeCategory(draft.categoryId) === null) {
    missingFields.push('categoryId');
  }
  const invalidDate = !isValidIsoDate(draft.date);
  return {
    isValid: missingFields.length === 0 && !invalidDate,
    missingFields,
    invalidDate,
  };
}

/**
 * Finds a same-day transaction with matching amount (and matching note/merchant or category)
 * so the confirmation card can warn without blocking legitimate repeated purchases (plan §10).
 */
export function findDuplicateTransaction(
  draft: AiExpenseDraft,
  transactions: Transaction[]
): Transaction | null {
  if (normalizePositiveVnd(draft.amount) === null) return null;
  const draftLabel = (draft.merchant || draft.note || '').trim().toLowerCase();

  return (
    transactions.find((tx) => {
      if (tx.date !== draft.date || tx.amount !== draft.amount) {
        return false;
      }
      if (!draftLabel) {
        return draft.categoryId !== null && tx.categoryId === draft.categoryId;
      }
      const txNote = tx.note.trim().toLowerCase();
      return (
        txNote === draftLabel ||
        txNote.includes(draftLabel) ||
        draftLabel.includes(txNote) ||
        (draft.categoryId !== null && tx.categoryId === draft.categoryId)
      );
    }) ?? null
  );
}

/** Builds the display note persisted when confirming an AI draft. */
export function resolveDraftNote(draft: AiExpenseDraft): string {
  const trimmedNote = draft.note.trim();
  const trimmedMerchant = draft.merchant?.trim() || '';
  if (trimmedNote && trimmedMerchant && !trimmedNote.toLowerCase().includes(trimmedMerchant.toLowerCase())) {
    return `${trimmedMerchant} - ${trimmedNote}`;
  }
  if (trimmedNote) return trimmedNote;
  if (trimmedMerchant) return trimmedMerchant;
  if (draft.categoryId && Object.hasOwn(CATEGORIES, draft.categoryId)) {
    return CATEGORIES[draft.categoryId].name;
  }
  return 'Khoản chi từ AI';
}
