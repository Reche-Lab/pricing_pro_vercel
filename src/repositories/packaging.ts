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
  capacities?: Array<{
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

    for (const capacity of (input.capacities ?? []).filter((item) => item.capacity > 0)) {
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
  input: {
    productVariantId?: string;
    quantity?: number;
    items?: Array<{ productVariantId: string; quantity: number }>;
    selectedBoxId?: string | null;
    splitByProduct?: boolean;
    clearanceCm?: number;
  }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const requestedItems = input.items?.length
      ? input.items
      : input.productVariantId && input.quantity
        ? [{ productVariantId: input.productVariantId, quantity: input.quantity }]
        : [];
    if (requestedItems.length === 0) throw new Error("At least one product item is required.");

    const variantIds = Array.from(new Set(requestedItems.map((item) => item.productVariantId)));
    const variantResult = await client.query<{
      id: string;
      unit_weight_kg: string;
      height_cm: string | null;
      width_cm: string | null;
      length_cm: string | null;
    }>(
      `
        select id, unit_weight_kg, height_cm, width_cm, length_cm
        from product_variants
        where tenant_id = $1
          and id = any($2::uuid[])
          and active = true
      `,
      [tenantId, variantIds]
    );
    const variantsById = new Map(variantResult.rows.map((variant) => [variant.id, variant]));
    if (variantsById.size !== variantIds.length) throw new Error("Product variant not found.");

    const boxResult = await client.query<{
      id: string;
      name: string;
      height_cm: string;
      width_cm: string;
      length_cm: string;
      weight_kg: string;
    }>(
      `
        select
          b.id,
          b.name,
          b.height_cm,
          b.width_cm,
          b.length_cm,
          b.weight_kg
        from packaging_boxes b
        where b.tenant_id = $1
          and b.active = true
          and ($2::uuid is null or b.id = $2::uuid)
        order by (b.height_cm * b.width_cm * b.length_cm), b.name
      `,
      [tenantId, input.selectedBoxId ?? null]
    );

    const boxes: PackagingBox[] = boxResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      heightCm: Number(row.height_cm),
      widthCm: Number(row.width_cm),
      lengthCm: Number(row.length_cm),
      weightKg: Number(row.weight_kg),
      capacities: {}
    }));

    const items = requestedItems.map((item) => {
      const variant = variantsById.get(item.productVariantId);
      if (!variant) throw new Error("Product variant not found.");
      if (!variant.height_cm || !variant.width_cm || !variant.length_cm) {
        throw new Error("Product dimensions are required for intelligent packaging.");
      }

      return {
        variantId: item.productVariantId,
        quantity: item.quantity,
        unitWeightKg: Number(variant.unit_weight_kg),
        heightCm: Number(variant.height_cm),
        widthCm: Number(variant.width_cm),
        lengthCm: Number(variant.length_cm)
      };
    });

    return selectBestPackage({
      items,
      boxes,
      selectedBoxId: input.selectedBoxId,
      splitByProduct: input.splitByProduct,
      clearanceCm: input.clearanceCm
    });
  });
}
