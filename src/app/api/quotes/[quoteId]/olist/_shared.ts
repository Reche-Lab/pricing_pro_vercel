import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { getQuoteDetail } from "@/repositories/quotes";
import { extractExternalId, olistRequest } from "@/services/olist/olist";
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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}) {
  const debugId = randomUUID();
  try {
    console.info("Olist quote operation started.", {
      debugId,
      provider: input.provider,
      operation: input.operation,
      quoteId: input.quoteId,
      method: input.method ?? "POST",
      path: input.path,
      payload: input.payload
    });
    const result = await olistRequest({
      settings: input.settings,
      credentials: input.credentials,
      path: input.path,
      body: input.payload,
      method: input.method ?? "POST"
    });
    const externalId = extractExternalId(result);
    await safeLogIntegrationEvent(input.userId, input.tenantId, debugId, {
      provider: input.provider,
      operation: input.operation,
      status: "success",
      externalId,
      metadata: { quoteId: input.quoteId, path: input.path, payload: input.payload, result }
    });
    return { ok: true, result, externalId, debugId } as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Olist error";
    console.error("Olist quote operation failed.", {
      debugId,
      provider: input.provider,
      operation: input.operation,
      quoteId: input.quoteId,
      method: input.method ?? "POST",
      path: input.path,
      payload: input.payload,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    await safeLogIntegrationEvent(input.userId, input.tenantId, debugId, {
      provider: input.provider,
      operation: input.operation,
      status: "error",
      message,
      metadata: { quoteId: input.quoteId, path: input.path, payload: input.payload }
    });
    throw new OlistQuoteOperationError(message, debugId);
  }
}

export class OlistQuoteOperationError extends Error {
  constructor(message: string, public readonly debugId: string) {
    super(message);
    this.name = "OlistQuoteOperationError";
  }
}

export function olistOperationErrorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const debugId = error instanceof OlistQuoteOperationError ? error.debugId : randomUUID();
  if (!(error instanceof OlistQuoteOperationError)) {
    console.error("Unexpected Olist route failure.", {
      debugId,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
  }
  return { ok: false, error: message, debugId };
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
