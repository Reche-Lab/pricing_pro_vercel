alter table quotes
  add column if not exists external_olist_order_id text,
  add column if not exists external_olist_invoice_id text;

create index if not exists idx_quotes_tenant_external_olist_order
  on quotes (tenant_id, external_olist_order_id)
  where external_olist_order_id is not null;

create index if not exists idx_quotes_tenant_external_olist_invoice
  on quotes (tenant_id, external_olist_invoice_id)
  where external_olist_invoice_id is not null;
