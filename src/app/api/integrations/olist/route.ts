import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  decryptIntegrationCredentials,
  getIntegrationConnection,
  upsertIntegrationConnection
} from "@/repositories/integrations";
import { OLIST_API_V3_BASE_URL, OLIST_APP_BASE_URL, OLIST_DEFAULT_PATHS } from "@/services/olist/defaults";
import type { OlistCredentials, OlistSettings } from "@/services/olist/types";

const olistIntegrationSchema = z.object({
  provider: z.enum(["olist", "olist_crm"]),
  apiBaseUrl: z.string().trim().url(),
  appBaseUrl: z.string().trim().url(),
  authorizePath: z.string().trim().min(1).default(OLIST_DEFAULT_PATHS.authorize),
  tokenPath: z.string().trim().min(1).default(OLIST_DEFAULT_PATHS.token),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  path: z.string().trim().min(1),
  customerLookupPath: z.string().trim().optional().default(""),
  salesOrderPath: z.string().trim().optional().default(""),
  invoicePath: z.string().trim().optional().default(""),
  invoiceEmitPath: z.string().trim().optional().default(""),
  userPath: z.string().trim().optional().default(""),
  taskPath: z.string().trim().optional().default(""),
  scopes: z.string().trim().optional().default(""),
  authScheme: z.enum(["Bearer", "Token", "ApiKey"]).default("Bearer"),
  authHeader: z.string().trim().default("authorization")
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const [olist, crm] = await Promise.all([
    getIntegrationConnection(session.userId, session.tenantId, "olist"),
    getIntegrationConnection(session.userId, session.tenantId, "olist_crm")
  ]);

  return NextResponse.json({
    ok: true,
    integrations: {
      olist: serializeConnection(olist),
      olistCrm: serializeConnection(crm)
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

  await upsertIntegrationConnection(session.userId, session.tenantId, {
    provider: parsed.data.provider,
    status: "active",
    settings:
      parsed.data.provider === "olist"
        ? {
            api_base_url: parsed.data.apiBaseUrl,
            app_base_url: parsed.data.appBaseUrl,
            authorize_path: parsed.data.authorizePath,
            token_path: parsed.data.tokenPath,
            customer_path: parsed.data.path,
            customer_lookup_path: parsed.data.customerLookupPath || OLIST_DEFAULT_PATHS.customerLookup,
            sales_order_path: parsed.data.salesOrderPath || OLIST_DEFAULT_PATHS.salesOrder,
            invoice_path: parsed.data.invoicePath || OLIST_DEFAULT_PATHS.invoice,
            invoice_emit_path: parsed.data.invoiceEmitPath || OLIST_DEFAULT_PATHS.invoiceEmit,
            scopes: parseScopes(parsed.data.scopes),
            api_version: "v3",
            auth_scheme: parsed.data.authScheme,
            auth_header: parsed.data.authHeader
          }
        : {
            api_base_url: parsed.data.apiBaseUrl,
            app_base_url: parsed.data.appBaseUrl,
            authorize_path: parsed.data.authorizePath,
            token_path: parsed.data.tokenPath,
            quote_path: parsed.data.path,
            user_path: parsed.data.userPath || OLIST_DEFAULT_PATHS.users,
            task_path: parsed.data.taskPath || OLIST_DEFAULT_PATHS.crmTask,
            scopes: parseScopes(parsed.data.scopes),
            api_version: "v3",
            auth_scheme: parsed.data.authScheme,
            auth_header: parsed.data.authHeader
          },
    credentials: {
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret
    }
  });

  return NextResponse.json({ ok: true });
}

function serializeConnection(connection: Awaited<ReturnType<typeof getIntegrationConnection>>) {
  if (!connection) return { configured: false, connected: false, status: "disabled" };
  const settings = connection.settings as OlistSettings;
  let credentials: OlistCredentials = {};
  try {
    credentials = decryptIntegrationCredentials<OlistCredentials>(connection);
  } catch {
    credentials = {};
  }

  return {
    configured: Boolean(settings.api_base_url && settings.app_base_url && (settings.customer_path || settings.quote_path)),
    connected: Boolean(credentials.accessToken || credentials.apiToken),
    status: connection.status,
    apiBaseUrl: settings.api_base_url ?? OLIST_API_V3_BASE_URL,
    appBaseUrl: settings.app_base_url ?? OLIST_APP_BASE_URL,
    authorizePath: settings.authorize_path ?? OLIST_DEFAULT_PATHS.authorize,
    tokenPath: settings.token_path ?? OLIST_DEFAULT_PATHS.token,
    path: settings.customer_path ?? settings.quote_path ?? "",
    customerLookupPath: settings.customer_lookup_path ?? OLIST_DEFAULT_PATHS.customerLookup,
    salesOrderPath: settings.sales_order_path ?? OLIST_DEFAULT_PATHS.salesOrder,
    invoicePath: settings.invoice_path ?? OLIST_DEFAULT_PATHS.invoice,
    invoiceEmitPath: settings.invoice_emit_path ?? OLIST_DEFAULT_PATHS.invoiceEmit,
    userPath: settings.user_path ?? OLIST_DEFAULT_PATHS.users,
    taskPath: settings.task_path ?? OLIST_DEFAULT_PATHS.crmTask,
    clientId: credentials.clientId ?? "",
    scopes: settings.scopes?.join(" ") ?? "",
    apiVersion: settings.api_version ?? "v3",
    authScheme: settings.auth_scheme ?? "Bearer",
    authHeader: settings.auth_header ?? "authorization"
  };
}

function parseScopes(value: string) {
  return value
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}
