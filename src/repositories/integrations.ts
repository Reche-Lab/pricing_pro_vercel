import { decryptTenantSecret } from "@/lib/crypto/secrets";
import { withTenantContext } from "@/lib/db/client";

export type IntegrationConnectionRow = {
  id: string;
  provider: string;
  status: "active" | "disabled" | "error";
  settings: Record<string, unknown>;
  credentials_encrypted: string | null;
};

export async function getIntegrationConnection(
  userId: string,
  tenantId: string,
  provider: string
): Promise<IntegrationConnectionRow | null> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<IntegrationConnectionRow>(
      `
        select id, provider, status, settings, credentials_encrypted
        from integration_connections
        where tenant_id = $1 and provider = $2
        limit 1
      `,
      [tenantId, provider]
    );

    return result.rows[0] ?? null;
  });
}

export function decryptIntegrationCredentials<T>(connection: IntegrationConnectionRow): T {
  if (!connection.credentials_encrypted) {
    throw new Error(`Integration ${connection.provider} has no encrypted credentials.`);
  }

  return decryptTenantSecret<T>(connection.credentials_encrypted);
}

export async function logIntegrationEvent(
  userId: string,
  tenantId: string,
  input: {
    provider: string;
    operation: string;
    status: "success" | "error" | "pending";
    externalId?: string | null;
    message?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query(
      `
        insert into integration_logs (
          tenant_id,
          provider,
          operation,
          status,
          external_id,
          message,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        tenantId,
        input.provider,
        input.operation,
        input.status,
        input.externalId ?? null,
        input.message ?? null,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  });
}
