// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as domainsRead, POST as domainsRequest } from "@/app/api/commerce/admin/domains/route";
import { POST as domainsCheck } from "@/app/api/commerce/admin/domains/[domainId]/check/route";
import { GET as emailRead, POST as emailAction } from "@/app/api/commerce/admin/email/route";
import { GET as operatorRead } from "@/app/api/superadmin/commerce-domains/route";
import { requireCommerceAdmin } from "@/services/commerce/http";
import { getCurrentSession } from "@/lib/auth/session";
import { isSuperAdmin } from "@/repositories/superadmin";
import { listStoreDomains, getStoreDomain, requestStoreDomains } from "@/repositories/commerce-domain-setup";
import { sendCustomStoreEmail } from "@/services/email/store-email";
import { setStoreEmailEnabled, loadStoreEmailConnection, markStoreEmailTested } from "@/repositories/commerce-store-email";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), requireCommerceAdmin: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/repositories/superadmin", () => ({ isSuperAdmin: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn(async () => null) }));
vi.mock("@/repositories/commerce-domain-setup", () => ({ listStoreDomains: vi.fn(async () => []), getStoreDomain: vi.fn(), requestStoreDomains: vi.fn(async () => []), saveDomainOperatorConfig: vi.fn(), approveStoreDomain: vi.fn(), storeDomainCheck: vi.fn() }));
vi.mock("@/repositories/commerce-store-email", () => ({ getStoreEmailSettings: vi.fn(async () => ({ hasPassword: true })), saveStoreEmail: vi.fn(), loadStoreEmailConnection: vi.fn(), markStoreEmailTested: vi.fn(), setStoreEmailEnabled: vi.fn() }));
vi.mock("@/services/email/store-email", () => ({ sendCustomStoreEmail: vi.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const session = { userId: id, tenantId: id, email: "admin@example.com", role: "owner" as const };
const request = (path: string, body: object, origin = "https://panel.example.com") => new Request(`https://panel.example.com${path}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_URL", "https://panel.example.com");
  vi.mocked(requireCommerceAdmin).mockResolvedValue({ session, profile: { email: "verified-admin@example.com" } } as never);
  vi.mocked(getCurrentSession).mockResolvedValue(session); vi.mocked(isSuperAdmin).mockResolvedValue(false);
});
describe("domain/email handler permissions", () => {
  it("requires authentication before returning any tenant configuration", async () => {
    vi.mocked(requireCommerceAdmin).mockRejectedValue(new CommerceError("Entre na conta.", 401));
    expect((await domainsRead()).status).toBe(401); expect((await emailRead()).status).toBe(401);
    expect(listStoreDomains).not.toHaveBeenCalled();
  });
  it("denies global domain configuration to a tenant owner", async () => {
    expect((await operatorRead()).status).toBe(403); expect(listStoreDomains).not.toHaveBeenCalled();
  });
  it("scopes domain listing and lookup to the authenticated tenant", async () => {
    await domainsRead(); expect(listStoreDomains).toHaveBeenCalledWith(session.tenantId);
    vi.mocked(getStoreDomain).mockRejectedValue(new CommerceError("Domínio não encontrado.", 404));
    expect((await domainsCheck(request("/api/commerce/admin/domains/x/check", {}), { params: Promise.resolve({ domainId: id }) })).status).toBe(404);
    expect(getStoreDomain).toHaveBeenCalledWith(id, session.tenantId);
  });
  it("rejects cross-origin writes and body tenant overrides", async () => {
    const body = { hostname: "groundshop.com.br", provider: "", includeWww: true };
    expect((await domainsRequest(request("/api/commerce/admin/domains", body, "https://evil.example.com"))).status).toBe(403);
    expect((await domainsRequest(request("/api/commerce/admin/domains", { ...body, tenantId: id }))).status).toBe(400);
    expect(requestStoreDomains).not.toHaveBeenCalled();
  });
  it("tests SMTP only to the verified administrator and records the exact revision", async () => {
    const row = { revision: 2, tenant_id: id };
    vi.mocked(loadStoreEmailConnection).mockResolvedValue(row as never);
    vi.mocked(sendCustomStoreEmail).mockResolvedValue({ sent: true, provider: "smtp", message: "accepted" });
    vi.mocked(markStoreEmailTested).mockResolvedValue({ tested: true } as never);
    expect((await emailAction(request("/api/commerce/admin/email", { action: "test", revision: 2 }))).status).toBe(200);
    expect(sendCustomStoreEmail).toHaveBeenCalledWith(row, expect.objectContaining({ to: "verified-admin@example.com" }));
    expect(markStoreEmailTested).toHaveBeenCalledWith(session.userId, session.tenantId, 2);
    expect((await emailAction(request("/api/commerce/admin/email", { action: "test", revision: 2, to: "victim@example.com" }))).status).toBe(400);
    expect(sendCustomStoreEmail).toHaveBeenCalledTimes(1);
  });
  it("requires explicit receipt confirmation before custom SMTP activation", async () => {
    expect((await emailAction(request("/api/commerce/admin/email", { action: "toggle", revision: 2, enabled: true }))).status).toBe(400);
    expect(setStoreEmailEnabled).not.toHaveBeenCalled();
  });
});
