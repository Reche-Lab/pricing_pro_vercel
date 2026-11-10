-- Optional, explicit opt-in. Existing stores and historical orders are not synchronized.
create table commerce_olist_settings (
  tenant_id uuid primary key references commerce_stores(tenant_id),
  settings jsonb not null default '{}' check(jsonb_typeof(settings)='object'),
  updated_by uuid not null references app_users(id),
  updated_at timestamptz not null default now()
);
create table commerce_olist_customers (
  tenant_id uuid not null references commerce_stores(tenant_id),
  document_hash text not null,
  external_id text check(external_id ~ '^[1-9][0-9]*$'),
  create_attempted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(tenant_id,document_hash)
);
create table commerce_olist_orders (
  tenant_id uuid not null,
  order_id uuid not null,
  customer_id text,
  sales_order_id text,
  invoice_id text,
  invoice_number text,
  invoice_series text,
  invoice_status integer,
  invoice_link text,
  authorization_requested_at timestamptz,
  email_requested_at timestamptz,
  expedition_id text,
  production_completed_at timestamptz,
  shipping_synced_at timestamptz,
  package_snapshot jsonb,
  payment_kind text check(payment_kind in ('pix','card','manual','other')),
  tracking_code text,
  tracking_url text,
  attempt_stage text,
  attempts integer not null default 0,
  status text not null default 'pending' check(status in ('pending','processing','waiting','blocked','review','done','stopped')),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  error_code text,
  debug_id uuid,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,order_id),
  foreign key(tenant_id,order_id) references commerce_orders(tenant_id,id)
);
create unique index commerce_olist_external_order on commerce_olist_orders(tenant_id,sales_order_id) where sales_order_id is not null;
create unique index commerce_olist_external_invoice on commerce_olist_orders(tenant_id,invoice_id) where invoice_id is not null;
create index commerce_olist_pending on commerce_olist_orders(next_attempt_at) where status in ('pending','processing');
-- Leases also work with Supabase transaction pooling (no session advisory locks).
create table commerce_olist_leases (
  lock_key text primary key,
  token uuid not null,
  expires_at timestamptz not null
);

-- The outbox entry commits with payment confirmation, including manual confirmation.
-- No ERP network call is performed by a database trigger.
create function enqueue_commerce_olist_paid() returns trigger language plpgsql set search_path=public as $$
begin
  if new.payment_status='paid' and old.payment_status is distinct from 'paid'
     and new.payment_environment='production' and new.deleted_at is null then
    insert into commerce_olist_orders(tenant_id,order_id)
    select new.tenant_id,new.id
    from commerce_olist_settings c
    join commerce_stores s on s.tenant_id=c.tenant_id and s.enabled
    join integration_connections i on i.tenant_id=c.tenant_id and i.provider='olist'
    where c.tenant_id=new.tenant_id and c.settings->>'enabled'='true'
      and i.status<>'disabled' and i.credentials_encrypted is not null
    on conflict(tenant_id,order_id) do nothing;
  end if;
  if new.payment_status='refunded' or new.deleted_at is not null then
    update commerce_olist_orders set status='stopped',last_error='Pedido excluído ou estornado. Revise documentos e pagamentos já existentes no Olist.',updated_at=now()
    where tenant_id=new.tenant_id and order_id=new.id;
  end if;
  return new;
end $$;
create trigger commerce_olist_payment_outbox after update of payment_status,deleted_at on commerce_orders
  for each row execute function enqueue_commerce_olist_paid();

do $$ declare tab text; begin
  foreach tab in array array['commerce_olist_settings','commerce_olist_customers','commerce_olist_orders','commerce_olist_leases'] loop
    execute format('alter table %I enable row level security',tab);
    execute format('revoke all on %I from public,anon,authenticated',tab);
  end loop;
end $$;
