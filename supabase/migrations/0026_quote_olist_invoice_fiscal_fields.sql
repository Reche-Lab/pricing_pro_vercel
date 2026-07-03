alter table quotes
  add column if not exists external_olist_invoice_number text,
  add column if not exists external_olist_invoice_series text,
  add column if not exists external_olist_invoice_model text;

