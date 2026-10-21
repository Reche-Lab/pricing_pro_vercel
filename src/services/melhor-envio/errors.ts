import { isMelhorEnvioReconnectRequired } from "@/lib/melhor-envio/oauth-errors";
import { MelhorEnvioRequestError } from "./melhor-envio";

export function melhorEnvioErrorPayload(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível concluir a operação no Melhor Envio.";
  const httpStatus = error instanceof MelhorEnvioRequestError ? error.status : undefined;
  const reconnectRequired = httpStatus === 401 || (httpStatus === undefined && isMelhorEnvioReconnectRequired(message));
  return {
    ok: false,
    provider: "melhor_envio",
    httpStatus,
    error: reconnectRequired ? "A conexão com o Melhor Envio expirou ou foi revogada. Autorize novamente para continuar." : message,
    ...(reconnectRequired ? { code: "melhor_envio_oauth_invalid", reconnectRequired: true } : {})
  };
}
