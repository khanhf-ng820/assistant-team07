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
  idempotency_key?: string | null;
}

export interface TransactionResponse {
  id: string;
  amount: number;
  kind: TransactionKind;
  category: string;
  date: string;
  note?: string | null;
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
  initial_allocated?: number;
}

export interface GoalResponse {
  id: string;
  title: string;
  target_amount: number;
  deadline: string;
  allocated_amount: number;
  remaining_target: number;
  saving_days: number;
  suggested_daily_saving: number;
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
  planning_days_remaining?: number | null;
}

export interface BudgetConfigResponse {
  status: string;
  message: string;
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

function asIntVnd(obj: Record<string, unknown>, field: string, label: string): number {
  const val = obj[field];
  if (typeof val !== 'number' || !Number.isSafeInteger(val)) {
    unexpected(`Expected integer VND for ${label}.${field}`);
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
    amount: asIntVnd(obj, 'amount', 'TransactionResponse'),
    kind,
    category: asString(obj, 'category', 'TransactionResponse'),
    date: asString(obj, 'date', 'TransactionResponse'),
    note: asNullableString(obj, 'note', 'TransactionResponse'),
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
    total: asIntVnd(obj, 'total', 'TransactionListResponse'),
    total_income: asIntVnd(obj, 'total_income', 'TransactionListResponse'),
    total_expense: asIntVnd(obj, 'total_expense', 'TransactionListResponse'),
  };
}

export function parseGoal(body: unknown): GoalResponse {
  const obj = asRecord(body, 'GoalResponse');
  return {
    id: asString(obj, 'id', 'GoalResponse'),
    title: asString(obj, 'title', 'GoalResponse'),
    target_amount: asIntVnd(obj, 'target_amount', 'GoalResponse'),
    deadline: asString(obj, 'deadline', 'GoalResponse'),
    allocated_amount: asIntVnd(obj, 'allocated_amount', 'GoalResponse'),
    remaining_target: asIntVnd(obj, 'remaining_target', 'GoalResponse'),
    saving_days: asIntVnd(obj, 'saving_days', 'GoalResponse'),
    suggested_daily_saving: asIntVnd(obj, 'suggested_daily_saving', 'GoalResponse'),
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
    cash: asIntVnd(obj, 'cash', 'BudgetSummaryResponse'),
    total_income: asIntVnd(obj, 'total_income', 'BudgetSummaryResponse'),
    total_expense: asIntVnd(obj, 'total_expense', 'BudgetSummaryResponse'),
    unpaid_commitments: asIntVnd(obj, 'unpaid_commitments', 'BudgetSummaryResponse'),
    savings_allocated: asIntVnd(obj, 'savings_allocated', 'BudgetSummaryResponse'),
    savings_reserved: asIntVnd(obj, 'savings_reserved', 'BudgetSummaryResponse'),
    protected: asIntVnd(obj, 'protected', 'BudgetSummaryResponse'),
    safe_to_spend: asIntVnd(obj, 'safe_to_spend', 'BudgetSummaryResponse'),
    funding_shortfall: asIntVnd(obj, 'funding_shortfall', 'BudgetSummaryResponse'),
    days_remaining: asIntVnd(obj, 'days_remaining', 'BudgetSummaryResponse'),
    daily_budget: asIntVnd(obj, 'daily_budget', 'BudgetSummaryResponse'),
    spent_today: asIntVnd(obj, 'spent_today', 'BudgetSummaryResponse'),
    remaining_today: asIntVnd(obj, 'remaining_today', 'BudgetSummaryResponse'),
    is_overspent_today: asBoolean(obj, 'is_overspent_today', 'BudgetSummaryResponse'),
    overspent_amount_today: asIntVnd(obj, 'overspent_amount_today', 'BudgetSummaryResponse'),
    subsequent_daily_budget: asIntVnd(obj, 'subsequent_daily_budget', 'BudgetSummaryResponse'),
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
