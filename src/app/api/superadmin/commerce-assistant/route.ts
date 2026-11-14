import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { isSuperAdmin } from "@/repositories/superadmin";
import { assistantLimitsSchema } from "@/domain/commerce/assistant";
import { assistantModels, assistantLimits, defaultAssistantLimits, assistantAudit } from "@/repositories/commerce-assistant";
import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
export const dynamic = "force-dynamic";
async function authorize() { const session = await getCurrentSession(); if (!session) throw new CommerceError("Entre na conta administrativa.", 401); if (!await isSuperAdmin(session.userId)) throw new CommerceError("Somente o superadmin pode definir modelos e limites.", 403); return session; }
export async function GET() {
  try {
    await authorize();
    const stores = (await getPool().query(`select t.id,t.name,t.slug,p.allowed,p.model,p.monthly_calls,p.monthly_tokens,p.monthly_usd,p.visitor_daily_turns,p.revision,
      coalesce(u.calls,0) as calls,coalesce(u.tokens,0) as tokens,coalesce(u.cost_usd,0)::float8 as cost_usd
      from tenants t join commerce_stores s on s.tenant_id=t.id left join commerce_assistant_limits p on p.tenant_id=t.id
      left join commerce_assistant_usage u on u.tenant_id=t.id and u.month=date_trunc('month',now() at time zone 'UTC')::date order by t.name limit 200`)).rows;
    const defaults = defaultAssistantLimits();
    const tenants = stores.map(row => ({ id: row.id, name: row.name, slug: row.slug,
      policy: row.model ? { allowed: row.allowed, model: row.model, monthlyCalls: row.monthly_calls, monthlyTokens: Number(row.monthly_tokens), monthlyUsd: Number(row.monthly_usd), visitorDailyTurns: row.visitor_daily_turns, revision: row.revision } : defaults,
      usage: { calls: row.calls, tokens: Number(row.tokens), cost_usd: row.cost_usd } }));
    return commerceJson({ models: assistantModels(), tenants });
  } catch (error) { return commerceFailure(error, "assistant.superadmin.read"); }
}
export async function PUT(request: Request) {
  try {
    checkCommerceOrigin(request); const session = await authorize();
    const input = await readCommerceBody(request, z.object({ tenantId: z.string().uuid(), policy: assistantLimitsSchema }).strict());
    if (!assistantModels().includes(input.policy.model)) throw new CommerceError("Modelo fora da lista global permitida.");
    const p = input.policy;
    await commerceTransaction(async client => {
      const params = [input.tenantId, p.allowed, p.model, p.monthlyCalls, p.monthlyTokens, p.monthlyUsd, p.visitorDailyTurns];
      const result = p.revision === 0 ? await client.query("insert into commerce_assistant_limits(tenant_id,allowed,model,monthly_calls,monthly_tokens,monthly_usd,visitor_daily_turns) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning revision", params)
        : await client.query("update commerce_assistant_limits set allowed=$2,model=$3,monthly_calls=$4,monthly_tokens=$5,monthly_usd=$6,visitor_daily_turns=$7,revision=revision+1,updated_at=now() where tenant_id=$1 and revision=$8 returning revision", [...params, p.revision]);
      if (!result.rowCount) throw new CommerceError("A política mudou. Recarregue antes de salvar.", 409);
      await client.query("update commerce_assistant_settings set enabled=false,tested_at=null,tested_revision=null,revision=revision+1 where tenant_id=$1", [input.tenantId]);
      await assistantAudit(client, input.tenantId, session.userId, "policy.save", { allowed: p.allowed, model: p.model, monthlyCalls: p.monthlyCalls, monthlyTokens: p.monthlyTokens, monthlyUsd: p.monthlyUsd });
    });
    return commerceJson({ policy: await assistantLimits(input.tenantId), message: "Limites salvos. O tenant precisa testar e ativar novamente o assistente." });
  } catch (error) { return commerceFailure(error, "assistant.superadmin.save"); }
}
