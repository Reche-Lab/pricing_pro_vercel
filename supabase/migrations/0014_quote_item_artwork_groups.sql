alter table quote_items
  add column if not exists artwork_name text,
  add column if not exists pricing_rule text not null default 'per_item'
    check (pricing_rule in ('per_item', 'per_art_average', 'aggregate_total')),
  add column if not exists pricing_group_key text,
  add column if not exists reference_quantity integer check (reference_quantity is null or reference_quantity > 0),
  add column if not exists base_unit_price numeric(12,4) check (base_unit_price is null or base_unit_price >= 0);

create index if not exists idx_quote_items_quote_pricing_group
  on quote_items (tenant_id, quote_id, pricing_group_key);
