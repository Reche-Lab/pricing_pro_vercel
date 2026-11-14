import { getServerEnv } from "@/lib/env/server";
import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
import { assistantRequestSchema, redactAssistantText } from "@/domain/commerce/assistant";
import { assistantConfig, assistantLimits, startAssistantConversation, assistantMessages, assistantDocuments, requireAssistantConversation, beginAssistantTurn, assistantHandoff, addAssistantMessage, assistantAudit } from "@/repositories/commerce-assistant";
import { getCommerceStore, cartView, commerceTransaction } from "@/repositories/commerce";
import { getBuyerQuote } from "@/repositories/commerce-buyer-quotes";
import { buyerContext, checkCommerceOrigin, readCommerceBody, commerceFailure, commerceJson } from "@/services/commerce/http";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { confirmAssistantCart } from "@/services/commerce/assistant-tools";
import { runAssistantTurn } from "@/services/commerce/assistant-engine";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ slug: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const store = await getCommerceStore((await params).slug, true);
    const config = store ? await assistantConfig(store.tenant_id) : null;
    if (!store || !config?.enabled) return commerceJson({ enabled: false });
    const policy = await assistantLimits(store.tenant_id);
    return commerceJson({ enabled: policy.allowed && Boolean(getServerEnv().OPENROUTER_API_KEY), name: config.settings.name, welcome: config.settings.welcome, retentionDays: config.settings.retentionDays, quotes: config.settings.allowQuotes, orders: config.settings.allowOrders });
  } catch { return commerceJson({ enabled: false }); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkCommerceOrigin(request); const slug = (await params).slug;
    const blocked = await enforcePublicRateLimit(request, slug, { action: "assistant.chat", limit: 20, windowSeconds: 600 }); if (blocked) return blocked;
    const input = await readCommerceBody(request, assistantRequestSchema, 7000);
    const { store, session } = await buyerContext(slug, input.action === "start", true);
    const config = await assistantConfig(store.tenant_id), policy = config ? await assistantLimits(store.tenant_id) : null;
    if (!config?.enabled || !policy?.allowed) throw new CommerceError("O assistente está desativado. Fale com a equipe da loja.", 404);
    const history = async (id: string) => {
      await requireAssistantConversation(store.tenant_id, session, id);
      const messages = await assistantMessages(store.tenant_id, id);
      // Official bank details/documents must not be restored from an outdated snapshot.
      if (messages.some(m => m.cards.some(c => c.kind === "company"))) {
        const current = await assistantConfig(store.tenant_id), documents = await assistantDocuments(store.tenant_id);
        for (const message of messages) message.cards = message.cards.map(card => card.kind === "company" ? { ...card, company: current?.settings.company ?? config.settings.company, documents } : card);
      }
      return messages;
    };
    if (input.action === "start") {
      const conversation = await startAssistantConversation(store.tenant_id, session, config.settings.retentionDays);
      return commerceJson({ conversation, messages: await history(conversation.id), customer: Boolean(session.customer_id) });
    }
    const conversation = await requireAssistantConversation(store.tenant_id, session, input.conversationId);
    const context = { store, session, config, conversationId: conversation.id };
    if (input.action === "clear") {
      await getPool().query("delete from commerce_assistant_conversations where tenant_id=$1 and session_id=$2 and id=$3", [store.tenant_id, session.id, conversation.id]);
      return commerceJson({ cleared: true });
    }
    if (input.action === "confirm") {
      if (store.status !== "published") throw new CommerceError("A loja está pausada. Fale com a equipe.", 409);
      const result = await confirmAssistantCart(context, input.actionId);
      const { session: latest } = await buyerContext(slug);
      return commerceJson({ ...result, cart: await cartView(store, latest), message: result.alreadyApplied ? "Esta proposta já foi adicionada. Seus itens não foram duplicados." : "Itens adicionados ao carrinho. Revise e confirme seus dados para salvar o orçamento." });
    }
    if (input.action === "handoff") return commerceJson({ summary: await assistantHandoff(store.tenant_id, session, conversation.id), message: "Solicitação registrada para a equipe. O contato não é uma confirmação de atendimento imediato." });
    if (input.action === "quote_saved") {
      const quote = await getBuyerQuote(store.tenant_id, session, input.quoteId);
      if (!config.settings.allowQuotes) throw new CommerceError("Orçamentos pelo chat estão desativados.", 403);
      await commerceTransaction(async client => {
        await requireAssistantConversation(store.tenant_id, session, conversation.id, client);
        const recorded = (await client.query("select id from audit_logs where tenant_id=$1 and action='commerce.assistant.quote.saved' and metadata->>'conversationId'=$2 and metadata->>'quoteId'=$3 limit 1", [store.tenant_id, conversation.id, quote.id])).rowCount;
        if (recorded) return;
        await addAssistantMessage(store.tenant_id, conversation.id, "assistant", "Seu orçamento está salvo na sua conta. Você pode baixar o PDF e continuar a compra quando desejar.", [{ kind: "quote_saved", quoteId: quote.id, totalCents: quote.total_cents }], client);
        await assistantAudit(client, store.tenant_id, null, "quote.saved", { conversationId: conversation.id, quoteId: quote.id });
      });
      return commerceJson({ messages: await history(conversation.id) });
    }
    const text = redactAssistantText(input.text);
    const started = await beginAssistantTurn(store.tenant_id, session, conversation.id, input.messageId, text);
    if (!started) return commerceJson({ messages: await history(conversation.id) });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ async start(controller) {
      let open = true;
      const send = (event: object) => { if (open) { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { open = false; } } };
      try { await runAssistantTurn(context, input.messageId, text => send({ type: "status", text }), request.signal); send({ type: "done", messages: await history(conversation.id) }); }
      catch { send({ type: "error", message: "O atendimento mudou ou expirou. Reabra a conversa para continuar." }); }
      finally { if (open) controller.close(); }
    } });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-accel-buffering": "no" } });
  } catch (error) { return commerceFailure(error, "assistant.chat"); }
}
