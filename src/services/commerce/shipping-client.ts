import { getPool } from "@/lib/db/client";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import { decryptIntegrationCredentials, type IntegrationConnectionRow } from "@/repositories/integrations";
import { CommerceError } from "@/domain/commerce/commerce";
import { isProductionCommerceCarrier } from "@/domain/commerce/carrier-settings";
import { melhorEnvioRequest, MelhorEnvioRequestError, refreshMelhorEnvioToken } from "@/services/melhor-envio/melhor-envio";
import type { MelhorEnvioCredentials, MelhorEnvioSettings } from "@/services/melhor-envio/types";

export async function commerceShippingConnection(tenantId: string) {
  const connection = (await getPool().query<IntegrationConnectionRow>("select id,provider,status,settings,credentials_encrypted from integration_connections where tenant_id=$1 and provider='melhor_envio'", [tenantId])).rows[0];
  if (!connection || connection.status === "disabled" || !connection.credentials_encrypted) throw new CommerceError("Conecte o Melhor Envio nas configurações para preparar a etiqueta.", 409);
  if (!isProductionCommerceCarrier(connection.settings)) throw new CommerceError("A etiqueta da loja exige uma conexão Melhor Envio de produção.", 409);
  return { ...connection, settings: { ...connection.settings, api_base_url: "https://www.melhorenvio.com.br/api/v2", app_base_url: "https://www.melhorenvio.com.br" } as MelhorEnvioSettings };
}
export async function commerceShippingRequest<T = unknown>(tenantId: string, path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new CommerceError("Caminho de envio inválido.", 400);
  const connection = await commerceShippingConnection(tenantId);
  let credentials = decryptIntegrationCredentials<MelhorEnvioCredentials>(connection);
  if (!credentials.accessToken) throw new MelhorEnvioRequestError("Reconecte o Melhor Envio.", 401, null);
  const send = (auth: MelhorEnvioCredentials) => melhorEnvioRequest<T>({ method, path, body, settings: connection.settings, credentials: auth, signal: AbortSignal.timeout(15000) });
  try { return await send(credentials); }
  catch (error) {
    // Retry only a definitive authentication rejection, never an ambiguous purchase timeout.
    if (!(error instanceof MelhorEnvioRequestError) || error.status !== 401 || !credentials.refreshToken) throw error;
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const latest = (await client.query<IntegrationConnectionRow>("select id,provider,status,settings,credentials_encrypted from integration_connections where tenant_id=$1 and provider='melhor_envio' for update", [tenantId])).rows[0];
      if (!latest || latest.status === "disabled") throw new Error("Connection disabled");
      const next = decryptIntegrationCredentials<MelhorEnvioCredentials>(latest);
      if (next.accessToken === credentials.accessToken) {
        const token = await refreshMelhorEnvioToken(connection.settings, next, AbortSignal.timeout(10000));
        next.accessToken = token.access_token;
        next.refreshToken = token.refresh_token || next.refreshToken;
        await client.query("update integration_connections set credentials_encrypted=$2,status='active',updated_at=now() where tenant_id=$1 and provider='melhor_envio'", [tenantId, encryptTenantSecret(next)]);
      }
      credentials = next;
      await client.query("commit");
    } catch {
      await client.query("rollback");
      throw new MelhorEnvioRequestError("Não foi possível renovar o acesso. Reconecte o Melhor Envio.", 401, null);
    } finally { client.release(); }
    return send(credentials);
  }
}
