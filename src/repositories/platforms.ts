import { withTenantContext } from "@/lib/db/client";

export type PlatformRuleRow = {
  id: string;
  key: string;
  name: string;
  commission_rate: string;
  fixed_fee: string;
  seller_shipping_cost: string;
  seller_shipping_threshold: string;
  sort_order: number;
};

export type PlatformRuleInput = {
  key: string;
  name: string;
  commissionRate: number;
  fixedFee: number;
  sellerShippingCost: number;
  sellerShippingThreshold: number;
  sortOrder?: number;
};

export async function listPlatformRules(userId: string, tenantId: string): Promise<PlatformRuleRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<PlatformRuleRow>(
      `
        select
          id,
          key,
          name,
          commission_rate,
          fixed_fee,
          seller_shipping_cost,
          seller_shipping_threshold,
          sort_order
        from platform_rules
        where tenant_id = $1 and active = true
        order by sort_order asc, name asc
      `,
      [tenantId]
    );

    return result.rows;
  });
}

export async function createPlatformRule(userId: string, tenantId: string, input: PlatformRuleInput) {
  return withTenantContext(userId, tenantId, async (client) => {
    const sortOrderResult = await client.query<{ next_sort_order: number }>(
      `
        select coalesce(max(sort_order), 0) + 1 as next_sort_order
        from platform_rules
        where tenant_id = $1
      `,
      [tenantId]
    );
    const sortOrder = input.sortOrder ?? sortOrderResult.rows[0]?.next_sort_order ?? 1;

    const result = await client.query<{ id: string }>(
      `
        insert into platform_rules (
          tenant_id,
          key,
          name,
          commission_rate,
          fixed_fee,
          seller_shipping_cost,
          seller_shipping_threshold,
          sort_order,
          active
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, true)
        returning id
      `,
      [
        tenantId,
        input.key,
        input.name,
        input.commissionRate,
        input.fixedFee,
        input.sellerShippingCost,
        input.sellerShippingThreshold,
        sortOrder
      ]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'platform_rules.create', 'platform_rule', $3, $4)
      `,
      [tenantId, userId, result.rows[0].id, JSON.stringify(input)]
    );

    return { id: result.rows[0].id };
  });
}

export async function updatePlatformRule(
  userId: string,
  tenantId: string,
  platformId: string,
  input: Omit<PlatformRuleInput, "key">
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ id: string }>(
      `
        update platform_rules
        set name = $3,
            commission_rate = $4,
            fixed_fee = $5,
            seller_shipping_cost = $6,
            seller_shipping_threshold = $7,
            sort_order = coalesce($8, sort_order),
            updated_at = now()
        where tenant_id = $1 and id = $2
        returning id
      `,
      [
        tenantId,
        platformId,
        input.name,
        input.commissionRate,
        input.fixedFee,
        input.sellerShippingCost,
        input.sellerShippingThreshold,
        input.sortOrder ?? null
      ]
    );

    if (!result.rows[0]) throw new Error("Platform rule not found.");

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'platform_rules.update', 'platform_rule', $3, $4)
      `,
      [tenantId, userId, platformId, JSON.stringify(input)]
    );

    return { id: platformId };
  });
}
