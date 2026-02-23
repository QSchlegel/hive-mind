-- Waitlist signup hardening: consent timestamp + normalized lookup index

alter table waitlist_entries
  add column if not exists privacy_consent_at timestamptz;

update waitlist_entries
set email = lower(email)
where email <> lower(email);

create index if not exists idx_waitlist_entries_email_lower on waitlist_entries (lower(email));
