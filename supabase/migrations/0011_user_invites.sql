create table if not exists user_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  tenant_member_id uuid not null references tenant_members(id) on delete cascade,
  invited_by uuid references app_users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_invites_tenant_created on user_invites (tenant_id, created_at desc);
create index if not exists idx_user_invites_token_hash on user_invites (token_hash);

alter table user_invites enable row level security;

drop policy if exists user_invites_manage on user_invites;
create policy user_invites_manage on user_invites
  for all using (tenant_id = current_tenant_id() and current_user_has_permission('users:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('users:manage'));

create or replace function get_user_invite_by_token_hash(target_token_hash text)
returns table (
  invite_id uuid,
  tenant_id uuid,
  tenant_name text,
  user_id uuid,
  user_name text,
  user_email text,
  member_status text,
  role_key text,
  expires_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    ui.id as invite_id,
    ui.tenant_id,
    t.name as tenant_name,
    u.id as user_id,
    u.name as user_name,
    u.email::text as user_email,
    tm.status as member_status,
    r.key as role_key,
    ui.expires_at
  from user_invites ui
  join tenants t on t.id = ui.tenant_id
  join app_users u on u.id = ui.user_id
  join tenant_members tm on tm.id = ui.tenant_member_id
  join roles r on r.id = tm.role_id
  where ui.token_hash = target_token_hash
    and ui.consumed_at is null
    and ui.expires_at > now()
    and tm.status = 'invited'
    and t.status = 'active'
  limit 1
$$;

create or replace function consume_user_invite(target_token_hash text, new_password_hash text)
returns table (
  tenant_id uuid,
  user_id uuid,
  tenant_member_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with target as (
    select ui.id, ui.tenant_id, ui.user_id, ui.tenant_member_id
    from user_invites ui
    join tenant_members tm on tm.id = ui.tenant_member_id
    join tenants t on t.id = ui.tenant_id
    where ui.token_hash = target_token_hash
      and ui.consumed_at is null
      and ui.expires_at > now()
      and tm.status = 'invited'
      and t.status = 'active'
    limit 1
    for update
  ),
  user_update as (
    update app_users u
    set password_hash = new_password_hash,
        status = 'active',
        updated_at = now()
    from target
    where u.id = target.user_id
    returning u.id
  ),
  member_update as (
    update tenant_members tm
    set status = 'active',
        joined_at = coalesce(tm.joined_at, now()),
        updated_at = now()
    from target
    where tm.id = target.tenant_member_id
    returning tm.id
  ),
  invite_update as (
    update user_invites ui
    set consumed_at = now()
    from target
    where ui.id = target.id
    returning target.tenant_id, target.user_id, target.tenant_member_id
  )
  select invite_update.tenant_id,
         invite_update.user_id,
         invite_update.tenant_member_id
  from invite_update;
end;
$$;
