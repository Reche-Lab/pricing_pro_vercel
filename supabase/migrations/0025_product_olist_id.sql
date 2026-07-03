alter table product_variants
  add column if not exists external_olist_product_id text;

create index if not exists idx_product_variants_tenant_external_olist_product
  on product_variants (tenant_id, external_olist_product_id)
  where external_olist_product_id is not null;
