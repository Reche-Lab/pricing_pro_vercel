import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent,
  updateIntegrationCredentials
} from "@/repositories/integrations";
import { replaceOlistPaymentOptions, type OlistPaymentOptionKind } from "@/repositories/olist-payment-options";
import { OlistRequestError, olistRequest, refreshOlistToken } from "@/services/olist/olist";
import { extractOlistPaymentOptions } from "@/services/olist/payment-options";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const OPTION_PATHS: Array<{ kind: OlistPaymentOptionKind; path: string; label: string }> = [
  { kind: "receiving_method", path: "/formas-recebimento", label: "formas de recebimento" },
  { kind: "category", path: "/categorias-receita-despesa", label: "categorias financeiras" }
];

export async function POST() {
  const debugId = randomUUID();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, debugId }, { status: 401 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Integração Olist não está ativa.", debugId }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  let credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  const collected: Array<{ kind: OlistPaymentOptionKind; externalId: string; name: string; groupName?: string | null; raw?: unknown }> = [];
  const syncedKinds: OlistPaymentOptionKind[] = [];
  const failures: Array<{ path: string; kind: OlistPaymentOptionKind; label: string; message: string; status: number | null }> = [];

  console.info("Olist payment options sync started.", { debugId, tenantId: session.tenantId });

  for (const target of OPTION_PATHS) {
    try {
      const data = await requestWithRefresh({
        userId: session.userId,
        tenantId: session.tenantId,
        settings,
        credentials,
        path: target.path
      });
      if (data.credentials) credentials = data.credentials;
      const options = extractOlistPaymentOptions(data.result, target.kind);
      collected.push(...options);
      syncedKinds.push(target.kind);
      console.info("Olist payment options path synced.", {
        debugId,
        path: target.path,
        kind: target.kind,
        count: options.length
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida.";
      const status = error instanceof OlistRequestError ? error.status : null;
      failures.push({ path: target.path, kind: target.kind, label: target.label, message, status });
      console.error("Olist payment options path failed.", {
        debugId,
        path: target.path,
        kind: target.kind,
        status,
        message,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  }

  const receivingPermissionDenied = failures.some((failure) => (
    failure.kind === "receiving_method" && failure.status === 403
  ));
  const permissionMessage = receivingPermissionDenied
    ? "O aplicativo Olist não tem permissão para consultar formas de recebimento. Habilite essa permissão no cadastro do aplicativo Olist e reautorize o OAuth."
    : null;

  if (collected.length === 0) {
    await safeLog(session.userId, session.tenantId, {
      operation: "payment_options.sync",
      status: "error",
      message: "Nenhuma opção foi sincronizada.",
      metadata: { debugId, failures }
    });
    return NextResponse.json({
      ok: false,
      debugId,
      error: permissionMessage ?? "Não foi possível sincronizar opções financeiras do Olist.",
      failures,
      requiresReauthorization: receivingPermissionDenied,
      permissionMessage
    }, { status: 502 });
  }

  const options = await replaceOlistPaymentOptions(session.userId, session.tenantId, collected, syncedKinds);
  await safeLog(session.userId, session.tenantId, {
    operation: "payment_options.sync",
    status: failures.length ? "pending" : "success",
    message: failures.length ? "Sincronização parcial das opções financeiras do Olist." : null,
    metadata: { debugId, count: options.length, syncedKinds, failures }
  });

  return NextResponse.json({
    ok: true,
    debugId,
    options,
    failures,
    syncedKinds,
    requiresReauthorization: receivingPermissionDenied,
    permissionMessage,
    counts: {
      paymentMethods: options.filter((option) => option.kind === "payment_method").length,
      receivingMethods: options.filter((option) => option.kind === "receiving_method").length,
      categories: options.filter((option) => option.kind === "category").length
    }
  });
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

async function safeLog(
  userId: string,
  tenantId: string,
  input: Omit<Parameters<typeof logIntegrationEvent>[2], "provider">
) {
  try {
    await logIntegrationEvent(userId, tenantId, { provider: "olist", ...input });
  } catch {
    // Sync must not fail only because the optional integration log failed.
  }
}
