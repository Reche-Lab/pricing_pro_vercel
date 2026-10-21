/** Only upstream Melhor Envio authentication failures, never a bare local-session HTTP 401. */
export function isMelhorEnvioReconnectRequired(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) return false;
  if (typeof value === "string") return /^\s*Unauthenticated\.?\s*$|\binvalid_grant\b|\binvalid_token\b|Melhor Envio accessToken is required|Melhor Envio request failed with status 401/i.test(value);
  if (typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (data.provider && data.provider !== "melhor_envio") return false;
  if (data.httpStatus != null && Number(data.httpStatus) !== 401) return false;
  if (data.code === "melhor_envio_oauth_invalid" || data.reconnectRequired === true) return true;
  if (data.provider === "melhor_envio" && Number(data.httpStatus) === 401) return true;
  return [data.error, data.message, data.response, data.data].some(entry => isMelhorEnvioReconnectRequired(entry, depth + 1));
}
