import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getCustomerById, updateCustomerExternalOlistId } from "@/repositories/customers";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  logIntegrationEvent
} from "@/repositories/integrations";
import { getQuoteDetail } from "@/repositories/quotes";
import { extractExternalId, olistRequest } from "@/services/olist/olist";
import { buildOlistCustomerPayload } from "@/services/olist/payloads";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

export async function POST(_request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const debugId = randomUUID();
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, debugId }, { status: 401 });

  const { quoteId } = await context.params;
  const parsed = z.string().uuid().safeParse(quoteId);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid quote id.", debugId }, { status: 400 });

  const detail = await getQuoteDetail(session.userId, session.tenantId, quoteId);
  if (!detail) return NextResponse.json({ ok: false, error: "Quote not found.", debugId }, { status: 404 });
  if (!detail.quote.customer_id) {
    return NextResponse.json({ ok: false, error: "Quote has no customer.", debugId }, { status: 409 });
  }

  const [customer, connection] = await Promise.all([
    getCustomerById(session.userId, session.tenantId, detail.quote.customer_id),
    getIntegrationConnection(session.userId, session.tenantId, "olist")
  ]);
  if (!customer) return NextResponse.json({ ok: false, error: "Customer not found.", debugId }, { status: 404 });
  if (!connection || connection.status !== "active") {
    return NextResponse.json({ ok: false, error: "Olist integration is not active.", debugId }, { status: 409 });
  }

  const settings = connection.settings as OlistSettings;
  const path = settings.customer_path;
  if (!path) return NextResponse.json({ ok: false, error: "Olist customer path is not configured.", debugId }, { status: 409 });

  const payload = buildOlistCustomerPayload(customer);
  try {
    console.info("Olist customer create started.", {
      debugId,
      quoteId,
      customerId: customer.id,
      path,
      payload
    });
    const result = await olistRequest({
      settings,
      credentials: decryptIntegrationCredentials<OlistCredentials>(connection),
      path,
      body: payload
    });
    const externalId = extractExternalId(result);
    if (externalId) {
      await updateCustomerExternalOlistId(session.userId, session.tenantId, customer.id, externalId);
    }
    await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
      provider: "olist",
      operation: "customers.create",
      status: "success",
      externalId,
      metadata: { quoteId, customerId: customer.id, payload, result }
    });
    return NextResponse.json({ ok: true, result, externalId, debugId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Olist error";
    console.error("Olist customer create failed.", {
      debugId,
      quoteId,
      customerId: customer.id,
      path,
      payload,
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    await safeLogIntegrationEvent(session.userId, session.tenantId, debugId, {
      provider: "olist",
      operation: "customers.create",
      status: "error",
      message,
      metadata: { quoteId, customerId: customer.id, payload }
    });
    return NextResponse.json(
      { ok: false, error: message, debugId },
      { status: 502 }
    );
  }
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
    console.error("Failed to persist Olist customer integration log.", {
      debugId,
      operation: input.operation,
      status: input.status,
      message: error instanceof Error ? error.message : "Unknown integration log error",
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}
