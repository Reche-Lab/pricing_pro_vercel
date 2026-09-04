create table if not exists financial_indicators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  unit text not null default 'currency' check (unit in ('currency', 'number')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_financial_indicators_tenant_name_ci
  on financial_indicators (tenant_id, lower(name));

create index if not exists idx_financial_indicators_tenant_active_order
  on financial_indicators (tenant_id, active, sort_order, name);

create table if not exists financial_indicator_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  indicator_id uuid not null references financial_indicators(id) on delete cascade,
  version integer not null check (version > 0),
  effective_from date not null check (extract(day from effective_from) = 1),
  formula jsonb not null check (jsonb_typeof(formula) = 'object'),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, indicator_id, version)
);

create index if not exists idx_financial_indicator_versions_effective
  on financial_indicator_versions (tenant_id, indicator_id, effective_from desc, version desc);

create table if not exists financial_indicator_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  indicator_id uuid not null references financial_indicators(id) on delete cascade,
  version_id uuid not null references financial_indicator_versions(id) on delete restrict,
  competence date not null check (extract(day from competence) = 1),
  value numeric(20,4) not null,
  component_results jsonb not null default '[]'::jsonb check (jsonb_typeof(component_results) = 'array'),
  calculated_at timestamptz not null default now(),
  frozen_at timestamptz not null default now(),
  unique (tenant_id, indicator_id, competence)
);

create index if not exists idx_financial_indicator_results_competence
  on financial_indicator_results (tenant_id, competence, indicator_id);

alter table financial_indicators enable row level security;
alter table financial_indicator_versions enable row level security;
alter table financial_indicator_results enable row level security;

drop policy if exists financial_indicators_tenant_select on financial_indicators;
create policy financial_indicators_tenant_select on financial_indicators
  for select using (tenant_id = current_tenant_id() and current_user_has_permission('finance:read'));

drop policy if exists financial_indicators_manage on financial_indicators;
create policy financial_indicators_manage on financial_indicators
  for all using (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'));

drop policy if exists financial_indicator_versions_tenant_select on financial_indicator_versions;
create policy financial_indicator_versions_tenant_select on financial_indicator_versions
  for select using (tenant_id = current_tenant_id() and current_user_has_permission('finance:read'));

drop policy if exists financial_indicator_versions_manage on financial_indicator_versions;
create policy financial_indicator_versions_manage on financial_indicator_versions
  for insert with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'));

drop policy if exists financial_indicator_results_tenant_select on financial_indicator_results;
create policy financial_indicator_results_tenant_select on financial_indicator_results
  for select using (tenant_id = current_tenant_id() and current_user_has_permission('finance:read'));

drop policy if exists financial_indicator_results_manage on financial_indicator_results;
create policy financial_indicator_results_manage on financial_indicator_results
  for all using (
    tenant_id = current_tenant_id()
    and (current_user_has_permission('finance:close') or current_user_has_permission('finance:manage'))
  ) with check (
    tenant_id = current_tenant_id()
    and (current_user_has_permission('finance:close') or current_user_has_permission('finance:manage'))
  );

comment on table financial_indicators is 'Tenant-specific financial KPIs built from validated filters and operations.';
comment on table financial_indicator_versions is 'Immutable, effective-dated definitions used to reproduce historical KPI calculations.';
comment on table financial_indicator_results is 'Frozen custom KPI results and component-level calculation memory for closed months.';
