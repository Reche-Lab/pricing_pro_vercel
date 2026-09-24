"use client";

import { isOlistReconnectRequired } from "./oauth-errors";

export const OLIST_RECONNECT_EVENT = "olist:reconnect-required";
export const OLIST_CONNECTED_EVENT = "olist:reconnected";

export function requestOlistReconnect() {
  window.dispatchEvent(new Event(OLIST_RECONNECT_EVENT));
}

/** Inspect a copy so callers keep their existing response/error handling. Never replay mutations. */
export async function olistAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const data: unknown = await response.clone().json().catch(() => null);
  if (isOlistReconnectRequired(data)) requestOlistReconnect();
  return response;
}
