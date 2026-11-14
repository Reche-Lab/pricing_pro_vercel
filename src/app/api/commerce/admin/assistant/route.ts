import { z } from "zod";
import { getPool } from "@/lib/db/client";
import { getServerEnv } from "@/lib/env/server";
import { CommerceError } from "@/domain/commerce/commerce";
import { assistantSettingsSchema } from "@/domain/commerce/assistant";
import { assistantConfig, assistantDocuments, assistantLimits, assistantMetrics, assistantMessages, listAssistantConversations, saveAssistantConfig, setAssistantState, assistantAudit } from "@/repositories/commerce-assistant";
import { requireCommerceAdmin, checkCommerceOrigin, commerceFailure, commerceJson, readCommerceBody } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { storeAssistantCompletion } from "@/services/openrouter/store-assistant";
import { previewAssistantReply } from "@/services/commerce/assistant-engine";
import type { CommerceStore } from "@/repositories/commerce";
import { storeSettingsSchema } from "@/domain/commerce/schemas";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { session } = await requireCommerceAdmin();
    const conversationId = new URL(request.url).searchParams.get("conversationId");
    if (conversationId) {
      z.string().uuid().parse(conversationId);
      const found = (await getPool().query("select id from commerce_assistant_conversations where tenant_id=$1 and id=$2 and expires_at>now()", [session.tenantId, conversationId])).rowCount;
      if (!found) throw new CommerceError("Atendimento não encontrado.", 404);
      await assistantAudit(getPool(), session.tenantId, session.userId, "conversation.read", { conversationId });
      return commerceJson({ messages: await assistantMessages(session.tenantId, conversationId) });
    }
    const config = await assistantConfig(session.tenantId);
    return commerceJson({ config, defaults: assistantSettingsSchema.parse({}), ready: Boolean(getServerEnv().OPENROUTER_API_KEY), storageReady: Boolean(getServerEnv().SUPABASE_SERVICE_ROLE_KEY && getServerEnv().SUPABASE_URL), policy: await assistantLimits(session.tenantId), documents: await assistantDocuments(session.tenantId, true), metrics: await assistantMetrics(session.tenantId), conversations: await listAssistantConversations(session.tenantId) });
  } catch (error) { return commerceFailure(error, "assistant.admin.read"); }
}
export async function PUT(request: Request) {
  try {
    checkCommerceOrigin(request); const { session } = await requireCommerceAdmin();
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "assistant.settings", limit: 20, windowSeconds: 600 }); if (blocked) return blocked;
    const input = await readCommerceBody(request, z.object({ revision: z.number().int().nonnegative(), settings: assistantSettingsSchema }).strict(), 20000);
    return commerceJson({ config: await saveAssistantConfig(session.tenantId, session.userId, input.revision, input.settings), message: "Configuração salva e assistente desativado. Teste a conexão e confirme as informações antes de ativar." });
  } catch (error) { return commerceFailure(error, "assistant.admin.save"); }
}
export async function POST(request: Request) {
  try {
    checkCommerceOrigin(request); const { session } = await requireCommerceAdmin();
    const input = await readCommerceBody(request, z.discriminatedUnion("action", [
      z.object({ action: z.enum(["test", "disable"]), revision: z.number().int().positive() }).strict(),
      z.object({ action: z.literal("enable"), revision: z.number().int().positive(), approvedInformation: z.literal(true) }).strict(),
      z.object({ action: z.literal("close"), conversationId: z.string().uuid() }).strict(),
      z.object({ action: z.literal("preview"), revision: z.number().int().positive(), text: z.string().trim().min(1).max(1000) }).strict(),
    ]));
    const blocked = await enforcePublicRateLimit(request, session.tenantId, { action: "assistant.admin.action", limit: 10, windowSeconds: 600 }); if (blocked) return blocked;
    if (input.action === "close") {
      const result = await getPool().query("update commerce_assistant_conversations set status='closed',updated_at=now() where tenant_id=$1 and id=$2 returning id", [session.tenantId, input.conversationId]);
      if (!result.rowCount) throw new CommerceError("Atendimento não encontrado.", 404);
      await assistantAudit(getPool(), session.tenantId, session.userId, "conversation.close", { conversationId: input.conversationId });
      return commerceJson({ message: "Atendimento marcado como concluído." });
    }
    const config = await assistantConfig(session.tenantId), policy = await assistantLimits(session.tenantId);
    if (!config || config.revision !== input.revision) throw new CommerceError("Salve a configuração atual antes de continuar.", 409);
    if (input.action !== "disable" && (!policy.allowed || !getServerEnv().OPENROUTER_API_KEY)) throw new CommerceError("O superadmin precisa liberar o uso e configurar a chave OpenRouter.", 409);
    if (input.action === "preview") {
      const store = (await getPool().query<CommerceStore>("select s.*,t.slug,s.settings || jsonb_build_object('production',t.production_settings) as settings from commerce_stores s join tenants t on t.id=s.tenant_id where s.tenant_id=$1", [session.tenantId])).rows[0];
      if (!store) throw new CommerceError("Salve a loja antes de testar.", 409);
      const settings = storeSettingsSchema.safeParse(store.settings);
      if (!settings.success) throw new CommerceError("Salve os dados gerais da loja antes de testar o atendimento.", 409);
      store.settings = settings.data;
      const answer = await previewAssistantReply({ store, config, session: { id: crypto.randomUUID(), tenant_id: session.tenantId, customer_id: null, revision: 0, cart: [] }, conversationId: crypto.randomUUID() }, input.text, request.signal);
      return commerceJson({ answer, message: "Teste somente de leitura concluído. Não foram criados carrinho, comprador ou orçamento. As chamadas contam no limite do mês." });
    }
    const answer = input.action === "test" ? await storeAssistantCompletion(session.tenantId, [{ role: "system", content: "Você é um assistente virtual de loja. Responda brevemente em português, sem pedir dados pessoais." }, { role: "user", content: "Diga uma saudação curta e ofereça ajuda com produtos." }], [], { signal: request.signal }) : null;
    return commerceJson({ config: await setAssistantState(session.tenantId, session.userId, input.revision, input.action === "test" ? "tested" : input.action), answer: answer?.content, message: input.action === "test" ? "Conexão validada com privacidade e limites configurados. O teste consumiu uma chamada. Use o laboratório para conferir as informações antes de ativar." : input.action === "enable" ? "Assistente ativado na loja." : "Assistente desativado." });
  } catch (error) { return commerceFailure(error, "assistant.admin.action"); }
}
