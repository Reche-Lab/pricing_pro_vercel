import { getPool } from "@/lib/db/client";
import type { CommerceLaunchReadiness } from "@/domain/commerce/publication";
import { isProductionCommerceCarrier } from "@/domain/commerce/carrier-settings";

export async function commerceLaunchReadiness(tenantId: string): Promise<CommerceLaunchReadiness> {
  const result = await getPool().query<{
    postal_code: string | null; carrier_status: string | null; carrier_credentials: boolean;
    has_boxes: boolean; payment_ready: boolean; carrier_settings: Record<string, unknown> | null;
  }>(`select t.postal_code,i.status as carrier_status,i.settings as carrier_settings,i.credentials_encrypted is not null as carrier_credentials,
    exists(select 1 from packaging_boxes b where b.tenant_id=t.id and b.active and b.height_cm>0 and b.width_cm>0 and b.length_cm>0) as has_boxes,
    coalesce(case when p.payment_environment='test' then p.mp_enabled and p.transparent_enabled and p.test_encrypted_credentials is not null and length(p.test_public_key)>0
      else (p.mp_enabled and p.encrypted_credentials is not null) or (p.manual_enabled and length(trim(p.manual_instructions))>0) end,false) as payment_ready
    from tenants t left join integration_connections i on i.tenant_id=t.id and i.provider='melhor_envio'
    left join commerce_payment_connections p on p.tenant_id=t.id where t.id=$1`, [tenantId]);
  const row = result.rows[0];
  const originReady = /^\d{8}$/.test(row?.postal_code?.replace(/\D/g, "") ?? "") && row?.postal_code?.replace(/\D/g, "") !== "00000000";
  const productionReady = isProductionCommerceCarrier(row?.carrier_settings ?? {});
  const carrierMessage = row?.carrier_status !== "active" || !row.carrier_credentials
    ? "Conecte o Melhor Envio em Configurações > Melhor Envio."
    : !productionReady ? "Configure o Melhor Envio no ambiente de produção antes de publicar a loja. Sandbox fica disponível apenas na prévia."
    : !originReady ? "Cadastre o CEP de origem em Configurações > Geral > Dados do tenant e remetente."
    : !row.has_boxes ? "Cadastre uma embalagem ativa em Embalagens e confira as dimensões e pesos dos produtos." : "Melhor Envio conectado, com CEP de origem e embalagem cadastrados.";
  return {
    carrierReady: Boolean(row?.carrier_status === "active" && row.carrier_credentials && productionReady && originReady && row.has_boxes),
    carrierMessage, paymentReady: Boolean(row?.payment_ready),
    emailReady: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    httpsReady: Boolean(process.env.APP_URL?.startsWith("https://")),
  };
}
