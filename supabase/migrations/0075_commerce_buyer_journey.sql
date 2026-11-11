alter table tenants add column if not exists production_settings jsonb not null
  default '{"minimumDays":3,"unitsPerDay":100,"holidays":[]}'::jsonb;

create table if not exists commerce_checkout_drafts (
  tenant_id uuid not null references tenants(id) on delete cascade,
  session_id uuid not null,
  customer_id uuid not null,
  payload_encrypted text not null,
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  primary key (tenant_id,session_id,customer_id),
  foreign key (tenant_id,session_id) references commerce_sessions(tenant_id,id) on delete cascade,
  foreign key (tenant_id,customer_id) references commerce_customers(tenant_id,id) on delete cascade
);
create index if not exists commerce_checkout_drafts_expiry on commerce_checkout_drafts(expires_at);

create table if not exists commerce_buyer_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null,
  session_id uuid not null,
  request_id uuid not null,
  request_hash text not null,
  snapshot jsonb not null,
  contact_encrypted text not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  shipping_cents integer check (shipping_cents is null or shipping_cents >= 0),
  total_cents integer not null check (total_cents > 0),
  created_at timestamptz not null default now(),
  valid_until timestamptz not null default now() + interval '3 days',
  foreign key (tenant_id,customer_id) references commerce_customers(tenant_id,id),
  foreign key (tenant_id,session_id) references commerce_sessions(tenant_id,id),
  unique (tenant_id,customer_id,request_id)
);
create index if not exists commerce_buyer_quotes_customer on commerce_buyer_quotes(tenant_id,customer_id,created_at desc);

alter table commerce_artworks add column if not exists coverage_acceptance jsonb;

alter table commerce_checkout_drafts enable row level security;
alter table commerce_buyer_quotes enable row level security;
revoke all on commerce_checkout_drafts,commerce_buyer_quotes from public,anon,authenticated;
-- Browser access is exclusively through server handlers scoped by tenant,
-- authenticated buyer and live session. No anonymous SQL policies.
