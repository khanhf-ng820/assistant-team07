import { CATEGORIES, type CategoryId } from '../types/transaction';
import { ApiError } from './errors';

export interface HealthResponse {
  status: 'ok';
  service: 'carenta-api';
}

export interface AuthIdentity {
  user_id: string;
  email: string | null;
  role: string;
  auth_mode: 'supabase_jwt' | 'local_dev';
}

export type TransactionKind = 'income' | 'expense';

export interface TransactionCreate {
  amount: number;
  kind: TransactionKind;
  category: string;
  date: string;
  note?: string | null;
  idempotency_key: string;
}

export interface TransactionResponse {
  id: string;
  amount: number;
  kind: TransactionKind;
  category: string;
  date: string;
  note?: string | null;
  idempotency_key: string;
  created_at: string;
}

export interface TransactionListResponse {
  items: TransactionResponse[];
  total: number;
  total_income: number;
  total_expense: number;
}

export interface TransactionListQuery {
  start_date?: string;
  end_date?: string;
  kind?: TransactionKind;
}

export interface GoalCreate {
  title: string;
  target_amount: number;
  deadline: string;
}

export interface GoalUpdate {
  title?: string | null;
  target_amount?: number | null;
  deadline?: string | null;
}

export interface GoalAllocationRequest {
  amount: number;
}

export type GoalStatus = 'on_track' | 'due_today' | 'overdue' | 'completed';

export interface GoalResponse {
  id: string;
  title: string;
  target_amount: number;
  deadline: string;
  allocated_amount: number;
  remaining_target: number;
  saving_days: number;
  suggested_daily_saving: number;
  status: GoalStatus;
  is_completed: boolean;
  created_at: string;
}

export interface BudgetSummaryQuery {
  today?: string;
  days_remaining?: number;
}

export interface BudgetSummaryResponse {
  cash: number;
  total_income: number;
  total_expense: number;
  unpaid_commitments: number;
  savings_allocated: number;
  savings_reserved: number;
  protected: number;
  safe_to_spend: number;
  funding_shortfall: number;
  days_remaining: number;
  daily_budget: number;
  spent_today: number;
  remaining_today: number;
  is_overspent_today: boolean;
  overspent_amount_today: number;
  subsequent_daily_budget: number;
  is_period_exhausted: boolean;
  engine: string;
}

export interface BudgetConfigRequest {
  opening_balance?: number | null;
  unpaid_commitments?: number | null;
  savings_reserved?: number | null;
}

export interface BudgetConfigResponse {
  status: string;
  message: string;
}

export type VoiceCaptureCategory = CategoryId;

export interface VoiceCaptureRequest {
  audio_base64: string;
  mime_type: string;
  duration_ms?: number | null;
}

export interface VoiceCaptureDraft {
  amount: number | null;
  currency: 'VND' | null;
  category: VoiceCaptureCategory | null;
  merchant: string | null;
  description: string | null;
  recognized_text: string | null;
  occurred_on: string | null;
  timestamp: string | null;
  uncertain_fields: string[];
  has_low_confidence: boolean;
}

export type VoiceDraftLike = VoiceCaptureDraft;

function unexpected(message: string): never {
  throw new ApiError({
    code: 'UNEXPECTED_RESPONSE',
    message,
    retryable: false,
    userMessage: 'Dữ liệu phản hồi từ máy chủ không đúng định dạng.',
  });
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    unexpected(`Expected object for ${label}`);
  }
  return value as Record<string, unknown>;
}

function asString(obj: Record<string, unknown>, field: string, label: string): string {
  const val = obj[field];
  if (typeof val !== 'string') {
    unexpected(`Expected string ${label}.${field}`);
  }
  return val;
}

function asNullableString(
  obj: Record<string, unknown>,
  field: string,
  label: string
): string | null | undefined {
  const val = obj[field];
  if (val !== undefined && val !== null && typeof val !== 'string') {
    unexpected(`Expected nullable string ${label}.${field}`);
  }
  return val;
}

function asSafeInteger(obj: Record<string, unknown>, field: string, label: string): number {
  const val = obj[field];
  if (typeof val !== 'number' || !Number.isSafeInteger(val)) {
    unexpected(`Expected integer value for ${label}.${field}`);
  }
  return val;
}

function asBoolean(obj: Record<string, unknown>, field: string, label: string): boolean {
  const val = obj[field];
  if (typeof val !== 'boolean') {
    unexpected(`Expected boolean for ${label}.${field}`);
  }
  return val;
}

export function parseHealthResponse(body: unknown): HealthResponse {
  const obj = asRecord(body, 'HealthResponse');
  if (obj.status !== 'ok' || obj.service !== 'carenta-api') {
    unexpected('Unexpected health response');
  }
  return { status: 'ok', service: 'carenta-api' };
}

export function parseAuthIdentity(body: unknown): AuthIdentity {
  const obj = asRecord(body, 'AuthIdentity');
  const authMode = obj.auth_mode;
  if (authMode !== 'supabase_jwt' && authMode !== 'local_dev') {
    unexpected('Expected valid AuthIdentity.auth_mode');
  }
  return {
    user_id: asString(obj, 'user_id', 'AuthIdentity'),
    email: asNullableString(obj, 'email', 'AuthIdentity') ?? null,
    role: asString(obj, 'role', 'AuthIdentity'),
    auth_mode: authMode,
  };
}

export function parseTransaction(body: unknown): TransactionResponse {
  const obj = asRecord(body, 'TransactionResponse');
  const kind = obj.kind;
  if (kind !== 'income' && kind !== 'expense') {
    unexpected('Expected TransactionResponse.kind to be income or expense');
  }
  return {
    id: asString(obj, 'id', 'TransactionResponse'),
    amount: asSafeInteger(obj, 'amount', 'TransactionResponse'),
    kind,
    category: asString(obj, 'category', 'TransactionResponse'),
    date: asString(obj, 'date', 'TransactionResponse'),
    note: asNullableString(obj, 'note', 'TransactionResponse'),
    idempotency_key: asString(obj, 'idempotency_key', 'TransactionResponse'),
    created_at: asString(obj, 'created_at', 'TransactionResponse'),
  };
}

export function parseTransactionList(body: unknown): TransactionListResponse {
  const obj = asRecord(body, 'TransactionListResponse');
  if (!Array.isArray(obj.items)) {
    unexpected('Expected array TransactionListResponse.items');
  }
  return {
    items: obj.items.map(parseTransaction),
    total: asSafeInteger(obj, 'total', 'TransactionListResponse'),
    total_income: asSafeInteger(obj, 'total_income', 'TransactionListResponse'),
    total_expense: asSafeInteger(obj, 'total_expense', 'TransactionListResponse'),
  };
}

const VALID_GOAL_STATUSES: readonly GoalStatus[] = [
  'on_track',
  'due_today',
  'overdue',
  'completed',
];

export function parseGoal(body: unknown): GoalResponse {
  const obj = asRecord(body, 'GoalResponse');
  const status = asString(obj, 'status', 'GoalResponse');
  if (!VALID_GOAL_STATUSES.includes(status as GoalStatus)) {
    unexpected('Expected valid GoalResponse.status');
  }
  return {
    id: asString(obj, 'id', 'GoalResponse'),
    title: asString(obj, 'title', 'GoalResponse'),
    target_amount: asSafeInteger(obj, 'target_amount', 'GoalResponse'),
    deadline: asString(obj, 'deadline', 'GoalResponse'),
    allocated_amount: asSafeInteger(obj, 'allocated_amount', 'GoalResponse'),
    remaining_target: asSafeInteger(obj, 'remaining_target', 'GoalResponse'),
    saving_days: asSafeInteger(obj, 'saving_days', 'GoalResponse'),
    suggested_daily_saving: asSafeInteger(obj, 'suggested_daily_saving', 'GoalResponse'),
    status: status as GoalStatus,
    is_completed: asBoolean(obj, 'is_completed', 'GoalResponse'),
    created_at: asString(obj, 'created_at', 'GoalResponse'),
  };
}

export function parseGoalList(body: unknown): GoalResponse[] {
  if (!Array.isArray(body)) {
    unexpected('Expected array for GoalList');
  }
  return body.map(parseGoal);
}

export function parseBudgetSummary(body: unknown): BudgetSummaryResponse {
  const obj = asRecord(body, 'BudgetSummaryResponse');
  return {
    cash: asSafeInteger(obj, 'cash', 'BudgetSummaryResponse'),
    total_income: asSafeInteger(obj, 'total_income', 'BudgetSummaryResponse'),
    total_expense: asSafeInteger(obj, 'total_expense', 'BudgetSummaryResponse'),
    unpaid_commitments: asSafeInteger(obj, 'unpaid_commitments', 'BudgetSummaryResponse'),
    savings_allocated: asSafeInteger(obj, 'savings_allocated', 'BudgetSummaryResponse'),
    savings_reserved: asSafeInteger(obj, 'savings_reserved', 'BudgetSummaryResponse'),
    protected: asSafeInteger(obj, 'protected', 'BudgetSummaryResponse'),
    safe_to_spend: asSafeInteger(obj, 'safe_to_spend', 'BudgetSummaryResponse'),
    funding_shortfall: asSafeInteger(obj, 'funding_shortfall', 'BudgetSummaryResponse'),
    days_remaining: asSafeInteger(obj, 'days_remaining', 'BudgetSummaryResponse'),
    daily_budget: asSafeInteger(obj, 'daily_budget', 'BudgetSummaryResponse'),
    spent_today: asSafeInteger(obj, 'spent_today', 'BudgetSummaryResponse'),
    remaining_today: asSafeInteger(obj, 'remaining_today', 'BudgetSummaryResponse'),
    is_overspent_today: asBoolean(obj, 'is_overspent_today', 'BudgetSummaryResponse'),
    overspent_amount_today: asSafeInteger(obj, 'overspent_amount_today', 'BudgetSummaryResponse'),
    subsequent_daily_budget: asSafeInteger(obj, 'subsequent_daily_budget', 'BudgetSummaryResponse'),
    is_period_exhausted: asBoolean(obj, 'is_period_exhausted', 'BudgetSummaryResponse'),
    engine: asString(obj, 'engine', 'BudgetSummaryResponse'),
  };
}

export function parseBudgetConfigResponse(body: unknown): BudgetConfigResponse {
  const obj = asRecord(body, 'BudgetConfigResponse');
  return {
    status: asString(obj, 'status', 'BudgetConfigResponse'),
    message: asString(obj, 'message', 'BudgetConfigResponse'),
  };
}

const VALID_VOICE_CATEGORIES = new Set<string>(Object.keys(CATEGORIES));

const MAX_VND_AMOUNT = 1_000_000_000_000;

export function parseVoiceCaptureDraft(body: unknown): VoiceCaptureDraft {
  const obj = asRecord(body, 'VoiceCaptureDraft');

  let amount: number | null = null;
  if (obj.amount !== null && obj.amount !== undefined) {
    const val = asSafeInteger(obj, 'amount', 'VoiceCaptureDraft');
    if (val < 1 || val > MAX_VND_AMOUNT) {
      unexpected('Expected positive VND integer for VoiceCaptureDraft.amount');
    }
    amount = val;
  }

  let currency: 'VND' | null = null;
  if (obj.currency !== null && obj.currency !== undefined) {
    if (obj.currency !== 'VND') {
      unexpected('Expected VND or null for VoiceCaptureDraft.currency');
    }
    currency = 'VND';
  }

  let category: VoiceCaptureCategory | null = null;
  if (obj.category !== null && obj.category !== undefined) {
    const rawCat = asString(obj, 'category', 'VoiceCaptureDraft');
    if (!VALID_VOICE_CATEGORIES.has(rawCat)) {
      unexpected('Expected valid VoiceCaptureDraft.category');
    }
    category = rawCat as VoiceCaptureCategory;
  }

  if (!Array.isArray(obj.uncertain_fields)) {
    unexpected('Expected array VoiceCaptureDraft.uncertain_fields');
  }
  const uncertainFields = obj.uncertain_fields.map((item) => {
    if (typeof item !== 'string') {
      unexpected('Expected string elements in VoiceCaptureDraft.uncertain_fields');
    }
    return item;
  });

  return {
    amount,
    currency,
    category,
    merchant: asNullableString(obj, 'merchant', 'VoiceCaptureDraft') ?? null,
    description: asNullableString(obj, 'description', 'VoiceCaptureDraft') ?? null,
    recognized_text: asNullableString(obj, 'recognized_text', 'VoiceCaptureDraft') ?? null,
    occurred_on: asNullableString(obj, 'occurred_on', 'VoiceCaptureDraft') ?? null,
    timestamp: asNullableString(obj, 'timestamp', 'VoiceCaptureDraft') ?? null,
    uncertain_fields: uncertainFields,
    has_low_confidence: asBoolean(obj, 'has_low_confidence', 'VoiceCaptureDraft'),
  };
}
