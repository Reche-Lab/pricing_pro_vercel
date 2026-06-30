alter table tenant_subscriptions
  add column if not exists discount_percent numeric(5,2) not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  add column if not exists discount_expires_at timestamptz,
  add column if not exists discount_note text;

alter table billing_invoices
  drop constraint if exists billing_invoices_amount_cents_check;

alter table billing_invoices
  add constraint billing_invoices_amount_cents_check check (amount_cents >= 0);

create table if not exists billing_vouchers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  discount_percent numeric(5,2) not null check (discount_percent > 0 and discount_percent <= 100),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  note text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index if not exists idx_billing_vouchers_tenant_active
  on billing_vouchers (tenant_id, expires_at desc)
  where cancelled_at is null;

alter table billing_vouchers enable row level security;

drop policy if exists billing_vouchers_superadmin_select on billing_vouchers;
create policy billing_vouchers_superadmin_select on billing_vouchers
  for select using (current_user_is_super_admin());

drop policy if exists billing_vouchers_superadmin_insert on billing_vouchers;
create policy billing_vouchers_superadmin_insert on billing_vouchers
  for insert with check (current_user_is_super_admin());

drop policy if exists billing_vouchers_superadmin_update on billing_vouchers;
create policy billing_vouchers_superadmin_update on billing_vouchers
  for update using (current_user_is_super_admin())
  with check (current_user_is_super_admin());
