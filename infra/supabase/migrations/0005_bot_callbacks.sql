-- Per-bot note callback settings + callback delivery postbox

create table if not exists bot_note_callbacks (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null unique references bots(id) on delete cascade,
  endpoint_url text not null,
  enabled boolean not null default true,
  event_note_created boolean not null default true,
  event_note_edited boolean not null default true,
  signing_secret_encrypted text not null,
  created_by_account_id text references "user"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bot_note_callbacks_bot_id on bot_note_callbacks(bot_id);

create table if not exists callback_postbox_jobs (
  id uuid primary key default gen_random_uuid(),
  bot_note_callback_id uuid not null references bot_note_callbacks(id) on delete cascade,
  bot_id uuid not null references bots(id) on delete cascade,
  note_id uuid not null references notes(id) on delete cascade,
  note_version_id uuid not null references note_versions(id) on delete cascade,
  event_type text not null check (event_type in ('note.created', 'note.edited')),
  payload_json jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'delivered', 'failed', 'dead_letter')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_http_status integer,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bot_note_callback_id, note_version_id, event_type)
);

create index if not exists idx_callback_postbox_jobs_ready on callback_postbox_jobs(status, available_at);
create index if not exists idx_callback_postbox_jobs_bot_history on callback_postbox_jobs(bot_id, created_at desc);
create index if not exists idx_callback_postbox_jobs_callback on callback_postbox_jobs(bot_note_callback_id, created_at desc);

drop trigger if exists bot_note_callbacks_updated_at on bot_note_callbacks;
create trigger bot_note_callbacks_updated_at
before update on bot_note_callbacks
for each row execute function set_updated_at();

drop trigger if exists callback_postbox_jobs_updated_at on callback_postbox_jobs;
create trigger callback_postbox_jobs_updated_at
before update on callback_postbox_jobs
for each row execute function set_updated_at();
