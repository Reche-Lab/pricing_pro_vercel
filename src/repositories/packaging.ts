import { selectBestPackage } from "@/domain/shipping/packaging";
import type { PackagingBox } from "@/domain/shipping/types";
import { withTenantContext } from "@/lib/db/client";

export type PackagingBoxRow = {
  id: string;
  name: string;
  height_cm: string;
  width_cm: string;
  length_cm: string;
  weight_kg: string;
  active: boolean;
  capacities: Record<string, number> | null;
};

export type CreatePackagingBoxInput = {
  name: string;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightKg: number;
  capacities: Array<{
    productVariantId: string;
    capacity: number;
  }>;
};

export async function listPackagingBoxes(userId: string, tenantId: string): Promise<PackagingBoxRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<PackagingBoxRow>(
      `
        select
          b.id,
          b.name,
          b.height_cm,
          b.width_cm,
          b.length_cm,
          b.weight_kg,
          b.active,
          (
            select jsonb_object_agg(pc.product_variant_id::text, pc.capacity order by pc.capacity desc)
            from packaging_capacities pc
            where pc.packaging_box_id = b.id and pc.tenant_id = b.tenant_id
          ) as capacities
        from packaging_boxes b
        where b.tenant_id = $1
        order by (b.height_cm * b.width_cm * b.length_cm), b.name
      `,
      [tenantId]
    );

    return result.rows;
  });
}

export async function createPackagingBox(userId: string, tenantId: string, input: CreatePackagingBoxInput) {
  return withTenantContext(userId, tenantId, async (client) => {
    const boxResult = await client.query<{ id: string }>(
      `
        insert into packaging_boxes (
          tenant_id,
          name,
          height_cm,
          width_cm,
          length_cm,
          weight_kg,
          active
        )
        values ($1, $2, $3, $4, $5, $6, true)
        on conflict (tenant_id, name) do update
          set height_cm = excluded.height_cm,
              width_cm = excluded.width_cm,
              length_cm = excluded.length_cm,
              weight_kg = excluded.weight_kg,
              active = true,
              updated_at = now()
        returning id
      `,
      [tenantId, input.name, input.heightCm, input.widthCm, input.lengthCm, input.weightKg]
    );

    const boxId = boxResult.rows[0].id;

    for (const capacity of input.capacities.filter((item) => item.capacity > 0)) {
      await client.query(
        `
          insert into packaging_capacities (
            tenant_id,
            packaging_box_id,
            product_variant_id,
            capacity
          )
          values ($1, $2, $3, $4)
          on conflict (tenant_id, packaging_box_id, product_variant_id) do update
            set capacity = excluded.capacity,
                updated_at = now()
        `,
        [tenantId, boxId, capacity.productVariantId, capacity.capacity]
      );
    }

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'packaging_boxes.upsert', 'packaging_box', $3, $4)
      `,
      [tenantId, userId, boxId, JSON.stringify(input)]
    );

    return { id: boxId };
  });
}

export async function estimatePackaging(
  userId: string,
  tenantId: string,
  input: { productVariantId: string; quantity: number }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const variantResult = await client.query<{ id: string; unit_weight_kg: string }>(
      `
        select id, unit_weight_kg
        from product_variants
        where tenant_id = $1 and id = $2 and active = true
        limit 1
      `,
      [tenantId, input.productVariantId]
    );
    const variant = variantResult.rows[0];
    if (!variant) throw new Error("Product variant not found.");

    const boxResult = await client.query<{
      id: string;
      name: string;
      height_cm: string;
      width_cm: string;
      length_cm: string;
      weight_kg: string;
      capacity: number;
    }>(
      `
        select
          b.id,
          b.name,
          b.height_cm,
          b.width_cm,
          b.length_cm,
          b.weight_kg,
          pc.capacity
        from packaging_boxes b
        join packaging_capacities pc on pc.packaging_box_id = b.id and pc.tenant_id = b.tenant_id
        where b.tenant_id = $1
          and b.active = true
          and pc.product_variant_id = $2
        order by (b.height_cm * b.width_cm * b.length_cm), b.name
      `,
      [tenantId, input.productVariantId]
    );

    const boxes: PackagingBox[] = boxResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      heightCm: Number(row.height_cm),
      widthCm: Number(row.width_cm),
      lengthCm: Number(row.length_cm),
      weightKg: Number(row.weight_kg),
      capacities: {
        [input.productVariantId]: Number(row.capacity)
      }
    }));

    return selectBestPackage({
      variantId: input.productVariantId,
      quantity: input.quantity,
      unitWeightKg: Number(variant.unit_weight_kg),
      boxes
    });
  });
}
