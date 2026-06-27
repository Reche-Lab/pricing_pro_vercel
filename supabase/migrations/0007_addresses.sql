alter table tenants
  add column if not exists company_document text,
  add column if not exists postal_code text,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists district text,
  add column if not exists city text,
  add column if not exists state text;

alter table customers
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists district text;

create index if not exists idx_customers_tenant_postal_code on customers (tenant_id, postal_code);

drop policy if exists tenants_member_update on tenants;
create policy tenants_member_update on tenants
  for update using (is_tenant_member(id))
  with check (is_tenant_member(id));
