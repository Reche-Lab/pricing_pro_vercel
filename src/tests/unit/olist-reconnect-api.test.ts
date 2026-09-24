import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/repositories/integrations", () => ({
  decryptIntegrationCredentials: vi.fn(() => ({ accessToken: "test-token" })),
  getIntegrationConnection: vi.fn(),
  logIntegrationEvent: vi.fn(),
  updateIntegrationCredentials: vi.fn(),
  consumeOAuthState: vi.fn()
}));
vi.mock("@/repositories/olist-payment-options", () => ({ replaceOlistPaymentOptions: vi.fn(async () => []) }));
vi.mock("@/services/olist/olist", async (original) => ({
  ...await original<typeof import("@/services/olist/olist")>(),
  olistRequest: vi.fn()
}));

import { getCurrentSession } from "@/lib/auth/session";
import { consumeOAuthState, getIntegrationConnection } from "@/repositories/integrations";
import { olistRequest, OlistRequestError } from "@/services/olist/olist";
import { POST } from "@/app/api/olist/payment-options/sync/route";
import { GET as callback } from "@/app/api/olist/oauth/callback/route";
import { olistOperationErrorResponse, OlistQuoteOperationError } from "@/app/api/quotes/[quoteId]/olist/_shared";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentSession).mockResolvedValue({ userId: "user", tenantId: "tenant" } as Awaited<ReturnType<typeof getCurrentSession>>);
  vi.mocked(getIntegrationConnection).mockResolvedValue({ status: "active", settings: {} } as NonNullable<Awaited<ReturnType<typeof getIntegrationConnection>>>);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Olist reconnect API contracts", () => {
  it.each([
    new OlistQuoteOperationError("invalid_grant", "debug"),
    new OlistRequestError("Unauthorized", 401, null),
    new Error("invalid_grant")
  ])("preserves authentication classification in quote errors", (error) => {
    expect(olistOperationErrorResponse(error, "Falha")).toMatchObject({ code: "olist_oauth_invalid", reconnectRequired: true });
  });

  it("does not request reconnect for upstream validation or permission errors", () => {
    for (const status of [400, 403, 422, 500]) {
      expect(olistOperationErrorResponse(new OlistRequestError("Falha", status, null), "Falha").reconnectRequired).toBe(false);
    }
  });

  it("marks payment sync as reconnectable when the refresh grant is rejected", async () => {
    vi.mocked(olistRequest).mockRejectedValue(new Error("invalid_grant"));
    const response = await POST();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "olist_oauth_invalid", reconnectRequired: true });
  });

  it("keeps a local session failure separate from Olist authentication", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(401);
    expect((await response.json()).reconnectRequired).toBeUndefined();
    expect(olistRequest).not.toHaveBeenCalled();
  });

  it("returns denied authorization to the state-bound completion page", async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue({ redirect_path: "/olist/oauth/complete?attempt=test", provider: "olist", user_id: "user", tenant_id: "tenant" } as NonNullable<Awaited<ReturnType<typeof consumeOAuthState>>>);
    const response = await callback(new Request("https://example.test/api/olist/oauth/callback?state=valid&error=access_denied"));
    const target = new URL(response.headers.get("location")!);
    expect(consumeOAuthState).toHaveBeenCalledWith("valid", "olist");
    expect(target.pathname).toBe("/olist/oauth/complete");
    expect(target.searchParams.get("olist")).toBe("error");
    expect(target.searchParams.get("attempt")).toBe("test");
    expect(getIntegrationConnection).not.toHaveBeenCalled();
  });
});
