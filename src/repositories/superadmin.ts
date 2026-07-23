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
  plan_id: string | null;
  plan_key: string | null;
  plan_name: string | null;
  plan_amount_cents: number | null;
  discount_percent: number | null;
  discount_expires_at: string | null;
  member_count: number;
  members: Array<{
    membership_id: string;
    user_id: string;
    name: string | null;
    email: string;
    role_key: string | null;
    role_name: string | null;
    member_status: string;
    is_super_admin: boolean;
    joined_at: string | null;
  }>;
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
        owner.owner_name,
        owner.owner_email,
        t.billing_status,
        ts.status as subscription_status,
        ts.current_period_end,
        p.id as plan_id,
        p.key as plan_key,
        p.name as plan_name,
        p.amount_cents as plan_amount_cents,
        ts.discount_percent,
        ts.discount_expires_at,
        coalesce(members.member_count, 0)::int as member_count,
        coalesce(members.members, '[]'::jsonb) as members,
        t.created_at
      from tenants t
      left join lateral (
        select
          u.name as owner_name,
          u.email::text as owner_email
        from tenant_members tm
        join roles r on r.id = tm.role_id and r.key = 'owner'
        join app_users u on u.id = tm.user_id
        where tm.tenant_id = t.id
          and tm.status = 'active'
        order by tm.created_at asc
        limit 1
      ) owner on true
      left join lateral (
        select
          count(tm.id)::int as member_count,
          jsonb_agg(
            jsonb_build_object(
              'membership_id', tm.id,
              'user_id', u.id,
              'name', u.name,
              'email', u.email::text,
              'role_key', r.key,
              'role_name', r.name,
              'member_status', tm.status,
              'is_super_admin', u.is_super_admin,
              'joined_at', tm.joined_at
            )
            order by
              case r.key when 'owner' then 0 when 'admin' then 1 when 'sales' then 2 else 3 end,
              u.name
          ) as members
        from tenant_members tm
        join app_users u on u.id = tm.user_id
        left join roles r on r.id = tm.role_id
        where tm.tenant_id = t.id
      ) members on true
      left join tenant_subscriptions ts on ts.tenant_id = t.id
      left join billing_plans p on p.id = ts.plan_id
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
