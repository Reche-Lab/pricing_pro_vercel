// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diagnosePaymentConnection } from "@/services/commerce/payment-connection-diagnostics";
import { paymentCredentials } from "@/services/commerce/payments";

vi.mock("@/services/commerce/payments", () => ({ paymentCredentials: vi.fn() }));
const fetcher = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetcher);
  vi.mocked(paymentCredentials).mockResolvedValue({ accessToken: "sandbox-private", webhookSecret: "signature-private", sellerId: "456" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("read-only payment connection diagnosis", () => {
  it("uses only the requested environment and performs GETs without creating a payment", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ id: 456, email: "private@example.test" })).mockResolvedValueOnce(Response.json({ data: [], paging: { total: 0 } }));
    const result = await diagnosePaymentConnection("tenant", "test");
    expect(paymentCredentials).toHaveBeenCalledWith("tenant", "test");
    expect(result.environment).toBe("test");
    expect(result.checks.map(check => check.outcome)).toEqual(["ok", "ok"]);
    expect(result.checks[1].message).toContain("não confirma");
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) {
      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      expect(init.headers.authorization).toBe("Bearer sandbox-private");
    }
    const url = new URL(fetcher.mock.calls[1][0]);
    expect(url.pathname).toBe("/v1/orders");
    expect(url.searchParams.get("begin_date")).toBeTruthy();
    expect(url.searchParams.get("end_date")).toBeTruthy();
    expect(url.searchParams.get("external_reference")).toMatch(/^diagnostic-/);
    expect(JSON.stringify(result)).not.toMatch(/sandbox-private|signature-private|private@example/);
  });
  it("distinguishes a successful identity lookup from an Orders policy denial", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    fetcher.mockResolvedValueOnce(Response.json({ id: "456", email: "private@example.test" })).mockResolvedValueOnce(Response.json({ code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", message: "Denied sandbox-private for private@example.test" }, { status: 403, headers: { "x-request-id": "support-reference" } }));
    const result = await diagnosePaymentConnection("tenant", "test");
    expect(result.checks[0].outcome).toBe("ok");
    expect(result.checks[1]).toMatchObject({ outcome: "failed", httpStatus: 403, code: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", supportReference: "support-reference" });
    expect(JSON.stringify([result, log.mock.calls, failed.mock.calls])).not.toMatch(/sandbox-private|signature-private|private@example/);
    expect(paymentCredentials).toHaveBeenCalledTimes(1);
  });
  it("reports a seller mismatch and still checks Orders without falling back to another key", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ id: 999 })).mockResolvedValueOnce(Response.json({ data: [] }));
    const result = await diagnosePaymentConnection("tenant", "production");
    expect(result.checks[0]).toMatchObject({ outcome: "failed", code: "seller_mismatch" });
    expect(result.checks[1].outcome).toBe("ok");
    expect(paymentCredentials).toHaveBeenCalledWith("tenant", "production");
  });
  it("contains timeouts and unrecognized responses, without leaking raw exception messages", async () => {
    fetcher.mockRejectedValueOnce(new Error("sandbox-private network detail")).mockResolvedValueOnce(Response.json({ unexpected: "private@example.test" }));
    const result = await diagnosePaymentConnection("tenant", "test");
    expect(result.checks.map(check => check.outcome)).toEqual(["unavailable", "unavailable"]);
    expect(JSON.stringify(result)).not.toMatch(/sandbox-private|private@example/);
  });
});
