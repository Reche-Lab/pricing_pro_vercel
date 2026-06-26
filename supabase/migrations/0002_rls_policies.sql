alter table tenants enable row level security;
alter table tenant_members enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table pricing_curves enable row level security;
alter table pricing_anchors enable row level security;
alter table platform_rules enable row level security;
alter table packaging_boxes enable row level security;
alter table packaging_capacities enable row level security;
alter table customers enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;
alter table quote_calculation_snapshots enable row level security;
alter table integration_connections enable row level security;
alter table integration_logs enable row level security;
alter table audit_logs enable row level security;

create or replace function current_app_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from tenant_members tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = current_app_user_id()
      and tm.status = 'active'
  )
$$;

create policy tenants_member_select on tenants
  for select using (is_tenant_member(id));

create policy tenant_members_member_select on tenant_members
  for select using (is_tenant_member(tenant_id));

create policy products_tenant_all on products
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy product_variants_tenant_all on product_variants
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy pricing_curves_tenant_all on pricing_curves
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy pricing_anchors_tenant_all on pricing_anchors
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy platform_rules_tenant_all on platform_rules
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy packaging_boxes_tenant_all on packaging_boxes
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy packaging_capacities_tenant_all on packaging_capacities
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy customers_tenant_all on customers
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy quotes_tenant_all on quotes
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy quote_items_tenant_all on quote_items
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy quote_snapshots_tenant_all on quote_calculation_snapshots
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy integration_connections_tenant_all on integration_connections
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy integration_logs_tenant_all on integration_logs
  for all using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id))
  with check (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));

create policy audit_logs_tenant_select on audit_logs
  for select using (tenant_id = current_tenant_id() and is_tenant_member(tenant_id));
