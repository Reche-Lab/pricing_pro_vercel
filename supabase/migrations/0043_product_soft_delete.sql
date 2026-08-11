alter table public.products
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.app_users(id) on delete set null;

alter table public.product_variants
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.app_users(id) on delete set null;

create index if not exists idx_products_tenant_not_deleted
  on public.products (tenant_id, name)
  where deleted_at is null;

create index if not exists idx_product_variants_tenant_not_deleted
  on public.product_variants (tenant_id, product_id)
  where deleted_at is null;
