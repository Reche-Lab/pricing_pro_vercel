import { CommerceError } from "@/domain/commerce/commerce";

type Reason = "authentication" | "permission" | "credits" | "privacy_route" | "price_route" | "parameters" | "route" | "rate_limit" | "timeout" | "transport" | "response" | "unavailable";
type BodyKind = "json" | "empty" | "html" | "text" | "invalid_json" | "truncated" | "unreadable";
export type AssistantProviderDiagnostics = {
  httpStatus: number; providerCode?: number; reason: Reason; bodyKind: BodyKind;
  providerRequestId?: string; retryAfterSeconds?: number; limitSource?: string; rejectedParameters: string[];
};
export type AssistantFailedAttempt = { model: string; attempt: number; diagnostics: AssistantProviderDiagnostics };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const parameterNames = ["messages", "temperature", "max_tokens", "parallel_tool_calls", "tool_choice", "tools", "reasoning", "require_parameters", "data_collection", "zdr", "max_price", "allow_safety_retention_google", "allow_safety_retention_other"];
const limitSources = ["openrouter_credits", "openrouter_key_limit", "openrouter_in_flight_budget"];
export function assistantDiagnostics(httpStatus: number, body: unknown, headers = new Headers(), secrets: string[] = [], bodyKind: BodyKind = "json"): AssistantProviderDiagnostics {
  const error = object(object(body).error), metadata = object(error.metadata);
  const code = typeof error.code === "number" ? error.code : typeof error.code === "string" && /^\d{3}$/.test(error.code) ? Number(error.code) : undefined;
  const providerCode = code !== undefined && Number.isInteger(code) && code >= 400 && code <= 599 ? code : undefined;
  const status = providerCode ?? httpStatus;
  // Classify only known fields. Never return messages, raw metadata, or echoed prompts.
  const message = [error.message, error.param, object(body).message].filter(value => typeof value === "string").map(value => String(value).slice(0, 2000)).join(" ").toLowerCase();
  const rejectedParameters = parameterNames.filter(name => message.includes(name));
  let reason: Reason = "unavailable";
  if (status === 401) reason = "authentication";
  else if (status === 403) reason = "permission";
  else if (status === 402) reason = "credits";
  else if (status === 429) reason = "rate_limit";
  else if (status === 408 || status === 504) reason = "timeout";
  else if (status === 400 || status === 422 || status === 413) reason = "parameters";
  else if (status === 404 || status === 503) {
    if (/privacy|data polic|retention|\bzdr\b/.test(message)) reason = "privacy_route";
    else if (/max_price|pricing|price (?:cap|limit)|cost limit/.test(message)) reason = "price_route";
    else if (/parameter|support.*(?:tools|tool_choice)/.test(message)) reason = "parameters";
    else if (status === 404) reason = "route";
  }
  const requestId = headers.get("x-request-id") || headers.get("x-generation-id") || headers.get("cf-ray") || "";
  const safeId = /^(?:req[-_][a-zA-Z0-9_-]{3,140}|gen[-_][a-zA-Z0-9_-]{3,140}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}|[a-f\d]{16}-[A-Z]{3})$/.test(requestId) && !secrets.some(secret => secret && requestId.includes(secret));
  const retry = headers.get("retry-after") || "", retryAfterSeconds = /^\d{1,5}$/.test(retry) && Number(retry) <= 86400 ? Number(retry) : undefined;
  return { httpStatus, providerCode, reason, bodyKind, rejectedParameters,
    ...(safeId ? { providerRequestId: requestId } : {}), ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    ...(typeof metadata.limit_source === "string" && limitSources.includes(metadata.limit_source) ? { limitSource: metadata.limit_source } : {}) };
}
export async function readAssistantErrorResponse(response: Response, secrets: string[] = []) {
  const reader = response.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.length;
        if (size > 32768) { await reader.cancel().catch(() => {}); return assistantDiagnostics(response.status, null, response.headers, secrets, "truncated"); }
        chunks.push(part.value);
      }
    } catch { return assistantDiagnostics(response.status, null, response.headers, secrets, "unreadable"); }
    finally { reader.releaseLock(); }
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return assistantDiagnostics(response.status, null, response.headers, secrets, "empty");
  try { return assistantDiagnostics(response.status, JSON.parse(text), response.headers, secrets); }
  catch { return assistantDiagnostics(response.status, null, response.headers, secrets, text.startsWith("<") ? "html" : response.headers.get("content-type")?.includes("json") ? "invalid_json" : "text"); }
}
export function assistantAdminFailureMessage(diagnostic: AssistantProviderDiagnostics) {
  const messages: Record<Reason, string> = {
    authentication: "O OpenRouter não autenticou a conexão. Confira OPENROUTER_API_KEY no ambiente correto da Vercel e faça novo deploy após corrigir.",
    permission: "O OpenRouter bloqueou a solicitação. Confira as permissões da chave, os modelos permitidos e os guardrails da conta; a aplicação não contorna esse bloqueio.",
    credits: diagnostic.limitSource === "openrouter_in_flight_budget" ? "O orçamento de solicitações simultâneas do OpenRouter foi atingido. Aguarde as chamadas em andamento e tente novamente." : "A conta ou a chave do OpenRouter está sem créditos suficientes ou atingiu seu limite. Confira o saldo e o limite da chave no OpenRouter, além da cota deste tenant.",
    privacy_route: "O OpenRouter não encontrou provedor compatível com a política de privacidade/ZDR. Confira os provedores e guardrails da conta. A aplicação não desativa a privacidade automaticamente.",
    price_route: "O OpenRouter não encontrou provedor dentro do teto de preço configurado. Confira os modelos e preços disponíveis; nenhum teto foi aumentado automaticamente.",
    parameters: "O OpenRouter recusou os parâmetros da solicitação. Confira o diagnóstico de parâmetros e a compatibilidade do modelo nos logs da Vercel.",
    route: "O OpenRouter não encontrou uma rota para o modelo solicitado. Confira o identificador do modelo, os provedores habilitados e os filtros de parâmetros, preço e privacidade.",
    rate_limit: "O limite de chamadas do OpenRouter ou do provedor foi atingido. Aguarde e confira os limites da chave e da conta antes de repetir o teste.",
    timeout: "O provedor de IA não respondeu dentro do prazo. Tente novamente mais tarde; os logs mostram se o fallback foi utilizado.",
    transport: "Não foi possível completar a conexão com o OpenRouter. Confira OPENROUTER_BASE_URL e a disponibilidade da rede do servidor.",
    response: "O provedor não retornou uma resposta válida para o teste. Confira o modelo e o diagnóstico de formato nos logs; a ativação não foi concluída.",
    unavailable: "O OpenRouter ou o provedor está indisponível ou sem rota elegível. Confira a disponibilidade e os filtros de roteamento da conta antes de repetir o teste.",
  };
  const status = diagnostic.httpStatus ? `HTTP ${diagnostic.httpStatus}${diagnostic.providerCode !== undefined && diagnostic.providerCode !== diagnostic.httpStatus ? `, código ${diagnostic.providerCode}` : ""}` : "sem resposta HTTP";
  return `OpenRouter (${status}): ${messages[diagnostic.reason]}`;
}
export class AssistantProviderError extends CommerceError {
  readonly code: string;
  constructor(readonly reference: string, readonly diagnostics: AssistantProviderDiagnostics, readonly attempts: AssistantFailedAttempt[], admin = false) {
    const code = `assistant_openrouter_${diagnostics.reason}`;
    const publicMessage = [401, 403].includes(diagnostics.providerCode ?? diagnostics.httpStatus) ? "Não foi possível autorizar o provedor de IA. A equipe da loja pode continuar seu atendimento." : "O assistente está indisponível agora. Tente novamente ou fale com a equipe.";
    const details = { code, reference, upstreamStatus: diagnostics.httpStatus, providerCode: diagnostics.providerCode, reason: diagnostics.reason };
    super(admin ? `${assistantAdminFailureMessage(diagnostics)} Referência: ${reference}.` : publicMessage, 503, details);
    this.name = "AssistantProviderError"; this.code = code;
  }
  forAdmin() { return new AssistantProviderError(this.reference, this.diagnostics, this.attempts, true); }
}
