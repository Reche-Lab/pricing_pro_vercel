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
import { OlistRequestError, olistRequest, refreshOlistToken } from "@/services/olist/olist";
import { OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const lookupSchema = z.object({
  mode: z.enum(["auto", "nome", "cpfCnpj", "celular", "email", "codigo"]).optional().default("auto"),
  value: z.string().trim().optional().default(""),
  nome: z.string().trim().optional().default(""),
  cpfCnpj: z.string().trim().optional().default(""),
  celular: z.string().trim().optional().default(""),
  email: z.string().trim().optional().default(""),
  codigo: z.string().trim().optional().default("")
});

type LookupMode = z.infer<typeof lookupSchema>["mode"];

export async function POST(request: Request) {
  const debugId = randomUUID();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, debugId }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = lookupSchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten(), debugId }, { status: 400 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Integração Olist não está ativa.", debugId }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  const credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  const criteria = resolveCriteria(parsed.data);
  if (!criteria.value) {
    return NextResponse.json({ ok: false, error: "Informe nome, CPF/CNPJ, telefone, e-mail ou código para buscar.", debugId }, { status: 400 });
  }

  const path = buildLookupPath(settings.customer_lookup_path || settings.customer_path || OLIST_DEFAULT_PATHS.customerLookup, criteria);
  try {
    const result = await requestWithRefresh({
      userId: session.userId,
      tenantId: session.tenantId,
      settings,
      credentials,
      path
    });
    const customers = recordsFromOlistResult(result).map(normalizeOlistCustomer).filter((customer) => customer.name || customer.id);
    await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
      provider: "olist",
      operation: "pricing.customer.lookup",
      status: "success",
      externalId: customers[0]?.id ?? null,
      metadata: { criteria, path, resultCount: customers.length }
    });

    return NextResponse.json({
      ok: true,
      debugId,
      customers,
      criteria,
      message: customers.length
        ? `${customers.length} cliente(s) encontrado(s) no Olist/Tiny.`
        : "Nenhum cliente encontrado no Olist/Tiny para esses critérios."
    });
  } catch (error) {
    const status = error instanceof OlistRequestError ? error.status : undefined;
    const response = error instanceof OlistRequestError ? error.data : undefined;
    const message = error instanceof Error ? error.message : "Falha ao consultar cliente no Olist.";
    const oauthInvalid = isOlistOAuthInvalid(message, status);
    console.error("Pricing Olist customer lookup failed.", {
      debugId,
      path,
      criteria,
      status,
      response,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
      provider: "olist",
      operation: "pricing.customer.lookup",
      status: "error",
      message,
      metadata: { criteria, path, httpStatus: status, response }
    });
    return NextResponse.json(
      {
        ok: false,
        code: oauthInvalid ? "olist_oauth_invalid" : "olist_lookup_failed",
        error: humanizeOlistError(message, status),
        debugId,
        response,
        reconnectRequired: oauthInvalid
      },
      { status: oauthInvalid ? 401 : 502 }
    );
  }
}

async function requestWithRefresh(input: {
  userId: string;
  tenantId: string;
  settings: OlistSettings;
  credentials: OlistCredentials;
  path: string;
}) {
  try {
    return await olistRequest({
      settings: input.settings,
      credentials: input.credentials,
      path: input.path,
      method: "GET"
    });
  } catch (error) {
    if (!(error instanceof OlistRequestError) || error.status !== 401 || !input.credentials.refreshToken) throw error;
    const token = await refreshOlistToken(input.settings, input.credentials);
    const refreshedCredentials: OlistCredentials = {
      ...input.credentials,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? input.credentials.refreshToken
    };
    await updateIntegrationCredentials(input.userId, input.tenantId, {
      provider: "olist",
      credentials: refreshedCredentials,
      status: "active"
    });
    return await olistRequest({
      settings: input.settings,
      credentials: refreshedCredentials,
      path: input.path,
      method: "GET"
    });
  }
}

function resolveCriteria(input: z.infer<typeof lookupSchema>) {
  const values = {
    nome: input.nome || input.value,
    cpfCnpj: digits(input.cpfCnpj || input.value),
    celular: digits(input.celular || input.value),
    email: input.email || input.value,
    codigo: input.codigo || input.value
  };
  const mode = input.mode === "auto" ? autoMode(values) : input.mode;
  const value = mode === "cpfCnpj"
    ? values.cpfCnpj
    : mode === "celular"
      ? values.celular
      : mode === "email"
        ? values.email
        : mode === "codigo"
          ? values.codigo
          : values.nome;
  return { mode, value };
}

function autoMode(values: Record<Exclude<LookupMode, "auto">, string>) {
  if (values.cpfCnpj.length === 11 || values.cpfCnpj.length === 14) return "cpfCnpj" as const;
  if (values.celular.length >= 10) return "celular" as const;
  if (values.email.includes("@")) return "email" as const;
  return "nome" as const;
}

function buildLookupPath(path: string, criteria: { mode: Exclude<LookupMode, "auto">; value: string }) {
  const params = new URLSearchParams();
  params.set(criteria.mode, criteria.value);
  params.set("limit", "5");
  params.set("offset", "0");
  return `${path}${path.includes("?") ? "&" : "?"}${params.toString()}`;
}

function normalizeOlistCustomer(record: unknown) {
  const data = record && typeof record === "object" ? record as Record<string, unknown> : {};
  const address = pickObject(data, ["endereco", "enderecoPrincipal", "address"]) ?? data;
  return {
    id: pickString(data, ["id", "idContato", "codigo"]),
    code: pickString(data, ["codigo", "external_reference"]),
    name: pickString(data, ["nome", "razaoSocial", "name"]),
    document: pickString(data, ["cpfCnpj", "documento", "document"]),
    email: pickString(data, ["email"]),
    phone: pickString(data, ["celular", "telefone", "fone", "phone"]),
    personType: pickString(data, ["tipoPessoa"]),
    status: pickString(data, ["situacao", "status"]),
    postalCode: pickString(address, ["cep", "postalCode"]),
    addressLine: pickString(address, ["endereco", "logradouro", "addressLine"]),
    addressNumber: pickString(address, ["numero", "enderecoNro", "number"]),
    addressComplement: pickString(address, ["complemento", "complement"]),
    district: pickString(address, ["bairro", "district"]),
    city: pickString(address, ["municipio", "cidade", "city"]),
    state: pickString(address, ["uf", "estado", "state"])
  };
}

function recordsFromOlistResult(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
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

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = pickString(value as Record<string, unknown>, keys);
      if (nested) return nested;
    }
  }
  return "";
}

function pickObject(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return null;
}

function digits(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).replace(/\D/g, "") : "";
}

function humanizeOlistError(message: string, status?: number) {
  if (isOlistOAuthInvalid(message, status)) return "A autenticação com o Olist/Tiny expirou ou foi revogada. Refaça a conexão OAuth para consultar clientes.";
  if (status === 401) return `Olist/Tiny recusou a autenticação. Reconecte o OAuth e tente novamente. Detalhe: ${message}`;
  if (status === 403) return `Olist/Tiny negou permissão para consultar contatos. Detalhe: ${message}`;
  if (status === 404) return `Endpoint de contatos não encontrado. Confira a configuração da integração Olist. Detalhe: ${message}`;
  return message;
}

function isOlistOAuthInvalid(message: string, status?: number) {
  const normalized = message.toLowerCase();
  return status === 401 || normalized.includes("invalid_grant") || normalized.includes("invalid token");
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
      metadata: { ...(input.metadata ?? {}), debugId }
    });
  } catch (error) {
    console.error("Failed to persist pricing Olist lookup log.", {
      debugId,
      message: error instanceof Error ? error.message : "Unknown integration log error"
    });
  }
}
