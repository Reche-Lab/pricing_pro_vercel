import { decryptTenantSecret, encryptTenantSecret } from "@/lib/crypto/secrets";
import { getPool, withTenantContext } from "@/lib/db/client";
import type pg from "pg";

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

export async function upsertIntegrationConnection(
  userId: string,
  tenantId: string,
  input: {
    provider: string;
    status?: "active" | "disabled" | "error";
    settings: Record<string, unknown>;
    credentials: Record<string, unknown>;
  }
): Promise<IntegrationConnectionRow> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<IntegrationConnectionRow>(
      `
        insert into integration_connections (
          tenant_id,
          provider,
          status,
          settings,
          credentials_encrypted
        )
        values ($1, $2, $3, $4, $5)
        on conflict (tenant_id, provider) do update
          set status = excluded.status,
              settings = excluded.settings,
              credentials_encrypted = excluded.credentials_encrypted,
              updated_at = now()
        returning id, provider, status, settings, credentials_encrypted
      `,
      [
        tenantId,
        input.provider,
        input.status ?? "active",
        JSON.stringify(input.settings),
        encryptTenantSecret(input.credentials)
      ]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'integrations.upsert', 'integration_connection', $3, $4)
      `,
      [tenantId, userId, result.rows[0].id, JSON.stringify({ provider: input.provider })]
    );

    return result.rows[0];
  });
}

export async function updateIntegrationCredentials(
  userId: string,
  tenantId: string,
  input: {
    provider: string;
    credentials: Record<string, unknown>;
    settings?: Record<string, unknown>;
    status?: "active" | "disabled" | "error";
  }
): Promise<IntegrationConnectionRow> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<IntegrationConnectionRow>(
      `
        update integration_connections
        set credentials_encrypted = $3,
            settings = coalesce($4::jsonb, settings),
            status = coalesce($5, status),
            updated_at = now()
        where tenant_id = $1 and provider = $2
        returning id, provider, status, settings, credentials_encrypted
      `,
      [
        tenantId,
        input.provider,
        encryptTenantSecret(input.credentials),
        input.settings === undefined ? null : JSON.stringify(input.settings),
        input.status ?? null
      ]
    );

    if (!result.rows[0]) throw new Error(`Integration ${input.provider} not found.`);

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'integrations.credentials_update', 'integration_connection', $3, $4)
      `,
      [tenantId, userId, result.rows[0].id, JSON.stringify({ provider: input.provider })]
    );

    return result.rows[0];
  });
}

export async function createOAuthState(
  userId: string,
  tenantId: string,
  input: {
    provider: string;
    state: string;
    redirectPath?: string | null;
    ttlMinutes?: number;
  }
) {
  return withTenantContext(userId, tenantId, async (client) => {
    const ttlMinutes = Math.max(1, Math.min(30, input.ttlMinutes ?? 10));
    await client.query(
      `
        insert into oauth_states (
          tenant_id,
          user_id,
          provider,
          state,
          redirect_path,
          expires_at
        )
        values ($1, $2, $3, $4, $5, now() + ($6::text || ' minutes')::interval)
      `,
      [tenantId, userId, input.provider, input.state, input.redirectPath ?? null, ttlMinutes]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, metadata)
        values ($1, $2, 'integrations.oauth_state_create', 'oauth_state', $3)
      `,
      [
        tenantId,
        userId,
        JSON.stringify({
          provider: input.provider,
          redirect_path: input.redirectPath ?? null,
          ttl_minutes: ttlMinutes
        })
      ]
    );
  });
}

export async function consumeOAuthState(state: string, provider: string) {
  return withTenantContextless(async (client) => {
    const result = await client.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      provider: string;
      state: string;
      redirect_path: string | null;
    }>(
      "select id, tenant_id, user_id, provider, state, redirect_path from consume_oauth_state($1, $2)",
      [state, provider]
    );

    const oauthState = result.rows[0] ?? null;
    return oauthState;
  });
}

async function withTenantContextless<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await callback(client);
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
