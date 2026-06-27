import { withTenantContext } from "@/lib/db/client";

export type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
  actor_email: string | null;
};

export type IntegrationLogRow = {
  id: string;
  provider: string;
  operation: string;
  status: string;
  external_id: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export async function listAuditLogs(userId: string, tenantId: string, limit = 100): Promise<AuditLogRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<AuditLogRow>(
      `
        select
          al.id,
          al.action,
          al.entity_type,
          al.entity_id,
          al.metadata,
          al.created_at,
          u.name as actor_name,
          u.email::text as actor_email
        from audit_logs al
        left join app_users u on u.id = al.actor_user_id
        where al.tenant_id = $1
        order by al.created_at desc
        limit $2
      `,
      [tenantId, limit]
    );

    return result.rows;
  });
}

export async function listIntegrationLogs(
  userId: string,
  tenantId: string,
  limit = 100
): Promise<IntegrationLogRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<IntegrationLogRow>(
      `
        select
          id,
          provider,
          operation,
          status,
          external_id,
          message,
          metadata,
          created_at
        from integration_logs
        where tenant_id = $1
        order by created_at desc
        limit $2
      `,
      [tenantId, limit]
    );

    return result.rows;
  });
}
