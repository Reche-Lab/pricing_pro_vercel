alter table shipments
  add column if not exists packaging_snapshot jsonb,
  add column if not exists selected_quote jsonb;
