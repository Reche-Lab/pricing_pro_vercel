alter table quote_items
  add column if not exists manual_unit_price boolean not null default false,
  add column if not exists manual_price_reason text,
  add column if not exists manual_price_changed_by uuid references app_users(id),
  add column if not exists manual_price_changed_at timestamptz;

create table if not exists quote_edit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  edited_by uuid references app_users(id),
  reason text,
  synced_olist_order_id text,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_quote_edit_logs_quote_created
  on quote_edit_logs (tenant_id, quote_id, created_at desc);

alter table quote_edit_logs enable row level security;

drop policy if exists quote_edit_logs_tenant_select on quote_edit_logs;
create policy quote_edit_logs_tenant_select on quote_edit_logs
  for select using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

drop policy if exists quote_edit_logs_tenant_insert on quote_edit_logs;
create policy quote_edit_logs_tenant_insert on quote_edit_logs
  for insert with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));
