insert into permissions(key,description) values
  ('commerce:orders:read','Consultar pedidos da loja e imprimir artes aprovadas'),
  ('commerce:orders:manage','Confirmar pagamentos manuais e avançar produção dos pedidos'),
  ('commerce:artworks:write','Preparar artes dos pedidos e publicar provas para o cliente')
on conflict(key) do nothing;

insert into role_permissions(role_id,permission_id)
select r.id,p.id from roles r cross join permissions p
where p.key in ('commerce:orders:read','commerce:orders:manage','commerce:artworks:write')
  and (r.key in ('owner','admin','manager')
    or (r.key in ('sales','support') and p.key in ('commerce:orders:read','commerce:artworks:write'))
    or (r.key='viewer' and p.key='commerce:orders:read'))
on conflict do nothing;

create table commerce_order_reads (
  tenant_id uuid not null,
  order_id uuid not null,
  user_id uuid not null references app_users(id) on delete cascade,
  seen_through timestamptz not null,
  primary key(tenant_id,order_id,user_id),
  foreign key(tenant_id,order_id) references commerce_orders(tenant_id,id) on delete cascade,
  foreign key(tenant_id,user_id) references tenant_members(tenant_id,user_id) on delete cascade
);
create index idx_commerce_reads_user on commerce_order_reads(tenant_id,user_id);
create index if not exists idx_commerce_orders_tenant_updated on commerce_orders(tenant_id,updated_at desc);

alter table commerce_order_reads enable row level security;
revoke all on commerce_order_reads from public,anon,authenticated;
create policy commerce_order_reads_own on commerce_order_reads for all
  using(tenant_id=current_tenant_id() and user_id=current_app_user_id()
    and current_user_has_permission('commerce:orders:read'))
  with check(tenant_id=current_tenant_id() and user_id=current_app_user_id()
    and current_user_has_permission('commerce:orders:read'));

create policy commerce_proofs_team_read on commerce_artwork_proofs for select
  using(tenant_id=current_tenant_id() and current_user_has_permission('commerce:orders:read'));
create policy commerce_proofs_team_update on commerce_artwork_proofs for update
  using(tenant_id=current_tenant_id() and current_user_has_permission('commerce:artworks:write'))
  with check(tenant_id=current_tenant_id() and current_user_has_permission('commerce:artworks:write'));
