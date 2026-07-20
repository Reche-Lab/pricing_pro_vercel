import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent,
  updateIntegrationCredentials
} from "@/repositories/integrations";
import { getQuoteDetail } from "@/repositories/quotes";
import { extractExternalId, OlistRequestError, olistRequest, refreshOlistToken } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

export async function loadQuoteOlistContext(
  quoteId: string,
  provider: "olist" | "olist_crm"
) {
  const session = await getCurrentSession();
  if (!session) return { error: { status: 401, body: { ok: false } } } as const;

  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) {
    return { error: { status: 400, body: { ok: false, error: "Invalid quote id." } } } as const;
  }

  const [detail, primaryConnection, legacyCrmConnection] = await Promise.all([
    getQuoteDetail(session.userId, session.tenantId, quoteId),
    getIntegrationConnection(session.userId, session.tenantId, "olist"),
    provider === "olist_crm" ? getIntegrationConnection(session.userId, session.tenantId, "olist_crm") : Promise.resolve(null)
  ]);
  const connection =
    primaryConnection?.status === "active"
      ? primaryConnection
      : legacyCrmConnection?.status === "active"
        ? legacyCrmConnection
        : primaryConnection;
  if (!detail) return { error: { status: 404, body: { ok: false, error: "Quote not found." } } } as const;
  if (!connection || connection.status !== "active") {
    return { error: { status: 409, body: { ok: false, error: "Olist integration is not active." } } } as const;
  }
  const settings = mergeOlistSettings(
    connection.settings as OlistSettings,
    legacyCrmConnection?.settings as OlistSettings | undefined
  );

  return {
    session,
    detail,
    connection,
    settings,
    credentials: decryptIntegrationCredentials<OlistCredentials>(connection)
  } as const;
}

export async function sendOlistQuoteOperation(input: {
  userId: string;
  tenantId: string;
  provider: "olist" | "olist_crm";
  operation: string;
  quoteId: string;
  settings: OlistSettings;
  credentials: OlistCredentials;
  path: string;
  payload?: unknown;
  payloadForLog?: unknown;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}) {
  const debugId = randomUUID();
  const payloadForLog = input.payloadForLog ?? serializePayload(input.payload);
  try {
    console.info("Olist quote operation started.", {
      debugId,
      provider: input.provider,
      operation: input.operation,
      quoteId: input.quoteId,
      method: input.method ?? "POST",
      path: input.path,
      payload: payloadForLog
    });
    const result = await sendOlistRequestWithRefresh(input);
    const externalId = extractExternalId(result);
    const summary = summarizeOlistResult(result);
    console.info("Olist quote operation succeeded.", {
      debugId,
      provider: input.provider,
      operation: input.operation,
      quoteId: input.quoteId,
      method: input.method ?? "POST",
      path: input.path,
      externalId,
      summary
    });
    await safeLogIntegrationEvent(input.userId, input.tenantId, debugId, {
      provider: input.provider,
      operation: input.operation,
      status: "success",
      externalId,
      metadata: { quoteId: input.quoteId, path: input.path, payload: payloadForLog, result, summary }
    });
    return {
      ok: true,
      result,
      externalId,
      debugId,
      message: humanizeOlistSuccess(input.operation, externalId, summary),
      call: {
        provider: input.provider,
        operation: input.operation,
        method: input.method ?? "POST",
        path: input.path,
        payload: payloadForLog,
        summary
      }
    } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Olist error";
    const status = error instanceof OlistRequestError ? error.status : undefined;
    const response = error instanceof OlistRequestError ? error.data : undefined;
    console.error("Olist quote operation failed.", {
      debugId,
      provider: input.provider,
      operation: input.operation,
      quoteId: input.quoteId,
      method: input.method ?? "POST",
      path: input.path,
      payload: payloadForLog,
      status,
      response,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    await safeLogIntegrationEvent(input.userId, input.tenantId, debugId, {
      provider: input.provider,
      operation: input.operation,
      status: "error",
      message,
      metadata: { quoteId: input.quoteId, path: input.path, payload: payloadForLog, httpStatus: status, response }
    });
    throw new OlistQuoteOperationError(message, debugId, status, response);
  }
}

async function sendOlistRequestWithRefresh(input: {
  userId: string;
  tenantId: string;
  provider: "olist" | "olist_crm";
  settings: OlistSettings;
  credentials: OlistCredentials;
  path: string;
  payload?: unknown;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}) {
  try {
    return await olistRequest({
      settings: input.settings,
      credentials: input.credentials,
      path: input.path,
      body: input.payload,
      method: input.method ?? "POST"
    });
  } catch (error) {
    if (!(error instanceof OlistRequestError) || error.status !== 401 || !input.credentials.refreshToken) {
      throw error;
    }

    console.info("Olist request returned 401. Trying OAuth token refresh once.", {
      provider: input.provider,
      path: input.path,
      method: input.method ?? "POST"
    });
    const token = await refreshOlistToken(input.settings, input.credentials);
    const refreshedCredentials: OlistCredentials = {
      ...input.credentials,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? input.credentials.refreshToken
    };

    await updateIntegrationCredentials(input.userId, input.tenantId, {
      provider: input.provider,
      credentials: refreshedCredentials,
      status: "active"
    });
    await logIntegrationEvent(input.userId, input.tenantId, {
      provider: input.provider,
      operation: "oauth.refresh_token",
      status: "success",
      metadata: {
        tokenType: token.token_type,
        expiresIn: token.expires_in,
        scope: token.scope
      }
    });

    console.info("Olist OAuth token refreshed. Retrying request once.", {
      provider: input.provider,
      path: input.path,
      method: input.method ?? "POST"
    });
    return await olistRequest({
      settings: input.settings,
      credentials: refreshedCredentials,
      path: input.path,
      body: input.payload,
      method: input.method ?? "POST"
    });
  }
}

function serializePayload(payload: unknown): unknown {
  if (typeof FormData !== "undefined" && payload instanceof FormData) {
    return Object.fromEntries(Array.from(payload.entries()).map(([key, value]) => [
      key,
      typeof value === "string" ? value : `[arquivo:${value.name}]`
    ]));
  }
  return payload;
}

export class OlistQuoteOperationError extends Error {
  constructor(
    message: string,
    public readonly debugId: string,
    public readonly status?: number,
    public readonly response?: unknown
  ) {
    super(message);
    this.name = "OlistQuoteOperationError";
  }
}

export function olistOperationErrorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const debugId = error instanceof OlistQuoteOperationError ? error.debugId : randomUUID();
  const status = error instanceof OlistQuoteOperationError ? error.status : undefined;
  const response = error instanceof OlistQuoteOperationError ? error.response : undefined;
  if (!(error instanceof OlistQuoteOperationError)) {
    console.error("Unexpected Olist route failure.", {
      debugId,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
  }
  return {
    ok: false,
    error: humanizeOlistError(message, status),
    debugId,
    httpStatus: status,
    responseSummary: summarizeOlistResult(response),
    response
  };
}

async function safeLogIntegrationEvent(
  userId: string,
  tenantId: string,
  debugId: string,
  input: Parameters<typeof logIntegrationEvent>[2]
) {
  try {
    await logIntegrationEvent(userId, tenantId, {
      ...input,
      metadata: {
        ...(input.metadata ?? {}),
        debugId
      }
    });
  } catch (error) {
    console.error("Failed to persist Olist quote integration log.", {
      debugId,
      operation: input.operation,
      status: input.status,
      message: error instanceof Error ? error.message : "Unknown integration log error",
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

function mergeOlistSettings(settings: OlistSettings, legacyCrmSettings?: OlistSettings): OlistSettings {
  if (!legacyCrmSettings) return settings;
  return {
    ...settings,
    quote_path: settings.quote_path ?? legacyCrmSettings.quote_path,
    user_path: settings.user_path ?? legacyCrmSettings.user_path,
    task_path: settings.task_path ?? legacyCrmSettings.task_path
  };
}

function humanizeOlistSuccess(operation: string, externalId: string | null, summary: Record<string, unknown> | null) {
  const count = typeof summary?.registros === "number" ? summary.registros : null;
  if (operation === "customers.lookup") {
    if (externalId) return `Cliente encontrado no Olist/Tiny. ID: ${externalId}.`;
    if (count === 0) return "Consulta concluída. Nenhum cliente correspondente foi encontrado.";
    return "Consulta de cliente concluída.";
  }
  if (operation === "customers.create") return externalId ? `Cliente criado no Olist/Tiny. ID: ${externalId}.` : "Cliente enviado ao Olist/Tiny.";
  if (operation === "crm.quotes.create") return externalId ? `Assunto CRM criado. ID: ${externalId}.` : "Assunto CRM enviado ao Olist/Tiny.";
  if (operation === "crm.tasks.create") return externalId ? `Tarefa CRM criada. ID: ${externalId}.` : "Tarefa CRM enviada ao Olist/Tiny.";
  if (operation === "sales_orders.create") return externalId ? `Pedido de venda criado. ID: ${externalId}.` : "Pedido de venda enviado ao Olist/Tiny.";
  if (operation === "sales_orders.dispatch.update") return "Despacho, volumes e rastreio enviados ao pedido Olist/Tiny.";
  if (operation === "invoices.create") return externalId ? `Nota fiscal gerada. ID: ${externalId}.` : "Solicitação de geração de nota enviada ao Olist/Tiny.";
  if (operation === "invoices.emit") return "Solicitação de autorização da nota enviada ao Olist/Tiny.";
  if (operation === "invoices.cancel") return "Solicitação de cancelamento da nota enviada ao Olist/Tiny.";
  return externalId ? `Operação concluída. ID: ${externalId}.` : "Operação Olist/Tiny concluída.";
}

function humanizeOlistError(message: string, status?: number) {
  if (status === 401) return `Olist/Tiny recusou a autenticação. O sistema tentou usar/renovar o token OAuth, mas a chamada continuou não autorizada. Reconecte o OAuth e confira se o aplicativo tem permissão para o módulo usado, especialmente Notas Fiscais. Detalhe: ${message}`;
  if (status === 403) return `Olist/Tiny negou permissão para este recurso. Verifique permissões do aplicativo/token. Detalhe: ${message}`;
  if (status === 404) return `Olist/Tiny não encontrou o endpoint ou recurso solicitado. Confira o path configurado. Detalhe: ${message}`;
  if (status === 422 || status === 400) return `Olist/Tiny recusou os dados enviados. Detalhe: ${message}`;
  if (status && status >= 500) return `Olist/Tiny retornou indisponibilidade ou erro interno. Detalhe: ${message}`;
  return message;
}

function summarizeOlistResult(data: unknown): Record<string, unknown> | null {
  if (data === null || data === undefined) return null;
  const records = recordsFromOlistResult(data);
  const first = records[0];
  const summary: Record<string, unknown> = {
    registros: records.length
  };
  if (first && typeof first === "object") {
    const record = first as Record<string, unknown>;
    const fields = {
      id: pickString(record, ["id", "uuid", "idContato", "idPedido", "idNotaFiscal"]),
      nome: pickString(record, ["nome", "name", "razaoSocial"]),
      documento: pickString(record, ["cpfCnpj", "documento", "document"]),
      email: pickString(record, ["email"]),
      telefone: pickString(record, ["celular", "telefone", "phone"]),
      situacao: pickString(record, ["situacao", "status"]),
      numero: pickString(record, ["numero", "numeroPedido", "numeroPedidoEcommerce"])
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value) summary[key] = value;
    }
  }
  return summary;
}

function recordsFromOlistResult(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return data === null || data === undefined ? [] : [data];
  const record = data as Record<string, unknown>;
  for (const key of ["itens", "items", "data", "retorno", "content"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = recordsFromOlistResult(value);
      if (nested.length) return nested;
    }
  }
  return [record];
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested: string | null = pickString(value as Record<string, unknown>, keys);
      if (nested) return nested;
    }
  }
  return null;
}
