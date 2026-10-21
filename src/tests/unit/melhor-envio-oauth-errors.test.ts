import { describe, expect, it } from "vitest";
import { isMelhorEnvioReconnectRequired } from "@/lib/melhor-envio/oauth-errors";
import { melhorEnvioErrorPayload } from "@/services/melhor-envio/errors";
import { MelhorEnvioRequestError } from "@/services/melhor-envio/melhor-envio";

describe("Melhor Envio authentication classification", () => {
  it.each(["Unauthenticated.", { error: "Unauthenticated." }, { code: "melhor_envio_oauth_invalid" },
    { provider: "melhor_envio", httpStatus: 401 }, new Error("Melhor Envio accessToken is required."), { error: "invalid_grant" }])("recognizes upstream authentication %j", value => {
    expect(isMelhorEnvioReconnectRequired(value)).toBe(true);
  });
  it.each([{ ok: false }, { status: 401 }, { provider: "olist", reconnectRequired: true },
    { error: "Permissões insuficientes", httpStatus: 403 }, { error: "Unauthenticated.", httpStatus: 403 }, { error: "CEP inválido", httpStatus: 422 }, null])("does not mistake session, validation or permission failures %j", value => {
    expect(isMelhorEnvioReconnectRequired(value)).toBe(false);
  });
  it("preserves upstream status and supplies a stable reconnect contract without exposing credentials", () => {
    expect(melhorEnvioErrorPayload(new MelhorEnvioRequestError("Unauthenticated.", 401, { token: "secret" }))).toMatchObject({
      provider: "melhor_envio", httpStatus: 401, code: "melhor_envio_oauth_invalid", reconnectRequired: true
    });
    expect(JSON.stringify(melhorEnvioErrorPayload(new MelhorEnvioRequestError("Unauthenticated.", 401, { token: "secret" })))).not.toContain("secret");
    expect(melhorEnvioErrorPayload(new MelhorEnvioRequestError("CEP inválido", 422, {}))).not.toHaveProperty("reconnectRequired");
  });
});
