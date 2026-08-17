import { getPool, query } from "@/lib/db/client";
import { PRICING_PRO_PRODUCT_CODE } from "@/domain/legal/terms";

export type LegalTermRow = {
  id: string;
  product_code: string;
  version: string;
  locale: string;
  title: string;
  content_text: string;
  content_hash: string;
  published_at: string | null;
};

export async function getActiveLegalTerm(): Promise<LegalTermRow | null> {
  const rows = await query<LegalTermRow>(
    `select id, product_code, version, locale, title, content_text, content_hash, published_at
     from legal_terms
     where product_code = $1 and locale = 'pt-BR' and is_active = true
     order by published_at desc nulls last
     limit 1`,
    [PRICING_PRO_PRODUCT_CODE]
  );
  return rows[0] ?? null;
}

export async function getAcceptedActiveLegalTermVersion(userId: string, tenantId: string): Promise<string | null> {
  const rows = await query<{ term_version: string }>(
    `select a.term_version
     from legal_term_acceptances a
     join legal_terms t on t.id = a.term_id
     where a.tenant_id = $1
       and a.user_id = $2
       and a.product_code = $3
       and t.is_active = true
     order by a.accepted_at desc
     limit 1`,
    [tenantId, userId, PRICING_PRO_PRODUCT_CODE]
  );
  return rows[0]?.term_version ?? null;
}

export async function acceptLegalTerm(input: {
  userId: string;
  tenantId: string;
  termId: string;
  email: string;
  userName: string;
  role: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ acceptanceId: string; term: LegalTermRow; acceptedAt: string; tenantName: string }> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const term = await client.query<LegalTermRow>(
      `select id, product_code, version, locale, title, content_text, content_hash, published_at
       from legal_terms
       where id = $1 and product_code = $2 and is_active = true
       limit 1`,
      [input.termId, PRICING_PRO_PRODUCT_CODE]
    );
    if (!term.rows[0]) throw new Error("Active legal term not found.");
    const membership = await client.query<{ tenant_name: string }>(
      `select t.name as tenant_name
       from tenant_members tm
       join tenants t on t.id = tm.tenant_id
       where tm.tenant_id = $1 and tm.user_id = $2 and tm.status = 'active' and t.status = 'active'
       limit 1`,
      [input.tenantId, input.userId]
    );
    if (!membership.rows[0]) throw new Error("Active membership not found.");
    const acceptedAt = new Date().toISOString();
    const acceptance = await client.query<{ id: string; accepted_at: string }>(
      `with inserted as (
         insert into legal_term_acceptances (
           tenant_id, user_id, term_id, product_code, term_version, accepted_locale,
           accepted_at, ip_address, user_agent, email, user_name, role, content_hash, metadata
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         on conflict (tenant_id, user_id, product_code, term_version) do nothing
         returning id, accepted_at
       )
       select id, accepted_at from inserted
       union all
       select id, accepted_at
       from legal_term_acceptances
       where tenant_id = $1 and user_id = $2 and product_code = $4 and term_version = $5
       limit 1`,
      [
        input.tenantId,
        input.userId,
        term.rows[0].id,
        term.rows[0].product_code,
        term.rows[0].version,
        term.rows[0].locale,
        acceptedAt,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.email,
        input.userName,
        input.role,
        term.rows[0].content_hash,
        JSON.stringify({ source: "first_access_gate" })
      ]
    );
    await client.query(
      `insert into audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       values ($1, $2, 'legal.terms_accept', 'legal_term_acceptance', $3, $4)`,
      [input.tenantId, input.userId, acceptance.rows[0].id, JSON.stringify({ version: term.rows[0].version, contentHash: term.rows[0].content_hash })]
    );
    await client.query("commit");
    return {
      acceptanceId: acceptance.rows[0].id,
      term: term.rows[0],
      acceptedAt: acceptance.rows[0].accepted_at,
      tenantName: membership.rows[0].tenant_name
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function markLegalAcceptanceEmailSent(acceptanceId: string): Promise<void> {
  await query("update legal_term_acceptances set email_sent_at = now() where id = $1", [acceptanceId]);
}
