import { createProductSlug } from "@/domain/products/products";
import {
  normalizeProductAliases,
  type ProductAliasSource,
  type ProductSearchAlias
} from "@/domain/products/product-search";
import { normalizePricingCurvePoints } from "@/domain/pricing/pricing";
import type { PricingCurve, PricingCurveMode } from "@/domain/pricing/types";
import type { PrintCornerStyle, PrintShape } from "@/domain/artwork/geometry";
import { withTenantContext } from "@/lib/db/client";
import type { PoolClient } from "pg";

export type ProductVariantRow = {
  product_id: string;
  product_name: string;
  product_slug: string;
  product_category: string;
  product_description: string | null;
  variant_id: string;
  variant_name: string;
  variant_description: string | null;
  sku: string | null;
  external_olist_product_id: string | null;
  unit_cost: string;
  unit_weight_kg: string;
  height_cm: string | null;
  width_cm: string | null;
  length_cm: string | null;
  print_diameter_mm: string | null;
  print_shape: PrintShape;
  print_width_mm: string | null;
  print_height_mm: string | null;
  print_corner_style: PrintCornerStyle;
  print_corner_radius_mm: string;
  print_shape_rotation_degrees: string;
  allow_print_rotation: boolean;
  print_bleed_mm: string;
  print_safe_margin_mm: string;
  curve_mode: PricingCurveMode | null;
  anchors: Record<string, number> | null;
  platform_curves?: Record<string, { mode: PricingCurveMode; anchors: Record<string, number> | null }> | null;
  aliases: ProductSearchAlias[];
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
  externalOlistProductId?: string | null;
  unitCost: number;
  unitWeightKg: number;
  heightCm?: number | null;
  widthCm?: number | null;
  lengthCm?: number | null;
  printDiameterMm?: number | null;
  printShape: PrintShape;
  printWidthMm: number;
  printHeightMm: number;
  printCornerStyle: PrintCornerStyle;
  printCornerRadiusMm: number;
  printShapeRotationDegrees: number;
  allowPrintRotation: boolean;
  printBleedMm: number;
  printSafeMarginMm: number;
  curve: PricingCurve;
  aliases?: Array<{ alias: string; source?: ProductAliasSource }>;
};

export type PricingCurveInput = PricingCurve & {
  platformRuleId?: string | null;
};

export type UpdateProductVariantInput = {
  productName: string;
  category: string;
  description?: string | null;
  productActive: boolean;
  variantName: string;
  sku?: string | null;
  externalOlistProductId?: string | null;
  unitCost: number;
  unitWeightKg: number;
  heightCm?: number | null;
  widthCm?: number | null;
  lengthCm?: number | null;
  printDiameterMm?: number | null;
  printShape: PrintShape;
  printWidthMm: number;
  printHeightMm: number;
  printCornerStyle: PrintCornerStyle;
  printCornerRadiusMm: number;
  printShapeRotationDegrees: number;
  allowPrintRotation: boolean;
  printBleedMm: number;
  printSafeMarginMm: number;
  variantActive: boolean;
  aliases?: Array<{ alias: string; source?: ProductAliasSource }>;
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
          p.description as product_description,
          v.id as variant_id,
          v.name as variant_name,
          v.description as variant_description,
          v.sku,
          to_jsonb(v)->>'external_olist_product_id' as external_olist_product_id,
          v.unit_cost,
          v.unit_weight_kg,
          v.height_cm,
          v.width_cm,
          v.length_cm,
          to_jsonb(v)->>'print_diameter_mm' as print_diameter_mm,
          coalesce(to_jsonb(v)->>'print_shape', 'circle') as print_shape,
          coalesce(to_jsonb(v)->>'print_width_mm', to_jsonb(v)->>'print_diameter_mm') as print_width_mm,
          coalesce(to_jsonb(v)->>'print_height_mm', to_jsonb(v)->>'print_diameter_mm') as print_height_mm,
          coalesce(to_jsonb(v)->>'print_corner_style', 'sharp') as print_corner_style,
          coalesce(to_jsonb(v)->>'print_corner_radius_mm', '0') as print_corner_radius_mm,
          coalesce(to_jsonb(v)->>'print_shape_rotation_degrees', '0') as print_shape_rotation_degrees,
          coalesce((to_jsonb(v)->>'allow_print_rotation')::boolean, true) as allow_print_rotation,
          coalesce(to_jsonb(v)->>'print_bleed_mm', '2') as print_bleed_mm,
          coalesce(to_jsonb(v)->>'print_safe_margin_mm', '2') as print_safe_margin_mm,
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'alias', psa.alias,
                'normalizedAlias', psa.normalized_alias,
                'source', psa.source
              )
              order by psa.alias
            )
            from product_search_aliases psa
            where psa.tenant_id = v.tenant_id
              and psa.product_variant_id = v.id
              and psa.active = true
          ), '[]'::jsonb) as aliases,
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
          and p.deleted_at is null
          and v.deleted_at is null
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
          p.description as product_description,
          p.active as product_active,
          v.id as variant_id,
          v.name as variant_name,
          v.description as variant_description,
          v.sku,
          to_jsonb(v)->>'external_olist_product_id' as external_olist_product_id,
          v.unit_cost,
          v.unit_weight_kg,
          v.height_cm,
          v.width_cm,
          v.length_cm,
          to_jsonb(v)->>'print_diameter_mm' as print_diameter_mm,
          coalesce(to_jsonb(v)->>'print_shape', 'circle') as print_shape,
          coalesce(to_jsonb(v)->>'print_width_mm', to_jsonb(v)->>'print_diameter_mm') as print_width_mm,
          coalesce(to_jsonb(v)->>'print_height_mm', to_jsonb(v)->>'print_diameter_mm') as print_height_mm,
          coalesce(to_jsonb(v)->>'print_corner_style', 'sharp') as print_corner_style,
          coalesce(to_jsonb(v)->>'print_corner_radius_mm', '0') as print_corner_radius_mm,
          coalesce(to_jsonb(v)->>'print_shape_rotation_degrees', '0') as print_shape_rotation_degrees,
          coalesce((to_jsonb(v)->>'allow_print_rotation')::boolean, true) as allow_print_rotation,
          coalesce(to_jsonb(v)->>'print_bleed_mm', '2') as print_bleed_mm,
          coalesce(to_jsonb(v)->>'print_safe_margin_mm', '2') as print_safe_margin_mm,
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'alias', psa.alias,
                'normalizedAlias', psa.normalized_alias,
                'source', psa.source
              )
              order by psa.alias
            )
            from product_search_aliases psa
            where psa.tenant_id = v.tenant_id
              and psa.product_variant_id = v.id
              and psa.active = true
          ), '[]'::jsonb) as aliases,
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
          and p.deleted_at is null
          and v.deleted_at is null
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
              deleted_at = null,
              deleted_by = null,
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
          description,
          sku,
          external_olist_product_id,
          unit_cost,
          unit_weight_kg,
          height_cm,
          width_cm,
          length_cm,
          print_diameter_mm,
          print_shape,
          print_width_mm,
          print_height_mm,
          print_corner_style,
          print_corner_radius_mm,
          print_shape_rotation_degrees,
          allow_print_rotation,
          print_bleed_mm,
          print_safe_margin_mm,
          active
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, true)
        on conflict (tenant_id, product_id, name) do update
          set description = excluded.description,
              sku = excluded.sku,
              external_olist_product_id = excluded.external_olist_product_id,
              unit_cost = excluded.unit_cost,
              unit_weight_kg = excluded.unit_weight_kg,
              height_cm = excluded.height_cm,
              width_cm = excluded.width_cm,
              length_cm = excluded.length_cm,
              print_diameter_mm = excluded.print_diameter_mm,
              print_shape = excluded.print_shape,
              print_width_mm = excluded.print_width_mm,
              print_height_mm = excluded.print_height_mm,
              print_corner_style = excluded.print_corner_style,
              print_corner_radius_mm = excluded.print_corner_radius_mm,
              print_shape_rotation_degrees = excluded.print_shape_rotation_degrees,
              allow_print_rotation = excluded.allow_print_rotation,
              print_bleed_mm = excluded.print_bleed_mm,
              print_safe_margin_mm = excluded.print_safe_margin_mm,
              active = true,
              deleted_at = null,
              deleted_by = null,
              updated_at = now()
        returning id
      `,
      [
        tenantId,
        productId,
        input.variantName,
        input.description || null,
        input.sku || null,
        input.externalOlistProductId || null,
        input.unitCost,
        input.unitWeightKg,
        input.heightCm ?? null,
        input.widthCm ?? null,
        input.lengthCm ?? null,
        input.printShape === "circle" ? input.printWidthMm : input.printDiameterMm ?? null,
        input.printShape,
        input.printWidthMm,
        input.printShape === "square" || input.printShape === "circle" ? input.printWidthMm : input.printHeightMm,
        input.printCornerStyle,
        input.printCornerStyle === "rounded" ? input.printCornerRadiusMm : 0,
        input.printShapeRotationDegrees,
        input.allowPrintRotation,
        input.printBleedMm,
        input.printSafeMarginMm
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
        values (
          $1,
          $2,
          'Curva inicial',
          'anchors',
          coalesce((select max(version) + 1 from pricing_curves where tenant_id = $1 and product_variant_id = $2), 1),
          true,
          $3,
          $4
        )
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

    await syncProductAliases(client, tenantId, userId, variantId, input.aliases ?? []);

    return { productId, variantId, curveId };
  });
}

async function syncProductAliases(
  client: PoolClient,
  tenantId: string,
  userId: string,
  variantId: string,
  aliases: Array<{ alias: string; source?: ProductAliasSource }>
) {
  const normalized = normalizeProductAliases(aliases);
  await client.query(
    `delete from product_search_aliases where tenant_id = $1 and product_variant_id = $2`,
    [tenantId, variantId]
  );
  for (const alias of normalized) {
    await client.query(
      `
        insert into product_search_aliases (
          tenant_id,
          product_variant_id,
          alias,
          normalized_alias,
          source,
          created_by
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [tenantId, variantId, alias.alias, alias.normalizedAlias, alias.source, userId]
    );
  }
}

export async function updateProductVariant(
  userId: string,
  tenantId: string,
  variantId: string,
  input: UpdateProductVariantInput
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const currentResult = await client.query<{ product_id: string }>(
      `
        select product_id
        from product_variants
        where tenant_id = $1 and id = $2 and deleted_at is null
        limit 1
      `,
      [tenantId, variantId]
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Product variant not found.");

    const slug = createProductSlug(input.productName);
    await client.query(
      `
        update products
        set name = $3,
            slug = $4,
            category = $5,
            active = $6,
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [
        tenantId,
        current.product_id,
        input.productName,
        slug,
        input.category,
        input.productActive
      ]
    );

    await client.query(
      `
        update product_variants
        set name = $3,
            description = $4,
            sku = $5,
            external_olist_product_id = $6,
            unit_cost = $7,
            unit_weight_kg = $8,
            height_cm = $9,
            width_cm = $10,
            length_cm = $11,
            print_diameter_mm = $12,
            print_shape = $13,
            print_width_mm = $14,
            print_height_mm = $15,
            print_corner_style = $16,
            print_corner_radius_mm = $17,
            print_shape_rotation_degrees = $18,
            allow_print_rotation = $19,
            print_bleed_mm = $20,
            print_safe_margin_mm = $21,
            active = $22,
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [
        tenantId,
        variantId,
        input.variantName,
        input.description || null,
        input.sku || null,
        input.externalOlistProductId || null,
        input.unitCost,
        input.unitWeightKg,
        input.heightCm ?? null,
        input.widthCm ?? null,
        input.lengthCm ?? null,
        input.printShape === "circle" ? input.printWidthMm : input.printDiameterMm ?? null,
        input.printShape,
        input.printWidthMm,
        input.printShape === "square" || input.printShape === "circle" ? input.printWidthMm : input.printHeightMm,
        input.printCornerStyle,
        input.printCornerStyle === "rounded" ? input.printCornerRadiusMm : 0,
        input.printShapeRotationDegrees,
        input.allowPrintRotation,
        input.printBleedMm,
        input.printSafeMarginMm,
        input.variantActive
      ]
    );

    await syncProductAliases(client, tenantId, userId, variantId, input.aliases ?? []);

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'products.update_variant', 'product_variant', $3, $4)
      `,
      [tenantId, userId, variantId, JSON.stringify({ productId: current.product_id, input })]
    );

    return { productId: current.product_id, variantId };
  });
}

export async function archiveProductByVariant(userId: string, tenantId: string, variantId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const productResult = await client.query<{ id: string; name: string }>(
      `
        select p.id, p.name
        from products p
        join product_variants v on v.product_id = p.id and v.tenant_id = p.tenant_id
        where p.tenant_id = $1
          and v.id = $2
          and p.deleted_at is null
          and v.deleted_at is null
        limit 1
        for update of p, v
      `,
      [tenantId, variantId]
    );
    const product = productResult.rows[0];
    if (!product) return null;

    const variantsResult = await client.query<{ id: string }>(
      `
        update product_variants
        set active = false,
            deleted_at = now(),
            deleted_by = $3,
            updated_at = now()
        where tenant_id = $1
          and product_id = $2
          and deleted_at is null
        returning id
      `,
      [tenantId, product.id, userId]
    );

    await client.query(
      `
        update products
        set active = false,
            deleted_at = now(),
            deleted_by = $3,
            updated_at = now()
        where tenant_id = $1 and id = $2
      `,
      [tenantId, product.id, userId]
    );

    await client.query(
      `
        update pricing_curves pc
        set active = false,
            updated_at = now()
        where pc.tenant_id = $1
          and pc.product_variant_id = any($2::uuid[])
      `,
      [tenantId, variantsResult.rows.map((variant) => variant.id)]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'products.archive', 'product', $3, $4)
      `,
      [tenantId, userId, product.id, JSON.stringify({ productName: product.name, variantIds: variantsResult.rows.map((variant) => variant.id), requestedFromVariantId: variantId })]
    );

    return { productId: product.id, productName: product.name, archivedVariants: variantsResult.rowCount ?? variantsResult.rows.length };
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
