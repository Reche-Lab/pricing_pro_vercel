import { getPool, query } from "@/lib/db/client";

export type SuperadminTenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner_name: string | null;
  owner_email: string | null;
  billing_status: string;
  subscription_status: string | null;
  current_period_end: string | null;
  discount_percent: number | null;
  discount_expires_at: string | null;
  member_count: number;
  created_at: string;
};

export type SuperadminUserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  is_super_admin: boolean;
  tenant_count: number;
  created_at: string;
};

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const rows = await query<{ allowed: boolean }>(
    "select exists (select 1 from app_users where id = $1 and status = 'active' and is_super_admin = true) as allowed",
    [userId]
  );

  return Boolean(rows[0]?.allowed);
}

export async function listSuperadminTenants(): Promise<SuperadminTenantRow[]> {
  const rows = await query<SuperadminTenantRow>(
    `
      select
        t.id,
        t.name,
        t.slug,
        t.status,
        owner.name as owner_name,
        owner.email::text as owner_email,
        t.billing_status,
        ts.status as subscription_status,
        ts.current_period_end,
        ts.discount_percent,
        ts.discount_expires_at,
        count(tm_all.id)::int as member_count,
        t.created_at
      from tenants t
      left join tenant_members tm_owner on tm_owner.tenant_id = t.id and tm_owner.status = 'active'
      left join roles r_owner on r_owner.id = tm_owner.role_id and r_owner.key = 'owner'
      left join app_users owner on owner.id = tm_owner.user_id
      left join tenant_members tm_all on tm_all.tenant_id = t.id
      left join tenant_subscriptions ts on ts.tenant_id = t.id
      group by t.id, owner.name, owner.email, ts.status, ts.current_period_end, ts.discount_percent, ts.discount_expires_at
      order by t.created_at desc
    `
  );

  return rows;
}

export async function listSuperadminUsers(): Promise<SuperadminUserRow[]> {
  const rows = await query<SuperadminUserRow>(
    `
      select
        u.id,
        u.name,
        u.email::text as email,
        u.status,
        u.is_super_admin,
        count(tm.id)::int as tenant_count,
        u.created_at
      from app_users u
      left join tenant_members tm on tm.user_id = u.id
      group by u.id
      order by u.created_at desc
      limit 100
    `
  );

  return rows;
}

export async function createTenantWithOwner(input: {
  actorUserId: string;
  tenantName: string;
  tenantSlug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPasswordHash: string;
}): Promise<{ tenantId: string; ownerUserId: string; membershipId: string; tenantName: string; roleName: string }> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [input.actorUserId]);
    const actor = await client.query<{ is_super_admin: boolean }>(
      "select is_super_admin from app_users where id = $1 and status = 'active'",
      [input.actorUserId]
    );
    if (!actor.rows[0]?.is_super_admin) throw new Error("Forbidden.");

    const tenant = await client.query<{ id: string; name: string }>(
      `
        insert into tenants (name, slug, status)
        values ($1, $2, 'active')
        returning id, name
      `,
      [input.tenantName, input.tenantSlug]
    );

    const ownerRole = await client.query<{ id: string; name: string }>("select id, name from roles where key = 'owner' limit 1");
    if (!ownerRole.rows[0]) throw new Error("Owner role not found.");

    const user = await client.query<{ id: string }>(
      `
        insert into app_users (email, name, password_hash, status)
        values ($1, $2, $3, 'invited')
        on conflict (email) do update
          set name = excluded.name,
              status = case when app_users.status = 'blocked' then app_users.status else app_users.status end,
              updated_at = now()
        returning id
      `,
      [input.ownerEmail, input.ownerName, input.ownerPasswordHash]
    );

    const member = await client.query<{ id: string }>(
      `
        insert into tenant_members (tenant_id, user_id, role_id, status, invited_by)
        values ($1, $2, $3, 'invited', $4)
        on conflict (tenant_id, user_id) do update
          set role_id = excluded.role_id,
              status = 'invited',
              invited_by = excluded.invited_by,
              updated_at = now()
        returning id
      `,
      [tenant.rows[0].id, user.rows[0].id, ownerRole.rows[0].id, input.actorUserId]
    );

    await client.query(
      `
        insert into tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
        select $1, p.id, 'trial', now(), now() + interval '14 days'
        from billing_plans p
        where p.key = 'starter_50'
        on conflict (tenant_id) do nothing
      `,
      [tenant.rows[0].id]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'superadmin.tenant_create', 'tenant', $1, $3)
      `,
      [
        tenant.rows[0].id,
        input.actorUserId,
        JSON.stringify({ ownerEmail: input.ownerEmail, ownerUserId: user.rows[0].id, membershipId: member.rows[0].id })
      ]
    );

    await client.query("commit");
    return {
      tenantId: tenant.rows[0].id,
      ownerUserId: user.rows[0].id,
      membershipId: member.rows[0].id,
      tenantName: tenant.rows[0].name,
      roleName: ownerRole.rows[0].name
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
