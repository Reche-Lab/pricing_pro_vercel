import { getServerEnv } from "@/lib/env/server";

export type MercadoPagoPreferenceInput = {
  invoiceId: string;
  tenantId: string;
  tenantName: string;
  title: string;
  amountCents: number;
};

export type MercadoPagoPreferenceResult = {
  id: string;
  initPoint: string;
};

export async function createMercadoPagoPreference(input: MercadoPagoPreferenceInput): Promise<MercadoPagoPreferenceResult> {
  const env = getServerEnv();
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) throw new Error("Mercado Pago access token is not configured.");

  const appUrl = env.APP_URL.replace(/\/$/, "");
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      items: [
        {
          id: input.invoiceId,
          title: input.title,
          description: `Assinatura mensal - ${input.tenantName}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: input.amountCents / 100
        }
      ],
      external_reference: input.invoiceId,
      metadata: {
        invoice_id: input.invoiceId,
        tenant_id: input.tenantId
      },
      back_urls: {
        success: `${appUrl}/billing?status=success`,
        failure: `${appUrl}/billing?status=failure`,
        pending: `${appUrl}/billing?status=pending`
      },
      notification_url: `${appUrl}/api/billing/mercado-pago/webhook`,
      auto_return: "approved"
    })
  });

  const payload = (await response.json().catch(() => null)) as { id?: string; init_point?: string; message?: string } | null;
  if (!response.ok || !payload?.id || !payload.init_point) {
    throw new Error(payload?.message || "Mercado Pago preference creation failed.");
  }

  return { id: payload.id, initPoint: payload.init_point };
}

export async function getMercadoPagoPayment(paymentId: string) {
  const env = getServerEnv();
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) throw new Error("Mercado Pago access token is not configured.");

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}` }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error("Mercado Pago payment lookup failed.");
  return payload as {
    id: number | string;
    status?: string;
    external_reference?: string | null;
    metadata?: { invoice_id?: string; tenant_id?: string };
  };
}
