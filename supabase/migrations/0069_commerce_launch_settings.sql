-- Tenant-specific Checkout Pro restrictions. Existing connections retain all methods.
alter table commerce_payment_connections
  add column if not exists checkout_settings jsonb not null default '{}'
    check (jsonb_typeof(checkout_settings) = 'object');

-- Shipping quotes are server-side, short-lived and bound to a buyer session/cart.
create table if not exists commerce_shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references commerce_stores(tenant_id),
  session_id uuid not null,
  cart_revision integer not null,
  store_revision integer not null,
  cart_hash text not null,
  postal_code text not null check (postal_code ~ '^[0-9]{8}$'),
  option jsonb not null check (jsonb_typeof(option) = 'object'),
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, session_id) references commerce_sessions(tenant_id, id)
);
create index if not exists commerce_shipping_quotes_session
  on commerce_shipping_quotes (tenant_id, session_id, expires_at);
alter table commerce_shipping_quotes enable row level security;
revoke all on commerce_shipping_quotes from public, anon, authenticated;
drop policy if exists commerce_shipping_quotes_admin on commerce_shipping_quotes;
create policy commerce_shipping_quotes_admin on commerce_shipping_quotes for all
  using (tenant_id = current_tenant_id() and current_user_has_permission('settings:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('settings:manage'));
