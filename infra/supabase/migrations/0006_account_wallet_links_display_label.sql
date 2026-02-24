-- Optional display label for account-linked bots (e.g. bot-01, bot-02 or custom)
alter table account_wallet_links
  add column if not exists display_label text;
