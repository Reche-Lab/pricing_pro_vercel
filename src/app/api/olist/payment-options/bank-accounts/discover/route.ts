import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  updateIntegrationCredentials
} from "@/repositories/integrations";
import { listOlistPaymentOptions, upsertOlistBankAccount } from "@/repositories/olist-payment-options";
import { OlistRequestError, olistRequest, refreshOlistToken } from "@/services/olist/olist";
import { extractOlistBankAccount, extractOlistOrderIds } from "@/services/olist/payment-options";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const MAX_ORDER_DETAILS = 30;

export async function POST() {
  const debugId = randomUUID();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, debugId }, { status: 401 });

  const connection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, debugId, error: "Integração Olist não está ativa." }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  let credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  const ordersPath = settings.sales_order_path || "/pedidos";

  console.info("Olist bank account discovery started.", {
    debugId,
    tenantId: session.tenantId,
    ordersPath,
    maxOrderDetails: MAX_ORDER_DETAILS
  });

  try {
    const listResult = await requestWithRefresh({
      userId: session.userId,
      tenantId: session.tenantId,
      settings,
      credentials,
      path: `${ordersPath}?limit=${MAX_ORDER_DETAILS}&offset=0&orderBy=desc`
    });
    if (listResult.credentials) credentials = listResult.credentials;

    const orderIds = extractOlistOrderIds(listResult.result).slice(0, MAX_ORDER_DETAILS);
    const knownOptions = await listOlistPaymentOptions(session.userId, session.tenantId);
    const receivingIds = new Set(
      knownOptions.filter((option) => option.kind === "receiving_method").map((option) => option.external_id)
    );
    const discovered = new Map<string, string>();
    const failures: Array<{ orderId: string; message: string }> = [];

    for (const orderId of orderIds) {
      try {
        const detail = await olistRequest({
          settings,
          credentials,
          path: `${ordersPath}/${encodeURIComponent(orderId)}`,
          method: "GET"
        });
        const account = extractOlistBankAccount(detail);
        if (account && !receivingIds.has(account.externalId)) discovered.set(account.externalId, account.name);
      } catch (error) {
        failures.push({ orderId, message: error instanceof Error ? error.message : "Falha desconhecida." });
      }
    }

    for (const [externalId, name] of discovered) {
      await upsertOlistBankAccount(session.userId, session.tenantId, { externalId, name });
    }

    console.info("Olist bank account discovery completed.", {
      debugId,
      tenantId: session.tenantId,
      ordersInspected: orderIds.length,
      accountsFound: discovered.size,
      failures: failures.length
    });

    return NextResponse.json({
      ok: true,
      debugId,
      accounts: [...discovered].map(([externalId, name]) => ({ externalId, name })),
      ordersInspected: orderIds.length,
      failures
    });
  } catch (error) {
    const status = error instanceof OlistRequestError ? error.status : null;
    console.error("Olist bank account discovery failed.", {
      debugId,
      tenantId: session.tenantId,
      status,
      response: error instanceof OlistRequestError ? error.data : undefined,
      message: error instanceof Error ? error.message : "Falha desconhecida.",
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json({
      ok: false,
      debugId,
      error: status === 403
        ? "O aplicativo Olist não tem permissão para consultar pedidos. Habilite a leitura de Pedidos e reautorize o OAuth."
        : error instanceof Error ? error.message : "Não foi possível descobrir contas bancárias nos pedidos Olist.",
      requiresReauthorization: status === 401 || status === 403
    }, { status: status === 401 || status === 403 ? 403 : 502 });
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
    return { result: await olistRequest({ settings: input.settings, credentials: input.credentials, path: input.path, method: "GET" }) };
  } catch (error) {
    if (!(error instanceof OlistRequestError) || error.status !== 401 || !input.credentials.refreshToken) throw error;
    const token = await refreshOlistToken(input.settings, input.credentials);
    const credentials = {
      ...input.credentials,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? input.credentials.refreshToken
    };
    await updateIntegrationCredentials(input.userId, input.tenantId, { provider: "olist", credentials, status: "active" });
    return {
      credentials,
      result: await olistRequest({ settings: input.settings, credentials, path: input.path, method: "GET" })
    };
  }
}
