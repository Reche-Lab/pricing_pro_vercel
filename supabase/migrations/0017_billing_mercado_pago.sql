alter table tenants
  add column if not exists billing_status text not null default 'trial'
    check (billing_status in ('trial', 'active', 'past_due', 'blocked', 'cancelled')),
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '14 days'),
  add column if not exists billing_blocked_at timestamptz;

create table if not exists billing_plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  amount_cents integer not null check (amount_cents > 0),
  currency char(3) not null default 'BRL',
  interval text not null default 'month' check (interval in ('month')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  plan_id uuid not null references billing_plans(id),
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'blocked', 'cancelled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table if not exists billing_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subscription_id uuid not null references tenant_subscriptions(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'pending', 'paid', 'failed', 'cancelled', 'expired')),
  amount_cents integer not null check (amount_cents > 0),
  currency char(3) not null default 'BRL',
  due_at timestamptz not null default now(),
  paid_at timestamptz,
  provider text not null default 'mercado_pago',
  provider_preference_id text,
  provider_payment_id text,
  checkout_url text,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  invoice_id uuid references billing_invoices(id) on delete set null,
  provider text not null default 'mercado_pago',
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_tenant_subscriptions_status on tenant_subscriptions (status);
create index if not exists idx_billing_invoices_tenant_created on billing_invoices (tenant_id, created_at desc);
create index if not exists idx_billing_invoices_external_reference on billing_invoices (external_reference);
create index if not exists idx_billing_invoices_provider_payment on billing_invoices (provider_payment_id);
create index if not exists idx_payment_events_provider_event on payment_events (provider, provider_event_id);

alter table billing_plans enable row level security;
alter table tenant_subscriptions enable row level security;
alter table billing_invoices enable row level security;
alter table payment_events enable row level security;

drop policy if exists billing_plans_member_select on billing_plans;
create policy billing_plans_member_select on billing_plans
  for select using (true);

drop policy if exists tenant_subscriptions_member_select on tenant_subscriptions;
create policy tenant_subscriptions_member_select on tenant_subscriptions
  for select using (is_tenant_member(tenant_id) or current_user_is_super_admin());

drop policy if exists billing_invoices_member_select on billing_invoices;
create policy billing_invoices_member_select on billing_invoices
  for select using (is_tenant_member(tenant_id) or current_user_is_super_admin());

drop policy if exists payment_events_superadmin_select on payment_events;
create policy payment_events_superadmin_select on payment_events
  for select using (current_user_is_super_admin());

insert into billing_plans (key, name, amount_cents, currency, interval, active)
values ('starter_50', 'Starter', 5000, 'BRL', 'month', true)
on conflict (key) do update
  set name = excluded.name,
      amount_cents = excluded.amount_cents,
      currency = excluded.currency,
      interval = excluded.interval,
      active = true,
      updated_at = now();

insert into tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
select
  t.id,
  p.id,
  t.billing_status,
  now(),
  t.trial_ends_at
from tenants t
cross join billing_plans p
where p.key = 'starter_50'
on conflict (tenant_id) do nothing;
