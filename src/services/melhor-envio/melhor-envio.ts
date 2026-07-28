import type {
  MelhorEnvioCredentials,
  MelhorEnvioOAuthTokenResponse,
  MelhorEnvioQuoteInput,
  MelhorEnvioRequestOptions,
  MelhorEnvioSettings
} from "./types";

const DEFAULT_API_BASE_URL = "https://www.melhorenvio.com.br/api/v2";
const DEFAULT_APP_BASE_URL = "https://www.melhorenvio.com.br";
const DEFAULT_SCOPES = [
  "shipping-calculate",
  "cart-read",
  "cart-write",
  "shipping-checkout",
  "shipping-generate",
  "shipping-print",
  "orders-read",
  "shipping-tracking"
];

export function buildMelhorEnvioAuthUrl(
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials,
  state: string
): string {
  if (!credentials.clientId) throw new Error("Melhor Envio clientId is required.");
  if (!settings.redirect_uri) throw new Error("Melhor Envio redirect_uri is required.");

  const url = new URL(`${appBaseUrl(settings)}/oauth/authorize`);
  url.searchParams.set("client_id", credentials.clientId);
  url.searchParams.set("redirect_uri", settings.redirect_uri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DEFAULT_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function refreshMelhorEnvioToken(
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
): Promise<MelhorEnvioOAuthTokenResponse> {
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error("Melhor Envio clientId, clientSecret and refreshToken are required.");
  }

  const response = await fetch(`${appBaseUrl(settings)}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": userAgent(settings)
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken
    })
  });

  return parseMelhorEnvioResponse<MelhorEnvioOAuthTokenResponse>(response);
}

export async function exchangeMelhorEnvioAuthorizationCode(
  code: string,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
): Promise<MelhorEnvioOAuthTokenResponse> {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error("Melhor Envio clientId and clientSecret are required.");
  }
  if (!settings.redirect_uri) throw new Error("Melhor Envio redirect_uri is required.");

  const response = await fetch(`${appBaseUrl(settings)}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": userAgent(settings)
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: settings.redirect_uri,
      code
    })
  });

  return parseMelhorEnvioResponse<MelhorEnvioOAuthTokenResponse>(response);
}

export function buildMelhorEnvioQuotePayload(input: MelhorEnvioQuoteInput, settings: MelhorEnvioSettings) {
  const services = input.serviceIds ?? settings.services ?? [];
  return {
    from: {
      postal_code: onlyDigits(input.originPostalCode)
    },
    to: {
      postal_code: onlyDigits(input.destinationPostalCode)
    },
    options: {
      insurance_value: input.insuranceValue ?? input.declaredValue ?? 0,
      receipt: input.receipt ?? false,
      own_hand: input.ownHand ?? false
    },
    services: services.length ? services.join(",") : undefined,
    products: [
      {
        id: "quote-item",
        width: Math.max(11, input.packaging.box.widthCm),
        height: Math.max(2, input.packaging.box.heightCm),
        length: Math.max(16, input.packaging.box.lengthCm),
        weight: Math.max(0.3, input.packaging.grossWeightPerBoxKg),
        insurance_value: input.declaredValue ?? 0,
        quantity: input.packaging.boxesNeeded
      }
    ]
  };
}

export async function quoteMelhorEnvioShipping(
  input: MelhorEnvioQuoteInput,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
) {
  return melhorEnvioRequest({
    method: "POST",
    path: "/me/shipment/calculate",
    settings,
    credentials,
    body: buildMelhorEnvioQuotePayload(input, settings)
  });
}

export async function addMelhorEnvioCartItem(
  body: unknown,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
) {
  return melhorEnvioRequest({
    method: "POST",
    path: "/me/cart",
    settings,
    credentials,
    body
  });
}

export async function checkoutMelhorEnvioCart(
  body: unknown,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
) {
  return melhorEnvioRequest({
    method: "POST",
    path: "/me/shipment/checkout",
    settings,
    credentials,
    body
  });
}

export async function generateMelhorEnvioLabels(
  body: unknown,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
) {
  return melhorEnvioRequest({
    method: "POST",
    path: "/me/shipment/generate",
    settings,
    credentials,
    body
  });
}

export async function printMelhorEnvioLabels(
  body: unknown,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
) {
  return melhorEnvioRequest({
    method: "POST",
    path: "/me/shipment/print",
    settings,
    credentials,
    body
  });
}

export async function trackMelhorEnvioShipments(
  body: unknown,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
) {
  return melhorEnvioRequest({
    method: "POST",
    path: "/me/shipment/tracking",
    settings,
    credentials,
    body
  });
}

export type MelhorEnvioOrder = {
  id: string;
  protocol?: string | null;
  purchase_id?: string | null;
  status?: string | null;
  tracking?: string | null;
  paid_at?: string | null;
  generated_at?: string | null;
  posted_at?: string | null;
  delivered_at?: string | null;
  files?: unknown[];
  [key: string]: unknown;
};

export async function findMelhorEnvioOrder(
  identifier: string,
  settings: MelhorEnvioSettings,
  credentials: MelhorEnvioCredentials
): Promise<MelhorEnvioOrder | null> {
  try {
    const direct = await melhorEnvioRequest<unknown>({
      method: "GET",
      path: `/me/orders/${encodeURIComponent(identifier)}`,
      settings,
      credentials
    });
    const directOrder = asMelhorEnvioOrder(direct);
    if (directOrder) return directOrder;
  } catch (error) {
    if (!(error instanceof MelhorEnvioRequestError) || error.status !== 404) throw error;
  }

  const listed = await melhorEnvioRequest<unknown>({
    method: "GET",
    path: "/me/orders",
    settings,
    credentials
  });

  return extractMelhorEnvioOrders(listed).find(
    (order) =>
      order.id === identifier ||
      order.purchase_id === identifier ||
      order.protocol === identifier
  ) ?? null;
}

export function extractMelhorEnvioOrders(value: unknown): MelhorEnvioOrder[] {
  if (Array.isArray(value)) return value.map(asMelhorEnvioOrder).filter(isPresent);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data.map(asMelhorEnvioOrder).filter(isPresent);
  const single = asMelhorEnvioOrder(record);
  return single ? [single] : [];
}

export function melhorEnvioOrderFlowStatus(order: MelhorEnvioOrder): string {
  if (order.delivered_at || order.status === "delivered") return "delivered";
  if (order.posted_at || order.tracking || order.status === "posted") return "posted";
  if (order.generated_at) return "label_generated";
  if (order.paid_at || order.status === "released") return "paid";
  return "cart";
}

export async function melhorEnvioRequest<T = unknown>({
  method = "POST",
  path,
  body,
  settings,
  credentials
}: MelhorEnvioRequestOptions): Promise<T> {
  if (!credentials.accessToken) throw new Error("Melhor Envio accessToken is required.");
  const endpoint = `${apiBaseUrl(settings)}${path}`;
  const startedAt = Date.now();

  console.info("Melhor Envio API request prepared.", {
    method,
    endpoint: sanitizeUrl(endpoint),
    hasBody: body != null,
    body: sanitizeMelhorEnvioLogValue(body)
  });

  const response = await fetch(endpoint, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${credentials.accessToken}`,
      "content-type": "application/json",
      "user-agent": userAgent(settings)
    },
    body: body == null ? undefined : JSON.stringify(body)
  });

  return parseMelhorEnvioResponse<T>(response, { method, endpoint, durationMs: Date.now() - startedAt });
}

async function parseMelhorEnvioResponse<T>(
  response: Response,
  context?: { method?: string; endpoint?: string; durationMs?: number }
): Promise<T> {
  const text = await response.text();
  const data = parseJson(text);
  if (context) {
    console.info("Melhor Envio API response received.", {
      method: context.method,
      endpoint: context.endpoint ? sanitizeUrl(context.endpoint) : undefined,
      status: response.status,
      ok: response.ok,
      durationMs: context.durationMs,
      error: response.ok ? null : extractError(data) ?? truncate(text),
      response: sanitizeMelhorEnvioLogValue(data)
    });
  }
  if (!response.ok) {
    throw new MelhorEnvioRequestError(
      extractError(data) ?? `Melhor Envio request failed with status ${response.status}.`,
      response.status,
      data
    );
  }
  return data as T;
}

export class MelhorEnvioRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown
  ) {
    super(message);
    this.name = "MelhorEnvioRequestError";
  }
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  if (Array.isArray(record.errors)) return record.errors.map(String).join("; ");
  if (record.errors && typeof record.errors === "object") {
    return Object.entries(record.errors as Record<string, unknown>)
      .map(([field, value]) => `${field}: ${formatErrorValue(value)}`)
      .join("; ");
  }
  return null;
}

function formatErrorValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatErrorValue).join(", ");
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function apiBaseUrl(settings: MelhorEnvioSettings): string {
  return (settings.api_base_url || DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

function appBaseUrl(settings: MelhorEnvioSettings): string {
  return (settings.app_base_url || DEFAULT_APP_BASE_URL).replace(/\/$/, "");
}

function userAgent(settings: MelhorEnvioSettings): string {
  return settings.user_agent || "Pricing Pro (contato@example.com)";
}

function parseJson(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: truncate(text) };
  }
}

function truncate(value: string, max = 500) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function sanitizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
}

export function sanitizeMelhorEnvioLogValue(value: unknown, depth = 0, keyName = ""): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (["authorization", "access_token", "refresh_token", "client_secret", "token"].includes(keyName.toLowerCase())) {
      return "[redacted]";
    }
    if (keyName === "document" || keyName === "company_document") return maskEnding(value, 4);
    if (keyName === "phone") return maskEnding(value, 4);
    if (keyName === "email") {
      const domain = value.includes("@") ? value.slice(value.indexOf("@")) : "";
      return `***${domain}`;
    }
    return truncate(value, 2000);
  }
  if (depth >= 7) return "[max-depth]";
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item) => sanitizeMelhorEnvioLogValue(item, depth + 1, keyName));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 80)
        .map(([key, item]) => [key, sanitizeMelhorEnvioLogValue(item, depth + 1, key)])
    );
  }
  return String(value);
}

function asMelhorEnvioOrder(value: unknown): MelhorEnvioOrder | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) return null;
  return record as MelhorEnvioOrder;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function maskEnding(value: string, visible: number) {
  const normalized = value.trim();
  if (!normalized) return "";
  return `${"*".repeat(Math.max(4, normalized.length - visible))}${normalized.slice(-visible)}`;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}
