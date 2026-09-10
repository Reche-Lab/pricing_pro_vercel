-- Repeated purchases are distinct rows, even with identical descriptions and amounts.
alter table bank_statement_raw_rows drop constraint if exists bank_statement_raw_rows_tenant_id_import_id_row_hash_key;
alter table financial_transactions add column if not exists entry_kind text not null default 'bank_movement'
  check (entry_kind in ('bank_movement', 'bill_payment', 'card_purchase', 'card_refund', 'card_payment'));
create unique index if not exists idx_statement_import_tenant_id on bank_statement_imports(tenant_id, id);
create unique index if not exists idx_financial_transaction_tenant_id on financial_transactions(tenant_id, id);
create unique index if not exists idx_financial_account_tenant_id on financial_accounts(tenant_id, id);
create table if not exists credit_card_statements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  import_id uuid not null,
  financial_account_id uuid not null,
  due_date date not null,
  total_cents bigint not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, import_id),
  unique (tenant_id, financial_account_id, due_date),
  foreign key (tenant_id, import_id) references bank_statement_imports(tenant_id, id) on delete cascade,
  foreign key (tenant_id, financial_account_id) references financial_accounts(tenant_id, id) on delete restrict
);
create table if not exists credit_card_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  statement_id uuid not null,
  transaction_id uuid not null,
  previous_flags jsonb not null,
  confirmed_by uuid references app_users(id),
  confirmed_at timestamptz not null default now(),
  unique (tenant_id, transaction_id),
  foreign key (tenant_id, statement_id) references credit_card_statements(tenant_id, id) on delete cascade,
  foreign key (tenant_id, transaction_id) references financial_transactions(tenant_id, id) on delete restrict
);
alter table credit_card_statements enable row level security;
alter table credit_card_payments enable row level security;
create policy credit_card_statements_read on credit_card_statements for select
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:read'));
create policy credit_card_statements_import on credit_card_statements for insert
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:import'));
create policy credit_card_payments_manage on credit_card_payments for all
  using (tenant_id = current_tenant_id() and current_user_has_permission('finance:classify'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('finance:classify'));

create or replace function protect_card_transaction_flags() returns trigger language plpgsql as $$
begin
  if new.entry_kind in ('card_purchase', 'card_refund', 'card_payment') then
    new.include_external_cash_flow := false;
  end if;
  if new.entry_kind in ('card_payment', 'bill_payment') then
    new.include_operating_result := false;
  end if;
  if new.entry_kind = 'card_payment' then
    new.direction := 'neutral';
    new.nature := 'informative';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_card_flags on financial_transactions;
create trigger protect_card_flags before insert or update on financial_transactions
  for each row execute function protect_card_transaction_flags();
