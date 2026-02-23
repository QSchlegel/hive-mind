-- Better Auth account model + treasury account-centric governance extensions

create table if not exists "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create table if not exists "session" (
  "id" text not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

create table if not exists "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null
);

create table if not exists "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz default current_timestamp not null
);

create table if not exists "passkey" (
  "id" text not null primary key,
  "name" text,
  "publicKey" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "credentialID" text not null,
  "counter" integer not null,
  "deviceType" text not null,
  "backedUp" boolean not null,
  "transports" text,
  "createdAt" timestamptz,
  "aaguid" text
);

create index if not exists "session_userId_idx" on "session" ("userId");
create index if not exists "account_userId_idx" on "account" ("userId");
create index if not exists "verification_identifier_idx" on "verification" ("identifier");
create index if not exists "passkey_userId_idx" on "passkey" ("userId");
create index if not exists "passkey_credentialID_idx" on "passkey" ("credentialID");

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
      'vote_treasury_proposal',
      'link_wallet'
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
      'vote_treasury_proposal',
      'link_wallet'
    )
  );

create table if not exists account_wallet_links (
  id uuid primary key default gen_random_uuid(),
  account_id text not null references "user"(id) on delete cascade,
  wallet_chain text not null check (wallet_chain in ('evm', 'cardano', 'bitcoin')),
  wallet_address text not null,
  bot_id uuid not null references bots(id) on delete cascade,
  linked_at timestamptz not null default now(),
  unique(account_id, wallet_chain, wallet_address),
  unique(wallet_chain, wallet_address),
  unique(account_id, bot_id)
);

create index if not exists idx_account_wallet_links_account on account_wallet_links(account_id);
create index if not exists idx_account_wallet_links_bot on account_wallet_links(bot_id);

alter table treasury_contributions
  add column if not exists contributor_account_id text references "user"(id) on delete set null;

alter table treasury_proposals
  add column if not exists proposer_account_id text references "user"(id) on delete set null;

alter table treasury_proposals
  alter column proposer_bot_id drop not null;

alter table treasury_votes
  add column if not exists voter_account_id text references "user"(id) on delete cascade;

alter table treasury_votes
  add column if not exists source_bot_id uuid references bots(id) on delete set null;

update treasury_votes
set source_bot_id = voter_bot_id
where source_bot_id is null;

create unique index if not exists idx_treasury_votes_account_unique
  on treasury_votes(proposal_id, voter_account_id)
  where voter_account_id is not null;

create index if not exists idx_treasury_proposals_proposer_account on treasury_proposals(proposer_account_id);
create index if not exists idx_treasury_contributions_account on treasury_contributions(contributor_account_id);
create index if not exists idx_treasury_votes_account on treasury_votes(voter_account_id);

create table if not exists treasury_payouts (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references treasury_proposals(id) on delete cascade,
  treasury_account_id uuid not null references treasury_accounts(id) on delete restrict,
  funded_by_account_id text not null references "user"(id) on delete restrict,
  funded_by_wallet_chain text check (funded_by_wallet_chain in ('evm', 'cardano', 'bitcoin')),
  funded_by_wallet_address text,
  amount_micro_eur bigint not null check (amount_micro_eur > 0),
  transfer_reference text not null,
  receipt_url text,
  notes text,
  funded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_treasury_payouts_created_at on treasury_payouts(created_at desc);
