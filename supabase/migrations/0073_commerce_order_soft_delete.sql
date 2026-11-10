-- Administrative deletion preserves buyer history, payments, webhook reconciliation and artwork files.
alter table commerce_orders
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references app_users(id),
  add column if not exists deletion_reason text;

alter table commerce_orders add constraint commerce_orders_deletion_metadata_check check (
  (deleted_at is null and deleted_by is null and deletion_reason is null)
  or (deleted_at is not null and deleted_by is not null and deletion_reason is not null
      and char_length(btrim(deletion_reason)) between 5 and 500)
);

create index if not exists idx_commerce_orders_active_tenant
  on commerce_orders(tenant_id, created_at desc, id) where deleted_at is null;
