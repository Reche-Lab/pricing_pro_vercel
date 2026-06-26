insert into tenants (name, slug)
values ('Ground Shop', 'ground-shop')
on conflict (slug) do nothing;

insert into products (tenant_id, name, slug, category, description)
select id, 'Botton', 'botton', 'button', 'Produto inicial migrado do precificador legado'
from tenants
where slug = 'ground-shop'
on conflict (tenant_id, slug) do nothing;

insert into platform_rules (tenant_id, key, name, commission_rate, fixed_fee, seller_shipping_cost, seller_shipping_threshold)
select id, 'direct', 'Venda direta', 0, 0, 0, 0
from tenants
where slug = 'ground-shop'
on conflict (tenant_id, key) do nothing;

insert into platform_rules (tenant_id, key, name, commission_rate, fixed_fee, seller_shipping_cost, seller_shipping_threshold)
select id, 'ml_classic', 'Mercado Livre Classico', 0.14, 6.75, 21.45, 79.00
from tenants
where slug = 'ground-shop'
on conflict (tenant_id, key) do nothing;

insert into platform_rules (tenant_id, key, name, commission_rate, fixed_fee, seller_shipping_cost, seller_shipping_threshold)
select id, 'ml_premium', 'Mercado Livre Premium', 0.19, 6.50, 21.45, 79.00
from tenants
where slug = 'ground-shop'
on conflict (tenant_id, key) do nothing;

insert into platform_rules (tenant_id, key, name, commission_rate, fixed_fee, seller_shipping_cost, seller_shipping_threshold)
select id, 'shopee_standard', 'Shopee Padrao', 0.14, 4.00, 0, 0
from tenants
where slug = 'ground-shop'
on conflict (tenant_id, key) do nothing;

insert into product_variants (tenant_id, product_id, name, sku, unit_cost, unit_weight_kg)
select t.id, p.id, v.name, v.sku, v.unit_cost, v.unit_weight_kg
from tenants t
join products p on p.tenant_id = t.id and p.slug = 'botton'
cross join (
  values
    ('2,5 cm', 'BOTTON-25', 0.67, 0.004),
    ('3,5 cm', 'BOTTON-35', 0.80, 0.006),
    ('4,5 cm', 'BOTTON-45', 0.90, 0.008),
    ('5,5 cm', 'BOTTON-55', 1.22, 0.010)
) as v(name, sku, unit_cost, unit_weight_kg)
where t.slug = 'ground-shop'
on conflict (tenant_id, product_id, name) do nothing;

insert into pricing_curves (tenant_id, product_variant_id, name, method, version, active)
select tenant_id, id, 'Curva inicial', 'anchors', 1, true
from product_variants
where sku in ('BOTTON-25', 'BOTTON-35', 'BOTTON-45', 'BOTTON-55')
on conflict (tenant_id, product_variant_id, version) do nothing;

insert into pricing_anchors (tenant_id, pricing_curve_id, quantity, unit_price)
select c.tenant_id, c.id, a.quantity, a.unit_price
from pricing_curves c
join product_variants v on v.id = c.product_variant_id
join lateral (
  values
    (1, case v.sku when 'BOTTON-25' then 8.00 when 'BOTTON-35' then 10.00 when 'BOTTON-45' then 12.50 else 15.00 end),
    (10, case v.sku when 'BOTTON-25' then 3.80 when 'BOTTON-35' then 3.90 when 'BOTTON-45' then 4.20 else 4.50 end),
    (50, case v.sku when 'BOTTON-25' then 2.78 when 'BOTTON-35' then 2.98 when 'BOTTON-45' then 3.20 else 3.80 end),
    (100, case v.sku when 'BOTTON-25' then 2.49 when 'BOTTON-35' then 2.67 when 'BOTTON-45' then 2.99 else 3.60 end),
    (500, case v.sku when 'BOTTON-25' then 2.30 when 'BOTTON-35' then 2.45 when 'BOTTON-45' then 2.75 else 3.10 end),
    (1000, case v.sku when 'BOTTON-25' then 1.99 when 'BOTTON-35' then 2.20 when 'BOTTON-45' then 2.30 else 2.70 end)
) as a(quantity, unit_price) on true
where v.sku in ('BOTTON-25', 'BOTTON-35', 'BOTTON-45', 'BOTTON-55')
on conflict (tenant_id, pricing_curve_id, quantity) do nothing;
