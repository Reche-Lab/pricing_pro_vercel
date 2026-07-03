import { getServerEnv } from "@/lib/env/server";
import type { OlistCredentials, OlistOAuthTokenResponse, OlistRequestOptions, OlistSettings } from "./types";

const OLIST_TINY_APP_BASE_URL = "https://accounts.tiny.com.br";
const OLIST_TINY_AUTHORIZE_PATH = "/realms/tiny/protocol/openid-connect/auth";
const OLIST_TINY_TOKEN_PATH = "/realms/tiny/protocol/openid-connect/token";

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

  const url = `${settings.api_base_url.replace(/\/$/, "")}${withSlash(path)}`;
  const startedAt = Date.now();

  console.info("Olist/Tiny API request prepared.", {
    method,
    endpoint: sanitizeUrl(url),
    hasBody: body !== undefined
  });

  const response = await fetch(url, {
    method,
    headers,
    body: method === "GET" || body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const data = parseJson(text);
  console.info("Olist/Tiny API response received.", {
    method,
    endpoint: sanitizeUrl(url),
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    error: response.ok ? null : extractError(data) ?? truncate(text)
  });

  if (!response.ok) {
    throw new OlistRequestError(extractError(data) ?? `Olist request failed with status ${response.status}.`, response.status, data);
  }
  return data as T;
}

export class OlistRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown
  ) {
    super(message);
    this.name = "OlistRequestError";
  }
}

export function extractExternalId(data: unknown): string | null {
  const record = firstRecord(data);
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

function firstRecord(data: unknown): unknown {
  if (Array.isArray(data)) return data[0];
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.itens)) return record.itens[0];
  if (Array.isArray(record.items)) return record.items[0];
  if (record.data) return firstRecord(record.data);
  if (record.retorno) return firstRecord(record.retorno);
  return record;
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
  const target = new URL(resolveOlistOAuthUrl(settings.authorize_path, appBaseUrl, OLIST_TINY_AUTHORIZE_PATH));
  target.searchParams.set("response_type", "code");
  target.searchParams.set("client_id", credentials.clientId);
  target.searchParams.set("redirect_uri", getOlistRedirectUri());
  target.searchParams.set("state", state);
  target.searchParams.set("scope", normalizeOlistScopes(settings.scopes).join(" "));
  return target.toString();
}

export function normalizeOlistAppBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === "erp.olist.com" || parsed.hostname === "erp.tiny.com.br") return OLIST_TINY_APP_BASE_URL;
  } catch {
    return trimmed;
  }
  return trimmed;
}

export function normalizeOlistScopes(scopes: string[] | undefined) {
  const cleaned = (scopes ?? []).map((scope) => scope.trim()).filter(Boolean);
  const legacyScopes = new Set(["all", "customers", "quotes"]);
  if (cleaned.length === 0 || cleaned.some((scope) => legacyScopes.has(scope.toLowerCase()))) {
    return ["openid"];
  }
  return cleaned;
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
  const appBaseUrl = normalizeOlistAppBaseUrl(requireSetting(settings.app_base_url, "Olist app_base_url is required."));
  const tokenUrl = resolveOlistOAuthUrl(settings.token_path, appBaseUrl, OLIST_TINY_TOKEN_PATH);

  const body = new URLSearchParams({
    ...params,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret
  });

  const response = await fetch(tokenUrl, {
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

function resolveOlistOAuthUrl(value: string | undefined, appBaseUrl: string, defaultPath: string) {
  const path = value?.trim() || defaultPath;
  if (/^https?:\/\//i.test(path)) {
    const parsed = new URL(path);
    if (parsed.hostname === "erp.olist.com" || parsed.hostname === "erp.tiny.com.br") {
      return `${OLIST_TINY_APP_BASE_URL}${defaultPath}`;
    }
    return path;
  }
  if (path === "/oauth/authorize" || path === "/authorize") return `${OLIST_TINY_APP_BASE_URL}${OLIST_TINY_AUTHORIZE_PATH}`;
  if (path === "/oauth/token" || path === "/token") return `${OLIST_TINY_APP_BASE_URL}${OLIST_TINY_TOKEN_PATH}`;
  return `${appBaseUrl.replace(/\/$/, "")}${withSlash(path)}`;
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
  if (typeof record.mensagem === "string") return record.mensagem;
  if (typeof record.error === "string") return record.error;
  if (typeof record.descricao === "string") return record.descricao;
  if (Array.isArray(record.errors)) return record.errors.map(formatErrorItem).join("; ");
  if (Array.isArray(record.erros)) return record.erros.map(formatErrorItem).join("; ");
  if (record.retorno) return extractError(record.retorno);
  return null;
}

function formatErrorItem(item: unknown) {
  if (!item || typeof item !== "object") return String(item);
  const record = item as Record<string, unknown>;
  return [
    record.message,
    record.mensagem,
    record.error,
    record.descricao,
    record.campo ? `${record.campo}` : null
  ].filter(Boolean).join(" - ") || JSON.stringify(record);
}

function parseJson(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: truncate(text) };
  }
}

function sanitizeUrl(value: string) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function truncate(value: string, maxLength = 500) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
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
