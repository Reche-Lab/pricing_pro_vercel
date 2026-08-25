create table if not exists financial_natures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  name text not null,
  type text not null check (type in ('income', 'expense', 'neutral')),
  default_include_external_cash_flow boolean not null default true,
  default_include_operating_result boolean not null default false,
  protected boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create unique index if not exists idx_financial_natures_tenant_name_ci
  on financial_natures (tenant_id, lower(name));

create index if not exists idx_financial_natures_tenant_active
  on financial_natures (tenant_id, active, name);

alter table financial_natures enable row level security;

drop policy if exists financial_natures_tenant_select on financial_natures;
create policy financial_natures_tenant_select on financial_natures
  for select using (tenant_id = current_tenant_id() and current_user_has_permission('finance:read'));

drop policy if exists financial_natures_manage on financial_natures;
create policy financial_natures_manage on financial_natures
  for all using (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'));

with defaults(key, name, type, external_cash_flow, operating_result, protected) as (
  values
    ('operating_revenue', 'Receita operacional', 'income', true, true, false),
    ('operating_expense', 'Despesa operacional', 'expense', true, true, false),
    ('refund', 'Estorno e devolução', 'neutral', true, true, false),
    ('debt', 'Dívidas e financiamentos', 'neutral', true, false, false),
    ('internal_transfer', 'Transferência interna', 'neutral', false, false, true),
    ('owner_contribution', 'Aporte do titular ou sócio', 'neutral', true, false, false),
    ('owner_withdrawal', 'Retirada do titular ou sócio', 'neutral', true, false, false),
    ('owner_loan', 'Empréstimo do titular', 'neutral', true, false, false),
    ('reimbursement', 'Reembolso', 'neutral', true, false, false),
    ('personal', 'Movimentação pessoal', 'neutral', true, false, false),
    ('unclassified', 'Não classificado', 'neutral', true, false, true),
    ('informative', 'Informativo', 'neutral', false, false, true)
)
insert into financial_natures (
  tenant_id, key, name, type, default_include_external_cash_flow,
  default_include_operating_result, protected
)
select t.id, defaults.key, defaults.name, defaults.type, defaults.external_cash_flow,
       defaults.operating_result, defaults.protected
from tenants t cross join defaults
on conflict (tenant_id, key) do update set
  protected = excluded.protected,
  updated_at = now();
