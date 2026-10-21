"use client";

import { isMelhorEnvioReconnectRequired } from "./oauth-errors";

export const MELHOR_ENVIO_RECONNECT_EVENT = "melhor-envio:reconnect-required";
export const MELHOR_ENVIO_CONNECTED_EVENT = "melhor-envio:reconnected";

export function requestMelhorEnvioReconnect() {
  window.dispatchEvent(new Event(MELHOR_ENVIO_RECONNECT_EVENT));
}

export async function melhorEnvioAwareFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  const data: unknown = await response.clone().json().catch(() => null);
  if (isMelhorEnvioReconnectRequired(data)) requestMelhorEnvioReconnect();
  return response;
}
