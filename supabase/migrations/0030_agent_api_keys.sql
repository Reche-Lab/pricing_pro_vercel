create table if not exists agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'revoked')),
  last_used_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_agent_api_keys_tenant_status
  on agent_api_keys (tenant_id, status);

create index if not exists idx_agent_api_keys_prefix
  on agent_api_keys (key_prefix);

alter table agent_api_keys enable row level security;

drop policy if exists agent_api_keys_tenant_select on agent_api_keys;
create policy agent_api_keys_tenant_select on agent_api_keys
  for select using (tenant_id = current_tenant_id() and current_user_has_permission('settings:manage'));

drop policy if exists agent_api_keys_tenant_insert on agent_api_keys;
create policy agent_api_keys_tenant_insert on agent_api_keys
  for insert with check (tenant_id = current_tenant_id() and current_user_has_permission('settings:manage'));

drop policy if exists agent_api_keys_tenant_update on agent_api_keys;
create policy agent_api_keys_tenant_update on agent_api_keys
  for update using (tenant_id = current_tenant_id() and current_user_has_permission('settings:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('settings:manage'));

create table if not exists agent_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  api_key_id uuid references agent_api_keys(id) on delete set null,
  idempotency_key text not null,
  request_hash text not null,
  response_body jsonb,
  status_code integer,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists idx_agent_idempotency_keys_created
  on agent_idempotency_keys (created_at desc);

alter table agent_idempotency_keys enable row level security;

drop policy if exists agent_idempotency_keys_tenant_select on agent_idempotency_keys;
create policy agent_idempotency_keys_tenant_select on agent_idempotency_keys
  for select using (tenant_id = current_tenant_id() and current_user_has_permission('audit:read'));
