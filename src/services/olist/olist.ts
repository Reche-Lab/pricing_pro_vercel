import type { OlistCredentials, OlistRequestOptions, OlistSettings } from "./types";

export async function olistRequest<T = unknown>({
  settings,
  credentials,
  path,
  body,
  method = "POST"
}: OlistRequestOptions): Promise<T> {
  if (!settings.api_base_url) throw new Error("Olist api_base_url is required.");
  if (!credentials.apiToken) throw new Error("Olist apiToken is required.");

  const response = await fetch(`${settings.api_base_url.replace(/\/$/, "")}${withSlash(path)}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...authHeader(settings, credentials)
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(extractError(data) ?? `Olist request failed with status ${response.status}.`);
  }
  return data as T;
}

export function extractExternalId(data: unknown): string | null {
  const record = Array.isArray(data) ? data[0] : data;
  if (!record || typeof record !== "object") return null;
  const value = findFirstString(record as Record<string, unknown>, [
    "id",
    "uuid",
    "customer_id",
    "client_id",
    "contact_id",
    "deal_id",
    "opportunity_id",
    "quote_id",
    "external_id"
  ]);
  return value;
}

function authHeader(settings: OlistSettings, credentials: OlistCredentials) {
  const header = settings.auth_header || "authorization";
  const scheme = settings.auth_scheme ?? "Bearer";
  const value = scheme === "ApiKey" ? credentials.apiToken : `${scheme} ${credentials.apiToken}`;
  return { [header]: value };
}

function withSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function extractError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  if (typeof record.error === "string") return record.error;
  if (Array.isArray(record.errors)) return record.errors.map(String).join("; ");
  return null;
}

function findFirstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const nested = findFirstString(value as Record<string, unknown>, keys);
      if (nested) return nested;
    }
  }

  return null;
}
