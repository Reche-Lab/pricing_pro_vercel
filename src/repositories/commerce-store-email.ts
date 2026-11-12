import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "./commerce";
import { encryptTenantSecret } from "@/lib/crypto/secrets";
import { CommerceError } from "@/domain/commerce/commerce";
import { storeEmailSchema, type StoreEmailInput, type StoreEmailSettings } from "@/domain/commerce/store-email";

export type StoreEmailRow = { tenant_id: string; host: string; port: 465 | 587; username: string; from_email: string; from_name: string; reply_to: string; password_encrypted: string; enabled: boolean; revision: number; tested_revision: number | null; tested_at: string | null };
export async function loadStoreEmailConnection(tenantId: string): Promise<StoreEmailRow | null> {
  return (await getPool().query<StoreEmailRow>("select *,tested_at::text from commerce_email_connections where tenant_id=$1", [tenantId])).rows[0] ?? null;
}
export function safeStoreEmailSettings(row: StoreEmailRow | null): StoreEmailSettings {
  return row ? { configured: true, host: row.host, port: row.port, username: row.username, fromEmail: row.from_email, fromName: row.from_name, replyTo: row.reply_to, revision: row.revision, enabled: row.enabled, hasPassword: Boolean(row.password_encrypted), tested: row.tested_revision === row.revision && Boolean(row.tested_at), testedAt: row.tested_at ? new Date(row.tested_at).toISOString() : null }
    : { configured: false, host: "", port: 587, username: "", fromEmail: "", fromName: "", replyTo: "", revision: 0, enabled: false, hasPassword: false, tested: false, testedAt: null };
}
export async function getStoreEmailSettings(tenantId: string) { return safeStoreEmailSettings(await loadStoreEmailConnection(tenantId)); }
export async function saveStoreEmail(actor: string, tenantId: string, raw: StoreEmailInput) {
  const input = storeEmailSchema.parse(raw), current = await loadStoreEmailConnection(tenantId);
  if ((current?.revision ?? 0) !== input.revision) throw new CommerceError("A configuração mudou em outra aba. Recarregue antes de salvar.", 409);
  const secret = input.password ? encryptTenantSecret({ password: input.password }) : current?.password_encrypted;
  if (!secret) throw new CommerceError("Informe a senha SMTP ou senha de aplicativo.");
  const currentSettings = safeStoreEmailSettings(current);
  if (!input.password && current && ["host", "port", "username", "fromEmail", "fromName", "replyTo"].every(key => currentSettings[key as keyof StoreEmailSettings] === input[key as keyof StoreEmailInput])) return currentSettings;
  await commerceTransaction(async client => {
    let result;
    const params = [tenantId, input.host, input.port, input.username, input.fromEmail, input.fromName, input.replyTo, secret, input.revision];
    if (!current) result = await client.query(`insert into commerce_email_connections(tenant_id,host,port,username,from_email,from_name,reply_to,password_encrypted)
      select $1,$2,$3,$4,$5,$6,$7,$8 where $9::integer=0 on conflict(tenant_id) do nothing returning tenant_id`, params);
    else result = await client.query(`update commerce_email_connections set host=$2,port=$3,username=$4,from_email=$5,from_name=$6,reply_to=$7,password_encrypted=$8,
      enabled=false,tested_at=null,tested_revision=null,revision=revision+1,updated_at=now() where tenant_id=$1 and revision=$9 returning tenant_id`, params);
    if (!result.rowCount) throw new CommerceError("A configuração mudou. Recarregue e tente novamente.", 409);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type) values($1,$2,'commerce.email.save','commerce_email')", [tenantId, actor]);
  });
  return getStoreEmailSettings(tenantId);
}
export async function setStoreEmailEnabled(actor: string, tenantId: string, revision: number, enabled: boolean) {
  await commerceTransaction(async client => {
    const result = await client.query(`update commerce_email_connections set enabled=$3,updated_at=now() where tenant_id=$1 and revision=$2
      and (not $3::boolean or (tested_revision=revision and tested_at is not null)) returning tenant_id`, [tenantId, revision, enabled]);
    if (!result.rowCount) throw new CommerceError("Envie um teste com a configuração atual antes de ativar. Se outra aba alterou os dados, recarregue.", 409);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,metadata) values($1,$2,'commerce.email.toggle','commerce_email',$3)", [tenantId, actor, JSON.stringify({ enabled })]);
  });
  return getStoreEmailSettings(tenantId);
}
export async function markStoreEmailTested(actor: string, tenantId: string, revision: number) {
  await commerceTransaction(async client => {
    const result = await client.query("update commerce_email_connections set tested_at=now(),tested_revision=revision where tenant_id=$1 and revision=$2 returning tenant_id", [tenantId, revision]);
    if (!result.rowCount) throw new CommerceError("O teste foi enviado, mas a configuração mudou. Teste novamente antes de ativar.", 409);
    await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type) values($1,$2,'commerce.email.test','commerce_email')", [tenantId, actor]);
  });
  return getStoreEmailSettings(tenantId);
}
