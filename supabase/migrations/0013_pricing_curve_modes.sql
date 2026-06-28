alter table pricing_curves
  add column if not exists mode text not null default 'interpolated'
    check (mode in ('interpolated', 'step')),
  add column if not exists platform_rule_id uuid references platform_rules(id) on delete cascade;

create index if not exists idx_pricing_curves_tenant_variant_platform_active
  on pricing_curves (tenant_id, product_variant_id, platform_rule_id, active);

create index if not exists idx_pricing_curves_tenant_variant_active_version
  on pricing_curves (tenant_id, product_variant_id, active, version desc);
