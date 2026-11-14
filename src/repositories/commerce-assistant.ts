import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db/client";
import { decryptTenantSecret, encryptTenantSecret } from "@/lib/crypto/secrets";
import { commerceTransaction, hashCommerceToken, type BuyerSession } from "./commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { assistantSettingsSchema, type AssistantSettings, type AssistantLimits, type AssistantDocument, type AssistantMessage, type AssistantCard } from "@/domain/commerce/assistant";
import { getServerEnv } from "@/lib/env/server";

export type AssistantConfig = { tenant_id: string; settings: AssistantSettings; enabled: boolean; revision: number; tested_revision: number | null; tested_at: string | null };
export type AssistantConversation = { id: string; tenant_id: string; session_id: string; status: string; expires_at: string };
export const assistantModels = () => [...new Set((process.env.OPENROUTER_ASSISTANT_MODELS || getServerEnv().OPENROUTER_TEXT_MODEL).split(",").map(value => value.trim()).filter(value => /^[\w./:-]{3,150}$/.test(value)))];
export const defaultAssistantLimits = (): AssistantLimits => ({ allowed: true, model: assistantModels()[0] || "openai/gpt-4.1-mini", monthlyCalls: 500, monthlyTokens: 2000000, monthlyUsd: 10, visitorDailyTurns: 20, revision: 0 });
export async function assistantConfig(tenantId: string): Promise<AssistantConfig | null> {
  try {
    const row = (await getPool().query("select *,tested_at::text from commerce_assistant_settings where tenant_id=$1", [tenantId])).rows[0];
    return row ? { ...row, settings: assistantSettingsSchema.parse(row.settings) } : null;
  } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "42P01") return null; throw error; }
}
export async function assistantLimits(tenantId: string): Promise<AssistantLimits> {
  const row = (await getPool().query("select * from commerce_assistant_limits where tenant_id=$1", [tenantId])).rows[0];
  return row ? { allowed: row.allowed, model: row.model, monthlyCalls: row.monthly_calls, monthlyTokens: row.monthly_tokens, monthlyUsd: Number(row.monthly_usd), visitorDailyTurns: row.visitor_daily_turns, revision: row.revision } : defaultAssistantLimits();
}
export async function assistantAudit(client: Pick<PoolClient, "query">, tenantId: string, actor: string | null, action: string, metadata: object = {}) {
  await client.query("insert into audit_logs(tenant_id,actor_user_id,action,entity_type,metadata) values($1,$2,$3,'commerce_assistant',$4)", [tenantId, actor, `commerce.assistant.${action}`, JSON.stringify(metadata)]);
}
export async function saveAssistantConfig(tenantId: string, actor: string, revision: number, settings: AssistantSettings) {
  const validated = assistantSettingsSchema.parse(settings);
  await commerceTransaction(async client => {
    // Lock conversations before settings, matching proposal confirmation order.
    await client.query("update commerce_assistant_conversations set expires_at=least(expires_at,created_at+$2::integer*interval '1 day') where tenant_id=$1", [tenantId, validated.retentionDays]);
    const row = revision === 0 ? await client.query(`insert into commerce_assistant_settings(tenant_id,settings) values($1,$2) on conflict do nothing returning revision`, [tenantId, JSON.stringify(validated)])
      : await client.query(`update commerce_assistant_settings set settings=$2,revision=revision+1,enabled=false,tested_at=null,tested_revision=null,updated_at=now() where tenant_id=$1 and revision=$3 returning revision`, [tenantId, JSON.stringify(validated), revision]);
    if (!row.rowCount) throw new CommerceError("A configuração mudou em outra aba. Recarregue antes de salvar.", 409);
    await assistantAudit(client, tenantId, actor, "settings.save", { revision: row.rows[0].revision });
  });
  return assistantConfig(tenantId);
}
export async function setAssistantState(tenantId: string, actor: string, revision: number, action: "tested" | "enable" | "disable") {
  await commerceTransaction(async client => {
    const query = action === "tested" ? "tested_revision=revision,tested_at=now()" : `enabled=${action === "enable" ? "true" : "false"}`;
    const result = await client.query(`update commerce_assistant_settings set ${query},updated_at=now() where tenant_id=$1 and revision=$2 ${action === "enable" ? "and tested_revision=revision" : ""} returning tenant_id`, [tenantId, revision]);
    if (!result.rowCount) throw new CommerceError("Salve e teste esta versão antes de ativar. Se ela mudou, recarregue.", 409);
    await assistantAudit(client, tenantId, actor, `settings.${action}`);
  });
  return assistantConfig(tenantId);
}
export async function assistantDocuments(tenantId: string, includeInactive = false): Promise<AssistantDocument[]> {
  return (await getPool().query<AssistantDocument>(`select id,label,file_name,file_size,visibility,created_at::text,active from commerce_assistant_documents where tenant_id=$1 ${includeInactive ? "" : "and active"} order by created_at desc limit 40`, [tenantId])).rows;
}
export async function assistantUsage(tenantId: string) {
  return (await getPool().query("select calls,tokens,cost_usd::float8 from commerce_assistant_usage where tenant_id=$1 and month=date_trunc('month',now() at time zone 'UTC')::date", [tenantId])).rows[0] ?? { calls: 0, tokens: 0, cost_usd: 0 };
}

// Reserve the full bounded request envelope; failed/unknown bills keep the reservation.
export async function reserveAssistantCall(tenantId: string, tokens: number) {
  if (!Number.isInteger(tokens) || tokens < 1 || tokens > 34000) throw new CommerceError("O contexto ficou longo. Inicie uma nova conversa.", 413);
  const limits = await assistantLimits(tenantId);
  return commerceTransaction(async client => {
    await client.query(`insert into commerce_assistant_limits(tenant_id,model) values($1,$2) on conflict do nothing`, [tenantId, limits.model]);
    const row = (await client.query(`select * from commerce_assistant_limits where tenant_id=$1 for update`, [tenantId])).rows[0];
    if (!row.allowed || !assistantModels().includes(row.model)) throw new CommerceError("O assistente está indisponível. Fale com a equipe da loja.", 503);
    const used = await client.query(`insert into commerce_assistant_usage(tenant_id,month,calls,tokens,cost_usd)
      select $1,date_trunc('month',now() at time zone 'UTC')::date,1,$2,0.10 where $3::integer>=1 and $4::bigint >= $2::bigint and $5::numeric>=0.10
      on conflict(tenant_id,month) do update set calls=commerce_assistant_usage.calls+1,tokens=commerce_assistant_usage.tokens+$2,cost_usd=commerce_assistant_usage.cost_usd+0.10
      where commerce_assistant_usage.calls<$3 and commerce_assistant_usage.tokens+$2<=$4 and commerce_assistant_usage.cost_usd+0.10<=$5 returning month::text`, [tenantId, tokens, row.monthly_calls, row.monthly_tokens, row.monthly_usd]);
    if (!used.rowCount) throw new CommerceError("O limite de atendimento por IA desta loja foi atingido. Você pode continuar com a equipe.", 429);
    return { ...limits, model: String(row.model), usageMonth: String(used.rows[0].month) };
  });
}
export async function settleAssistantCall(tenantId: string, month: string, reservedTokens: number, usage: { tokens?: number; cost?: number }) {
  const tokens = Number.isSafeInteger(usage.tokens) && usage.tokens! > 0 ? usage.tokens! : reservedTokens;
  const cost = typeof usage.cost === "number" && Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost : .10;
  await getPool().query(`update commerce_assistant_usage set tokens=greatest(0,tokens+$2),cost_usd=greatest(0,cost_usd+$3::numeric)
    where tenant_id=$1 and month=$4::date`, [tenantId, tokens - reservedTokens, cost - .10, month]);
}
export async function requireAssistantConversation(tenantId: string, session: BuyerSession, id: string, client: Pick<PoolClient, "query"> = getPool()): Promise<AssistantConversation> {
  const row = (await client.query<AssistantConversation>(`update commerce_assistant_conversations c set customer_id=coalesce(c.customer_id,s.customer_id)
    from commerce_sessions s where c.tenant_id=$1 and c.session_id=$2 and c.id=$3 and c.expires_at>now()
    and s.tenant_id=c.tenant_id and s.id=c.session_id and s.expires_at>now() and (c.customer_id is null or c.customer_id=s.customer_id)
    and s.customer_id is not distinct from $4::uuid
    returning c.id,c.tenant_id,c.session_id,c.status,c.expires_at::text`, [tenantId, session.id, id, session.customer_id])).rows[0];
  if (!row || row.status === "closed") throw new CommerceError("Atendimento encerrado ou não encontrado nesta sessão. Inicie outro.", 404);
  return row;
}
export async function startAssistantConversation(tenantId: string, session: BuyerSession, retention: number) {
  await purgeExpiredAssistant(tenantId);
  const existing = (await getPool().query<AssistantConversation>("select id,tenant_id,session_id,status,expires_at::text from commerce_assistant_conversations where tenant_id=$1 and session_id=$2 and status<>'closed' and expires_at>now() and (customer_id is null or customer_id=$3) order by created_at desc limit 1", [tenantId, session.id, session.customer_id])).rows[0];
  if (existing) return requireAssistantConversation(tenantId, session, existing.id);
  return (await getPool().query<AssistantConversation>("insert into commerce_assistant_conversations(tenant_id,session_id,customer_id,expires_at) values($1,$2,$4,now()+$3::integer*interval '1 day') returning id,tenant_id,session_id,status,expires_at::text", [tenantId, session.id, retention, session.customer_id])).rows[0];
}
export async function assistantMessages(tenantId: string, conversationId: string, client: Pick<PoolClient, "query"> = getPool()): Promise<AssistantMessage[]> {
  const rows = (await client.query("select id,role,payload_encrypted from commerce_assistant_messages where tenant_id=$1 and conversation_id=$2 order by created_at,id limit 100", [tenantId, conversationId])).rows;
  return rows.map(row => ({ id: row.id, role: row.role, ...decryptTenantSecret<{ text: string; cards: AssistantCard[] }>(row.payload_encrypted) }));
}
export async function addAssistantMessage(tenantId: string, conversationId: string, role: "user" | "assistant", text: string, cards: AssistantCard[] = [], client: Pick<PoolClient, "query"> = getPool()) {
  await client.query("insert into commerce_assistant_messages(tenant_id,conversation_id,role,payload_encrypted) values($1,$2,$3,$4)", [tenantId, conversationId, role, encryptTenantSecret({ text, cards })]);
}
export async function beginAssistantTurn(tenantId: string, session: BuyerSession, conversationId: string, messageId: string, text: string) {
  const limits = await assistantLimits(tenantId);
  return commerceTransaction(async client => {
    await requireAssistantConversation(tenantId, session, conversationId, client);
    await client.query("select id from commerce_assistant_conversations where tenant_id=$1 and id=$2 for update", [tenantId, conversationId]);
    const previous = (await client.query("select state,request_hash from commerce_assistant_turns where tenant_id=$1 and conversation_id=$2 and id=$3", [tenantId, conversationId, messageId])).rows[0];
    const hash = hashCommerceToken(text);
    if (previous) {
      if (previous.request_hash !== hash) throw new CommerceError("Este envio já foi utilizado por outra mensagem.", 409);
      if (previous.state === "completed") return false;
      throw new CommerceError(previous.state === "failed" ? "O envio anterior não terminou. Envie novamente como uma nova mensagem." : "Aguarde a resposta da mensagem anterior.", 409);
    }
    const usage = await client.query(`insert into commerce_assistant_visitor_usage(tenant_id,session_id,day,turns) values($1,$2,(now() at time zone 'UTC')::date,1)
      on conflict(tenant_id,session_id,day) do update set turns=commerce_assistant_visitor_usage.turns+1 where commerce_assistant_visitor_usage.turns<$3 returning turns`, [tenantId, session.id, limits.visitorDailyTurns]);
    if (!usage.rowCount) throw new CommerceError("O limite diário deste atendimento foi atingido. Fale com a equipe para continuar.", 429);
    const count = (await client.query("select count(*)::int as count from commerce_assistant_messages where tenant_id=$1 and conversation_id=$2", [tenantId, conversationId])).rows[0].count;
    if (count >= 80) throw new CommerceError("Esta conversa ficou longa. Limpe o histórico para iniciar outra.", 409);
    const locked = await client.query("update commerce_assistant_conversations set busy_turn=$3,busy_until=now()+interval '90 seconds',updated_at=now() where tenant_id=$1 and id=$2 and (busy_until is null or busy_until<now()) returning id", [tenantId, conversationId, messageId]);
    if (!locked.rowCount) throw new CommerceError("Aguarde a resposta anterior antes de enviar outra mensagem.", 409);
    await client.query("insert into commerce_assistant_turns(id,tenant_id,conversation_id,request_hash) values($1,$2,$3,$4)", [messageId, tenantId, conversationId, hash]);
    await addAssistantMessage(tenantId, conversationId, "user", text, [], client); return true;
  });
}
export async function completeAssistantTurn(tenantId: string, conversationId: string, messageId: string, text: string, cards: AssistantCard[], failed = false, expectedRevision?: number) {
  await commerceTransaction(async client => {
    const result = await client.query("update commerce_assistant_conversations set busy_until=null,busy_turn=null,updated_at=now() where tenant_id=$1 and id=$2 and busy_turn=$3 returning id", [tenantId, conversationId, messageId]);
    if (!result.rowCount) throw new CommerceError("O atendimento mudou. Recarregue a conversa.", 409);
    if (expectedRevision !== undefined) {
      const config = (await client.query("select enabled,revision from commerce_assistant_settings where tenant_id=$1 for share", [tenantId])).rows[0];
      if (!config?.enabled || config.revision !== expectedRevision) throw new CommerceError("A loja atualizou o assistente. Reabra o atendimento.", 409);
    }
    await addAssistantMessage(tenantId, conversationId, "assistant", text, cards, client);
    await client.query("update commerce_assistant_turns set state=$4 where tenant_id=$1 and conversation_id=$2 and id=$3", [tenantId, conversationId, messageId, failed ? "failed" : "completed"]);
  });
}
export async function purgeExpiredAssistant(tenantId?: string) {
  return getPool().query(`delete from commerce_assistant_conversations where id in(select id from commerce_assistant_conversations where expires_at<now() ${tenantId ? "and tenant_id=$1" : ""} limit 200)`, tenantId ? [tenantId] : []);
}
export async function assistantHandoff(tenantId: string, session: BuyerSession, conversationId: string) {
  await requireAssistantConversation(tenantId, session, conversationId);
  await getPool().query("update commerce_assistant_conversations set status='handoff',updated_at=now() where tenant_id=$1 and session_id=$2 and id=$3", [tenantId, session.id, conversationId]);
  const history = await assistantMessages(tenantId, conversationId);
  const summary = history.filter(message => message.role === "user").slice(-3).map(message => message.text).join(" · ").slice(0, 700);
  await assistantAudit(getPool(), tenantId, null, "handoff", { conversationId });
  return summary;
}
export async function assistantMetrics(tenantId: string) {
  await purgeExpiredAssistant(tenantId);
  const totals = (await getPool().query(`select count(*)::int as conversations,count(*) filter(where status='handoff')::int as handoffs from commerce_assistant_conversations where tenant_id=$1 and created_at>now()-interval '30 days'`, [tenantId])).rows[0];
  const events = (await getPool().query("select action,count(*)::int as count from audit_logs where tenant_id=$1 and action in('commerce.assistant.cart.confirm','commerce.assistant.quote.saved','commerce.assistant.document.read') and created_at>now()-interval '30 days' group by action", [tenantId])).rows;
  return { ...totals, usage: await assistantUsage(tenantId), events };
}
export async function listAssistantConversations(tenantId: string) {
  return (await getPool().query("select id,status,created_at::text,updated_at::text,expires_at::text from commerce_assistant_conversations where tenant_id=$1 and expires_at>now() order by updated_at desc limit 50", [tenantId])).rows;
}
export const newAssistantId = randomUUID;
