-- Stable, readable URLs per store. Internal UUIDs and order snapshots are unchanged.
begin;

alter table commerce_products add column if not exists slug text;

create or replace function commerce_product_slug_base(product_name text)
returns text language sql immutable set search_path = pg_catalog as $$
  select coalesce(nullif(trim(both '-' from left(regexp_replace(
    lower(translate(normalize(coalesce(product_name, ''), NFC),
      'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸ',
      'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNYY')),
    '[^a-z0-9]+', '-', 'g'), 120)), ''), 'produto')
$$;

create or replace function assign_commerce_product_slug()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
declare
  base_slug text;
  candidate text;
  suffix integer := 1;
begin
  if new.slug is not null and new.slug <> '' then return new; end if;
  -- Serialize automatic allocation per tenant, including publications outside the UI.
  perform pg_advisory_xact_lock(hashtextextended('commerce-product-slug:' || new.tenant_id::text, 0));
  base_slug := public.commerce_product_slug_base(new.snapshot->>'name');
  -- UUID paths are reserved for redirects from the original storefront.
  if base_slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    base_slug := 'produto-' || base_slug;
  end if;
  candidate := base_slug;
  while exists (select 1 from public.commerce_products cp where cp.tenant_id=new.tenant_id and cp.slug=candidate and cp.id<>new.id) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix::text;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

drop trigger if exists commerce_product_assign_slug on commerce_products;
create trigger commerce_product_assign_slug before insert or update of slug on commerce_products
  for each row execute function assign_commerce_product_slug();

-- Process old rows in deterministic order, including inactive products: URLs are never reused.
do $$
declare product record;
begin
  for product in select id from commerce_products where slug is null or slug='' order by tenant_id, id loop
    update commerce_products set slug=null where id=product.id;
  end loop;
end $$;

alter table commerce_products alter column slug set not null;
alter table commerce_products drop constraint if exists commerce_product_slug_format;
alter table commerce_products add constraint commerce_product_slug_format
  check (length(slug) <= 160 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
create unique index if not exists commerce_products_tenant_slug_unique on commerce_products(tenant_id, slug);

revoke all on function commerce_product_slug_base(text) from public, anon, authenticated;
revoke all on function assign_commerce_product_slug() from public, anon, authenticated;

commit;
