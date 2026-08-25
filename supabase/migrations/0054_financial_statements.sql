insert into permissions (key, description)
values
  ('finance:read', 'Visualizar contas, lançamentos e relatórios financeiros'),
  ('finance:import', 'Importar extratos financeiros'),
  ('finance:classify', 'Classificar lançamentos e confirmar transferências'),
  ('finance:manage', 'Gerenciar contas e regras financeiras'),
  ('finance:reconcile', 'Conciliar lançamentos com integrações externas'),
  ('finance:close', 'Fechar e reabrir competências financeiras'),
  ('finance:export', 'Exportar relatórios financeiros')
on conflict (key) do nothing;

insert into roles (key, name)
values ('finance', 'Financeiro')
on conflict (key) do update set name = excluded.name;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.key in ('owner', 'admin') and p.key like 'finance:%'
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.key = 'finance' and p.key in (
  'finance:read', 'finance:import', 'finance:classify', 'finance:manage',
  'finance:reconcile', 'finance:close', 'finance:export'
)
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.key = 'manager' and p.key in ('finance:read', 'finance:import', 'finance:classify', 'finance:export')
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.key in ('viewer', 'support') and p.key in ('finance:read', 'finance:export')
on conflict do nothing;

create table if not exists financial_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  institution text not null,
  account_type text not null default 'checking',
  currency char(3) not null default 'BRL',
  ownership_type text not null default 'company'
    check (ownership_type in ('company', 'owner', 'partner', 'personal', 'third_party')),
  same_economic_entity boolean not null default true,
  olist_account_id text,
  required_for_monthly_close boolean not null default true,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists financial_months (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  competence date not null check (extract(day from competence) = 1),
  status text not null default 'open' check (status in ('open', 'partial', 'review', 'completed', 'reopened')),
  closing_notes text,
  closed_by uuid references app_users(id),
  closed_at timestamptz,
  reopened_by uuid references app_users(id),
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, competence)
);

create table if not exists bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  financial_account_id uuid not null references financial_accounts(id) on delete restrict,
  source_type text not null check (source_type in ('nubank', 'olist', 'mercado_pago', 'paypal', 'generic')),
  competence date not null check (extract(day from competence) = 1),
  original_filename text not null,
  storage_path text,
  original_content bytea,
  content_type text not null default 'text/csv',
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  file_checksum text not null,
  adapter_name text not null,
  adapter_version text not null,
  status text not null default 'processing'
    check (status in ('uploaded', 'processing', 'needs_mapping', 'needs_review', 'completed', 'failed', 'cancelled')),
  raw_row_count integer not null default 0,
  transaction_row_count integer not null default 0,
  duplicate_row_count integer not null default 0,
  ignored_row_count integer not null default 0,
  credit_total_cents bigint not null default 0,
  debit_total_cents bigint not null default 0,
  initial_balance_cents bigint,
  final_balance_cents bigint,
  calculated_balance_cents bigint,
  currency char(3) not null default 'BRL',
  error_message text,
  imported_by uuid references app_users(id),
  imported_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (tenant_id, file_checksum)
);

create table if not exists bank_statement_raw_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  import_id uuid not null references bank_statement_imports(id) on delete cascade,
  source_line_number integer not null,
  source_identifier text,
  raw_payload jsonb not null,
  row_hash text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, import_id, source_line_number),
  unique (tenant_id, import_id, row_hash)
);

create table if not exists financial_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  parent_id uuid references financial_categories(id) on delete restrict,
  name text not null,
  type text not null check (type in ('income', 'expense', 'neutral')),
  affects_operating_result boolean not null default true,
  active boolean not null default true,
  olist_category_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, parent_id, name)
);

create table if not exists financial_classification_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  scope text not null default 'tenant' check (scope in ('tenant', 'seed')),
  priority integer not null default 100,
  name text not null,
  financial_account_id uuid references financial_accounts(id) on delete cascade,
  source_type text,
  conditions jsonb not null,
  actions jsonb not null,
  enabled boolean not null default true,
  auto_apply boolean not null default true,
  minimum_confidence numeric(5,4) not null default 1 check (minimum_confidence between 0 and 1),
  created_from_transaction_id uuid,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists financial_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  import_id uuid not null references bank_statement_imports(id) on delete cascade,
  financial_account_id uuid not null references financial_accounts(id) on delete restrict,
  raw_row_id uuid not null references bank_statement_raw_rows(id) on delete restrict,
  transaction_date date not null,
  competence date not null check (extract(day from competence) = 1),
  source_identifier text,
  source_type text not null,
  original_description text not null,
  normalized_description text not null,
  counterparty text,
  amount_cents bigint not null,
  currency char(3) not null default 'BRL',
  gross_amount_cents bigint,
  fee_amount_cents bigint,
  net_amount_cents bigint,
  direction text not null check (direction in ('inflow', 'outflow', 'neutral')),
  nature text not null default 'unclassified',
  category_id uuid references financial_categories(id) on delete set null,
  subcategory_id uuid references financial_categories(id) on delete set null,
  include_external_cash_flow boolean not null default true,
  include_operating_result boolean not null default false,
  review_required boolean not null default true,
  review_status text not null default 'pending' check (review_status in ('pending', 'reviewed', 'ignored')),
  classification_confidence numeric(5,4) not null default 0 check (classification_confidence between 0 and 1),
  classification_source text not null default 'unclassified',
  classification_rule_id uuid references financial_classification_rules(id) on delete set null,
  internal_transfer_pair_id uuid,
  refund_of_transaction_id uuid references financial_transactions(id) on delete set null,
  notes text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, financial_account_id, raw_row_id)
);

alter table financial_classification_rules
  drop constraint if exists financial_classification_rules_created_from_transaction_id_fkey;
alter table financial_classification_rules
  add constraint financial_classification_rules_created_from_transaction_id_fkey
  foreign key (created_from_transaction_id) references financial_transactions(id) on delete set null;

create table if not exists internal_transfer_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  outgoing_transaction_id uuid not null references financial_transactions(id) on delete cascade,
  incoming_transaction_id uuid not null references financial_transactions(id) on delete cascade,
  match_score numeric(5,4) not null check (match_score between 0 and 1),
  match_method text not null,
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected', 'cancelled')),
  confirmed_by uuid references app_users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, outgoing_transaction_id, incoming_transaction_id)
);

alter table financial_transactions
  drop constraint if exists financial_transactions_internal_transfer_pair_id_fkey;
alter table financial_transactions
  add constraint financial_transactions_internal_transfer_pair_id_fkey
  foreign key (internal_transfer_pair_id) references internal_transfer_matches(id) on delete set null;

create table if not exists olist_financial_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  financial_transaction_id uuid not null references financial_transactions(id) on delete cascade,
  olist_record_type text not null,
  olist_record_id text not null,
  match_score numeric(5,4) not null default 0 check (match_score between 0 and 1),
  match_reason text,
  status text not null default 'suggested',
  sync_direction text not null default 'read_only',
  idempotency_key text,
  last_sync_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, financial_transaction_id, olist_record_type, olist_record_id)
);

create table if not exists financial_audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid references app_users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_financial_accounts_tenant_active on financial_accounts (tenant_id, active);
create index if not exists idx_financial_months_tenant_competence on financial_months (tenant_id, competence desc);
create index if not exists idx_bank_imports_tenant_competence on bank_statement_imports (tenant_id, competence desc);
create index if not exists idx_raw_rows_tenant_import on bank_statement_raw_rows (tenant_id, import_id);
create index if not exists idx_financial_transactions_tenant_competence on financial_transactions (tenant_id, competence, transaction_date desc);
create index if not exists idx_financial_transactions_tenant_review on financial_transactions (tenant_id, review_status, review_required);
create index if not exists idx_financial_transactions_tenant_category on financial_transactions (tenant_id, category_id);
create index if not exists idx_financial_rules_tenant_priority on financial_classification_rules (tenant_id, enabled, priority);
create index if not exists idx_transfer_matches_tenant_status on internal_transfer_matches (tenant_id, status);

alter table financial_accounts enable row level security;
alter table financial_months enable row level security;
alter table bank_statement_imports enable row level security;
alter table bank_statement_raw_rows enable row level security;
alter table financial_categories enable row level security;
alter table financial_classification_rules enable row level security;
alter table financial_transactions enable row level security;
alter table internal_transfer_matches enable row level security;
alter table olist_financial_matches enable row level security;
alter table financial_audit_logs enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'financial_accounts', 'financial_months', 'bank_statement_imports', 'bank_statement_raw_rows',
    'financial_categories', 'financial_classification_rules', 'financial_transactions',
    'internal_transfer_matches', 'olist_financial_matches', 'financial_audit_logs'
  ] loop
    execute format('drop policy if exists %I_tenant_select on %I', table_name, table_name);
    execute format(
      'create policy %I_tenant_select on %I for select using (tenant_id = current_tenant_id() and current_user_has_permission(''finance:read''))',
      table_name, table_name
    );
  end loop;
end $$;

create policy financial_accounts_manage on financial_accounts for all
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'));
create policy financial_categories_manage on financial_categories for all
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'));
create policy financial_rules_manage on financial_classification_rules for all
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:manage'));
create policy financial_imports_insert on bank_statement_imports for insert
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:import'));
create policy financial_imports_update on bank_statement_imports for update
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:import'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:import'));
create policy financial_raw_insert on bank_statement_raw_rows for insert
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:import'));
create policy financial_transactions_insert on financial_transactions for insert
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:import'));
create policy financial_transactions_classify on financial_transactions for update
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:classify'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:classify'));
create policy financial_months_manage on financial_months for all
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:close'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:close'));
create policy transfer_matches_manage on internal_transfer_matches for all
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:classify'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:classify'));
create policy olist_financial_matches_manage on olist_financial_matches for all
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:reconcile'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:reconcile'));
create policy financial_audit_insert on financial_audit_logs for insert
  with check (tenant_id = current_tenant_id());

with defaults(name, type, affects) as (
  values
    ('Receitas operacionais', 'income', true),
    ('Despesas operacionais', 'expense', true),
    ('Estornos e devoluções', 'neutral', true),
    ('Dívidas e financiamentos', 'neutral', false),
    ('Transferências internas', 'neutral', false),
    ('Aportes e retiradas', 'neutral', false),
    ('Reembolsos', 'neutral', false),
    ('Movimentações pessoais', 'neutral', false)
)
insert into financial_categories (tenant_id, name, type, affects_operating_result)
select t.id, defaults.name, defaults.type, defaults.affects
from tenants t cross join defaults
where not exists (
  select 1 from financial_categories c
  where c.tenant_id = t.id and c.parent_id is null and c.name = defaults.name
);

with tenant as (select id from tenants where slug = 'ground-shop'),
seed_categories(name, type, affects) as (
  values
    ('Vendas', 'income', true), ('Sistemas e software', 'expense', true),
    ('Telecomunicações', 'expense', true), ('Impostos e tributos', 'expense', true),
    ('Contabilidade', 'expense', true), ('Tarifas financeiras', 'expense', true),
    ('Assinaturas', 'expense', true), ('Serviços digitais', 'expense', true),
    ('Devoluções de vendas', 'expense', true), ('Envio cancelado', 'income', true),
    ('Dívidas e financiamentos', 'neutral', false)
)
insert into financial_categories (tenant_id, name, type, affects_operating_result)
select tenant.id, seed_categories.name, seed_categories.type, seed_categories.affects
from tenant cross join seed_categories
where not exists (
  select 1 from financial_categories c
  where c.tenant_id = tenant.id and c.parent_id is null and c.name = seed_categories.name
);

with tenant as (select id from tenants where slug = 'ground-shop'),
seed_rules(name, priority, source_type, needle, nature, category, external_flow, operating, review) as (
  values
    ('MP - Liberação de dinheiro', 10, 'mercado_pago', 'LIBERACAO DE DINHEIRO', 'operating_revenue', 'Vendas', true, true, false),
    ('MP - Pix QR recebido', 10, 'mercado_pago', 'PAGAMENTO COM CODIGO QR PIX', 'operating_revenue', 'Vendas', true, true, false),
    ('Olist - Boleto recebido', 10, 'olist', 'TRANSFERENCIA RECEBIDA POR BOLETO', 'operating_revenue', 'Vendas', true, true, false),
    ('MP - Devoluções', 10, 'mercado_pago', 'DEVOLUCOES E RECLAMACOES', 'refund', 'Devoluções de vendas', true, true, false),
    ('MP - Envio cancelado', 10, 'mercado_pago', 'REEMBOLSO ENVIO CANCELADO', 'refund', 'Envio cancelado', true, true, false),
    ('MP - Pagamento mínimo', 10, 'mercado_pago', 'PAGAMENTO MINIMO', 'debt', 'Dívidas e financiamentos', true, false, false),
    ('MP - Faturas vencidas', 10, 'mercado_pago', 'FATURAS VENCIDAS', 'debt', 'Dívidas e financiamentos', true, false, false),
    ('Nubank - Olist Tiny', 10, 'nubank', 'OLIST TINY TECNOLOGIA', 'operating_expense', 'Sistemas e software', true, true, false),
    ('Nubank - Linked Store', 10, 'nubank', 'LINKED STORE BRASIL', 'operating_expense', 'Sistemas e software', true, true, false),
    ('Telecom - Claro', 10, null, 'CLARO', 'operating_expense', 'Telecomunicações', true, true, false),
    ('Nubank - Trixnet', 10, 'nubank', 'TRIXNET TELECOM', 'operating_expense', 'Telecomunicações', true, true, false),
    ('Nubank - Receita Federal', 10, 'nubank', 'RECEITA FEDERAL', 'operating_expense', 'Impostos e tributos', true, true, false),
    ('Nubank - Contabilidade', 10, 'nubank', 'YC ASSESSORIA CONTABIL', 'operating_expense', 'Contabilidade', true, true, false),
    ('Olist - Tarifa boleto', 10, 'olist', 'TARIFA BOLETO', 'operating_expense', 'Tarifas financeiras', true, true, false),
    ('MP - Assinatura Meli+', 10, 'mercado_pago', 'ASSINATURA MELI+', 'operating_expense', 'Assinaturas', true, true, false),
    ('MP - Google revisão', 20, 'mercado_pago', 'GOOGLE BRASIL PAGAMENTOS', 'unclassified', 'Serviços digitais', true, false, true),
    ('Nubank - Vindi revisão', 20, 'nubank', 'VINDI PAGAMENTOS ONLINE', 'unclassified', null, true, false, true)
)
insert into financial_classification_rules (
  tenant_id, scope, priority, name, source_type, conditions, actions, minimum_confidence
)
select tenant.id, 'seed', seed_rules.priority, seed_rules.name, seed_rules.source_type,
  jsonb_build_object('descriptionContains', seed_rules.needle),
  jsonb_build_object(
    'nature', seed_rules.nature,
    'categoryName', seed_rules.category,
    'includeExternalCashFlow', seed_rules.external_flow,
    'includeOperatingResult', seed_rules.operating,
    'reviewRequired', seed_rules.review
  ),
  case when seed_rules.review then 0.7 else 1 end
from tenant cross join seed_rules
on conflict (tenant_id, name) do update set
  priority = excluded.priority, source_type = excluded.source_type,
  conditions = excluded.conditions, actions = excluded.actions, updated_at = now();

comment on table bank_statement_raw_rows is 'Immutable source rows preserved exactly as parsed from imported files.';
comment on table olist_financial_matches is 'Read-only reconciliation by default; writes require explicit capability and confirmation.';
