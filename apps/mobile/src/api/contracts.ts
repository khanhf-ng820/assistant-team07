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

export type JobName = 'evening_reminder' | 'habit_analysis';

export type ProactiveTriggerKind =
  | 'overspending_warning'
  | 'evening_reminder'
  | 'habit_suggestion';

export type ProactiveTriggerAction =
  | 'open_budget_recovery'
  | 'open_manual_entry'
  | 'open_stats'
  | 'open_habit_review';

export interface HabitCandidate {
  id: string;
  date: string;
  amount: number;
  category: string;
  note: string;
  confidence: number;
  matching_days: number;
}

export interface ProactiveTrigger {
  id: string;
  kind: ProactiveTriggerKind;
  title: string;
  message: string;
  action_target: ProactiveTriggerAction;
  local_date: string;
  amount_vnd?: number | null;
  habit_candidate?: HabitCandidate | null;
  created_at: string;
}

export interface ProactiveTriggerListResponse {
  items: ProactiveTrigger[];
  total: number;
}

export interface TriggerDismissResponse {
  trigger_id: string;
  status: 'dismissed';
  cooldown_until?: string | null;
}

export interface AssistantInsight {
  summary: string;
  source: 'provider' | 'deterministic_fallback';
  ledger_revision: number;
  generated_at: string;
}

export interface AssistantSnapshotResponse {
  budget_summary: BudgetSummaryResponse;
  insight: AssistantInsight;
  active_triggers: ProactiveTrigger[];
  habit_candidate?: HabitCandidate | null;
  ledger_revision: number;
  evaluated_at: string;
}

export type ScheduledJobRunStatus = 'executed' | 'deduplicated' | 'skipped_no_action';

export interface ScheduledJobRunResponse {
  job_name: JobName;
  local_date: string;
  status: ScheduledJobRunStatus;
  triggers_emitted: number;
  owners_evaluated: number;
  executed_at: string;
}

export interface JobScheduleSummary {
  job_name: JobName;
  scheduled_time_local: string;
  last_run_date?: string | null;
  last_status?: ScheduledJobRunStatus | null;
  last_executed_at?: string | null;
}

export interface JobStatusResponse {
  scheduler_enabled: boolean;
  scheduler_running: boolean;
  timezone: 'Asia/Ho_Chi_Minh';
  jobs: JobScheduleSummary[];
}

export interface ReadinessResponse {
  status: 'ready' | 'degraded';
  service: 'carenta-api';
  auth_mode: 'supabase_jwt' | 'local_dev' | 'fail_closed_unconfigured';
  scheduler_enabled: boolean;
  scheduler_running: boolean;
  insight_provider: 'configured' | 'deterministic_fallback';
  subsystems: Record<string, string>;
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

const VALID_TRIGGER_KINDS: readonly ProactiveTriggerKind[] = [
  'overspending_warning',
  'evening_reminder',
  'habit_suggestion',
];

const VALID_TRIGGER_ACTIONS: readonly ProactiveTriggerAction[] = [
  'open_budget_recovery',
  'open_manual_entry',
  'open_stats',
  'open_habit_review',
];

const VALID_JOB_NAMES: readonly JobName[] = ['evening_reminder', 'habit_analysis'];

const VALID_JOB_STATUSES: readonly ScheduledJobRunStatus[] = [
  'executed',
  'deduplicated',
  'skipped_no_action',
];

function asFiniteNumber(obj: Record<string, unknown>, field: string, label: string): number {
  const val = obj[field];
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    unexpected(`Expected finite number ${label}.${field}`);
  }
  return val;
}

function asNullableSafeInteger(
  obj: Record<string, unknown>,
  field: string,
  label: string
): number | null {
  const val = obj[field];
  if (val === undefined || val === null) {
    return null;
  }
  if (typeof val !== 'number' || !Number.isSafeInteger(val)) {
    unexpected(`Expected nullable integer ${label}.${field}`);
  }
  return val;
}

export function parseHabitCandidate(body: unknown): HabitCandidate {
  const obj = asRecord(body, 'HabitCandidate');
  const amount = asSafeInteger(obj, 'amount', 'HabitCandidate');
  const confidence = asFiniteNumber(obj, 'confidence', 'HabitCandidate');
  const matchingDays = asSafeInteger(obj, 'matching_days', 'HabitCandidate');
  if (amount <= 0) {
    unexpected('Expected positive HabitCandidate.amount');
  }
  if (confidence < 0 || confidence > 1) {
    unexpected('Expected HabitCandidate.confidence between 0 and 1');
  }
  if (matchingDays < 1 || matchingDays > 31) {
    unexpected('Expected HabitCandidate.matching_days between 1 and 31');
  }
  return {
    id: asString(obj, 'id', 'HabitCandidate'),
    date: asString(obj, 'date', 'HabitCandidate'),
    amount,
    category: asString(obj, 'category', 'HabitCandidate'),
    note: asString(obj, 'note', 'HabitCandidate'),
    confidence,
    matching_days: matchingDays,
  };
}

export function parseProactiveTrigger(body: unknown): ProactiveTrigger {
  const obj = asRecord(body, 'ProactiveTrigger');
  const kind = asString(obj, 'kind', 'ProactiveTrigger');
  if (!VALID_TRIGGER_KINDS.includes(kind as ProactiveTriggerKind)) {
    unexpected('Expected valid ProactiveTrigger.kind');
  }
  const actionTarget = asString(obj, 'action_target', 'ProactiveTrigger');
  if (!VALID_TRIGGER_ACTIONS.includes(actionTarget as ProactiveTriggerAction)) {
    unexpected('Expected allowlisted ProactiveTrigger.action_target');
  }
  const amountVnd = asNullableSafeInteger(obj, 'amount_vnd', 'ProactiveTrigger');
  if (amountVnd !== null && amountVnd < 0) {
    unexpected('Expected non-negative ProactiveTrigger.amount_vnd');
  }
  const habitCandidate =
    obj.habit_candidate === undefined || obj.habit_candidate === null
      ? null
      : parseHabitCandidate(obj.habit_candidate);

  return {
    id: asString(obj, 'id', 'ProactiveTrigger'),
    kind: kind as ProactiveTriggerKind,
    title: asString(obj, 'title', 'ProactiveTrigger'),
    message: asString(obj, 'message', 'ProactiveTrigger'),
    action_target: actionTarget as ProactiveTriggerAction,
    local_date: asString(obj, 'local_date', 'ProactiveTrigger'),
    amount_vnd: amountVnd,
    habit_candidate: habitCandidate,
    created_at: asString(obj, 'created_at', 'ProactiveTrigger'),
  };
}

export function parseProactiveTriggerListResponse(body: unknown): ProactiveTriggerListResponse {
  const obj = asRecord(body, 'ProactiveTriggerListResponse');
  if (!Array.isArray(obj.items)) {
    unexpected('Expected array ProactiveTriggerListResponse.items');
  }
  return {
    items: obj.items.map(parseProactiveTrigger),
    total: asSafeInteger(obj, 'total', 'ProactiveTriggerListResponse'),
  };
}

export function parseTriggerDismissResponse(body: unknown): TriggerDismissResponse {
  const obj = asRecord(body, 'TriggerDismissResponse');
  if (obj.status !== 'dismissed') {
    unexpected('Expected TriggerDismissResponse.status to be dismissed');
  }
  return {
    trigger_id: asString(obj, 'trigger_id', 'TriggerDismissResponse'),
    status: 'dismissed',
    cooldown_until: asNullableString(obj, 'cooldown_until', 'TriggerDismissResponse') ?? null,
  };
}

export function parseAssistantInsight(body: unknown): AssistantInsight {
  const obj = asRecord(body, 'AssistantInsight');
  const source = obj.source;
  if (source !== 'provider' && source !== 'deterministic_fallback') {
    unexpected('Expected valid AssistantInsight.source');
  }
  return {
    summary: asString(obj, 'summary', 'AssistantInsight'),
    source,
    ledger_revision: asSafeInteger(obj, 'ledger_revision', 'AssistantInsight'),
    generated_at: asString(obj, 'generated_at', 'AssistantInsight'),
  };
}

export function parseAssistantSnapshotResponse(body: unknown): AssistantSnapshotResponse {
  const obj = asRecord(body, 'AssistantSnapshotResponse');
  if (!Array.isArray(obj.active_triggers)) {
    unexpected('Expected array AssistantSnapshotResponse.active_triggers');
  }
  const habitCandidate =
    obj.habit_candidate === undefined || obj.habit_candidate === null
      ? null
      : parseHabitCandidate(obj.habit_candidate);
  return {
    budget_summary: parseBudgetSummary(obj.budget_summary),
    insight: parseAssistantInsight(obj.insight),
    active_triggers: obj.active_triggers.map(parseProactiveTrigger),
    habit_candidate: habitCandidate,
    ledger_revision: asSafeInteger(obj, 'ledger_revision', 'AssistantSnapshotResponse'),
    evaluated_at: asString(obj, 'evaluated_at', 'AssistantSnapshotResponse'),
  };
}

export function parseScheduledJobRunResponse(body: unknown): ScheduledJobRunResponse {
  const obj = asRecord(body, 'ScheduledJobRunResponse');
  const jobName = asString(obj, 'job_name', 'ScheduledJobRunResponse');
  if (!VALID_JOB_NAMES.includes(jobName as JobName)) {
    unexpected('Expected valid ScheduledJobRunResponse.job_name');
  }
  const status = asString(obj, 'status', 'ScheduledJobRunResponse');
  if (!VALID_JOB_STATUSES.includes(status as ScheduledJobRunStatus)) {
    unexpected('Expected valid ScheduledJobRunResponse.status');
  }
  return {
    job_name: jobName as JobName,
    local_date: asString(obj, 'local_date', 'ScheduledJobRunResponse'),
    status: status as ScheduledJobRunStatus,
    triggers_emitted: asSafeInteger(obj, 'triggers_emitted', 'ScheduledJobRunResponse'),
    owners_evaluated: asSafeInteger(obj, 'owners_evaluated', 'ScheduledJobRunResponse'),
    executed_at: asString(obj, 'executed_at', 'ScheduledJobRunResponse'),
  };
}

function parseJobScheduleSummary(body: unknown): JobScheduleSummary {
  const obj = asRecord(body, 'JobScheduleSummary');
  const jobName = asString(obj, 'job_name', 'JobScheduleSummary');
  if (!VALID_JOB_NAMES.includes(jobName as JobName)) {
    unexpected('Expected valid JobScheduleSummary.job_name');
  }
  const lastStatus = asNullableString(obj, 'last_status', 'JobScheduleSummary') ?? null;
  if (lastStatus !== null && !VALID_JOB_STATUSES.includes(lastStatus as ScheduledJobRunStatus)) {
    unexpected('Expected valid JobScheduleSummary.last_status');
  }
  return {
    job_name: jobName as JobName,
    scheduled_time_local: asString(obj, 'scheduled_time_local', 'JobScheduleSummary'),
    last_run_date: asNullableString(obj, 'last_run_date', 'JobScheduleSummary') ?? null,
    last_status: lastStatus as ScheduledJobRunStatus | null,
    last_executed_at: asNullableString(obj, 'last_executed_at', 'JobScheduleSummary') ?? null,
  };
}

export function parseJobStatusResponse(body: unknown): JobStatusResponse {
  const obj = asRecord(body, 'JobStatusResponse');
  if (obj.timezone !== 'Asia/Ho_Chi_Minh') {
    unexpected('Expected JobStatusResponse.timezone to be Asia/Ho_Chi_Minh');
  }
  if (!Array.isArray(obj.jobs)) {
    unexpected('Expected array JobStatusResponse.jobs');
  }
  return {
    scheduler_enabled: asBoolean(obj, 'scheduler_enabled', 'JobStatusResponse'),
    scheduler_running: asBoolean(obj, 'scheduler_running', 'JobStatusResponse'),
    timezone: 'Asia/Ho_Chi_Minh',
    jobs: obj.jobs.map(parseJobScheduleSummary),
  };
}

export function parseReadinessResponse(body: unknown): ReadinessResponse {
  const obj = asRecord(body, 'ReadinessResponse');
  if (obj.status !== 'ready' && obj.status !== 'degraded') {
    unexpected('Expected valid ReadinessResponse.status');
  }
  if (obj.service !== 'carenta-api') {
    unexpected('Expected ReadinessResponse.service to be carenta-api');
  }
  if (
    obj.auth_mode !== 'supabase_jwt' &&
    obj.auth_mode !== 'local_dev' &&
    obj.auth_mode !== 'fail_closed_unconfigured'
  ) {
    unexpected('Expected valid ReadinessResponse.auth_mode');
  }
  if (obj.insight_provider !== 'configured' && obj.insight_provider !== 'deterministic_fallback') {
    unexpected('Expected valid ReadinessResponse.insight_provider');
  }
  const rawSubsystems = asRecord(obj.subsystems, 'ReadinessResponse.subsystems');
  const subsystems: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawSubsystems)) {
    if (typeof value !== 'string') {
      unexpected(`Expected string ReadinessResponse.subsystems.${key}`);
    }
    subsystems[key] = value;
  }
  return {
    status: obj.status,
    service: 'carenta-api',
    auth_mode: obj.auth_mode,
    scheduler_enabled: asBoolean(obj, 'scheduler_enabled', 'ReadinessResponse'),
    scheduler_running: asBoolean(obj, 'scheduler_running', 'ReadinessResponse'),
    insight_provider: obj.insight_provider,
    subsystems,
  };
}
