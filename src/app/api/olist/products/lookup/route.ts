import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const lookupSchema = z.object({
  sku: z.string().trim().min(1)
});

type OlistProductSummary = {
  id: string | null;
  nome: string | null;
  codigo: string | null;
  situacao: string | null;
  preco: string | number | null;
  raw: unknown;
};

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Informe o SKU/código do produto para buscar no Olist." }, { status: 400 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Integração Olist não está ativa para este tenant." }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  const credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  const response = await directOlistGet(settings, credentials, OLIST_DEFAULT_PATHS.products, {
    codigo: parsed.data.sku,
    limit: "10",
    offset: "0"
  }).catch((error) => ({
    ok: false,
    status: 502,
    data: null,
    message: error instanceof Error ? error.message : "Falha ao consultar produto no Olist."
  }));

  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: humanizeOlistError(response.status, response.message),
        status: response.status,
        raw: response.data
      },
      { status: response.status === 401 || response.status === 403 ? 409 : 502 }
    );
  }

  const products = recordsFromOlistResult(response.data)
    .map(summarizeProductRecord)
    .filter((item) => item.id || item.nome || item.codigo);

  return NextResponse.json({
    ok: true,
    products,
    message: products.length
      ? `${products.length} produto(s) encontrado(s) no Olist para o SKU ${parsed.data.sku}.`
      : `Nenhum produto encontrado no Olist para o SKU ${parsed.data.sku}.`,
    raw: response.data
  });
}

async function directOlistGet(
  settings: OlistSettings,
  credentials: OlistCredentials,
  path: string,
  query: Record<string, string>
) {
  const apiBaseUrl = settings.api_base_url?.replace(/\/$/, "");
  const token = credentials.accessToken || credentials.apiToken;
  if (!apiBaseUrl) throw new Error("Base URL da API Olist não configurada.");
  if (!token) throw new Error("Token OAuth/API Olist ausente.");

  const url = new URL(`${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== "") url.searchParams.set(key, value);
  }

  console.info("Olist product lookup started.", {
    endpoint: `${url.origin}${url.pathname}`,
    query: Object.fromEntries(url.searchParams.entries())
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      [settings.auth_header || "authorization"]: authHeaderValue(settings, token)
    }
  });
  const text = await response.text();
  const data = parseJson(text);

  console.info("Olist product lookup finished.", {
    endpoint: `${url.origin}${url.pathname}`,
    status: response.status,
    ok: response.ok
  });

  return {
    ok: response.ok,
    status: response.status,
    data,
    message: extractError(data) ?? response.statusText
  };
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

function recordsFromOlistResult(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  for (const key of ["itens", "items", "produtos", "data", "registros", "content"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    const nested = recordsFromOlistResult(value);
    if (nested.length) return nested;
  }
  return [record];
}

function summarizeProductRecord(item: unknown): OlistProductSummary {
  const record = unwrapRecord(item);
  return {
    id: firstString(record, ["id", "idProduto", "produtoId", "codigoProduto"]),
    nome: firstString(record, ["nome", "descricao", "description"]),
    codigo: firstString(record, ["codigo", "sku", "codigoSku"]),
    situacao: firstString(record, ["situacao", "status"]),
    preco: firstPrimitive(record, ["preco", "precoVenda", "valorUnitario"]),
    raw: item
  };
}

function unwrapRecord(item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object") return {};
  const record = item as Record<string, unknown>;
  if (record.produto && typeof record.produto === "object") return record.produto as Record<string, unknown>;
  return record;
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  const value = firstPrimitive(record, keys);
  return value === null || value === undefined ? null : String(value);
}

function firstPrimitive(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") return value;
  }
  return null;
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

function humanizeOlistError(status: number, message: string) {
  if (status === 401) return "Olist não autorizou a busca. Refaça o OAuth ou confira o token.";
  if (status === 403) return "Olist negou acesso à consulta de produtos para este token/app.";
  if (status === 404) return "Endpoint de produtos não encontrado no Olist.";
  return message || `Olist retornou HTTP ${status} ao buscar o produto.`;
}
