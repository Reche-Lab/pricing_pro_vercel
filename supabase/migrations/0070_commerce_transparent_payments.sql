-- Opt-in per store. Existing hosted checkouts continue unchanged.
alter table commerce_payment_connections
  add column if not exists public_key text not null default '',
  add column if not exists transparent_enabled boolean not null default false;

create table commerce_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  request_id uuid not null,
  fingerprint text not null,
  seller_id text not null,
  method text not null check (method in ('pix','card')),
  status text not null default 'submitting'
    check (status in ('submitting','unknown','pending','paid','failed','refunded')),
  provider_order_id text,
  result jsonb not null default '{}' check (jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,order_id) references commerce_orders(tenant_id,id),
  unique(tenant_id,order_id,request_id),
  unique(tenant_id,provider_order_id)
);
create unique index commerce_payment_attempt_active
  on commerce_payment_attempts(tenant_id,order_id)
  where status in ('submitting','unknown','pending','paid','refunded');
create index commerce_payment_attempt_order
  on commerce_payment_attempts(tenant_id,order_id,created_at desc);
alter table commerce_payment_attempts enable row level security;
revoke all on commerce_payment_attempts from public, anon, authenticated;
create policy commerce_tenant_admin on commerce_payment_attempts
  for all using (tenant_id=current_tenant_id() and current_user_has_permission('settings:manage'))
  with check (tenant_id=current_tenant_id() and current_user_has_permission('settings:manage'));
