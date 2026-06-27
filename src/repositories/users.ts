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

export type TenantMemberRow = {
  membership_id: string;
  user_id: string;
  email: string;
  name: string;
  user_status: string;
  member_status: string;
  role_key: string;
  role_name: string;
  joined_at: string | null;
  created_at: string;
};

export type RoleRow = {
  id: string;
  key: string;
  name: string;
};

export type UserInviteInfo = {
  invite_id: string;
  tenant_id: string;
  tenant_name: string;
  user_id: string;
  user_name: string;
  user_email: string;
  member_status: string;
  role_key: string;
  expires_at: string;
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

export async function userHasPermission(userId: string, tenantId: string, permission: string): Promise<boolean> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ allowed: boolean }>(
      `
        select exists (
          select 1
          from tenant_members tm
          join roles r on r.id = tm.role_id
          join role_permissions rp on rp.role_id = r.id
          join permissions p on p.id = rp.permission_id
          where tm.tenant_id = $1
            and tm.user_id = $2
            and tm.status = 'active'
            and p.key = $3
        ) as allowed
      `,
      [tenantId, userId, permission]
    );

    return Boolean(result.rows[0]?.allowed);
  });
}

export async function listTenantMembers(userId: string, tenantId: string): Promise<TenantMemberRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<TenantMemberRow>(
      `
        select
          tm.id as membership_id,
          u.id as user_id,
          u.email::text as email,
          u.name,
          u.status as user_status,
          tm.status as member_status,
          r.key as role_key,
          r.name as role_name,
          tm.joined_at,
          tm.created_at
        from tenant_members tm
        join app_users u on u.id = tm.user_id
        join roles r on r.id = tm.role_id
        where tm.tenant_id = $1
        order by
          case r.key when 'owner' then 1 when 'admin' then 2 when 'manager' then 3 when 'sales' then 4 else 5 end,
          u.name asc
      `,
      [tenantId]
    );

    return result.rows;
  });
}

export async function listRoles(userId: string, tenantId: string): Promise<RoleRow[]> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<RoleRow>(
      `
        select id, key, name
        from roles
        where key in ('owner', 'admin', 'manager', 'sales', 'viewer', 'support')
        order by case key
          when 'owner' then 1
          when 'admin' then 2
          when 'manager' then 3
          when 'sales' then 4
          when 'viewer' then 5
          else 6
        end
      `
    );

    return result.rows;
  });
}

export async function createOrInviteTenantMember(
  actorUserId: string,
  tenantId: string,
  input: {
    email: string;
    name: string;
    passwordHash: string;
    roleKey: string;
    memberStatus?: "active" | "invited";
  }
): Promise<TenantMemberRow> {
  return withTenantContext(actorUserId, tenantId, async (client) => {
    const role = await client.query<{ id: string }>("select id from roles where key = $1 limit 1", [input.roleKey]);
    if (!role.rows[0]) throw new Error("Role not found.");

    const user = await client.query<{ id: string }>(
      `
        insert into app_users (email, name, password_hash, status)
        values ($1, $2, $3, $4)
        on conflict (email) do update
          set name = excluded.name,
              password_hash = case
                when excluded.status = 'active' then excluded.password_hash
                else app_users.password_hash
              end,
              status = case
                when app_users.status = 'blocked' then app_users.status
                when excluded.status = 'active' then 'active'
                when app_users.status = 'active' then 'active'
                else 'invited'
              end,
              updated_at = now()
        returning id
      `,
      [input.email, input.name, input.passwordHash, input.memberStatus === "invited" ? "invited" : "active"]
    );

    const membership = await client.query<{ id: string }>(
      `
        insert into tenant_members (
          tenant_id,
          user_id,
          role_id,
          status,
          invited_by,
          joined_at
        )
        values ($1, $2, $3, $4, $5, case when $4 = 'active' then now() else null end)
        on conflict (tenant_id, user_id) do update
          set role_id = excluded.role_id,
              status = excluded.status,
              invited_by = excluded.invited_by,
              joined_at = case when excluded.status = 'active' then coalesce(tenant_members.joined_at, now()) else tenant_members.joined_at end,
              updated_at = now()
        returning id
      `,
      [tenantId, user.rows[0].id, role.rows[0].id, input.memberStatus ?? "active", actorUserId]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'users.invite', 'tenant_member', $3, $4)
      `,
      [
        tenantId,
        actorUserId,
        membership.rows[0].id,
        JSON.stringify({ email: input.email, role: input.roleKey, status: input.memberStatus ?? "active" })
      ]
    );

    const result = await client.query<TenantMemberRow>(
      `
        select
          tm.id as membership_id,
          u.id as user_id,
          u.email::text as email,
          u.name,
          u.status as user_status,
          tm.status as member_status,
          r.key as role_key,
          r.name as role_name,
          tm.joined_at,
          tm.created_at
        from tenant_members tm
        join app_users u on u.id = tm.user_id
        join roles r on r.id = tm.role_id
        where tm.tenant_id = $1 and tm.id = $2
        limit 1
      `,
      [tenantId, membership.rows[0].id]
    );

    return result.rows[0];
  });
}

export async function createUserInvite(
  actorUserId: string,
  tenantId: string,
  input: {
    userId: string;
    membershipId: string;
    tokenHash: string;
    ttlDays?: number;
  }
): Promise<void> {
  return withTenantContext(actorUserId, tenantId, async (client) => {
    const ttlDays = Math.max(1, Math.min(30, input.ttlDays ?? 7));
    await client.query(
      `
        update user_invites
        set consumed_at = now()
        where tenant_id = $1
          and tenant_member_id = $2
          and consumed_at is null
      `,
      [tenantId, input.membershipId]
    );

    await client.query(
      `
        insert into user_invites (
          tenant_id,
          user_id,
          tenant_member_id,
          invited_by,
          token_hash,
          expires_at
        )
        values ($1, $2, $3, $4, $5, now() + ($6::text || ' days')::interval)
      `,
      [tenantId, input.userId, input.membershipId, actorUserId, input.tokenHash, ttlDays]
    );

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
        values ($1, $2, 'users.invite_token_create', 'tenant_member', $3)
      `,
      [tenantId, actorUserId, input.membershipId]
    );
  });
}

export async function getUserInviteInfo(tokenHash: string): Promise<UserInviteInfo | null> {
  const rows = await query<UserInviteInfo>(
    "select invite_id, tenant_id, tenant_name, user_id, user_name, user_email, member_status, role_key, expires_at from get_user_invite_by_token_hash($1)",
    [tokenHash]
  );

  return rows[0] ?? null;
}

export async function acceptUserInvite(tokenHash: string, passwordHash: string) {
  const rows = await query<{
    tenant_id: string;
    user_id: string;
    tenant_member_id: string;
  }>(
    "select tenant_id, user_id, tenant_member_id from consume_user_invite($1, $2)",
    [tokenHash, passwordHash]
  );

  return rows[0] ?? null;
}

export async function recordInviteAccepted(userId: string, tenantId: string, membershipId: string): Promise<void> {
  return withTenantContext(userId, tenantId, async (client) => {
    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
        values ($1, $2, 'users.invite_accept', 'tenant_member', $3)
      `,
      [tenantId, userId, membershipId]
    );
  });
}

export async function getTenantMember(
  userId: string,
  tenantId: string,
  membershipId: string
): Promise<TenantMemberRow | null> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<TenantMemberRow>(
      `
        select
          tm.id as membership_id,
          u.id as user_id,
          u.email::text as email,
          u.name,
          u.status as user_status,
          tm.status as member_status,
          r.key as role_key,
          r.name as role_name,
          tm.joined_at,
          tm.created_at
        from tenant_members tm
        join app_users u on u.id = tm.user_id
        join roles r on r.id = tm.role_id
        where tm.tenant_id = $1 and tm.id = $2
        limit 1
      `,
      [tenantId, membershipId]
    );

    return result.rows[0] ?? null;
  });
}

export async function updateTenantMember(
  actorUserId: string,
  tenantId: string,
  input: {
    membershipId: string;
    roleKey?: string;
    status?: "active" | "invited" | "blocked";
  }
): Promise<TenantMemberRow> {
  return withTenantContext(actorUserId, tenantId, async (client) => {
    let roleId: string | null = null;
    if (input.roleKey) {
      const role = await client.query<{ id: string }>("select id from roles where key = $1 limit 1", [input.roleKey]);
      if (!role.rows[0]) throw new Error("Role not found.");
      roleId = role.rows[0].id;
    }

    const updated = await client.query<{ id: string }>(
      `
        update tenant_members
        set role_id = coalesce($3, role_id),
            status = coalesce($4, status),
            joined_at = case
              when $4 = 'active' then coalesce(joined_at, now())
              else joined_at
            end,
            updated_at = now()
        where tenant_id = $1 and id = $2
        returning id
      `,
      [tenantId, input.membershipId, roleId, input.status ?? null]
    );

    if (!updated.rows[0]) throw new Error("Tenant member not found.");

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, $2, 'users.update_member', 'tenant_member', $3, $4)
      `,
      [tenantId, actorUserId, input.membershipId, JSON.stringify({ role: input.roleKey, status: input.status })]
    );

    const result = await client.query<TenantMemberRow>(
      `
        select
          tm.id as membership_id,
          u.id as user_id,
          u.email::text as email,
          u.name,
          u.status as user_status,
          tm.status as member_status,
          r.key as role_key,
          r.name as role_name,
          tm.joined_at,
          tm.created_at
        from tenant_members tm
        join app_users u on u.id = tm.user_id
        join roles r on r.id = tm.role_id
        where tm.tenant_id = $1 and tm.id = $2
        limit 1
      `,
      [tenantId, input.membershipId]
    );

    return result.rows[0];
  });
}

export async function removeTenantMember(actorUserId: string, tenantId: string, membershipId: string): Promise<void> {
  return withTenantContext(actorUserId, tenantId, async (client) => {
    const result = await client.query<{ id: string }>(
      "delete from tenant_members where tenant_id = $1 and id = $2 returning id",
      [tenantId, membershipId]
    );
    if (!result.rows[0]) throw new Error("Tenant member not found.");

    await client.query(
      `
        insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id)
        values ($1, $2, 'users.remove_member', 'tenant_member', $3)
      `,
      [tenantId, actorUserId, membershipId]
    );
  });
}

export async function countActiveOwners(userId: string, tenantId: string): Promise<number> {
  return withTenantContext(userId, tenantId, async (client) => {
    const result = await client.query<{ count: string }>(
      `
        select count(*)::text as count
        from tenant_members tm
        join roles r on r.id = tm.role_id
        where tm.tenant_id = $1
          and tm.status = 'active'
          and r.key = 'owner'
      `,
      [tenantId]
    );

    return Number(result.rows[0]?.count ?? 0);
  });
}
