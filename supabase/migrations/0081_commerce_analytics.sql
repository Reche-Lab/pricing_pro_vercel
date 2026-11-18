-- Configuration is tenant-owned. No Google credentials or personal browsing history.
alter table commerce_stores add column if not exists analytics_settings jsonb not null default '{}'::jsonb
  check (jsonb_typeof(analytics_settings)='object');
alter table commerce_sessions
  add column if not exists cart_updated_at timestamptz,
  add column if not exists cart_intent text not null default 'purchase' check (cart_intent in ('purchase','quote')),
  add column if not exists cart_environment text not null default 'unknown' check (cart_environment in ('production','test','unknown'));
alter table commerce_buyer_quotes
  add column if not exists environment text not null default 'unknown' check (environment in ('production','test','unknown'));

-- Historical activity times/environments cannot be reconstructed reliably.
-- Leave old carts unclassified until they change; new quotes get the current mode.
create or replace function commerce_record_cart_activity() returns trigger language plpgsql
set search_path = public as $$
begin
  if new.cart is distinct from old.cart then
    new.cart_updated_at := now();
    new.cart_environment := coalesce((select payment_environment from commerce_payment_connections where tenant_id=new.tenant_id),'production');
  end if;
  return new;
end $$;
drop trigger if exists commerce_cart_activity on commerce_sessions;
create trigger commerce_cart_activity before update of cart on commerce_sessions
  for each row execute function commerce_record_cart_activity();

create or replace function commerce_record_quote_environment() returns trigger language plpgsql
set search_path = public as $$
begin
  new.environment := coalesce((select payment_environment from commerce_payment_connections where tenant_id=new.tenant_id),'production');
  return new;
end $$;
drop trigger if exists commerce_quote_environment on commerce_buyer_quotes;
create trigger commerce_quote_environment before insert on commerce_buyer_quotes
  for each row execute function commerce_record_quote_environment();

create index if not exists commerce_sessions_cart_activity on commerce_sessions(tenant_id,cart_updated_at desc) where jsonb_array_length(cart)>0;
create index if not exists commerce_quotes_reporting on commerce_buyer_quotes(tenant_id,environment,created_at desc);
create index if not exists commerce_quotes_session_reporting on commerce_buyer_quotes(tenant_id,session_id);
create index if not exists commerce_order_reporting on commerce_orders(tenant_id,payment_environment,created_at desc) where deleted_at is null;
