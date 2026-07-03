import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { getTenantMember, userHasPermission } from "@/repositories/users";
import { olistRequest } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const searchSchema = z.object({
  nome: z.string().trim().min(1),
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
  const path = buildSearchPath(settings.user_path, parsed.data.nome, parsed.data.tipo);
  if (!path) return NextResponse.json({ ok: false, error: "Olist user path is not configured." }, { status: 409 });

  try {
    const result = await olistRequest({
      settings,
      credentials: decryptIntegrationCredentials<OlistCredentials>(connection),
      path,
      method: "GET"
    });
    return NextResponse.json({
      ok: true,
      path,
      results: recordsFromOlistResult(result).map(summarizeUserRecord).filter((item) => item.id || item.nome),
      raw: result
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown Olist error." },
      { status: 502 }
    );
  }
}

function buildSearchPath(basePath: string | undefined, nome: string, tipo: string | null | undefined) {
  if (!basePath) return null;
  const params = new URLSearchParams();
  params.set("nome", nome);
  if (tipo) params.set("tipo", tipo);
  params.set("limit", "10");
  const separator = basePath.includes("?") ? "&" : "?";
  return `${basePath}${separator}${params.toString()}`;
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
