alter table quotes
  add column if not exists delivery_method text not null default 'delivery'
    check (delivery_method in ('delivery', 'pickup')),
  add column if not exists shipping_olist_sync_pending boolean not null default false;

comment on column quotes.shipping_olist_sync_pending is
  'Shipping changed locally after order creation; verify freight in Olist before generating an invoice.';
