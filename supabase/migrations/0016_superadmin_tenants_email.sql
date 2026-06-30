alter table app_users
  add column if not exists is_super_admin boolean not null default false;

create index if not exists idx_app_users_super_admin on app_users (is_super_admin) where is_super_admin = true;

create or replace function current_user_is_super_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from app_users u
    where u.id = current_app_user_id()
      and u.status = 'active'
      and u.is_super_admin = true
  )
$$;

drop policy if exists tenants_superadmin_select on tenants;
create policy tenants_superadmin_select on tenants
  for select using (current_user_is_super_admin());

drop policy if exists tenants_superadmin_insert on tenants;
create policy tenants_superadmin_insert on tenants
  for insert with check (current_user_is_super_admin());

drop policy if exists tenants_superadmin_update on tenants;
create policy tenants_superadmin_update on tenants
  for update using (current_user_is_super_admin())
  with check (current_user_is_super_admin());

drop policy if exists tenant_members_superadmin_select on tenant_members;
create policy tenant_members_superadmin_select on tenant_members
  for select using (current_user_is_super_admin());

drop policy if exists tenant_members_superadmin_insert on tenant_members;
create policy tenant_members_superadmin_insert on tenant_members
  for insert with check (current_user_is_super_admin());

drop policy if exists tenant_members_superadmin_update on tenant_members;
create policy tenant_members_superadmin_update on tenant_members
  for update using (current_user_is_super_admin())
  with check (current_user_is_super_admin());

drop policy if exists user_invites_superadmin_manage on user_invites;
create policy user_invites_superadmin_manage on user_invites
  for all using (current_user_is_super_admin())
  with check (current_user_is_super_admin());
