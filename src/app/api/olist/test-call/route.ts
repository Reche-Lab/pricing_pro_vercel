import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const testCallSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().trim().min(1),
  query: z.record(z.unknown()).optional().default({}),
  body: z.unknown().optional()
});

export async function POST(request: Request) {
  const debugId = randomUUID();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, debugId }, { status: 401 });

  const input = await request.json().catch(() => null);
  const parsed = testCallSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten(), debugId }, { status: 400 });
  }

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Integração Olist não está ativa.", debugId }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  const credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  const apiBaseUrl = settings.api_base_url?.replace(/\/$/, "");
  const token = credentials.accessToken || credentials.apiToken;
  if (!apiBaseUrl) return NextResponse.json({ ok: false, error: "Base URL da API Olist não configurada.", debugId }, { status: 409 });
  if (!token) return NextResponse.json({ ok: false, error: "Token OAuth/API Olist ausente.", debugId }, { status: 409 });

  const startedAt = Date.now();
  const url = new URL(`${apiBaseUrl}${parsed.data.path.startsWith("/") ? parsed.data.path : `/${parsed.data.path}`}`);
  for (const [key, value] of Object.entries(parsed.data.query)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      if (value !== "") url.searchParams.set(key, String(value));
    }
  }

  console.info("Olist API test call started.", {
    debugId,
    method: parsed.data.method,
    endpoint: `${url.origin}${url.pathname}`,
    query: Object.fromEntries(url.searchParams.entries()),
    hasBody: parsed.data.body !== undefined
  });

  try {
    const response = await fetch(url, {
      method: parsed.data.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        [settings.auth_header || "authorization"]: authHeaderValue(settings, token)
      },
      body: parsed.data.method === "GET" || parsed.data.body === undefined
        ? undefined
        : JSON.stringify(parsed.data.body)
    });
    const text = await response.text();
    const data = parseJson(text);
    const durationMs = Date.now() - startedAt;
    const humanMessage = humanizeOlistResponse(response.status, response.ok, data, durationMs);

    await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
      provider: "olist",
      operation: "test.call",
      status: response.ok ? "success" : "error",
      message: response.ok ? null : humanMessage,
      metadata: {
        method: parsed.data.method,
        path: parsed.data.path,
        endpoint: `${url.origin}${url.pathname}`,
        query: Object.fromEntries(url.searchParams.entries()),
        request_body: parsed.data.body ?? null,
        response_status: response.status,
        response_body: data,
        duration_ms: durationMs
      }
    });

    return NextResponse.json({
      ok: true,
      debugId,
      call: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        durationMs,
        method: parsed.data.method,
        endpoint: `${url.origin}${url.pathname}`,
        query: Object.fromEntries(url.searchParams.entries()),
        message: humanMessage,
        data
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao chamar Olist.";
    console.error("Olist API test call failed before response.", {
      debugId,
      method: parsed.data.method,
      endpoint: `${url.origin}${url.pathname}`,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
      provider: "olist",
      operation: "test.call",
      status: "error",
      message,
      metadata: {
        method: parsed.data.method,
        path: parsed.data.path,
        endpoint: `${url.origin}${url.pathname}`
      }
    });
    return NextResponse.json({ ok: false, error: message, debugId }, { status: 502 });
  }
}

function authHeaderValue(settings: OlistSettings, token: string) {
  const scheme = settings.auth_scheme ?? "Bearer";
  return scheme === "ApiKey" ? token : `${scheme} ${token}`;
}

function parseJson(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function humanizeOlistResponse(status: number, ok: boolean, data: unknown, durationMs: number) {
  const detail = extractError(data);
  if (ok) return `Chamada concluída com sucesso em ${durationMs}ms.`;
  if (status === 400) return detail ? `Requisição inválida: ${detail}` : "Requisição inválida. Confira parâmetros e corpo JSON.";
  if (status === 401) return "Não autorizado. Refaça o OAuth ou confira se o token está válido.";
  if (status === 403) return "Acesso negado pela Olist/Tiny. O app/token não tem permissão para este recurso.";
  if (status === 404) return "Recurso não encontrado. Confira o path e os IDs informados.";
  if (status === 429) return "Limite de chamadas atingido. Aguarde alguns instantes antes de testar novamente.";
  if (status >= 500) return "Olist/Tiny retornou erro interno ou indisponibilidade temporária.";
  return detail ? `Olist/Tiny retornou erro: ${detail}` : `Olist/Tiny retornou HTTP ${status}.`;
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.mensagem === "string") return record.mensagem;
  if (typeof record.error === "string") return record.error;
  if (typeof record.descricao === "string") return record.descricao;
  if (Array.isArray(record.errors)) return record.errors.map(formatErrorItem).join("; ");
  if (Array.isArray(record.erros)) return record.erros.map(formatErrorItem).join("; ");
  if (record.retorno) return extractError(record.retorno);
  return null;
}

function formatErrorItem(item: unknown) {
  if (!item || typeof item !== "object") return String(item);
  const record = item as Record<string, unknown>;
  return [
    record.message,
    record.mensagem,
    record.error,
    record.descricao,
    record.campo ? `${record.campo}` : null
  ].filter(Boolean).join(" - ") || JSON.stringify(record);
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
    console.error("Failed to persist Olist test call log.", {
      debugId,
      message: error instanceof Error ? error.message : "Unknown integration log error",
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}
