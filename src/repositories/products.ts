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
  anchors: Record<string, number> | null;
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
          (
            select jsonb_object_agg(pa.quantity::text, pa.unit_price order by pa.quantity)
            from pricing_curves pc
            join pricing_anchors pa on pa.pricing_curve_id = pc.id and pa.tenant_id = pc.tenant_id
            where pc.product_variant_id = v.id
              and pc.tenant_id = v.tenant_id
              and pc.active = true
          ) as anchors
        from products p
        join product_variants v on v.product_id = p.id and v.tenant_id = p.tenant_id
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
