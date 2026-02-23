-- Treasury governance + custody evolution (Stripe first, cross-chain later)

alter table action_nonces drop constraint if exists action_nonces_action_type_check;
alter table action_nonces
  add constraint action_nonces_action_type_check
  check (
    action_type in (
      'auth_login',
      'create_note',
      'edit_note',
      'endorse_note',
      'create_treasury_proposal',
      'vote_treasury_proposal'
    )
  );

alter table action_signatures drop constraint if exists action_signatures_action_type_check;
alter table action_signatures
  add constraint action_signatures_action_type_check
  check (
    action_type in (
      'create_note',
      'edit_note',
      'endorse_note',
      'auth_login',
      'create_treasury_proposal',
      'vote_treasury_proposal'
    )
  );

alter table ledger_entries drop constraint if exists ledger_entries_entry_type_check;
alter table ledger_entries
  add constraint ledger_entries_entry_type_check
  check (
    entry_type in (
      'credit_topup',
      'write_cost',
      'edit_cost',
      'xp_mint',
      'endorse_spend',
      'endorse_cashback',
      'treasury_vote_spend'
    )
  );

create table if not exists treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'cross_chain')),
  status text not null default 'active' check (status in ('active', 'migrating', 'inactive')),
  currency text not null default 'eur',
  external_account_ref text,
  network text,
  balance_micro_eur bigint not null default 0 check (balance_micro_eur >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_account_ref)
);

create unique index if not exists idx_treasury_single_active
  on treasury_accounts ((1))
  where status = 'active';

insert into treasury_accounts (provider, status, currency, balance_micro_eur)
select 'stripe', 'active', 'eur', 0
where not exists (
  select 1 from treasury_accounts where status = 'active'
);

create table if not exists treasury_contributions (
  id uuid primary key default gen_random_uuid(),
  treasury_account_id uuid not null references treasury_accounts(id) on delete restrict,
  contributor_bot_id uuid references bots(id) on delete set null,
  provider text not null check (provider in ('stripe', 'cross_chain')),
  provider_reference text not null unique,
  amount_micro_eur bigint not null check (amount_micro_eur > 0),
  currency text not null default 'eur',
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists treasury_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_bot_id uuid not null references bots(id) on delete cascade,
  title text not null,
  summary text,
  description_md text not null,
  requested_micro_eur bigint not null check (requested_micro_eur > 0),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'funded', 'cancelled')),
  vote_quorum_xp bigint not null check (vote_quorum_xp > 0),
  yes_xp bigint not null default 0 check (yes_xp >= 0),
  no_xp bigint not null default 0 check (no_xp >= 0),
  voting_deadline timestamptz not null,
  executed_at timestamptz,
  treasury_account_id uuid references treasury_accounts(id) on delete set null,
  action_signature_id uuid unique references action_signatures(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists treasury_votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references treasury_proposals(id) on delete cascade,
  voter_bot_id uuid not null references bots(id) on delete cascade,
  vote text not null check (vote in ('yes', 'no')),
  xp_spent integer not null check (xp_spent > 0),
  action_signature_id uuid unique references action_signatures(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(proposal_id, voter_bot_id)
);

create index if not exists idx_treasury_proposals_status_deadline on treasury_proposals(status, voting_deadline);
create index if not exists idx_treasury_votes_proposal on treasury_votes(proposal_id);
create index if not exists idx_treasury_contributions_created_at on treasury_contributions(created_at desc);

drop trigger if exists treasury_accounts_updated_at on treasury_accounts;
create trigger treasury_accounts_updated_at
before update on treasury_accounts
for each row execute function set_updated_at();

drop trigger if exists treasury_proposals_updated_at on treasury_proposals;
create trigger treasury_proposals_updated_at
before update on treasury_proposals
for each row execute function set_updated_at();
