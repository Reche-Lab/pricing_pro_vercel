import { getPool, query } from "@/lib/db/client";

export type AccessRequestStatus =
  | "pending_email"
  | "pending_review"
  | "needs_information"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

export type AccessRequestRow = {
  id: string;
  full_name: string;
  email: string;
  whatsapp: string;
  company_name: string;
  business_segment: string | null;
  intended_use: string | null;
  status: AccessRequestStatus;
  email_verified_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  applicant_response: string | null;
  rejection_reason: string | null;
  approved_tenant_id: string | null;
  approved_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export class AccessRequestRateLimitError extends Error {}

export async function createOrRefreshAccessRequest(input: {
  fullName: string;
  email: string;
  whatsapp: string;
  companyName: string;
  businessSegment?: string | null;
  intendedUse?: string | null;
  verificationTokenHash: string;
  publicTokenHash: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ kind: "request"; requestId: string } | { kind: "existing_user" }> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const existingUser = await client.query<{ exists: boolean }>(
      "select exists(select 1 from app_users where lower(email::text) = lower($1)) as exists",
      [input.email]
    );
    if (existingUser.rows[0]?.exists) {
      await client.query("commit");
      return { kind: "existing_user" };
    }

    if (input.ipAddress) {
      const attempts = await client.query<{ count: string }>(
        `select count(*)::text as count
         from tenant_access_requests
         where ip_address = $1 and created_at > now() - interval '1 hour'`,
        [input.ipAddress]
      );
      if (Number(attempts.rows[0]?.count ?? 0) >= 5) throw new AccessRequestRateLimitError("rate_limit");
    }

    await client.query(
      `update tenant_access_requests
       set status = 'expired', updated_at = now()
       where email = $1 and status = 'pending_email' and verification_expires_at <= now()`,
      [input.email]
    );

    const existing = await client.query<{ id: string }>(
      `select id
       from tenant_access_requests
       where email = $1 and status in ('pending_email', 'pending_review', 'needs_information')
       limit 1
       for update`,
      [input.email]
    );

    let requestId: string;
    if (existing.rows[0]) {
      requestId = existing.rows[0].id;
      await client.query(
        `update tenant_access_requests
         set full_name = $2,
             whatsapp = $3,
             company_name = $4,
             business_segment = $5,
             intended_use = $6,
             status = 'pending_email',
             verification_token_hash = $7,
             verification_expires_at = now() + interval '24 hours',
             email_verified_at = null,
             public_token_hash = $8,
             ip_address = $9,
             user_agent = $10,
             updated_at = now()
         where id = $1`,
        [
          requestId,
          input.fullName,
          input.whatsapp,
          input.companyName,
          input.businessSegment ?? null,
          input.intendedUse ?? null,
          input.verificationTokenHash,
          input.publicTokenHash,
          input.ipAddress ?? null,
          input.userAgent ?? null
        ]
      );
    } else {
      const inserted = await client.query<{ id: string }>(
        `insert into tenant_access_requests (
           full_name, email, whatsapp, company_name, business_segment, intended_use,
           verification_token_hash, verification_expires_at, public_token_hash, ip_address, user_agent
         ) values ($1, $2, $3, $4, $5, $6, $7, now() + interval '24 hours', $8, $9, $10)
         returning id`,
        [
          input.fullName,
          input.email,
          input.whatsapp,
          input.companyName,
          input.businessSegment ?? null,
          input.intendedUse ?? null,
          input.verificationTokenHash,
          input.publicTokenHash,
          input.ipAddress ?? null,
          input.userAgent ?? null
        ]
      );
      requestId = inserted.rows[0].id;
    }

    await client.query(
      `insert into tenant_access_request_events (request_id, event_type, message)
       values ($1, 'request.submitted', 'Solicitação enviada e aguardando confirmação do e-mail.')`,
      [requestId]
    );
    await client.query("commit");
    return { kind: "request", requestId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyAccessRequestEmail(tokenHash: string): Promise<AccessRequestRow | null> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await client.query<AccessRequestRow>(
      `update tenant_access_requests
       set status = 'pending_review',
           email_verified_at = coalesce(email_verified_at, now()),
           verification_token_hash = null,
           verification_expires_at = null,
           updated_at = now()
       where verification_token_hash = $1
         and verification_expires_at > now()
         and status = 'pending_email'
       returning id, full_name, email::text, whatsapp, company_name, business_segment, intended_use,
         status, email_verified_at, reviewed_at, review_notes, applicant_response, rejection_reason,
         approved_tenant_id, approved_user_id, created_at, updated_at`,
      [tokenHash]
    );
    if (!result.rows[0]) {
      await client.query("rollback");
      return null;
    }
    await client.query(
      `insert into tenant_access_request_events (request_id, event_type, message)
       values ($1, 'request.email_verified', 'E-mail confirmado; solicitação enviada para análise.')`,
      [result.rows[0].id]
    );
    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAccessRequestByPublicToken(tokenHash: string): Promise<AccessRequestRow | null> {
  await expirePendingEmailRequests();
  const rows = await query<AccessRequestRow>(
    `select id, full_name, email::text, whatsapp, company_name, business_segment, intended_use,
       status, email_verified_at, reviewed_at, review_notes, applicant_response, rejection_reason,
       approved_tenant_id, approved_user_id, created_at, updated_at
     from tenant_access_requests
     where public_token_hash = $1
     limit 1`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function listAccessRequestsForSuperadmin(): Promise<AccessRequestRow[]> {
  await expirePendingEmailRequests();
  return query<AccessRequestRow>(
    `select id, full_name, email::text, whatsapp, company_name, business_segment, intended_use,
       status, email_verified_at, reviewed_at, review_notes, applicant_response, rejection_reason,
       approved_tenant_id, approved_user_id, created_at, updated_at
     from tenant_access_requests
     order by
       case status when 'pending_review' then 0 when 'needs_information' then 1 when 'pending_email' then 2 else 3 end,
       created_at desc
     limit 200`
  );
}

async function expirePendingEmailRequests(): Promise<void> {
  await query(
    `update tenant_access_requests
     set status = 'expired', updated_at = now()
     where status = 'pending_email' and verification_expires_at <= now()`
  );
}

export async function reviewAccessRequest(input: {
  actorUserId: string;
  requestId: string;
  status: "needs_information" | "rejected";
  message: string;
  publicTokenHash: string;
}): Promise<AccessRequestRow> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await assertSuperadmin(client, input.actorUserId);
    const result = await client.query<AccessRequestRow>(
      `update tenant_access_requests
       set status = $3,
           reviewed_by = $2,
           reviewed_at = now(),
           review_notes = case when $3 = 'needs_information' then $4 else review_notes end,
           rejection_reason = case when $3 = 'rejected' then $4 else rejection_reason end,
           public_token_hash = $5,
           updated_at = now()
       where id = $1 and status in ('pending_review', 'needs_information')
       returning id, full_name, email::text, whatsapp, company_name, business_segment, intended_use,
         status, email_verified_at, reviewed_at, review_notes, applicant_response, rejection_reason,
         approved_tenant_id, approved_user_id, created_at, updated_at`,
      [input.requestId, input.actorUserId, input.status, input.message, input.publicTokenHash]
    );
    if (!result.rows[0]) throw new Error("Access request not found or cannot be reviewed.");
    await client.query(
      `insert into tenant_access_request_events (request_id, actor_user_id, event_type, message)
       values ($1, $2, $3, $4)`,
      [input.requestId, input.actorUserId, `request.${input.status}`, input.message]
    );
    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function approveAccessRequest(input: {
  actorUserId: string;
  requestId: string;
  tenantSlug: string;
  planId: string;
  trialDays: number;
  artworkAiGenerationLimit: number;
  temporaryPasswordHash: string;
  inviteTokenHash: string;
}): Promise<{
  tenantId: string;
  tenantName: string;
  ownerUserId: string;
  membershipId: string;
  ownerName: string;
  ownerEmail: string;
  roleName: string;
}> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await assertSuperadmin(client, input.actorUserId);
    const request = await client.query<AccessRequestRow>(
      `select id, full_name, email::text, whatsapp, company_name, business_segment, intended_use,
         status, email_verified_at, reviewed_at, review_notes, applicant_response, rejection_reason,
         approved_tenant_id, approved_user_id, created_at, updated_at
       from tenant_access_requests where id = $1 for update`,
      [input.requestId]
    );
    const accessRequest = request.rows[0];
    if (!accessRequest || !["pending_review", "needs_information"].includes(accessRequest.status) || !accessRequest.email_verified_at) {
      throw new Error("Access request is not ready for approval.");
    }

    const plan = await client.query<{ id: string }>("select id from billing_plans where id = $1 and active = true", [input.planId]);
    if (!plan.rows[0]) throw new Error("Billing plan not found or inactive.");

    const tenant = await client.query<{ id: string; name: string }>(
      `insert into tenants (
         name, slug, status, company_phone, billing_status, trial_ends_at,
         requires_legal_acceptance, artwork_ai_generation_limit
       ) values ($1, $2, 'active', $3, 'trial', now() + ($4::text || ' days')::interval, true, $5)
       returning id, name`,
      [accessRequest.company_name, input.tenantSlug, accessRequest.whatsapp, input.trialDays, input.artworkAiGenerationLimit]
    );
    const ownerRole = await client.query<{ id: string; name: string }>("select id, name from roles where key = 'owner' limit 1");
    if (!ownerRole.rows[0]) throw new Error("Owner role not found.");
    const user = await client.query<{ id: string }>(
      `insert into app_users (email, name, password_hash, status)
       values ($1, $2, $3, 'invited') returning id`,
      [accessRequest.email, accessRequest.full_name, input.temporaryPasswordHash]
    );
    const member = await client.query<{ id: string }>(
      `insert into tenant_members (tenant_id, user_id, role_id, status, invited_by)
       values ($1, $2, $3, 'invited', $4) returning id`,
      [tenant.rows[0].id, user.rows[0].id, ownerRole.rows[0].id, input.actorUserId]
    );
    await client.query(
      `insert into user_invites (
         tenant_id, user_id, tenant_member_id, invited_by, token_hash, expires_at
       ) values ($1, $2, $3, $4, $5, now() + interval '7 days')`,
      [tenant.rows[0].id, user.rows[0].id, member.rows[0].id, input.actorUserId, input.inviteTokenHash]
    );
    await client.query(
      `insert into tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
       values ($1, $2, 'trial', now(), now() + ($3::text || ' days')::interval)`,
      [tenant.rows[0].id, input.planId, input.trialDays]
    );
    await client.query(
      `update tenant_access_requests
       set status = 'approved', reviewed_by = $2, reviewed_at = now(),
           approved_tenant_id = $3, approved_user_id = $4, updated_at = now()
       where id = $1`,
      [input.requestId, input.actorUserId, tenant.rows[0].id, user.rows[0].id]
    );
    await client.query(
      `insert into tenant_access_request_events (request_id, actor_user_id, event_type, message, metadata)
       values ($1, $2, 'request.approved', 'Solicitação aprovada e tenant provisionado.', $3)`,
      [input.requestId, input.actorUserId, JSON.stringify({ tenantId: tenant.rows[0].id, planId: input.planId, trialDays: input.trialDays })]
    );
    await client.query(
      `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'superadmin.access_request_approve', 'tenant', $1, $3)`,
      [tenant.rows[0].id, input.actorUserId, JSON.stringify({ requestId: input.requestId, ownerEmail: accessRequest.email })]
    );
    await client.query("commit");
    return {
      tenantId: tenant.rows[0].id,
      tenantName: tenant.rows[0].name,
      ownerUserId: user.rows[0].id,
      membershipId: member.rows[0].id,
      ownerName: accessRequest.full_name,
      ownerEmail: accessRequest.email,
      roleName: ownerRole.rows[0].name
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function submitAccessRequestAdditionalInfo(input: {
  publicTokenHash: string;
  message: string;
}): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await client.query<{ id: string }>(
      `update tenant_access_requests
       set applicant_response = $2,
           status = 'pending_review',
           updated_at = now()
       where public_token_hash = $1 and status = 'needs_information'
       returning id`,
      [input.publicTokenHash, input.message]
    );
    if (!result.rows[0]) {
      await client.query("rollback");
      return false;
    }
    await client.query(
      `insert into tenant_access_request_events (request_id, event_type, message)
       values ($1, 'request.additional_information_submitted', $2)`,
      [result.rows[0].id, input.message]
    );
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function assertSuperadmin(client: import("pg").PoolClient, userId: string) {
  const actor = await client.query<{ allowed: boolean }>(
    "select exists(select 1 from app_users where id = $1 and status = 'active' and is_super_admin = true) as allowed",
    [userId]
  );
  if (!actor.rows[0]?.allowed) throw new Error("Forbidden.");
}
