import { withTenantContext } from "@/lib/db/client";

export type PlatformRuleRow = {
  id: string;
  key: string;
  name: string;
  commission_rate: string;
  fixed_fee: string;
  seller_shipping_cost: string;
  seller_shipping_threshold: string;
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
          seller_shipping_threshold
        from platform_rules
        where tenant_id = $1 and active = true
        order by name
      `,
      [tenantId]
    );

    return result.rows;
  });
}
