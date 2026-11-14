import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import { CommerceError } from "@/domain/commerce/commerce";
import { reserveAssistantCall, settleAssistantCall } from "@/repositories/commerce-assistant";

export type AssistantModelMessage = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[]; tool_call_id?: string };
const responseSchema = z.object({ choices: z.array(z.object({ finish_reason: z.string().optional(), message: z.object({ content: z.string().max(12000).nullable().optional(), tool_calls: z.array(z.object({ id: z.string().max(120), type: z.literal("function"), function: z.object({ name: z.string().max(80), arguments: z.string().max(10000) }) })).max(2).optional() }) })).min(1).max(10), usage: z.object({ total_tokens: z.number().int().nonnegative().optional(), cost: z.number().nonnegative().optional() }).optional() });

export async function storeAssistantCompletion(tenantId: string, messages: AssistantModelMessage[], tools: object[], options: { request?: typeof fetch; signal?: AbortSignal } = {}) {
  const env = getServerEnv();
  if (!env.OPENROUTER_API_KEY) throw new CommerceError("O atendimento por IA ainda não está disponível. Fale com a equipe da loja.", 503);
  const bytes = Buffer.byteLength(JSON.stringify({ messages, tools }), "utf8");
  if (bytes > 32768) throw new CommerceError("A conversa ficou longa. Inicie um novo atendimento para continuar.", 413);
  const reserved = bytes + 900, policy = await reserveAssistantCall(tenantId, reserved);
  const debugId = crypto.randomUUID(), started = Date.now();
  try {
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
    const response = await (options.request ?? fetch)(`${env.OPENROUTER_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", cache: "no-store", redirect: "error", signal,
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "content-type": "application/json", "HTTP-Referer": env.APP_URL, "X-OpenRouter-Title": "Liaflow Store Assistant" },
      body: JSON.stringify({ model: policy.model, temperature: .3, max_tokens: 900, messages, ...(tools.length ? { tools, tool_choice: "auto", parallel_tool_calls: false } : {}),
        provider: { require_parameters: true, data_collection: "deny", zdr: true, allow_safety_retention_google: false, allow_safety_retention_other: false, max_price: { prompt: 2, completion: 8, request: 0 } } }),
    });
    if (!response.ok) {
      console.warn("Store assistant provider unavailable.", { debugId, tenantId, status: response.status, durationMs: Date.now() - started });
      throw new CommerceError(response.status === 401 || response.status === 403 ? "Não foi possível autorizar o provedor de IA. A equipe da loja pode continuar seu atendimento." : "O assistente está indisponível agora. Tente novamente ou fale com a equipe.", 503);
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new CommerceError("O assistente não conseguiu concluir a resposta. Tente outra mensagem ou fale com a equipe.", 502);
    await settleAssistantCall(tenantId, policy.usageMonth, reserved, { tokens: parsed.data.usage?.total_tokens, cost: parsed.data.usage?.cost });
    console.info("Store assistant provider completed.", { debugId, tenantId, model: policy.model, durationMs: Date.now() - started, tools: parsed.data.choices[0].message.tool_calls?.length ?? 0 });
    return parsed.data.choices[0].message;
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    console.warn("Store assistant transport failed.", { debugId, tenantId, durationMs: Date.now() - started });
    throw new CommerceError("A resposta demorou mais que o esperado. Tente novamente ou continue com a equipe.", 503);
  }
}
