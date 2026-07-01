import { getServerEnv } from "@/lib/env/server";
import type { OlistCredentials, OlistOAuthTokenResponse, OlistRequestOptions, OlistSettings } from "./types";

const OLIST_TINY_APP_BASE_URL = "https://erp.tiny.com.br";

export async function olistRequest<T = unknown>({
  settings,
  credentials,
  path,
  body,
  method = "POST"
}: OlistRequestOptions): Promise<T> {
  if (!settings.api_base_url) throw new Error("Olist api_base_url is required.");
  if (!credentials.accessToken && !credentials.apiToken) throw new Error("Olist accessToken is required.");
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    ...authHeader(settings, credentials)
  };

  const response = await fetch(`${settings.api_base_url.replace(/\/$/, "")}${withSlash(path)}`, {
    method,
    headers,
    body: method === "GET" || body === undefined ? undefined : JSON.stringify(body)
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
  const token = credentials.accessToken || credentials.apiToken;
  const value = scheme === "ApiKey" ? token : `${scheme} ${token}`;
  return { [header]: value };
}

export function buildOlistAuthUrl(settings: OlistSettings, credentials: OlistCredentials, state: string) {
  if (!credentials.clientId) throw new Error("Olist clientId is required.");
  const appBaseUrl = normalizeOlistAppBaseUrl(requireSetting(settings.app_base_url, "Olist app_base_url is required."));
  const authorizePath = settings.authorize_path || "/oauth/authorize";
  const target = new URL(`${appBaseUrl.replace(/\/$/, "")}${withSlash(authorizePath)}`);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("client_id", credentials.clientId);
  target.searchParams.set("redirect_uri", getOlistRedirectUri());
  target.searchParams.set("state", state);
  const scopes = settings.scopes?.filter(Boolean) ?? [];
  if (scopes.length > 0) target.searchParams.set("scope", scopes.join(" "));
  return target.toString();
}

export function normalizeOlistAppBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (trimmed === "https://erp.olist.com" || trimmed === "http://erp.olist.com") return OLIST_TINY_APP_BASE_URL;
  return trimmed;
}

export async function exchangeOlistAuthorizationCode(
  code: string,
  settings: OlistSettings,
  credentials: OlistCredentials
): Promise<OlistOAuthTokenResponse> {
  return requestOlistToken(settings, credentials, {
    grant_type: "authorization_code",
    code,
    redirect_uri: getOlistRedirectUri()
  });
}

export async function refreshOlistToken(
  settings: OlistSettings,
  credentials: OlistCredentials
): Promise<OlistOAuthTokenResponse> {
  if (!credentials.refreshToken) throw new Error("Olist refreshToken is required.");
  return requestOlistToken(settings, credentials, {
    grant_type: "refresh_token",
    refresh_token: credentials.refreshToken
  });
}

function getOlistRedirectUri() {
  return `${getServerEnv().APP_URL.replace(/\/$/, "")}/api/olist/oauth/callback`;
}

async function requestOlistToken(
  settings: OlistSettings,
  credentials: OlistCredentials,
  params: Record<string, string>
): Promise<OlistOAuthTokenResponse> {
  if (!credentials.clientId) throw new Error("Olist clientId is required.");
  if (!credentials.clientSecret) throw new Error("Olist clientSecret is required.");
  const apiBaseUrl = requireSetting(settings.api_base_url, "Olist api_base_url is required.");
  const tokenPath = settings.token_path || "/oauth/token";

  const body = new URLSearchParams({
    ...params,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret
  });

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${withSlash(tokenPath)}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(extractError(data) ?? `Olist token request failed with status ${response.status}.`);
  }
  if (!data?.access_token) throw new Error("Olist token response did not include access_token.");
  return data as OlistOAuthTokenResponse;
}

function requireSetting(value: string | undefined, message: string) {
  if (!value) throw new Error(message);
  return value;
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
