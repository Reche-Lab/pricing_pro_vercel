create policy audit_logs_tenant_insert on audit_logs
  for insert
  with check (
    tenant_id = current_tenant_id()
    and is_tenant_member(tenant_id)
    and actor_user_id = current_app_user_id()
  );
