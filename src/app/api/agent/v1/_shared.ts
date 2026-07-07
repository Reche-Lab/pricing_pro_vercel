import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
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

type AgentRequestLog = {
  debugId: string;
  method: string;
  path: string;
  scope: string;
  startedAt: number;
  source: string | null;
  userAgent: string | null;
  contentLength: string | null;
  idempotencyKeyPresent: boolean;
  tenantId?: string;
  tenantSlug?: string;
  apiKeyId?: string;
  keyName?: string;
};

export async function withAgentAuth<TBody>(
  request: Request,
  scope: string,
  parseBody: (value: unknown) => TBody,
  handler: AgentHandler<TBody>,
  options: { idempotent?: boolean } = {}
) {
  const log = createAgentRequestLog(request, scope);
  console.info("Agent API request started.", publicLogFields(log));

  const context = await authenticateRequest(request, log);
  if ("response" in context) return context.response;
  attachAgentContext(log, context.context);
  if (!hasAgentScope(context.context, scope)) {
    return failAgentRequest(log, new AgentApiError("forbidden_scope", `Escopo obrigatório ausente: ${scope}.`, 403));
  }

  let rawBody: unknown = null;
  if (request.method !== "GET") {
    try {
      rawBody = await request.json();
    } catch {
      return failAgentRequest(
        log,
        new AgentApiError("invalid_json", "Corpo da requisição não é um JSON válido.", 400, { recoverable: true })
      );
    }
  }

  let body: TBody;
  try {
    body = parseBody(rawBody);
  } catch (error) {
    return failAgentRequest(log, error);
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  const requestHash = hashRequestBody(body);
  if (options.idempotent && idempotencyKey) {
    try {
      const cached = await findIdempotencyResponse(context.context, idempotencyKey, requestHash);
      if (cached) {
        console.info("Agent API idempotency cache hit.", {
          ...publicLogFields(log),
          status: cached.status,
          durationMs: durationMs(log),
          requestHash
        });
        const response = NextResponse.json(cached.body, { status: cached.status });
        response.headers.set("x-agent-debug-id", log.debugId);
        return response;
      }
    } catch (error) {
      return failAgentRequest(log, error);
    }
  }

  try {
    const result = await handler({ request, context: context.context, body });
    const status = result.status ?? 200;
    if (options.idempotent && idempotencyKey) {
      await saveIdempotencyResponse(context.context, idempotencyKey, requestHash, result.body, status);
    }
    console.info("Agent API request completed.", {
      ...publicLogFields(log),
      status,
      durationMs: durationMs(log),
      idempotencySaved: Boolean(options.idempotent && idempotencyKey)
    });
    const response = NextResponse.json(result.body, { status });
    response.headers.set("x-agent-debug-id", log.debugId);
    return response;
  } catch (error) {
    return failAgentRequest(log, error);
  }
}

export async function withAgentAuthGet(
  request: Request,
  scope: string,
  handler: (context: AgentContext, request: Request) => Promise<{ body: unknown; status?: number }>
) {
  const log = createAgentRequestLog(request, scope);
  console.info("Agent API request started.", publicLogFields(log));

  const context = await authenticateRequest(request, log);
  if ("response" in context) return context.response;
  attachAgentContext(log, context.context);
  if (!hasAgentScope(context.context, scope)) {
    return failAgentRequest(log, new AgentApiError("forbidden_scope", `Escopo obrigatório ausente: ${scope}.`, 403));
  }

  try {
    const result = await handler(context.context, request);
    const status = result.status ?? 200;
    console.info("Agent API request completed.", {
      ...publicLogFields(log),
      status,
      durationMs: durationMs(log)
    });
    const response = NextResponse.json(result.body, { status });
    response.headers.set("x-agent-debug-id", log.debugId);
    return response;
  } catch (error) {
    return failAgentRequest(log, error);
  }
}

async function authenticateRequest(
  request: Request,
  log: AgentRequestLog
): Promise<{ context: AgentContext } | { response: NextResponse }> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    return { response: failAgentRequest(log, new AgentApiError("unauthorized", "Token de agente ausente.", 401)) };
  }

  let context: AgentContext | null;
  try {
    context = await authenticateAgentApiKey(token);
  } catch {
    return {
      response: failAgentRequest(
        log,
        new AgentApiError("authentication_failed", "Falha ao autenticar token de agente.", 500)
      )
    };
  }
  if (!context) {
    return { response: failAgentRequest(log, new AgentApiError("unauthorized", "Token de agente inválido.", 401)) };
  }

  return { context };
}

export function agentErrorResponse(error: unknown, debugId?: string) {
  if (error instanceof AgentApiError) {
    return NextResponse.json(
      {
        ok: false,
        debugId,
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
      debugId,
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

export function createAgentRequestLog(request: Request, scope: string): AgentRequestLog {
  return {
    debugId: request.headers.get("x-agent-debug-id") ?? randomUUID(),
    method: request.method,
    path: requestPath(request.url),
    scope,
    startedAt: Date.now(),
    source: request.headers.get("x-agent-source"),
    userAgent: request.headers.get("user-agent"),
    contentLength: request.headers.get("content-length"),
    idempotencyKeyPresent: Boolean(request.headers.get("idempotency-key"))
  };
}

export function attachAgentContext(log: AgentRequestLog, context: AgentContext) {
  log.tenantId = context.tenantId;
  log.tenantSlug = context.tenantSlug;
  log.apiKeyId = context.apiKeyId;
  log.keyName = context.keyName;
  console.info("Agent API request authenticated.", publicLogFields(log));
}

export function logAgentBinarySuccess(log: AgentRequestLog, metadata: Record<string, unknown> = {}) {
  console.info("Agent API binary request completed.", {
    ...publicLogFields(log),
    status: 200,
    durationMs: durationMs(log),
    ...metadata
  });
}

export function failAgentRequest(log: AgentRequestLog, error: unknown) {
  const status = statusFromError(error);
  console.error("Agent API request failed.", {
    ...publicLogFields(log),
    status,
    durationMs: durationMs(log),
    error: errorToLog(error)
  });
  const response = agentErrorResponse(error, log.debugId);
  response.headers.set("x-agent-debug-id", log.debugId);
  return response;
}

function publicLogFields(log: AgentRequestLog) {
  return {
    debugId: log.debugId,
    method: log.method,
    path: log.path,
    scope: log.scope,
    source: log.source,
    userAgent: log.userAgent,
    contentLength: log.contentLength,
    idempotencyKeyPresent: log.idempotencyKeyPresent,
    tenantId: log.tenantId,
    tenantSlug: log.tenantSlug,
    apiKeyId: log.apiKeyId,
    keyName: log.keyName
  };
}

function errorToLog(error: unknown) {
  if (error instanceof AgentApiError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field,
      recoverable: error.recoverable,
      stack: error.stack
    };
  }
  if (error instanceof Error) {
    return {
      code: "internal_error",
      message: error.message,
      stack: error.stack
    };
  }
  return {
    code: "unknown_error",
    message: String(error)
  };
}

function statusFromError(error: unknown) {
  return error instanceof AgentApiError ? error.status : 500;
}

function durationMs(log: AgentRequestLog) {
  return Date.now() - log.startedAt;
}

function requestPath(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
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
