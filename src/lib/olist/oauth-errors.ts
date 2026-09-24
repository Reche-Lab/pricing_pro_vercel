/** Upstream authentication only: a local 401 can mean the Pricing Pro session ended. */
export function isOlistReconnectRequired(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) return false;
  if (typeof value === "string") {
    return /\binvalid_grant\b|\binvalid_token\b|\binvalid token\b|Olist (?:accessToken|refreshToken) is required|Olist (?:token )?request failed with status 401/i.test(value);
  }
  if (typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (data.reconnectRequired === true || data.code === "olist_oauth_invalid") return true;
  if (Number(data.httpStatus ?? data.status) === 401) return true;
  if (Array.isArray(data.failures) && data.failures.some((failure) => isOlistReconnectRequired(failure, depth + 1))) return true;
  return [data.error, data.message, data.response, data.data].some((entry) => isOlistReconnectRequired(entry, depth + 1));
}
