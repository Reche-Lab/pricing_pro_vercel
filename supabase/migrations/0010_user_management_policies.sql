create or replace function current_user_has_permission(permission_key text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from tenant_members tm
    join roles r on r.id = tm.role_id
    join role_permissions rp on rp.role_id = r.id
    join permissions p on p.id = rp.permission_id
    where tm.tenant_id = current_tenant_id()
      and tm.user_id = current_app_user_id()
      and tm.status = 'active'
      and p.key = permission_key
  )
$$;

drop policy if exists tenant_members_manage_all on tenant_members;
create policy tenant_members_manage_all on tenant_members
  for all using (tenant_id = current_tenant_id() and current_user_has_permission('users:manage'))
  with check (tenant_id = current_tenant_id() and current_user_has_permission('users:manage'));
