import { getPool } from "@/lib/db/client";
import { estimatePackagingWithClient } from "@/repositories/packaging";
import type { IntegrationConnectionRow } from "@/repositories/integrations";
import type { CartLine } from "@/domain/commerce/schemas";
import type { CommerceProduct } from "@/repositories/commerce";
import { carrierDelivery } from "./preview-delivery";
import { CommerceError } from "@/domain/commerce/commerce";
import { isProductionCommerceCarrier } from "@/domain/commerce/carrier-settings";

export async function publicCarrierDelivery(tenantId: string, postalCode: string, lines: CartLine[], products: CommerceProduct[], declaredValueCents?: number) {
  // Public buyers never acquire an app user identity or receive credentials. The store must explicitly opt in.
  const result = await getPool().query<IntegrationConnectionRow & { postal_code: string }>(
    `select i.id,i.provider,i.status,i.settings,i.credentials_encrypted,t.postal_code
     from commerce_stores s join tenants t on t.id=s.tenant_id
     join integration_connections i on i.tenant_id=s.tenant_id and i.provider='melhor_envio'
     where s.tenant_id=$1 and s.enabled and s.status='published' and t.status='active'
       and s.settings->>'carrierEnabled'='true'`, [tenantId]);
  const connection = result.rows[0];
  if (!connection) throw new CommerceError("O frete automático está indisponível. Escolha outra opção ou contate a loja.", 409);
  if (!isProductionCommerceCarrier(connection.settings))
    throw new CommerceError("O frete automático ainda não foi configurado para produção. Contate a loja.", 409);
  try {
    return await carrierDelivery(connection, connection.postal_code ?? "", postalCode, lines, products,
      items => estimatePackagingWithClient(getPool(), tenantId, { items }), declaredValueCents);
  } catch (error) {
    console.warn("Commerce carrier unavailable.", { tenantId, status: error instanceof CommerceError ? error.status : 500 });
    throw new CommerceError("Não foi possível consultar o frete automático. Tente novamente, escolha outra opção ou contate a loja.", 409);
  }
}
