create table if not exists oauth_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null,
  state text not null unique,
  redirect_path text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_oauth_states_tenant_provider on oauth_states (tenant_id, provider, created_at desc);
create index if not exists idx_oauth_states_expires_at on oauth_states (expires_at);

alter table oauth_states enable row level security;

drop policy if exists oauth_states_tenant_all on oauth_states;
create policy oauth_states_tenant_all on oauth_states
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create or replace function consume_oauth_state(target_state text, target_provider text)
returns table (
  id uuid,
  tenant_id uuid,
  user_id uuid,
  provider text,
  state text,
  redirect_path text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with target as (
    select os.id
    from oauth_states os
    where os.state = target_state
      and os.provider = target_provider
      and os.consumed_at is null
      and os.expires_at > now()
    limit 1
    for update
  ),
  consumed as (
    update oauth_states os
    set consumed_at = now()
    from target
    where os.id = target.id
    returning os.id, os.tenant_id, os.user_id, os.provider, os.state, os.redirect_path
  )
  select consumed.id,
         consumed.tenant_id,
         consumed.user_id,
         consumed.provider,
         consumed.state,
         consumed.redirect_path
  from consumed;
end;
$$;
