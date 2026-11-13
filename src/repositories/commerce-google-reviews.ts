import { getPool } from "@/lib/db/client";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import { commerceTransaction } from "./commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { googleReviewsSaveSchema, type GoogleReviewsInput, type GoogleReviewsSettings } from "@/domain/commerce/google-reviews";
export type GoogleReviewsConnection = { tenant_id: string; place_id: string; title: string; api_key_encrypted: string | null; daily_limit: number; enabled: boolean; revision: number; tested_revision: number | null; tested_at: string | null; used_today: number };
export async function loadGoogleReviews(tenantId: string): Promise<GoogleReviewsConnection | null> {
  try {
    return (await getPool().query<GoogleReviewsConnection>(`select c.*,c.tested_at::text,coalesce(u.request_count,0)::int as used_today from commerce_google_review_connections c
      left join commerce_google_review_usage u on u.tenant_id=c.tenant_id and u.usage_day=(now() at time zone 'UTC')::date where c.tenant_id=$1`, [tenantId])).rows[0] ?? null;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return null;
    throw error;
  }
}
export function safeGoogleReviews(row: GoogleReviewsConnection | null): GoogleReviewsSettings {
  return row ? { configured: true, hasKey: Boolean(row.api_key_encrypted), placeId: row.place_id, title: row.title, dailyLimit: row.daily_limit, usedToday: row.used_today, revision: row.revision, enabled: row.enabled, tested: row.tested_revision === row.revision && Boolean(row.tested_at), testedAt: row.tested_at ? new Date(row.tested_at).toISOString() : null }
    : { configured: false, hasKey: false, placeId: "", title: "Avaliações no Google", dailyLimit: 50, usedToday: 0, revision: 0, enabled: false, tested: false, testedAt: null };
}
export async function saveGoogleReviews(actor: string, tenantId: string, raw: GoogleReviewsInput) {
  const input = googleReviewsSaveSchema.parse(raw), current = await loadGoogleReviews(tenantId);
  if ((current?.revision ?? 0) !== input.revision) throw new CommerceError("A configuração mudou. Recarregue antes de salvar.", 409);
  if (!input.apiKey && !current?.api_key_encrypted) throw new CommerceError("Informe uma chave da Places API (New).");
  if (input.apiKey && input.apiKey.length < 20) throw new CommerceError("Confira a chave da Places API (New).");
  const credentialChanged = Boolean(input.apiKey || current?.place_id !== input.placeId);
  const secret = input.apiKey ? encryptTenantSecret({ apiKey: input.apiKey }) : current!.api_key_encrypted;
  await commerceTransaction(async client => {
    const params = [tenantId, input.placeId, input.title, input.dailyLimit, secret, input.revision, credentialChanged];
    const result = current ? await client.query(`update commerce_google_review_connections set place_id=$2,title=$3,daily_limit=$4,api_key_encrypted=$5,
      enabled=case when $7::boolean then false else enabled end,tested_at=case when $7::boolean then null else tested_at end,
      tested_revision=case when not $7::boolean and tested_revision=revision then revision+1 else null end,revision=revision+1,updated_at=now()
      where tenant_id=$1 and revision=$6 returning tenant_id`, params)
      : await client.query(`insert into commerce_google_review_connections(tenant_id,place_id,title,daily_limit,api_key_encrypted)
        select $1,$2,$3,$4,$5 where $6::integer=0 and $7::boolean on conflict(tenant_id) do nothing returning tenant_id`, params);
    if (!result.rowCount) throw new CommerceError("A configuração mudou. Recarregue antes de salvar.", 409);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,metadata) values($1,$2,'commerce.google_reviews.save','commerce_google_reviews',$3)", [tenantId, actor, JSON.stringify({ placeId: input.placeId, credentialChanged })]);
  });
  return safeGoogleReviews(await loadGoogleReviews(tenantId));
}
export async function markGoogleReviewsTested(actor: string, tenantId: string, revision: number) {
  await commerceTransaction(async client => {
    const result = await client.query("update commerce_google_review_connections set tested_revision=revision,tested_at=now(),updated_at=now() where tenant_id=$1 and revision=$2 returning tenant_id", [tenantId, revision]);
    if (!result.rowCount) throw new CommerceError("A configuração mudou durante o teste. Teste novamente.", 409);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type) values($1,$2,'commerce.google_reviews.test','commerce_google_reviews')", [tenantId, actor]);
  });
}
export async function toggleGoogleReviews(actor: string, tenantId: string, revision: number, enabled: boolean) {
  await commerceTransaction(async client => {
    const result = await client.query(`update commerce_google_review_connections set enabled=$3,updated_at=now() where tenant_id=$1 and revision=$2
      and (not $3::boolean or (api_key_encrypted is not null and tested_revision=revision and tested_at is not null)) returning tenant_id`, [tenantId, revision, enabled]);
    if (!result.rowCount) throw new CommerceError("Salve e teste a configuração atual antes de ativar. Se ela mudou, recarregue.", 409);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,metadata) values($1,$2,'commerce.google_reviews.toggle','commerce_google_reviews',$3)", [tenantId, actor, JSON.stringify({ enabled })]);
  });
  return safeGoogleReviews(await loadGoogleReviews(tenantId));
}
export async function removeGoogleReviewsKey(actor: string, tenantId: string, revision: number) {
  await commerceTransaction(async client => {
    const result = await client.query("update commerce_google_review_connections set api_key_encrypted=null,enabled=false,tested_revision=null,tested_at=null,revision=revision+1,updated_at=now() where tenant_id=$1 and revision=$2 returning tenant_id", [tenantId, revision]);
    if (!result.rowCount) throw new CommerceError("A configuração mudou. Recarregue antes de remover.", 409);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type) values($1,$2,'commerce.google_reviews.remove_key','commerce_google_reviews')", [tenantId, actor]);
  });
  return safeGoogleReviews(await loadGoogleReviews(tenantId));
}
export async function reserveGoogleReviewsRequest(row: GoogleReviewsConnection, requireEnabled: boolean) {
  const result = await getPool().query(`insert into commerce_google_review_usage(tenant_id,usage_day,request_count)
    select tenant_id,(now() at time zone 'UTC')::date,1 from commerce_google_review_connections where tenant_id=$1 and revision=$2 and (not $4::boolean or enabled)
    on conflict(tenant_id,usage_day) do update set request_count=commerce_google_review_usage.request_count+1 where commerce_google_review_usage.request_count < $3::integer returning request_count`, [row.tenant_id, row.revision, row.daily_limit, requireEnabled]);
  if (!result.rowCount) throw new CommerceError("O limite diário de consultas foi atingido ou a configuração mudou. As avaliações continuam disponíveis no Google Maps.", 429);
}
