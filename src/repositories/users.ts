import { query, withTenantContext } from "@/lib/db/client";

export type UserWithMembership = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  role_key: string;
};

export async function findUserWithDefaultMembership(email: string): Promise<UserWithMembership | null> {
  const rows = await query<UserWithMembership>(
    `
      select
        u.id,
        u.email,
        u.name,
        u.password_hash,
        t.id as tenant_id,
        t.name as tenant_name,
        t.slug as tenant_slug,
        r.key as role_key
      from app_users u
      join tenant_members tm on tm.user_id = u.id and tm.status = 'active'
      join tenants t on t.id = tm.tenant_id and t.status = 'active'
      join roles r on r.id = tm.role_id
      where lower(u.email) = lower($1)
        and u.status = 'active'
      order by tm.created_at asc
      limit 1
    `,
    [email]
  );

  return rows[0] ?? null;
}

export async function getSessionProfile(userId: string, tenantId: string) {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{
      user_id: string;
      email: string;
      name: string;
      tenant_id: string;
      tenant_name: string;
      tenant_slug: string;
      role: string;
    }>(
      `
        select
          u.id as user_id,
          u.email,
          u.name,
          t.id as tenant_id,
          t.name as tenant_name,
          t.slug as tenant_slug,
          r.key as role
        from app_users u
        join tenant_members tm on tm.user_id = u.id
        join tenants t on t.id = tm.tenant_id
        join roles r on r.id = tm.role_id
        where u.id = $1 and t.id = $2 and tm.status = 'active'
        limit 1
      `,
      [userId, tenantId]
    );

    return result.rows[0] ?? null;
  });
}
