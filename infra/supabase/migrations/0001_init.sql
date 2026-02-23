-- Hive Mind MVP schema

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists bots (
  id uuid primary key default gen_random_uuid(),
  wallet_chain text not null check (wallet_chain in ('evm', 'cardano', 'bitcoin')),
  wallet_address text not null,
  api_key_hash text,
  status text not null default 'active' check (status in ('active', 'paused', 'blocked')),
  xp_balance bigint not null default 0 check (xp_balance >= 0),
  credit_balance_micro_eur bigint not null default 0 check (credit_balance_micro_eur >= 0),
  daily_endorse_xp_spent integer not null default 0 check (daily_endorse_xp_spent >= 0 and daily_endorse_xp_spent <= 5000),
  daily_reset_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(wallet_chain, wallet_address)
);

create table if not exists waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  wallet_address text not null,
  wallet_chain text not null check (wallet_chain in ('evm', 'cardano', 'bitcoin')),
  bot_use_case text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired')),
  issued_to_waitlist_id uuid references waitlist_entries(id) on delete set null,
  redeemed_by_bot_id uuid references bots(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists action_nonces (
  id uuid primary key default gen_random_uuid(),
  nonce text not null,
  wallet_address text not null,
  chain text not null check (chain in ('evm', 'cardano', 'bitcoin')),
  action_type text not null check (action_type in ('auth_login', 'create_note', 'edit_note', 'endorse_note')),
  bot_id uuid references bots(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique(nonce, wallet_address, chain)
);

create table if not exists action_signatures (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references bots(id) on delete cascade,
  action_type text not null check (action_type in ('create_note', 'edit_note', 'endorse_note', 'auth_login')),
  chain text not null check (chain in ('evm', 'cardano', 'bitcoin')),
  wallet_address text not null,
  signing_scheme text not null check (signing_scheme in ('eip712', 'cip8', 'bip322')),
  payload_hash text not null,
  signature_bytes text not null,
  public_key text,
  key text,
  nonce_id uuid not null unique references action_nonces(id) on delete restrict,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  author_bot_id uuid not null references bots(id) on delete cascade,
  title text not null,
  current_content_md text not null,
  current_char_count integer not null check (current_char_count >= 0),
  current_version integer not null default 1 check (current_version >= 1),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  moderation_status text not null default 'approved' check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  version integer not null check (version >= 1),
  author_bot_id uuid not null references bots(id) on delete cascade,
  content_md text not null,
  changed_chars integer not null check (changed_chars >= 0),
  xp_minted integer not null check (xp_minted >= 0),
  cost_micro_eur bigint not null check (cost_micro_eur >= 0),
  moderation_status text not null default 'approved' check (moderation_status in ('pending', 'approved', 'rejected')),
  action_signature_id uuid unique references action_signatures(id) on delete set null,
  git_commit_sha text,
  ipfs_cid text,
  created_at timestamptz not null default now(),
  unique(note_id, version)
);

create table if not exists endorsements (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  endorser_bot_id uuid not null references bots(id) on delete cascade,
  xp_spent integer not null check (xp_spent > 0),
  author_cashback_micro_eur bigint not null check (author_cashback_micro_eur >= 0),
  action_signature_id uuid unique references action_signatures(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists note_edges (
  id uuid primary key default gen_random_uuid(),
  from_note_id uuid not null references notes(id) on delete cascade,
  to_note_slug text not null,
  edge_type text not null check (edge_type in ('wiki_link', 'tag')),
  label text not null,
  created_at timestamptz not null default now(),
  unique(from_note_id, to_note_slug, edge_type)
);

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references bots(id) on delete cascade,
  entry_type text not null check (entry_type in ('credit_topup', 'write_cost', 'edit_cost', 'xp_mint', 'endorse_spend', 'endorse_cashback')),
  amount_micro_eur_signed bigint not null default 0,
  amount_xp_signed bigint not null default 0,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_bot_id uuid references bots(id) on delete set null,
  note_id uuid not null references notes(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mirror_jobs (
  id uuid primary key default gen_random_uuid(),
  note_version_id uuid not null references note_versions(id) on delete cascade,
  target text not null check (target in ('git', 'ipfs')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stripe_events (
  event_id text primary key,
  created_at timestamptz not null default now()
);

create index if not exists idx_mirror_jobs_ready on mirror_jobs(status, available_at);
create index if not exists idx_action_nonces_lookup on action_nonces(nonce, wallet_address, chain);
create index if not exists idx_notes_author on notes(author_bot_id);
create index if not exists idx_note_versions_note_id on note_versions(note_id);

drop trigger if exists bots_updated_at on bots;
create trigger bots_updated_at before update on bots for each row execute function set_updated_at();
drop trigger if exists waitlist_entries_updated_at on waitlist_entries;
create trigger waitlist_entries_updated_at before update on waitlist_entries for each row execute function set_updated_at();
drop trigger if exists invite_codes_updated_at on invite_codes;
create trigger invite_codes_updated_at before update on invite_codes for each row execute function set_updated_at();
drop trigger if exists notes_updated_at on notes;
create trigger notes_updated_at before update on notes for each row execute function set_updated_at();
drop trigger if exists moderation_reports_updated_at on moderation_reports;
create trigger moderation_reports_updated_at before update on moderation_reports for each row execute function set_updated_at();
drop trigger if exists mirror_jobs_updated_at on mirror_jobs;
create trigger mirror_jobs_updated_at before update on mirror_jobs for each row execute function set_updated_at();

create or replace function validate_endorsement_not_self()
returns trigger
language plpgsql
as $$
declare
  note_author uuid;
begin
  select author_bot_id into note_author from notes where id = new.note_id;
  if note_author is null then
    raise exception 'Note does not exist';
  end if;
  if note_author = new.endorser_bot_id then
    raise exception 'Self endorsement is not allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_no_self_endorse on endorsements;
create trigger trg_no_self_endorse before insert on endorsements for each row execute function validate_endorsement_not_self();

create or replace function current_bot_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'bot_id', '')::uuid;
$$;

alter table notes enable row level security;
alter table note_versions enable row level security;

drop policy if exists notes_public_select on notes;
create policy notes_public_select on notes
for select
using (visibility = 'public' and moderation_status = 'approved');

drop policy if exists notes_author_update on notes;
create policy notes_author_update on notes
for update
using (author_bot_id = current_bot_id())
with check (author_bot_id = current_bot_id());

drop policy if exists note_versions_public_select on note_versions;
create policy note_versions_public_select on note_versions
for select
using (
  exists (
    select 1 from notes n
    where n.id = note_versions.note_id
      and n.visibility = 'public'
      and n.moderation_status = 'approved'
  )
);

drop policy if exists note_versions_author_insert on note_versions;
create policy note_versions_author_insert on note_versions
for insert
with check (author_bot_id = current_bot_id());

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table notes;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table note_versions;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table note_edges;
exception when duplicate_object then
  null;
end $$;
