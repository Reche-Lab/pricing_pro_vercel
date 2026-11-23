-- Shipments belong to a store purchase, not to an administrative quote.
create unique index if not exists integration_connections_tenant_identity on integration_connections(tenant_id,id);
create table commerce_order_shipments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  order_id uuid not null,
  connection_id uuid not null,
  service_code text not null check(service_code ~ '^[1-9][0-9]*$'),
  service_name text not null,
  status text not null default 'quoted',
  quoted_cents integer not null check(quoted_cents >= 0),
  purchase_cents integer check(purchase_cents >= 0),
  purchase_attempted_at timestamptz,
  snapshot jsonb not null default '{}',
  production_ready_at timestamptz,
  tracking_code text,
  tracking_url text,
  label_url text,
  posted_at timestamptz,
  delivered_at timestamptz,
  operation text,
  operation_token uuid,
  operation_started_at timestamptz,
  last_error text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,order_id),
  unique(tenant_id,id),
  foreign key(tenant_id,order_id) references commerce_orders(tenant_id,id),
  foreign key(tenant_id,connection_id) references integration_connections(tenant_id,id)
);
create table commerce_order_shipment_parcels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  shipment_id uuid not null,
  parcel_index integer not null check(parcel_index >= 0),
  provider_id uuid unique,
  status text not null default 'quoted',
  price_cents integer check(price_cents >= 0),
  snapshot jsonb not null,
  tracking_code text,
  tracking_url text,
  label_url text,
  paid_at timestamptz,
  posted_at timestamptz,
  delivered_at timestamptz,
  provider_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(shipment_id,parcel_index),
  unique(tenant_id,shipment_id,id),
  foreign key(tenant_id,shipment_id) references commerce_order_shipments(tenant_id,id)
);
create table commerce_shipment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  shipment_id uuid not null,
  parcel_id uuid,
  event_key text not null unique,
  status text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,shipment_id) references commerce_order_shipments(tenant_id,id),
  foreign key(tenant_id,shipment_id,parcel_id) references commerce_order_shipment_parcels(tenant_id,shipment_id,id)
);
create index commerce_shipment_parcels_parent on commerce_order_shipment_parcels(tenant_id,shipment_id);
create index commerce_shipment_events_parent on commerce_shipment_events(tenant_id,shipment_id,occurred_at);
do $$ declare tab text; begin
  foreach tab in array array['commerce_order_shipments','commerce_order_shipment_parcels','commerce_shipment_events'] loop
    execute format('alter table %I enable row level security',tab);
    execute format('revoke all on %I from public,anon,authenticated',tab);
  end loop;
end $$;
