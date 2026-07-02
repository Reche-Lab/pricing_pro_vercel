import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
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
  const debugId = randomUUID();
  let session: Awaited<ReturnType<typeof getCurrentSession>> | null = null;
  let membershipId = "unknown";

  try {
    session = await getCurrentSession();
    if (!session) return NextResponse.json({ ok: false, debugId }, { status: 401 });

    const params = await context.params;
    membershipId = params.membershipId;
    const parsed = z.string().uuid().safeParse(membershipId);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid membership id.", debugId }, { status: 400 });
    }

    const [allowed, member, connection] = await Promise.all([
      userHasPermission(session.userId, session.tenantId, "users:manage"),
      getTenantMember(session.userId, session.tenantId, membershipId),
      getIntegrationConnection(session.userId, session.tenantId, "olist")
    ]);
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden.", debugId }, { status: 403 });
    if (!member) return NextResponse.json({ ok: false, error: "Member not found.", debugId }, { status: 404 });
    if (!connection || connection.status !== "active") {
      await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
        provider: "olist",
        operation: "users.sync",
        status: "error",
        message: "Olist integration is not active.",
        metadata: { membershipId }
      });
      return NextResponse.json(
        { ok: false, error: "Olist integration is not active.", debugId },
        { status: 409 }
      );
    }

    const settings = connection.settings as OlistSettings;
    const path = settings.user_path;
    if (!path) {
      await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
        provider: "olist",
        operation: "users.sync",
        status: "error",
        message: "Olist user path is not configured.",
        metadata: { membershipId }
      });
      return NextResponse.json(
        { ok: false, error: "Olist user path is not configured.", debugId },
        { status: 409 }
      );
    }

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
      await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
        provider: "olist",
        operation: "users.sync",
        status: "success",
        externalId,
        metadata: { membershipId, payload, path: lookupPath, result }
      });
      return NextResponse.json({ ok: true, externalId, result, debugId });
    } catch (error) {
      const message = errorMessage(error, "Unknown Olist error");
      if (isOptionalUserSyncFailure(message)) {
        console.warn("Olist user sync kept as local_only.", {
          debugId,
          membershipId,
          message,
          path: lookupPath
        });
        await updateTenantMemberOlistLink(session.userId, session.tenantId, membershipId, {
          externalOlistUserId: null,
          metadata: {
            lastUserSyncAt: new Date().toISOString(),
            lastUserSyncStatus: "local_only",
            lastUserSyncError: message
          }
        });
        await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
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
          detail: message,
          debugId
        });
      }

      console.error("Olist user sync request failed.", {
        debugId,
        membershipId,
        message,
        path: lookupPath,
        stack: errorStack(error)
      });
      await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
        provider: "olist",
        operation: "users.sync",
        status: "error",
        message,
        metadata: { membershipId, payload, path: lookupPath }
      });
      return NextResponse.json(
        { ok: false, error: message, debugId },
        { status: 502 }
      );
    }
  } catch (error) {
    const message = errorMessage(error, "Unexpected Olist user sync error");
    console.error("Olist user sync unexpected failure.", {
      debugId,
      membershipId,
      message,
      stack: errorStack(error)
    });
    if (session) {
      await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
        provider: "olist",
        operation: "users.sync",
        status: "error",
        message,
        metadata: { membershipId }
      });
    }
    return NextResponse.json(
      { ok: false, error: message, debugId },
      { status: 500 }
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
    console.error("Failed to persist Olist integration log.", {
      debugId,
      operation: input.operation,
      status: input.status,
      message: errorMessage(error, "Unknown integration log error"),
      stack: errorStack(error)
    });
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function errorStack(error: unknown) {
  return error instanceof Error ? error.stack : undefined;
}
