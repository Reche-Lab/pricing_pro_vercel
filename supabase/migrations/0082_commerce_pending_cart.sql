alter table commerce_orders
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists converted_quote_id uuid;

create index if not exists commerce_orders_pending_cart
  on commerce_orders(tenant_id,session_id,cart_revision)
  where cancelled_at is null and deleted_at is null and payment_status='pending';

-- A delayed payment must never empty a newer or different buyer's cart.
create or replace function clear_commerce_paid_cart() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.payment_status='paid' and old.payment_status is distinct from 'paid'
     and new.cancelled_at is null and new.deleted_at is null then
    update commerce_sessions set cart='[]'::jsonb,revision=revision+1
    where tenant_id=new.tenant_id and id=new.session_id and customer_id=new.customer_id
      and revision=new.cart_revision and cart=new.snapshot->'lines';
  end if;
  return new;
end $$;
drop trigger if exists commerce_paid_cart on commerce_orders;
create trigger commerce_paid_cart after update of payment_status on commerce_orders
  for each row execute function clear_commerce_paid_cart();

create or replace function enqueue_commerce_olist_paid() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.payment_status='paid' and old.payment_status is distinct from 'paid'
     and new.payment_environment='production' and new.deleted_at is null and new.cancelled_at is null then
    insert into commerce_olist_orders(tenant_id,order_id)
    select new.tenant_id,new.id from commerce_olist_settings c
    join commerce_stores s on s.tenant_id=c.tenant_id and s.enabled
    join integration_connections i on i.tenant_id=c.tenant_id and i.provider='olist'
    where c.tenant_id=new.tenant_id and c.settings->>'enabled'='true'
      and i.status<>'disabled' and i.credentials_encrypted is not null
    on conflict(tenant_id,order_id) do nothing;
  end if;
  if new.payment_status='refunded' or new.deleted_at is not null or new.cancelled_at is not null then
    update commerce_olist_orders set status='stopped',last_error='Pedido encerrado ou estornado. Revise documentos e pagamentos já existentes no Olist.',updated_at=now()
    where tenant_id=new.tenant_id and order_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists commerce_olist_payment_outbox on commerce_orders;
create trigger commerce_olist_payment_outbox after update of payment_status,deleted_at,cancelled_at on commerce_orders
  for each row execute function enqueue_commerce_olist_paid();
