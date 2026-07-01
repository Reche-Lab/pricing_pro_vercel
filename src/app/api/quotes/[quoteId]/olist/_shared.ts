import { z } from "zod";
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
  try {
    const result = await olistRequest({
      settings: input.settings,
      credentials: input.credentials,
      path: input.path,
      body: input.payload,
      method: input.method ?? "POST"
    });
    const externalId = extractExternalId(result);
    await logIntegrationEvent(input.userId, input.tenantId, {
      provider: input.provider,
      operation: input.operation,
      status: "success",
      externalId,
      metadata: { quoteId: input.quoteId, payload: input.payload, result }
    });
    return { ok: true, result, externalId } as const;
  } catch (error) {
    await logIntegrationEvent(input.userId, input.tenantId, {
      provider: input.provider,
      operation: input.operation,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown Olist error",
      metadata: { quoteId: input.quoteId, payload: input.payload }
    });
    throw error;
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
