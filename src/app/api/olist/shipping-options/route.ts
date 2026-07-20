import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent,
  updateIntegrationCredentials
} from "@/repositories/integrations";
import { OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import { OlistRequestError, olistRequest, refreshOlistToken } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const searchSchema = z.object({
  nome: z.string().trim().optional().default(""),
  tipo: z.string().trim().optional().default(""),
  situacao: z.string().trim().optional().default("1")
});

export async function GET(request: Request) {
  const debugId = randomUUID();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, debugId }, { status: 401 });

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten(), debugId }, { status: 400 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Integração Olist não está ativa.", debugId }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  let credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  const query = compactQuery({
    nome: parsed.data.nome,
    tipo: parsed.data.tipo,
    situacao: parsed.data.situacao,
    limit: "100",
    offset: "0"
  });
  const path = withQuery(OLIST_DEFAULT_PATHS.shippingForms, query);

  console.info("Olist shipping options lookup started.", {
    debugId,
    path,
    query
  });

  try {
    const listResponse = await requestWithRefresh({
      userId: session.userId,
      tenantId: session.tenantId,
      settings,
      credentials,
      path
    });
    if (listResponse.credentials) credentials = listResponse.credentials;
    const baseOptions = records(listResponse.result);
    const options = [];
    const failures: Array<{ id: string; message: string }> = [];

    for (const baseOption of baseOptions) {
      const summary = normalizeShippingForm(baseOption);
      if (!summary?.id) continue;
      try {
        const detailResponse = await requestWithRefresh({
          userId: session.userId,
          tenantId: session.tenantId,
          settings,
          credentials,
          path: `${OLIST_DEFAULT_PATHS.shippingForms}/${encodeURIComponent(summary.id)}`
        });
        if (detailResponse.credentials) credentials = detailResponse.credentials;
        options.push({
          ...summary,
          ...normalizeShippingForm(detailResponse.result),
          freightForms: extractFreightForms(detailResponse.result),
          raw: detailResponse.result
        });
      } catch (error) {
        failures.push({
          id: summary.id,
          message: error instanceof Error ? error.message : "Falha ao obter detalhes da forma de envio."
        });
        options.push({ ...summary, freightForms: [], raw: baseOption });
      }
    }

    await safeLog(session.userId, session.tenantId, {
      operation: "shipping_options.lookup",
      status: failures.length ? "pending" : "success",
      message: failures.length ? "Consulta parcial de formas de envio Olist." : null,
      metadata: { debugId, query, count: options.length, failures }
    });

    return NextResponse.json({
      ok: true,
      debugId,
      options,
      failures,
      message: options.length
        ? `Encontramos ${options.length} forma(s) de envio no Olist/Tiny.`
        : "Nenhuma forma de envio encontrada no Olist/Tiny para este filtro."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar formas de envio no Olist.";
    const status = error instanceof OlistRequestError ? error.status : undefined;
    const response = error instanceof OlistRequestError ? error.data : undefined;
    console.error("Olist shipping options lookup failed.", {
      debugId,
      path,
      status,
      response,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    await safeLog(session.userId, session.tenantId, {
      operation: "shipping_options.lookup",
      status: "error",
      message,
      metadata: { debugId, query, status, response }
    });
    return NextResponse.json({
      ok: false,
      debugId,
      error: humanizeOlistShippingError(message, status),
      response
    }, { status: 502 });
  }
}

async function requestWithRefresh(input: {
  userId: string;
  tenantId: string;
  settings: OlistSettings;
  credentials: OlistCredentials;
  path: string;
}): Promise<{ result: unknown; credentials?: OlistCredentials }> {
  try {
    return {
      result: await olistRequest({
        settings: input.settings,
        credentials: input.credentials,
        path: input.path,
        method: "GET"
      })
    };
  } catch (error) {
    if (!(error instanceof OlistRequestError) || error.status !== 401 || !input.credentials.refreshToken) throw error;
    const token = await refreshOlistToken(input.settings, input.credentials);
    const credentials = {
      ...input.credentials,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? input.credentials.refreshToken
    };
    await updateIntegrationCredentials(input.userId, input.tenantId, {
      provider: "olist",
      credentials,
      status: "active"
    });
    return {
      credentials,
      result: await olistRequest({
        settings: input.settings,
        credentials,
        path: input.path,
        method: "GET"
      })
    };
  }
}

function normalizeShippingForm(data: unknown) {
  const record = firstRecord(data);
  if (!record) return null;
  return {
    id: stringValue(record.id),
    name: stringValue(record.nome ?? record.name),
    type: stringValue(record.tipo),
    status: stringValue(record.situacao),
    gatewayName: nestedString(record.gatewayLogistico, ["nome", "name"]),
    gatewayId: nestedString(record.gatewayLogistico, ["id"])
  };
}

function extractFreightForms(data: unknown) {
  const record = firstRecord(data);
  if (!record) return [];
  const source = Array.isArray(record.formasFrete) ? record.formasFrete : [];
  return source
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const form = item as Record<string, unknown>;
      const id = stringValue(form.id);
      const name = stringValue(form.nome ?? form.name);
      if (!id || !name) return null;
      return {
        id,
        name,
        code: stringValue(form.codigo),
        externalCode: stringValue(form.codigoExterno),
        deliveryType: stringValue(form.tipoEntrega),
        raw: form
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function records(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.itens)) return record.itens;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  if (record.retorno) return records(record.retorno);
  return [];
}

function firstRecord(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return firstRecord(data[0]);
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.data) return firstRecord(record.data);
  if (record.retorno) return firstRecord(record.retorno);
  return record;
}

function nestedString(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const output = stringValue(record[key]);
    if (output) return output;
  }
  return null;
}

function stringValue(value: unknown) {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function compactQuery(input: Record<string, string>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== ""));
}

function withQuery(path: string, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return params.size ? `${path}?${params.toString()}` : path;
}

function humanizeOlistShippingError(message: string, status?: number) {
  if (status === 401) return `Olist/Tiny recusou a autenticação. Refaça o OAuth e tente consultar novamente. Detalhe: ${message}`;
  if (status === 403) return `Olist/Tiny negou acesso às formas de envio. Confira as permissões do aplicativo/token. Detalhe: ${message}`;
  if (status === 404) return `Endpoint de formas de envio não encontrado. Confira se a integração está usando API v3. Detalhe: ${message}`;
  return message;
}

async function safeLog(
  userId: string,
  tenantId: string,
  input: Omit<Parameters<typeof logIntegrationEvent>[2], "provider">
) {
  try {
    await logIntegrationEvent(userId, tenantId, { provider: "olist", ...input });
  } catch {
    // This endpoint must not fail only because optional logging failed.
  }
}
