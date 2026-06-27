create table if not exists shipments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,
  provider text not null,
  provider_shipment_id text,
  provider_order_id text,
  tracking_code text,
  status text not null default 'draft' check (
    status in (
      'draft',
      'quoted',
      'cart',
      'paid',
      'label_generated',
      'printed',
      'posted',
      'delivered',
      'cancelled',
      'error'
    )
  ),
  service_name text,
  service_code text,
  shipping_amount numeric(12,4) not null default 0,
  label_url text,
  raw_quote jsonb,
  raw_payload jsonb,
  raw_response jsonb,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shipments_tenant_quote on shipments(tenant_id, quote_id);
create index if not exists idx_shipments_tenant_provider on shipments(tenant_id, provider, created_at desc);
create index if not exists idx_shipments_tracking on shipments(tracking_code);

alter table shipments enable row level security;

create policy shipments_tenant_all on shipments
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));
