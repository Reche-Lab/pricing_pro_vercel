create extension if not exists pg_trgm;

create table if not exists product_search_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_variant_id uuid not null references product_variants(id) on delete cascade,
  alias text not null check (char_length(trim(alias)) between 2 and 120),
  normalized_alias text not null check (char_length(trim(normalized_alias)) between 2 and 120),
  source text not null default 'manual' check (source in ('manual', 'ai')),
  active boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_variant_id, normalized_alias)
);

create index if not exists idx_product_search_aliases_tenant_variant
  on product_search_aliases (tenant_id, product_variant_id)
  where active = true;

create index if not exists idx_product_search_aliases_normalized_trgm
  on product_search_aliases using gin (normalized_alias gin_trgm_ops)
  where active = true;

alter table product_search_aliases enable row level security;

drop policy if exists product_search_aliases_tenant_select on product_search_aliases;
create policy product_search_aliases_tenant_select on product_search_aliases
  for select using (
    tenant_id = current_tenant_id()
    and is_tenant_member(tenant_id)
  );

drop policy if exists product_search_aliases_tenant_insert on product_search_aliases;
create policy product_search_aliases_tenant_insert on product_search_aliases
  for insert with check (
    tenant_id = current_tenant_id()
    and current_user_has_permission('products:write')
    and exists (
      select 1 from product_variants v
      where v.id = product_variant_id and v.tenant_id = tenant_id
    )
  );

drop policy if exists product_search_aliases_tenant_update on product_search_aliases;
create policy product_search_aliases_tenant_update on product_search_aliases
  for update using (
    tenant_id = current_tenant_id()
    and current_user_has_permission('products:write')
  )
  with check (
    tenant_id = current_tenant_id()
    and current_user_has_permission('products:write')
    and exists (
      select 1 from product_variants v
      where v.id = product_variant_id and v.tenant_id = tenant_id
    )
  );

drop policy if exists product_search_aliases_tenant_delete on product_search_aliases;
create policy product_search_aliases_tenant_delete on product_search_aliases
  for delete using (
    tenant_id = current_tenant_id()
    and current_user_has_permission('products:write')
  );
