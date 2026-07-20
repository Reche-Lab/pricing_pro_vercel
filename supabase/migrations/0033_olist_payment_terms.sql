create table if not exists olist_payment_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null check (kind in ('payment_method', 'receiving_method', 'category')),
  external_id text not null,
  name text not null,
  group_name text,
  raw jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, kind, external_id)
);

create index if not exists idx_olist_payment_options_tenant_kind
  on olist_payment_options (tenant_id, kind, active, name);

alter table olist_payment_options enable row level security;

drop policy if exists olist_payment_options_tenant_all on olist_payment_options;
create policy olist_payment_options_tenant_all on olist_payment_options
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create table if not exists quote_payment_terms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  payment_method_external_id text,
  payment_method_name text,
  receiving_method_external_id text,
  receiving_method_name text,
  category_external_id text,
  category_name text,
  installments_count integer not null default 1 check (installments_count > 0 and installments_count <= 24),
  notes text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, quote_id)
);

create index if not exists idx_quote_payment_terms_quote
  on quote_payment_terms (tenant_id, quote_id);

alter table quote_payment_terms enable row level security;

drop policy if exists quote_payment_terms_tenant_all on quote_payment_terms;
create policy quote_payment_terms_tenant_all on quote_payment_terms
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create table if not exists quote_payment_installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  quote_payment_term_id uuid not null references quote_payment_terms(id) on delete cascade,
  installment_number integer not null check (installment_number > 0 and installment_number <= 24),
  due_date date,
  days integer check (days is null or days >= 0),
  amount numeric(12,2) not null check (amount >= 0),
  notes text,
  payment_method_external_id text,
  payment_method_name text,
  receiving_method_external_id text,
  receiving_method_name text,
  created_at timestamptz not null default now(),
  unique (tenant_id, quote_payment_term_id, installment_number)
);

create index if not exists idx_quote_payment_installments_term
  on quote_payment_installments (tenant_id, quote_payment_term_id, installment_number);

alter table quote_payment_installments enable row level security;

drop policy if exists quote_payment_installments_tenant_all on quote_payment_installments;
create policy quote_payment_installments_tenant_all on quote_payment_installments
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));
