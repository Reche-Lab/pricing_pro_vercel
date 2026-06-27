import { withTenantContext } from "@/lib/db/client";

export type ShipmentRow = {
  id: string;
  provider: string;
  provider_shipment_id: string | null;
  provider_order_id: string | null;
  tracking_code: string | null;
  status: string;
  service_name: string | null;
  service_code: string | null;
  shipping_amount: string;
  label_url: string | null;
  created_at: string;
};

export async function listQuoteShipments(
  userId: string,
  tenantId: string,
  quoteId: string
): Promise<ShipmentRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<ShipmentRow>(
      `
        select
          id,
          provider,
          provider_shipment_id,
          provider_order_id,
          tracking_code,
          status,
          service_name,
          service_code,
          shipping_amount,
          label_url,
          created_at
        from shipments
        where tenant_id = $1 and quote_id = $2
        order by created_at desc
      `,
      [tenantId, quoteId]
    );

    return result.rows;
  });
}

export async function createShipmentDraft(
  userId: string,
  tenantId: string,
  input: {
    quoteId: string;
    provider: string;
    status?: string;
    serviceName?: string | null;
    serviceCode?: string | null;
    shippingAmount?: number;
    rawQuote?: unknown;
  }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ id: string }>(
      `
        insert into shipments (
          tenant_id,
          quote_id,
          provider,
          status,
          service_name,
          service_code,
          shipping_amount,
          raw_quote,
          created_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning id
      `,
      [
        tenantId,
        input.quoteId,
        input.provider,
        input.status ?? "quoted",
        input.serviceName ?? null,
        input.serviceCode ?? null,
        input.shippingAmount ?? 0,
        JSON.stringify(input.rawQuote ?? null),
        userId
      ]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'shipments.create_draft', 'shipment', $3, $4)
      `,
      [tenantId, userId, result.rows[0].id, JSON.stringify({ quoteId: input.quoteId, provider: input.provider })]
    );

    return { id: result.rows[0].id };
  });
}
