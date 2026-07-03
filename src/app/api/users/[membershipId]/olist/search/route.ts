import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { getTenantMember, userHasPermission } from "@/repositories/users";
import { OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const searchSchema = z.object({
  nome: z.string().trim().optional().nullable(),
  tipo: z.string().trim().optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ membershipId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { membershipId } = await context.params;
  const id = z.string().uuid().safeParse(membershipId);
  if (!id.success) return NextResponse.json({ ok: false, error: "Invalid membership id." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const [allowed, member, connection] = await Promise.all([
    userHasPermission(session.userId, session.tenantId, "users:manage"),
    getTenantMember(session.userId, session.tenantId, membershipId),
    getIntegrationConnection(session.userId, session.tenantId, "olist")
  ]);
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  if (!member) return NextResponse.json({ ok: false, error: "Member not found." }, { status: 404 });
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Olist integration is not active." }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  const targets = searchTargets(settings.user_path, parsed.data.nome ?? "", parsed.data.tipo);
  if (!targets.length) return NextResponse.json({ ok: false, error: "Olist user path is not configured." }, { status: 409 });

  const errors: Array<{ path: string; status?: number; message: string }> = [];
  try {
    const credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
    for (const target of targets) {
      const response = await directOlistGet(settings, credentials, target.path, target.query);
      if (response.ok) {
        return NextResponse.json({
          ok: true,
          path: target.path,
          query: target.query,
          attemptedPaths: targets.map((item) => item.path),
          warning: errors.length ? "A busca em /usuarios não foi permitida pelo Olist; tentei /vendedores automaticamente." : null,
          results: recordsFromOlistResult(response.data).map(summarizeUserRecord).filter((item) => item.id || item.nome),
          raw: response.data
        });
      }

      errors.push({
        path: target.path,
        status: response.status,
        message: response.message
      });
      if (![401, 403, 404, 405].includes(response.status)) {
        return NextResponse.json(
          { ok: false, error: response.message || `Olist retornou HTTP ${response.status}.`, attempts: errors },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Olist não permitiu consultar usuários/vendedores com o token atual. Informe manualmente o ID do responsável Olist.",
        message: "A busca agora usa a mesma chamada do laboratório, mas o token OAuth atual não autorizou estes recursos nesta tela.",
        attempts: errors
      },
      { status: 409 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Olist error." },
      { status: 502 }
    );
  }
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

  console.info("Olist user search request started.", {
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

function searchTargets(basePath: string | undefined, nome: string, tipo: string | null | undefined) {
  const targets = [
    buildSearchTarget(basePath, nome, tipo),
    buildSearchTarget(OLIST_DEFAULT_PATHS.sellers, nome, null)
  ].filter(Boolean) as Array<{ path: string; query: Record<string, string> }>;
  return targets.filter((target, index, list) => list.findIndex((item) => item.path === target.path) === index);
}

function buildSearchTarget(basePath: string | undefined, nome: string, tipo: string | null | undefined) {
  if (!basePath) return null;
  const query: Record<string, string> = { limit: "10", offset: "0" };
  if (nome.trim()) query.nome = nome;
  if (tipo) query.tipo = tipo;
  return { path: basePath, query };
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

function summarizeUserRecord(record: unknown) {
  const source = record && typeof record === "object" ? record as Record<string, unknown> : {};
  return {
    id: pickString(source, ["id", "idUsuario", "codigo"]),
    nome: pickString(source, ["nome", "name"]),
    email: pickString(source, ["email"]),
    tipo: pickString(source, ["tipo", "perfil", "role"]),
    situacao: pickString(source, ["situacao", "status"])
  };
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}
