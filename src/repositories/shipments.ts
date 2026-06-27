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

export async function getShipment(userId: string, tenantId: string, shipmentId: string): Promise<ShipmentRow | null> {
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
        where tenant_id = $1 and id = $2
        limit 1
      `,
      [tenantId, shipmentId]
    );

    return result.rows[0] ?? null;
  });
}

export async function updateShipmentFlow(
  userId: string,
  tenantId: string,
  input: {
    shipmentId: string;
    status: string;
    rawPayload?: unknown;
    rawResponse?: unknown;
    providerShipmentId?: string | null;
    providerOrderId?: string | null;
    trackingCode?: string | null;
    labelUrl?: string | null;
  }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ id: string }>(
      `
        update shipments
        set status = $3,
            raw_payload = coalesce($4::jsonb, raw_payload),
            raw_response = coalesce($5::jsonb, raw_response),
            provider_shipment_id = coalesce($6, provider_shipment_id),
            provider_order_id = coalesce($7, provider_order_id),
            tracking_code = coalesce($8, tracking_code),
            label_url = coalesce($9, label_url),
            updated_at = now()
        where tenant_id = $1 and id = $2
        returning id
      `,
      [
        tenantId,
        input.shipmentId,
        input.status,
        input.rawPayload === undefined ? null : JSON.stringify(input.rawPayload),
        input.rawResponse === undefined ? null : JSON.stringify(input.rawResponse),
        input.providerShipmentId ?? null,
        input.providerOrderId ?? null,
        input.trackingCode ?? null,
        input.labelUrl ?? null
      ]
    );

    if (!result.rows[0]) throw new Error("Shipment not found.");

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'shipments.flow_update', 'shipment', $3, $4)
      `,
      [
        tenantId,
        userId,
        input.shipmentId,
        JSON.stringify({
          status: input.status,
          providerShipmentId: input.providerShipmentId,
          providerOrderId: input.providerOrderId,
          trackingCode: input.trackingCode,
          labelUrl: input.labelUrl
        })
      ]
    );

    return { id: input.shipmentId, status: input.status };
  });
}
