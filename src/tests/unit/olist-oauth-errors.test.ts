import { describe, expect, it } from "vitest";
import { isOlistReconnectRequired } from "@/lib/olist/oauth-errors";

describe("Olist reconnect classification", () => {
  it.each([
    { error: "invalid_grant" },
    { httpStatus: 401, error: "Olist request failed with status 401." },
    { reconnectRequired: true },
    { code: "olist_oauth_invalid" },
    { ok: true, failures: [{ status: 401, message: "Unauthorized" }] },
    { ok: false, failures: [{ status: null, message: "invalid_grant" }] },
    new Error("Olist accessToken is required.")
  ])("recognizes authentication failure %j", (data) => {
    expect(isOlistReconnectRequired(data)).toBe(true);
  });

  it.each([
    { ok: false }, // A local HTTP 401 does not prove the Olist token expired.
    { httpStatus: 403, error: "Permissão OAuth insuficiente", requiresReauthorization: true },
    { failures: [{ status: 403, message: "Olist request failed with status 403." }] },
    { httpStatus: 400, error: "UF inválida" },
    { httpStatus: 502, error: "Falha de comunicação" },
    { error: "Olist integration is not active." },
    { error: "Olist clientSecret is required." },
    null
  ])("does not confuse other failures with authentication %j", (data) => {
    expect(isOlistReconnectRequired(data)).toBe(false);
  });
});
