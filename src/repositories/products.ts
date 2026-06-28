import { createProductSlug } from "@/domain/products/products";
import { normalizePricingCurvePoints } from "@/domain/pricing/pricing";
import type { PricingCurve, PricingCurveMode } from "@/domain/pricing/types";
import { withTenantContext } from "@/lib/db/client";

export type ProductVariantRow = {
  product_id: string;
  product_name: string;
  product_slug: string;
  product_category: string;
  variant_id: string;
  variant_name: string;
  sku: string | null;
  unit_cost: string;
  unit_weight_kg: string;
  curve_mode: PricingCurveMode | null;
  anchors: Record<string, number> | null;
  platform_curves?: Record<string, { mode: PricingCurveMode; anchors: Record<string, number> | null }> | null;
};

export type ProductAdminRow = ProductVariantRow & {
  product_active: boolean;
  variant_active: boolean;
  curve_id: string | null;
  curve_version: number | null;
};

export type CreateProductWithVariantInput = {
  productName: string;
  category: string;
  description?: string | null;
  variantName: string;
  sku?: string | null;
  unitCost: number;
  unitWeightKg: number;
  curve: PricingCurve;
};

export type PricingCurveInput = PricingCurve & {
  platformRuleId?: string | null;
};

export async function listProductVariants(userId: string, tenantId: string): Promise<ProductVariantRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<ProductVariantRow>(
      `
        select
          p.id as product_id,
          p.name as product_name,
          p.slug as product_slug,
          p.category as product_category,
          v.id as variant_id,
          v.name as variant_name,
          v.sku,
          v.unit_cost,
          v.unit_weight_kg,
          pc.mode as curve_mode,
          (
            select jsonb_object_agg(pa.quantity::text, pa.unit_price order by pa.quantity)
            from pricing_anchors pa
            where pa.pricing_curve_id = pc.id
              and pa.tenant_id = pc.tenant_id
          ) as anchors,
          (
            select jsonb_object_agg(platform_curve.platform_rule_id::text, platform_curve.payload)
            from (
              select
                pc2.platform_rule_id,
                jsonb_build_object(
                  'mode', pc2.mode,
                  'anchors', (
                    select jsonb_object_agg(pa2.quantity::text, pa2.unit_price order by pa2.quantity)
                    from pricing_anchors pa2
                    where pa2.pricing_curve_id = pc2.id
                      and pa2.tenant_id = pc2.tenant_id
                  )
                ) as payload
              from pricing_curves pc2
              where pc2.product_variant_id = v.id
                and pc2.tenant_id = v.tenant_id
                and pc2.active = true
                and pc2.platform_rule_id is not null
            ) platform_curve
          ) as platform_curves
        from products p
        join product_variants v on v.product_id = p.id and v.tenant_id = p.tenant_id
        left join lateral (
          select pc.*
          from pricing_curves pc
          where pc.product_variant_id = v.id
            and pc.tenant_id = v.tenant_id
            and pc.active = true
            and pc.platform_rule_id is null
          order by pc.version desc, pc.created_at desc
          limit 1
        ) pc on true
        where p.tenant_id = $1
          and p.active = true
          and v.active = true
        order by p.name, v.name
      `,
      [tenantId]
    );

    return result.rows;
  });
}

export async function listProductsAdmin(userId: string, tenantId: string): Promise<ProductAdminRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<ProductAdminRow>(
      `
        select
          p.id as product_id,
          p.name as product_name,
          p.slug as product_slug,
          p.category as product_category,
          p.active as product_active,
          v.id as variant_id,
          v.name as variant_name,
          v.sku,
          v.unit_cost,
          v.unit_weight_kg,
          v.active as variant_active,
          pc.id as curve_id,
          pc.version as curve_version,
          pc.mode as curve_mode,
          (
            select jsonb_object_agg(pa.quantity::text, pa.unit_price order by pa.quantity)
            from pricing_anchors pa
            where pa.pricing_curve_id = pc.id
              and pa.tenant_id = pc.tenant_id
          ) as anchors
        from products p
        join product_variants v on v.product_id = p.id and v.tenant_id = p.tenant_id
        left join pricing_curves pc
          on pc.product_variant_id = v.id
          and pc.tenant_id = v.tenant_id
          and pc.active = true
          and pc.platform_rule_id is null
        where p.tenant_id = $1
        order by p.name, v.name
      `,
      [tenantId]
    );

    return result.rows;
  });
}

export async function createProductWithVariant(
  userId: string,
  tenantId: string,
  input: CreateProductWithVariantInput
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const slug = createProductSlug(input.productName);
    const productResult = await client.query<{ id: string }>(
      `
        insert into products (tenant_id, name, slug, category, description, active)
        values ($1, $2, $3, $4, $5, true)
        on conflict (tenant_id, slug) do update
          set name = excluded.name,
              category = excluded.category,
              description = excluded.description,
              active = true,
              updated_at = now()
        returning id
      `,
      [tenantId, input.productName, slug, input.category, input.description || null]
    );
    const productId = productResult.rows[0].id;

    const variantResult = await client.query<{ id: string }>(
      `
        insert into product_variants (
          tenant_id,
          product_id,
          name,
          sku,
          unit_cost,
          unit_weight_kg,
          active
        )
        values ($1, $2, $3, $4, $5, $6, true)
        returning id
      `,
      [
        tenantId,
        productId,
        input.variantName,
        input.sku || null,
        input.unitCost,
        input.unitWeightKg
      ]
    );
    const variantId = variantResult.rows[0].id;

    const curveResult = await client.query<{ id: string }>(
      `
        insert into pricing_curves (
          tenant_id,
          product_variant_id,
          name,
          method,
          version,
          active,
          mode,
          created_by
        )
        values ($1, $2, 'Curva inicial', 'anchors', 1, true, $3, $4)
        returning id
      `,
      [tenantId, variantId, input.curve.mode, userId]
    );
    const curveId = curveResult.rows[0].id;

    for (const point of normalizePricingCurvePoints(input.curve.points)) {
      await client.query(
        `
          insert into pricing_anchors (tenant_id, pricing_curve_id, quantity, unit_price)
          values ($1, $2, $3, $4)
        `,
        [tenantId, curveId, point.quantity, point.unitPrice]
      );
    }

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'products.create_with_variant', 'product', $3, $4)
      `,
      [
        tenantId,
        userId,
        productId,
        JSON.stringify({
          variantId,
          curveId
        })
      ]
    );

    return { productId, variantId, curveId };
  });
}

export async function updateVariantAnchors(
  userId: string,
  tenantId: string,
  variantId: string,
  curve: PricingCurveInput
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const curveResult = await client.query<{ id: string }>(
      `
        select pc.id
        from pricing_curves pc
        join product_variants v on v.id = pc.product_variant_id and v.tenant_id = pc.tenant_id
        where pc.tenant_id = $1
          and pc.product_variant_id = $2
          and pc.active = true
          and (($3::uuid is null and pc.platform_rule_id is null) or pc.platform_rule_id = $3::uuid)
          and v.active = true
        order by pc.version desc, pc.created_at desc
        limit 1
      `,
      [tenantId, variantId, curve.platformRuleId ?? null]
    );

    const curveId = curveResult.rows[0]?.id;
    if (!curveId) throw new Error("Active pricing curve not found.");

    await client.query(
      `
        delete from pricing_anchors
        where tenant_id = $1 and pricing_curve_id = $2
      `,
      [tenantId, curveId]
    );

    for (const point of normalizePricingCurvePoints(curve.points)) {
      await client.query(
        `
          insert into pricing_anchors (tenant_id, pricing_curve_id, quantity, unit_price)
          values ($1, $2, $3, $4)
        `,
        [tenantId, curveId, point.quantity, point.unitPrice]
      );
    }

    await client.query(
      `
        update pricing_curves
        set mode = $3,
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [tenantId, curveId, curve.mode]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'pricing_anchors.update', 'product_variant', $3, $4)
      `,
      [tenantId, userId, variantId, JSON.stringify({ curveId, curve })]
    );

    return { variantId, curveId };
  });
}

export async function createVariantPricingCurveVersion(
  userId: string,
  tenantId: string,
  variantId: string,
  curve: PricingCurveInput
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const variantResult = await client.query<{ id: string }>(
      `
        select id
        from product_variants
        where tenant_id = $1
          and id = $2
          and active = true
        limit 1
      `,
      [tenantId, variantId]
    );

    if (!variantResult.rows[0]) throw new Error("Product variant not found.");

    const versionResult = await client.query<{ next_version: number }>(
      `
        select coalesce(max(version), 0) + 1 as next_version
        from pricing_curves
        where tenant_id = $1
          and product_variant_id = $2
      `,
      [tenantId, variantId]
    );
    const nextVersion = versionResult.rows[0]?.next_version ?? 1;

    await client.query(
      `
        update pricing_curves
        set active = false,
            updated_at = now()
        where tenant_id = $1
          and product_variant_id = $2
          and active = true
          and (($3::uuid is null and platform_rule_id is null) or platform_rule_id = $3::uuid)
      `,
      [tenantId, variantId, curve.platformRuleId ?? null]
    );

    const curveResult = await client.query<{ id: string }>(
      `
        insert into pricing_curves (
          tenant_id,
          product_variant_id,
          name,
          method,
          version,
          active,
          mode,
          platform_rule_id,
          created_by
        )
        values ($1, $2, $3, 'anchors', $4, true, $5, $6, $7)
        returning id
      `,
      [
        tenantId,
        variantId,
        curve.platformRuleId ? `Curva canal v${nextVersion}` : `Curva v${nextVersion}`,
        nextVersion,
        curve.mode,
        curve.platformRuleId ?? null,
        userId
      ]
    );
    const curveId = curveResult.rows[0].id;

    for (const point of normalizePricingCurvePoints(curve.points)) {
      await client.query(
        `
          insert into pricing_anchors (tenant_id, pricing_curve_id, quantity, unit_price)
          values ($1, $2, $3, $4)
        `,
        [tenantId, curveId, point.quantity, point.unitPrice]
      );
    }

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'pricing_curves.version_create', 'product_variant', $3, $4)
      `,
      [tenantId, userId, variantId, JSON.stringify({ curveId, version: nextVersion, curve })]
    );

    return { variantId, curveId, version: nextVersion };
  });
}
