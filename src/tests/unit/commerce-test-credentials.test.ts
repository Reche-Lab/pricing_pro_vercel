// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paymentCredentials, savePaymentConnection } from "@/services/commerce/payments";
import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "@/repositories/commerce";
vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/repositories/commerce", () => ({ commerceTransaction: vi.fn() }));
vi.mock("@/lib/crypto/secrets", () => ({ decryptTenantSecret: (value: string) => JSON.parse(value), encryptTenantSecret: (value: unknown) => `encrypted:${JSON.stringify(value)}` }));
const prod = { accessToken: "production-private", webhookSecret: "production-signature", sellerId: "123" };
const sandbox = { accessToken: "sandbox-private", webhookSecret: "test-signature", sellerId: "456" };
const query = vi.fn();
let account: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks(); account = { payment_environment: "production", public_key: "APP_USR-production", test_public_key: "APP_USR-sandbox", test_encrypted_credentials: JSON.stringify(sandbox) };
  vi.mocked(getPool).mockReturnValue({ query } as never);
  vi.mocked(commerceTransaction).mockImplementation(work => work({ query } as never));
  query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("select test_encrypted_credentials as")) return { rows: [{ encrypted_credentials: account.test_encrypted_credentials }] };
    if (sql.startsWith("select encrypted_credentials as")) return { rows: [{ encrypted_credentials: JSON.stringify(prod) }] };
    if (sql.startsWith("select payment_environment")) return { rows: [account] };
    return { rows: [] };
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("per-tenant test credentials", () => {
  it("selects the requested environment explicitly, never the currently active environment", async () => {
    account.payment_environment = "test";
    expect(await paymentCredentials("tenant", "production")).toEqual(prod);
    expect(await paymentCredentials("tenant", "test")).toEqual(sandbox);
  });
  it("does not fall back to production when test credentials are missing", async () => {
    account.test_encrypted_credentials = null;
    await expect(paymentCredentials("tenant", "test")).rejects.toThrow("produção não serão");
  });
  it("saves test keys separately without replacing production credentials or calling a charge API", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await savePaymentConnection("tenant", "actor", { manualEnabled: false, manualInstructions: "", mpEnabled: true, transparentEnabled: true, paymentEnvironment: "test", testPublicKey: "APP_USR-sandbox", testAccessToken: "new-sandbox-private", testSellerId: "456", testCredentialsConfirmed: true });
    expect(fetcher).not.toHaveBeenCalled();
    const insert = query.mock.calls.find(([sql]) => sql.startsWith("insert into commerce_payment_connections"))!;
    expect(insert[1][4]).toBeNull();
    const update = query.mock.calls.find(([sql]) => sql.includes("set payment_environment="))!;
    expect(update[1]).toEqual(["tenant", "test", "APP_USR-sandbox", expect.stringContaining("encrypted:")]);
    expect(update[1][3]).not.toContain("production-private");
  });
  it("requires explicit confirmation and rejects reuse of the production token", async () => {
    const input = { manualEnabled: false, manualInstructions: "", mpEnabled: true, transparentEnabled: true, paymentEnvironment: "test" as const, testPublicKey: "APP_USR-sandbox", testAccessToken: "production-private", testSellerId: "456" };
    await expect(savePaymentConnection("tenant", "actor", input)).rejects.toThrow("Confirme");
    await expect(savePaymentConnection("tenant", "actor", { ...input, testCredentialsConfirmed: true })).rejects.toThrow("diferente");
    expect(query.mock.calls.some(([sql]) => sql.startsWith("update"))).toBe(false);
  });
});
