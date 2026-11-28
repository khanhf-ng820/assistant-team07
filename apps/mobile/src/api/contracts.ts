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

export interface HabitSuggestion {
  id: string;
  date: string;
  amount: number;
  category: string;
  note: string;
  confidence: number;
  matching_days: number;
}

export interface HabitSuggestionResponse {
  suggestion: HabitSuggestion | null;
}

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

export function parseHabitSuggestion(body: unknown): HabitSuggestionResponse {
  const { suggestion } = asRecord(body, 'HabitSuggestionResponse');
  if (suggestion === null) return { suggestion };

  const label = 'HabitSuggestion';
  const obj = asRecord(suggestion, label);
  const id = asString(obj, 'id', label);
  const date = asString(obj, 'date', label);
  const amount = asSafeInteger(obj, 'amount', label);
  const matching_days = asSafeInteger(obj, 'matching_days', label);
  const confidence = obj.confidence;
  if (
    !/^[a-f0-9]{64}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    amount <= 0 || matching_days < 5 || matching_days > 7 ||
    typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1
  ) {
    unexpected('Invalid habit suggestion');
  }
  return {
    suggestion: {
      id, date, amount, matching_days, confidence,
      category: asString(obj, 'category', label),
      note: asString(obj, 'note', label),
    },
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
