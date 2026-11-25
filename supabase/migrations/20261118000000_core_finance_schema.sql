-- CARENTA core finance schema (issue #42, UC01-UC03 and UC06 storage).
--
-- Tables: profiles (users), transactions, commitments (planned events),
-- goals ("Heo đất") and goal_allocations ("Lịch sử đút heo").
-- Money is stored as integer VND (bigint); balances and totals are derived,
-- never stored. Every user-owned row is protected by row-level security and
-- scoped to auth.uid(). Budget plans, capture drafts and AI usage are owned by
-- later issues and are intentionally not created here.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per Supabase Auth user
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  opening_balance_vnd bigint not null default 0
    check (opening_balance_vnd between 0 and 1000000000000),
  opening_balance_effective_at timestamptz not null default now(),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  currency text not null default 'VND' check (currency = 'VND'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create the profile automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- commitments: planned events / unpaid bills (unpaid amount is derived)
-- ---------------------------------------------------------------------------

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  planned_amount_vnd bigint not null check (planned_amount_vnd between 1 and 1000000000000),
  due_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, owner_id)
);

create index commitments_owner_due_idx on public.commitments (owner_id, due_on)
  where deleted_at is null;

create trigger commitments_set_updated_at
  before update on public.commitments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions: confirmed income and expenses
-- ---------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  category text not null check (category ~ '^[a-z][a-z_]{0,31}$'),
  occurred_on date not null,
  occurred_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  source text not null default 'manual' check (source in ('manual', 'receipt', 'voice')),
  commitment_id uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, idempotency_key),
  -- A linked bill payment must belong to the same owner.
  foreign key (commitment_id, owner_id) references public.commitments (id, owner_id),
  check (commitment_id is null or kind = 'expense')
);

create index transactions_owner_date_idx on public.transactions (owner_id, occurred_on)
  where deleted_at is null;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- goals: the savings goal ("Heo đất"); at most one active goal per owner
-- ---------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null default 'Heo đất' check (char_length(name) between 1 and 80),
  target_vnd bigint not null check (target_vnd between 1 and 1000000000000),
  deadline_on date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index goals_one_active_per_owner on public.goals (owner_id) where is_active;

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- goal_allocations: deposit history ("Lịch sử đút heo"); append-only.
-- Allocations move virtual savings; they are not income or expenses.
-- ---------------------------------------------------------------------------

create table public.goal_allocations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  kind text not null check (kind in ('allocation', 'release')),
  amount_vnd bigint not null check (amount_vnd between 1 and 1000000000000),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  foreign key (goal_id, owner_id) references public.goals (id, owner_id) on delete cascade
);

create index goal_allocations_goal_created_idx
  on public.goal_allocations (goal_id, created_at desc);

-- A release cannot take out more than the goal currently holds.
create or replace function public.check_goal_release()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  saved bigint;
begin
  if new.kind = 'release' then
    -- Serialise concurrent allocations for the same goal.
    perform 1 from public.goals where id = new.goal_id for update;
    select coalesce(sum(case when kind = 'allocation' then amount_vnd else -amount_vnd end), 0)
      into saved
      from public.goal_allocations
      where goal_id = new.goal_id;
    if new.amount_vnd > saved then
      raise exception 'release of % VND exceeds saved amount % VND', new.amount_vnd, saved
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger goal_allocations_check_release
  before insert on public.goal_allocations
  for each row execute function public.check_goal_release();

-- ---------------------------------------------------------------------------
-- Row-level security: every row is visible and writable only by its owner.
-- The service-role key bypasses RLS and must stay in the backend .env only.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.commitments enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.goal_allocations enable row level security;

revoke all on public.profiles, public.commitments, public.transactions,
  public.goals, public.goal_allocations from anon;

create policy "profiles: owner can read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner can update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "commitments: owner can read" on public.commitments
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "commitments: owner can insert" on public.commitments
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "commitments: owner can update" on public.commitments
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "transactions: owner can read" on public.transactions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "transactions: owner can insert" on public.transactions
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "transactions: owner can update" on public.transactions
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "goals: owner can read" on public.goals
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "goals: owner can insert" on public.goals
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "goals: owner can update" on public.goals
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- History is append-only: no update or delete policy is granted.
create policy "goal_allocations: owner can read" on public.goal_allocations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "goal_allocations: owner can insert" on public.goal_allocations
  for insert to authenticated with check (owner_id = (select auth.uid()));
