import { getPool } from "@/lib/db/client";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import { decryptIntegrationCredentials, type IntegrationConnectionRow } from "@/repositories/integrations";
import { OlistRequestError, olistRequest, refreshOlistToken } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";
import { CommerceError } from "@/domain/commerce/commerce";
import { OLIST_API_V3_BASE_URL } from "@/services/olist/defaults";
import { isOlistReconnectRequired } from "@/lib/olist/oauth-errors";

export async function commerceOlistConnection(tenantId: string) {
  const connection = (await getPool().query<IntegrationConnectionRow>("select id,provider,status,settings,credentials_encrypted from integration_connections where tenant_id=$1 and provider='olist'", [tenantId])).rows[0];
  if (!connection || connection.status === "disabled" || !connection.credentials_encrypted)
    throw new CommerceError("Cadastre e conecte o Olist nas Configurações antes de sincronizar a loja.", 409);
  const settings = connection.settings as OlistSettings;
  // Background jobs may only call the official ERP host, never an arbitrary tenant URL.
  const url = new URL(settings.api_base_url || OLIST_API_V3_BASE_URL);
  if (url.origin !== "https://api.tiny.com.br" || url.pathname.replace(/\/$/, "") !== "/public-api/v3" || url.search || url.hash || url.username || url.password)
    throw new CommerceError("A automação da loja requer a URL oficial da API v3 Olist.", 409);
  return { ...connection, settings: { ...settings, api_base_url: OLIST_API_V3_BASE_URL } };
}

export async function commerceOlistRequest(tenantId: string, path: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new CommerceError("Caminho Olist inválido.", 409);
  const connection = await commerceOlistConnection(tenantId);
  const credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  if (!credentials.accessToken && !credentials.apiToken) throw new OlistRequestError("Olist accessToken is required.", 401, { reconnectRequired: true });
  const deadline = () => signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
  const send = (auth: OlistCredentials) => olistRequest<Record<string, unknown>>({ settings: connection.settings, credentials: auth, path, method, body, signal: deadline() });
  try { return await send(credentials); }
  catch (error) {
    if (!(error instanceof OlistRequestError) || error.status !== 401 || !credentials.refreshToken) throw error;
    const client = await getPool().connect();
    let refreshed: OlistCredentials;
    try {
      await client.query("begin");
      const latest = (await client.query<IntegrationConnectionRow>("select id,provider,status,settings,credentials_encrypted from integration_connections where tenant_id=$1 and provider='olist' for update", [tenantId])).rows[0];
      if (!latest || latest.status === "disabled") throw new CommerceError("A conexão Olist foi desativada.", 409);
      refreshed = decryptIntegrationCredentials<OlistCredentials>(latest);
      if (refreshed.accessToken === credentials.accessToken) {
        const oauthSettings = latest.settings as OlistSettings;
        // Do not send client secrets to configurable external token endpoints.
        if (oauthSettings.app_base_url && new URL(oauthSettings.app_base_url).origin !== "https://accounts.tiny.com.br") throw new CommerceError("Revise o endereço OAuth oficial do Olist.", 409);
        const token = await refreshOlistToken({ ...oauthSettings, app_base_url: "https://accounts.tiny.com.br", token_path: "/realms/tiny/protocol/openid-connect/token" }, refreshed, deadline());
        refreshed = { ...refreshed, accessToken: token.access_token, refreshToken: token.refresh_token || refreshed.refreshToken };
        await client.query("update integration_connections set credentials_encrypted=$2,status='active',updated_at=now() where tenant_id=$1 and provider='olist'", [tenantId, encryptTenantSecret(refreshed)]);
      }
      await client.query("commit");
    } catch (refreshError) {
      await client.query("rollback");
      if (isOlistReconnectRequired(refreshError instanceof Error ? refreshError.message : refreshError)) throw new OlistRequestError("Reconecte o Olist: invalid_grant.", 401, { reconnectRequired: true });
      throw new OlistRequestError("Não foi possível renovar o acesso Olist. Reconecte a integração.", 401, { reconnectRequired: true });
    }
    finally { client.release(); }
    return send(refreshed);
  }
}
