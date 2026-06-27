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
  "cart-checkout",
  "orders-read",
  "orders-write",
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

export async function melhorEnvioRequest<T = unknown>({
  method = "POST",
  path,
  body,
  settings,
  credentials
}: MelhorEnvioRequestOptions): Promise<T> {
  if (!credentials.accessToken) throw new Error("Melhor Envio accessToken is required.");

  const response = await fetch(`${apiBaseUrl(settings)}${path}`, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${credentials.accessToken}`,
      "content-type": "application/json",
      "user-agent": userAgent(settings)
    },
    body: body == null ? undefined : JSON.stringify(body)
  });

  return parseMelhorEnvioResponse<T>(response);
}

async function parseMelhorEnvioResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(extractError(data) ?? `Melhor Envio request failed with status ${response.status}.`);
  }
  return data as T;
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  if (Array.isArray(record.errors)) return record.errors.map(String).join("; ");
  return null;
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

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}
