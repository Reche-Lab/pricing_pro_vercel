import { NextResponse } from "next/server";
import {
  AgentApiError,
  authenticateAgentApiKey,
  findIdempotencyResponse,
  hashRequestBody,
  hasAgentScope,
  saveIdempotencyResponse,
  type AgentContext
} from "@/repositories/agent";

type AgentHandlerInput<TBody> = {
  request: Request;
  context: AgentContext;
  body: TBody;
};

type AgentHandler<TBody> = (input: AgentHandlerInput<TBody>) => Promise<{ body: unknown; status?: number }>;

export async function withAgentAuth<TBody>(
  request: Request,
  scope: string,
  parseBody: (value: unknown) => TBody,
  handler: AgentHandler<TBody>,
  options: { idempotent?: boolean } = {}
) {
  const context = await authenticateRequest(request);
  if ("response" in context) return context.response;
  if (!hasAgentScope(context.context, scope)) {
    return agentErrorResponse(new AgentApiError("forbidden_scope", `Escopo obrigatório ausente: ${scope}.`, 403));
  }

  let rawBody: unknown = null;
  if (request.method !== "GET") {
    rawBody = await request.json().catch(() => null);
  }

  let body: TBody;
  try {
    body = parseBody(rawBody);
  } catch (error) {
    return agentErrorResponse(error);
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  const requestHash = hashRequestBody(body);
  if (options.idempotent && idempotencyKey) {
    try {
      const cached = await findIdempotencyResponse(context.context, idempotencyKey, requestHash);
      if (cached) return NextResponse.json(cached.body, { status: cached.status });
    } catch (error) {
      return agentErrorResponse(error);
    }
  }

  try {
    const result = await handler({ request, context: context.context, body });
    const status = result.status ?? 200;
    if (options.idempotent && idempotencyKey) {
      await saveIdempotencyResponse(context.context, idempotencyKey, requestHash, result.body, status);
    }
    return NextResponse.json(result.body, { status });
  } catch (error) {
    return agentErrorResponse(error);
  }
}

export async function withAgentAuthGet(
  request: Request,
  scope: string,
  handler: (context: AgentContext, request: Request) => Promise<{ body: unknown; status?: number }>
) {
  const context = await authenticateRequest(request);
  if ("response" in context) return context.response;
  if (!hasAgentScope(context.context, scope)) {
    return agentErrorResponse(new AgentApiError("forbidden_scope", `Escopo obrigatório ausente: ${scope}.`, 403));
  }

  try {
    const result = await handler(context.context, request);
    return NextResponse.json(result.body, { status: result.status ?? 200 });
  } catch (error) {
    return agentErrorResponse(error);
  }
}

async function authenticateRequest(request: Request): Promise<{ context: AgentContext } | { response: NextResponse }> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    return { response: agentErrorResponse(new AgentApiError("unauthorized", "Token de agente ausente.", 401)) };
  }

  const context = await authenticateAgentApiKey(token);
  if (!context) {
    return { response: agentErrorResponse(new AgentApiError("unauthorized", "Token de agente inválido.", 401)) };
  }

  return { context };
}

export function agentErrorResponse(error: unknown) {
  if (error instanceof AgentApiError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          field: error.field,
          recoverable: error.recoverable
        },
        nextActions: nextActionsForError(error)
      },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : "Erro inesperado na API do agente.";
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "internal_error",
        message,
        recoverable: false
      },
      nextActions: []
    },
    { status: 500 }
  );
}

function nextActionsForError(error: AgentApiError) {
  if (error.code === "missing_customer_postal_code") {
    return [{ type: "ask_user", message: "Qual é o CEP de entrega?" }];
  }
  if (error.code === "ambiguous_product") {
    return [{ type: "ask_user", message: "Encontrei mais de um produto. Qual opção o cliente quer?" }];
  }
  if (error.code === "product_not_found") {
    return [{ type: "ask_user", message: "Não encontrei esse produto. Pode informar tamanho, modelo ou SKU?" }];
  }
  return [];
}

export function emptyBodyParser(value: unknown) {
  return value ?? {};
}
