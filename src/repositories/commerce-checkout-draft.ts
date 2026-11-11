import { getPool } from "@/lib/db/client";
import { encryptTenantSecret, decryptTenantSecret } from "@/lib/crypto/secrets";
import { checkoutDraftSchema, type CheckoutDraft } from "@/domain/commerce/checkout-draft";
import { CommerceError } from "@/domain/commerce/commerce";
import type { BuyerSession } from "./commerce";

export async function readCheckoutDraft(tenantId: string, session: BuyerSession) {
  if (!session.customer_id) throw new CommerceError("Entre na sua conta.", 401);
  const result = await getPool().query<{ payload_encrypted: string; version: number }>(
    "select payload_encrypted,version from commerce_checkout_drafts where tenant_id=$1 and session_id=$2 and customer_id=$3 and expires_at>now()",
    [tenantId, session.id, session.customer_id]);
  const row = result.rows[0];
  return row ? { draft: checkoutDraftSchema.parse(decryptTenantSecret(row.payload_encrypted)), version: row.version } : { draft: null, version: 0 };
}
export async function saveCheckoutDraft(tenantId: string, session: BuyerSession, draft: CheckoutDraft, version: number) {
  if (!session.customer_id) throw new CommerceError("Entre na sua conta.", 401);
  const payload = encryptTenantSecret(checkoutDraftSchema.parse(draft));
  const result = await getPool().query<{ version: number }>(`insert into commerce_checkout_drafts(tenant_id,session_id,customer_id,payload_encrypted)
    select $1,$2,$3,$4 from commerce_sessions s where s.tenant_id=$1 and s.id=$2 and s.customer_id=$3 and s.expires_at>now() and $5::integer=0
    on conflict(tenant_id,session_id,customer_id) do nothing returning version`, [tenantId, session.id, session.customer_id, payload, version]);
  if (result.rows[0]) return result.rows[0];
  const updated = await getPool().query<{ version: number }>(`update commerce_checkout_drafts d set payload_encrypted=$4,version=d.version+1,updated_at=now(),expires_at=now()+interval '14 days'
    where d.tenant_id=$1 and d.session_id=$2 and d.customer_id=$3 and (d.version=$5::integer or (d.expires_at<=now() and $5::integer=0))
      and exists(select 1 from commerce_sessions s where s.tenant_id=d.tenant_id and s.id=d.session_id and s.customer_id=d.customer_id and s.expires_at>now()) returning d.version`,
    [tenantId, session.id, session.customer_id, payload, version]);
  if (!updated.rows[0]) throw new CommerceError("Os dados foram alterados em outra aba. Reabra esta etapa antes de continuar.", 409);
  // Retention cleanup is scoped to this tenant and does not touch active drafts.
  await getPool().query("delete from commerce_checkout_drafts where tenant_id=$1 and expires_at<now()", [tenantId]);
  return updated.rows[0];
}
