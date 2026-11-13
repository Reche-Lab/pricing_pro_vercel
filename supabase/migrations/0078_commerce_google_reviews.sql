-- Optional per-store Places API configuration. Google review content is never stored here.
create table if not exists commerce_google_review_connections (
  tenant_id uuid primary key references commerce_stores(tenant_id) on delete cascade,
  place_id text not null,
  title text not null default 'Avaliações no Google' check(length(title) between 2 and 100),
  api_key_encrypted text,
  daily_limit integer not null default 50 check(daily_limit between 1 and 1000),
  enabled boolean not null default false,
  revision integer not null default 1 check(revision > 0),
  tested_revision integer,
  tested_at timestamptz,
  updated_at timestamptz not null default now(),
  check(not enabled or (api_key_encrypted is not null and tested_revision is not null and tested_revision = revision and tested_at is not null))
);
create table if not exists commerce_google_review_usage (
  tenant_id uuid not null references commerce_stores(tenant_id) on delete cascade,
  usage_day date not null,
  request_count integer not null default 0 check(request_count >= 0),
  primary key(tenant_id, usage_day)
);
alter table commerce_google_review_connections enable row level security;
alter table commerce_google_review_usage enable row level security;
revoke all on commerce_google_review_connections, commerce_google_review_usage from public, anon, authenticated;
-- Credentials and quota writes are accessible only through authenticated server handlers.
