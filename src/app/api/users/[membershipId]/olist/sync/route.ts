import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import {
  getTenantMember,
  updateTenantMemberOlistLink,
  userHasPermission
} from "@/repositories/users";
import { extractExternalId, olistRequest } from "@/services/olist/olist";
import { buildOlistUserPayload } from "@/services/olist/payloads";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

export async function POST(_request: Request, context: { params: Promise<{ membershipId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { membershipId } = await context.params;
  const parsed = z.string().uuid().safeParse(membershipId);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid membership id." }, { status: 400 });

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
  const path = settings.user_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist user path is not configured." }, { status: 409 });

  const payload = buildOlistUserPayload(member);
  const lookupPath = buildUserLookupPath(path, payload);
  try {
    const result = await olistRequest({
      settings,
      credentials: decryptIntegrationCredentials<OlistCredentials>(connection),
      path: lookupPath,
      method: "GET"
    });
    const externalId = extractExternalId(result);
    await updateTenantMemberOlistLink(session.userId, session.tenantId, membershipId, {
      externalOlistUserId: externalId,
      metadata: { lastUserSyncAt: new Date().toISOString(), result }
    });
    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "olist",
      operation: "users.sync",
      status: "success",
      externalId,
      metadata: { membershipId, payload, path: lookupPath, result }
    });
    return NextResponse.json({ ok: true, externalId, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Olist error";
    if (isOptionalUserSyncFailure(message)) {
      await updateTenantMemberOlistLink(session.userId, session.tenantId, membershipId, {
        externalOlistUserId: null,
        metadata: {
          lastUserSyncAt: new Date().toISOString(),
          lastUserSyncStatus: "local_only",
          lastUserSyncError: message
        }
      });
      await logIntegrationEvent(session.userId, session.tenantId, {
        provider: "olist",
        operation: "users.sync",
        status: "pending",
        message,
        metadata: { membershipId, payload, path: lookupPath }
      });
      return NextResponse.json({
        ok: true,
        externalId: null,
        warning: "O usuário foi mantido localmente, mas a API Olist/Tiny não retornou um ID de usuário/vendedor para vincular.",
        detail: message
      });
    }

    await logIntegrationEvent(session.userId, session.tenantId, {
      provider: "olist",
      operation: "users.sync",
      status: "error",
      message,
      metadata: { membershipId, payload, path: lookupPath }
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 502 }
    );
  }
}

function buildUserLookupPath(path: string, payload: ReturnType<typeof buildOlistUserPayload>) {
  const params = new URLSearchParams();
  if (payload.id) params.set("id", payload.id);
  else if (payload.nome) params.set("nome", payload.nome);
  if (payload.tipo) params.set("tipo", payload.tipo);
  params.set("limit", "1");
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${params.toString()}`;
}

function isOptionalUserSyncFailure(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("status 400") ||
    normalized.includes("status 404") ||
    normalized.includes("status 405") ||
    normalized.includes("not found") ||
    normalized.includes("não encontrado") ||
    normalized.includes("nao encontrado")
  );
}
