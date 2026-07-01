alter table quotes
  add column if not exists public_token_hash text unique,
  add column if not exists public_token_expires_at timestamptz,
  add column if not exists public_viewed_at timestamptz,
  add column if not exists public_accepted_at timestamptz,
  add column if not exists public_rejected_at timestamptz,
  add column if not exists customer_decision_note text;

create index if not exists idx_quotes_public_token_hash
  on quotes (public_token_hash)
  where public_token_hash is not null;

create index if not exists idx_quotes_tenant_public_token_expires
  on quotes (tenant_id, public_token_expires_at desc)
  where public_token_hash is not null;
