create table commerce_artwork_proofs (
  tenant_id uuid not null,
  order_id uuid not null,
  line_id uuid not null,
  artwork_id uuid not null,
  source_path text not null,
  prepared_path text,
  crop jsonb,
  revision integer not null default 1 check (revision > 0),
  approved_at timestamptz,
  published_at timestamptz,
  prepared_by uuid references app_users(id),
  updated_at timestamptz not null default now(),
  primary key(tenant_id, order_id, line_id),
  foreign key(tenant_id, order_id) references commerce_orders(tenant_id, id) on delete cascade,
  foreign key(tenant_id, artwork_id) references commerce_artworks(tenant_id, id)
);

insert into commerce_artwork_proofs(tenant_id,order_id,line_id,artwork_id,source_path,prepared_path,crop,approved_at,published_at)
select o.tenant_id,o.id,(l->>'id')::uuid,a.id,a.storage_path,a.prepared_path,a.crop,a.approved_at,a.approved_at
from commerce_orders o cross join lateral jsonb_array_elements(o.snapshot->'lines') l
join commerce_artworks a on a.tenant_id=o.tenant_id and a.id::text=l->>'artworkId'
on conflict do nothing;

alter table commerce_artwork_proofs enable row level security;
revoke all on commerce_artwork_proofs from public, anon, authenticated;
create policy commerce_proofs_admin on commerce_artwork_proofs for all
  using(tenant_id=current_tenant_id() and current_user_has_permission('settings:manage'))
  with check(tenant_id=current_tenant_id() and current_user_has_permission('settings:manage'));
