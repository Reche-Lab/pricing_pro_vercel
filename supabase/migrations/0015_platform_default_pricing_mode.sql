alter table platform_rules
  add column if not exists default_pricing_mode text not null default 'interpolated'
    check (default_pricing_mode in ('interpolated', 'step'));
