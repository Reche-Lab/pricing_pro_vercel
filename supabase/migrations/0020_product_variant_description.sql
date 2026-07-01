alter table product_variants
  add column if not exists description text;

update product_variants v
set description = p.description
from products p
where p.id = v.product_id
  and p.tenant_id = v.tenant_id
  and v.description is null
  and p.description is not null;
