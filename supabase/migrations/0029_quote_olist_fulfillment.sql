alter table quotes
  add column if not exists external_olist_fulfillment_status text not null default 'not_sent'
    check (external_olist_fulfillment_status in ('not_sent', 'sent_to_fulfillment')),
  add column if not exists external_olist_fulfillment_sent_at timestamptz,
  add column if not exists external_olist_fulfillment_note text,
  add column if not exists external_olist_fulfillment_response jsonb;

create index if not exists idx_quotes_tenant_olist_fulfillment
  on quotes (tenant_id, external_olist_fulfillment_status, external_olist_fulfillment_sent_at desc);
