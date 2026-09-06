-- Optional commerce pilot. Nothing is enabled or published by this migration.
create unique index if not exists platform_rules_tenant_id_unique on platform_rules(tenant_id,id);
create unique index if not exists product_variants_tenant_id_unique on product_variants(tenant_id,id);
create table commerce_stores (
  tenant_id uuid primary key references tenants(id),
  enabled boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','paused')),
  platform_id uuid,
  settings jsonb not null default '{}' check (jsonb_typeof(settings)='object'),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  foreign key(tenant_id,platform_id) references platform_rules(tenant_id,id)
);
create table commerce_products (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references commerce_stores(tenant_id),
  variant_id uuid not null, active boolean not null default false,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'), updated_at timestamptz not null default now(),
  unique(tenant_id,variant_id), unique(tenant_id,id),
  foreign key(tenant_id,variant_id) references product_variants(tenant_id,id)
);
create table commerce_customers (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references commerce_stores(tenant_id),
  email citext not null, name text not null, created_at timestamptz not null default now(),
  unique(tenant_id,email), unique(tenant_id,id)
);
create table commerce_sessions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references commerce_stores(tenant_id),
  token_hash text not null unique, customer_id uuid,
  cart jsonb not null default '[]', revision integer not null default 0,
  expires_at timestamptz not null default now()+interval '14 days', created_at timestamptz not null default now(),
  foreign key (tenant_id,customer_id) references commerce_customers(tenant_id,id), unique(tenant_id,id)
);
create table commerce_login_challenges (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references commerce_stores(tenant_id),
  session_id uuid not null, email citext not null, name text not null, code_hash text not null,
  attempts integer not null default 0, consumed_at timestamptz,
  expires_at timestamptz not null default now()+interval '10 minutes',
  foreign key(tenant_id,session_id) references commerce_sessions(tenant_id,id)
);
create table commerce_artworks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references commerce_stores(tenant_id),
  session_id uuid not null, product_id uuid not null, storage_path text not null,
  prepared_path text, file_name text not null, crop jsonb, approved_at timestamptz, content_hash text not null,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,session_id) references commerce_sessions(tenant_id,id),
  foreign key(tenant_id,product_id) references commerce_products(tenant_id,id), unique(tenant_id,id)
);
create table commerce_payment_connections (
  tenant_id uuid primary key references commerce_stores(tenant_id),
  manual_enabled boolean not null default false, manual_instructions text not null default '',
  mp_enabled boolean not null default false, encrypted_credentials text,
  updated_at timestamptz not null default now()
);
create table commerce_orders (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references commerce_stores(tenant_id),
  customer_id uuid not null, session_id uuid not null, cart_revision integer not null,
  snapshot jsonb not null, subtotal_cents integer not null check(subtotal_cents>=0),
  shipping_cents integer not null check(shipping_cents>=0), total_cents integer not null check(total_cents>0),
  provider text not null check(provider in ('manual','mercado_pago')),
  payment_status text not null default 'pending' check(payment_status in ('pending','paid','refunded')),
  fulfillment_status text not null default 'received' check(fulfillment_status in ('received','production','shipped','completed')),
  provider_preference_id text, checkout_url text, provider_payment_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(tenant_id,customer_id) references commerce_customers(tenant_id,id),
  foreign key(tenant_id,session_id) references commerce_sessions(tenant_id,id),
  unique(tenant_id,session_id,cart_revision), unique(tenant_id,id)
);
create unique index commerce_order_payment_unique on commerce_orders(tenant_id,provider,provider_payment_id) where provider_payment_id is not null;
create table commerce_order_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, order_id uuid not null,
  type text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
  foreign key(tenant_id,order_id) references commerce_orders(tenant_id,id)
);
create index commerce_orders_customer on commerce_orders(tenant_id,customer_id,created_at desc);
create index commerce_sessions_expiry on commerce_sessions(expires_at);

-- Browser roles have no table access. Public HTTP handlers authorize a separate,
-- opaque buyer session and use explicit tenant filters on every query.
do $$ declare tab text; begin
  foreach tab in array array['commerce_stores','commerce_products','commerce_customers','commerce_sessions','commerce_login_challenges','commerce_artworks','commerce_payment_connections','commerce_orders','commerce_order_events'] loop
    execute format('alter table %I enable row level security',tab);
    execute format('revoke all on %I from public, anon, authenticated',tab);
    execute format('create policy commerce_tenant_admin on %I for all using (tenant_id=current_tenant_id() and current_user_has_permission(''settings:manage'')) with check (tenant_id=current_tenant_id() and current_user_has_permission(''settings:manage''))',tab);
  end loop;
end $$;
