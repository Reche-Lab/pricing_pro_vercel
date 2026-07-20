import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  upsertIntegrationConnection
} from "@/repositories/integrations";
import { OLIST_API_V3_BASE_URL, OLIST_APP_BASE_URL, OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import { normalizeOlistAppBaseUrl, normalizeOlistScopes } from "@/services/olist/olist";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const olistIntegrationSchema = z.object({
  apiBaseUrl: z.string().trim().url(),
  appBaseUrl: z.string().trim().url(),
  authorizePath: z.string().trim().min(1).default(OLIST_DEFAULT_PATHS.authorize),
  tokenPath: z.string().trim().min(1).default(OLIST_DEFAULT_PATHS.token),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().optional().default(""),
  path: z.string().trim().min(1),
  quotePath: z.string().trim().optional().default(""),
  customerLookupPath: z.string().trim().optional().default(""),
  salesOrderPath: z.string().trim().optional().default(""),
  salesOrderDispatchPath: z.string().trim().optional().default(""),
  invoicePath: z.string().trim().optional().default(""),
  invoiceEmitPath: z.string().trim().optional().default(""),
  invoiceCancelPath: z.string().trim().optional().default(""),
  userPath: z.string().trim().optional().default(""),
  taskPath: z.string().trim().optional().default(""),
  scopes: z.string().trim().optional().default(""),
  authScheme: z.enum(["Bearer", "Token", "ApiKey"]).default("Bearer"),
  authHeader: z.string().trim().default("authorization"),
  defaultPaymentCategoryExternalId: z.string().trim().optional().default(""),
  defaultPaymentCategoryName: z.string().trim().optional().default(""),
  defaultFretePorConta: z.enum(["R", "D", "T", "3", "4", "S"]).default("D"),
  melhorEnvioFormaEnvioId: z.string().trim().optional().default(""),
  melhorEnvioFormaEnvioName: z.string().trim().optional().default(""),
  correiosFormaEnvioId: z.string().trim().optional().default(""),
  correiosFormaEnvioName: z.string().trim().optional().default(""),
  pickupFormaEnvioId: z.string().trim().optional().default(""),
  pickupFormaEnvioName: z.string().trim().optional().default(""),
  carrierFormaEnvioId: z.string().trim().optional().default(""),
  carrierFormaEnvioName: z.string().trim().optional().default(""),
  sedexFormaFreteId: z.string().trim().optional().default(""),
  sedexFormaFreteName: z.string().trim().optional().default(""),
  pacFormaFreteId: z.string().trim().optional().default(""),
  pacFormaFreteName: z.string().trim().optional().default("")
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const [olist, legacyCrm] = await Promise.all([
    getIntegrationConnection(session.userId, session.tenantId, "olist"),
    getIntegrationConnection(session.userId, session.tenantId, "olist_crm")
  ]);

  return NextResponse.json({
    ok: true,
    integrations: {
      olist: serializeConnection(olist, legacyCrm)
    }
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = olistIntegrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const existingConnection = await getIntegrationConnection(session.userId, session.tenantId, "olist");
  const existingCredentials = readExistingCredentials(existingConnection);
  const nextClientSecret = parsed.data.clientSecret || existingCredentials.clientSecret;
  if (!nextClientSecret) {
    return NextResponse.json(
      { ok: false, error: "Informe Client Secret para a primeira configuração. Depois ele pode ficar em branco para manter o atual." },
      { status: 400 }
    );
  }

  await upsertIntegrationConnection(session.userId, session.tenantId, {
    provider: "olist",
    status: "active",
    settings: {
      api_base_url: parsed.data.apiBaseUrl,
      app_base_url: normalizeOlistAppBaseUrl(parsed.data.appBaseUrl),
      authorize_path: parsed.data.authorizePath,
      token_path: parsed.data.tokenPath,
      customer_path: parsed.data.path,
      customer_lookup_path: parsed.data.customerLookupPath || OLIST_DEFAULT_PATHS.customerLookup,
      quote_path: parsed.data.quotePath || OLIST_DEFAULT_PATHS.crmQuote,
      sales_order_path: parsed.data.salesOrderPath || OLIST_DEFAULT_PATHS.salesOrder,
      sales_order_dispatch_path: parsed.data.salesOrderDispatchPath || OLIST_DEFAULT_PATHS.salesOrderDispatch,
      invoice_path: parsed.data.invoicePath || OLIST_DEFAULT_PATHS.invoice,
      invoice_emit_path: parsed.data.invoiceEmitPath || OLIST_DEFAULT_PATHS.invoiceEmit,
      invoice_cancel_path: normalizeInvoiceCancelPath(parsed.data.invoiceCancelPath),
      user_path: parsed.data.userPath || OLIST_DEFAULT_PATHS.users,
      task_path: parsed.data.taskPath || OLIST_DEFAULT_PATHS.crmTask,
      scopes: normalizeOlistScopes(parseScopes(parsed.data.scopes)),
      api_version: "v3",
      auth_scheme: parsed.data.authScheme,
      auth_header: parsed.data.authHeader,
      default_payment_category_external_id: parsed.data.defaultPaymentCategoryExternalId || undefined,
      default_payment_category_name: parsed.data.defaultPaymentCategoryName || undefined,
      default_frete_por_conta: parsed.data.defaultFretePorConta,
      melhor_envio_forma_envio_id: parsed.data.melhorEnvioFormaEnvioId || undefined,
      melhor_envio_forma_envio_name: parsed.data.melhorEnvioFormaEnvioName || undefined,
      correios_forma_envio_id: parsed.data.correiosFormaEnvioId || undefined,
      correios_forma_envio_name: parsed.data.correiosFormaEnvioName || undefined,
      pickup_forma_envio_id: parsed.data.pickupFormaEnvioId || undefined,
      pickup_forma_envio_name: parsed.data.pickupFormaEnvioName || undefined,
      carrier_forma_envio_id: parsed.data.carrierFormaEnvioId || undefined,
      carrier_forma_envio_name: parsed.data.carrierFormaEnvioName || undefined,
      sedex_forma_frete_id: parsed.data.sedexFormaFreteId || undefined,
      sedex_forma_frete_name: parsed.data.sedexFormaFreteName || undefined,
      pac_forma_frete_id: parsed.data.pacFormaFreteId || undefined,
      pac_forma_frete_name: parsed.data.pacFormaFreteName || undefined
    },
    credentials: {
      ...existingCredentials,
      clientId: parsed.data.clientId,
      clientSecret: nextClientSecret
    }
  });

  return NextResponse.json({ ok: true });
}

function readExistingCredentials(connection: Awaited<ReturnType<typeof getIntegrationConnection>>): OlistCredentials {
  if (!connection) return {};
  try {
    return decryptIntegrationCredentials<OlistCredentials>(connection);
  } catch {
    return {};
  }
}

function serializeConnection(
  connection: Awaited<ReturnType<typeof getIntegrationConnection>>,
  legacyCrm?: Awaited<ReturnType<typeof getIntegrationConnection>>
) {
  const source = connection ?? legacyCrm;
  if (!source) return { configured: false, connected: false, status: "disabled" };
  const settings = source.settings as OlistSettings;
  const crmSettings = legacyCrm?.settings as OlistSettings | undefined;
  let credentials: OlistCredentials = {};
  try {
    credentials = decryptIntegrationCredentials<OlistCredentials>(source);
  } catch {
    credentials = {};
  }

  return {
    configured: Boolean(settings.api_base_url && settings.app_base_url && (settings.customer_path || settings.quote_path || crmSettings?.quote_path)),
    connected: Boolean(credentials.accessToken || credentials.apiToken),
    status: source.status,
    apiBaseUrl: settings.api_base_url ?? OLIST_API_V3_BASE_URL,
    appBaseUrl: normalizeOlistAppBaseUrl(settings.app_base_url ?? OLIST_APP_BASE_URL),
    authorizePath: settings.authorize_path ?? OLIST_DEFAULT_PATHS.authorize,
    tokenPath: settings.token_path ?? OLIST_DEFAULT_PATHS.token,
    path: settings.customer_path ?? OLIST_DEFAULT_PATHS.customer,
    quotePath: settings.quote_path ?? crmSettings?.quote_path ?? OLIST_DEFAULT_PATHS.crmQuote,
    customerLookupPath: settings.customer_lookup_path ?? OLIST_DEFAULT_PATHS.customerLookup,
    salesOrderPath: settings.sales_order_path ?? OLIST_DEFAULT_PATHS.salesOrder,
    salesOrderDispatchPath: settings.sales_order_dispatch_path ?? OLIST_DEFAULT_PATHS.salesOrderDispatch,
    invoicePath: settings.invoice_path ?? OLIST_DEFAULT_PATHS.invoice,
    invoiceEmitPath: settings.invoice_emit_path ?? OLIST_DEFAULT_PATHS.invoiceEmit,
    invoiceCancelPath: normalizeInvoiceCancelPath(settings.invoice_cancel_path),
    userPath: settings.user_path ?? crmSettings?.user_path ?? OLIST_DEFAULT_PATHS.users,
    taskPath: settings.task_path ?? crmSettings?.task_path ?? OLIST_DEFAULT_PATHS.crmTask,
    clientId: credentials.clientId ?? "",
    scopes: normalizeOlistScopes(settings.scopes).join(" "),
    apiVersion: settings.api_version ?? "v3",
    authScheme: settings.auth_scheme ?? "Bearer",
    authHeader: settings.auth_header ?? "authorization",
    defaultPaymentCategoryExternalId: settings.default_payment_category_external_id ?? "",
    defaultPaymentCategoryName: settings.default_payment_category_name ?? "",
    defaultFretePorConta: settings.default_frete_por_conta ?? "D",
    melhorEnvioFormaEnvioId: settings.melhor_envio_forma_envio_id ?? "",
    melhorEnvioFormaEnvioName: settings.melhor_envio_forma_envio_name ?? "",
    correiosFormaEnvioId: settings.correios_forma_envio_id ?? "",
    correiosFormaEnvioName: settings.correios_forma_envio_name ?? "",
    pickupFormaEnvioId: settings.pickup_forma_envio_id ?? "",
    pickupFormaEnvioName: settings.pickup_forma_envio_name ?? "",
    carrierFormaEnvioId: settings.carrier_forma_envio_id ?? "",
    carrierFormaEnvioName: settings.carrier_forma_envio_name ?? "",
    sedexFormaFreteId: settings.sedex_forma_frete_id ?? "",
    sedexFormaFreteName: settings.sedex_forma_frete_name ?? "",
    pacFormaFreteId: settings.pac_forma_frete_id ?? "",
    pacFormaFreteName: settings.pac_forma_frete_name ?? ""
  };
}

function normalizeInvoiceCancelPath(path: string | undefined) {
  if (!path || path === "/notas/{idNota}/cancelar") return OLIST_DEFAULT_PATHS.invoiceCancel;
  return path;
}

function parseScopes(value: string) {
  return value
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}
