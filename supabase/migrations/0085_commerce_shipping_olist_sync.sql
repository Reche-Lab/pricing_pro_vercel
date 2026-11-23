alter table commerce_order_shipments
  add column olist_tracking_synced_code text,
  add column olist_tracking_error text,
  add column olist_tracking_next_at timestamptz not null default now();
create index commerce_shipping_olist_due on commerce_order_shipments(olist_tracking_next_at)
  where tracking_code is not null and tracking_url is not null;
