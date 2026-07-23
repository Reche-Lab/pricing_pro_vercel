drop policy if exists billing_plans_superadmin_insert on billing_plans;
create policy billing_plans_superadmin_insert on billing_plans
  for insert with check (current_user_is_super_admin());

drop policy if exists billing_plans_superadmin_update on billing_plans;
create policy billing_plans_superadmin_update on billing_plans
  for update using (current_user_is_super_admin())
  with check (current_user_is_super_admin());
