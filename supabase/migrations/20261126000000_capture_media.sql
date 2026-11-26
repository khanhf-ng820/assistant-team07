-- CARENTA capture media storage and expense linking (issue #52, UC03/UC04).
--
-- Receipt images and temporary voice clips are stored in the private
-- `capture-media` Storage bucket by the backend (service role) after the API has
-- validated and stripped metadata (services/carenta-api/app/media.py). This
-- table records their metadata per owner and links them to the confirmed
-- expense in one database transaction via public.confirm_expense_with_media().

-- Linked media must reference a transaction of the same owner.
alter table public.transactions
  add constraint transactions_id_owner_key unique (id, owner_id);

-- ---------------------------------------------------------------------------
-- capture_media
-- ---------------------------------------------------------------------------

create table public.capture_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('receipt', 'voice')),
  storage_bucket text not null default 'capture-media' check (storage_bucket = 'capture-media'),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width integer check (width is null or width between 32 and 10000),
  height integer check (height is null or height between 32 and 10000),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 30500),
  transaction_id uuid,
  linked_at timestamptz,
  expires_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  -- Object path is always {owner_id}/{kind}/{id}.{ext}; never a client file name.
  check (storage_path = owner_id::text || '/' || kind || '/' || id::text || '.'
         || case mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'm4a' end),
  check (
    (kind = 'receipt' and mime_type in ('image/jpeg', 'image/png')
       and size_bytes <= 5242880 and width is not null and height is not null and duration_ms is null)
    or
    (kind = 'voice' and mime_type = 'audio/mp4'
       and size_bytes <= 2097152 and duration_ms is not null and width is null and height is null)
  ),
  check ((transaction_id is null) = (linked_at is null)),
  foreign key (transaction_id, owner_id) references public.transactions (id, owner_id)
);

create index capture_media_owner_created_idx on public.capture_media (owner_id, created_at desc);
create index capture_media_transaction_idx on public.capture_media (transaction_id)
  where transaction_id is not null;
create index capture_media_expiry_idx on public.capture_media (expires_at)
  where expires_at is not null and purged_at is null;

alter table public.capture_media enable row level security;
revoke all on public.capture_media from anon;

create policy "capture_media: owner can read" on public.capture_media
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "capture_media: owner can insert unlinked" on public.capture_media
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and transaction_id is null and linked_at is null);
-- No update/delete policies: linking goes through confirm_expense_with_media(),
-- and expiry/purging is done by the backend with the service role.

-- ---------------------------------------------------------------------------
-- Atomic confirm: insert the expense and link its media, or do nothing.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_expense_with_media(
  p_amount_vnd bigint,
  p_category text,
  p_occurred_on date,
  p_note text,
  p_source text,
  p_idempotency_key text,
  p_media_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_tx_id uuid;
  v_wanted int;
  v_found int;
  v_linked_elsewhere int;
begin
  if v_owner is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_source not in ('receipt', 'voice') then
    raise exception 'source must be receipt or voice' using errcode = 'check_violation';
  end if;
  select count(distinct m) into v_wanted from unnest(p_media_ids) as m;
  if v_wanted = 0 then
    raise exception 'at least one capture media item is required' using errcode = 'check_violation';
  end if;

  -- Lock the caller's media rows so two confirmations cannot both link them.
  perform 1 from public.capture_media
    where owner_id = v_owner and id = any (p_media_ids)
    for update;
  select count(*) into v_found from public.capture_media
    where owner_id = v_owner and id = any (p_media_ids);
  if v_found <> v_wanted then
    raise exception 'capture media not found' using errcode = 'no_data_found';
  end if;

  -- Idempotent retry: same key and media already linked to that transaction.
  select id into v_tx_id from public.transactions
    where owner_id = v_owner and idempotency_key = p_idempotency_key;
  if v_tx_id is not null then
    if not exists (
      select 1 from public.transactions
      where id = v_tx_id and kind = 'expense' and amount_vnd = p_amount_vnd
        and category = p_category and occurred_on = p_occurred_on
        and note is not distinct from p_note
    ) then
      raise exception 'idempotency key already used with a different payload'
        using errcode = 'unique_violation';
    end if;
    select count(*) into v_linked_elsewhere from public.capture_media
      where owner_id = v_owner and id = any (p_media_ids)
        and transaction_id is distinct from v_tx_id;
    if v_linked_elsewhere > 0 then
      raise exception 'idempotency key already used for a different confirmation'
        using errcode = 'unique_violation';
    end if;
    return v_tx_id;
  end if;

  if exists (
    select 1 from public.capture_media
    where owner_id = v_owner and id = any (p_media_ids)
      and (transaction_id is not null or (expires_at is not null and expires_at <= now()))
  ) then
    raise exception 'capture media is already linked or has expired' using errcode = 'check_violation';
  end if;

  insert into public.transactions
    (owner_id, kind, amount_vnd, category, occurred_on, note, source, idempotency_key)
  values
    (v_owner, 'expense', p_amount_vnd, p_category, p_occurred_on, p_note, p_source, p_idempotency_key)
  returning id into v_tx_id;

  update public.capture_media
    set transaction_id = v_tx_id,
        linked_at = now(),
        -- Receipts are kept as evidence; voice clips stay temporary.
        expires_at = case when kind = 'receipt' then null else expires_at end
    where owner_id = v_owner and id = any (p_media_ids);

  return v_tx_id;
end;
$$;

revoke execute on function public.confirm_expense_with_media(bigint, text, date, text, text, text, uuid[])
  from public, anon;
grant execute on function public.confirm_expense_with_media(bigint, text, date, text, text, text, uuid[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- Private Storage bucket. Only the backend (service role) uploads or deletes;
-- a student can read objects under their own `{owner_id}/` folder.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capture-media', 'capture-media', false, 5242880,
        array['image/jpeg', 'image/png', 'audio/mp4'])
on conflict (id) do nothing;

create policy "capture-media: owner can read own folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'capture-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
