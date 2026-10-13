import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/repositories/integrations", () => ({
  decryptIntegrationCredentials: vi.fn(), getIntegrationConnection: vi.fn(),
  logIntegrationEvent: vi.fn(), updateIntegrationCredentials: vi.fn()
}));
vi.mock("@/services/olist/olist", async original => ({
  ...await original<typeof import("@/services/olist/olist")>(), olistRequest: vi.fn()
}));
import { getCurrentSession } from "@/lib/auth/session";
import { decryptIntegrationCredentials, getIntegrationConnection } from "@/repositories/integrations";
import { olistRequest } from "@/services/olist/olist";
import { POST } from "@/app/api/pricing/olist/customer-lookup/route";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentSession).mockResolvedValue({ userId: "user", tenantId: "tenant" } as Awaited<ReturnType<typeof getCurrentSession>>);
  vi.mocked(getIntegrationConnection).mockResolvedValue({ status: "active", settings: {} } as NonNullable<Awaited<ReturnType<typeof getIntegrationConnection>>>);
  vi.mocked(decryptIntegrationCredentials).mockReturnValue({ accessToken: "test" });
  vi.mocked(olistRequest).mockResolvedValue({ itens: [{ id: 123, nome: "Angelita Valenciani" }] });
});

describe("pricing Olist customer lookup", () => {
  it("returns partial-name matches using the same criteria as the quote search", async () => {
    const response = await POST(new Request("https://example.test/api/pricing/olist/customer-lookup", {
      method: "POST", body: JSON.stringify({ mode: "auto", value: "Angelita", cpfCnpj: "52998224725", nome: "Outro nome" })
    }));
    expect(olistRequest).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", path: "/contatos?nome=Angelita&limit=5&offset=0" }));
    expect(await response.json()).toMatchObject({ ok: true, criteria: { mode: "nome", value: "Angelita" }, customers: [{ id: "123", name: "Angelita Valenciani" }] });
  });

  it("requires a populated selected field rather than silently substituting the name", async () => {
    const response = await POST(new Request("https://example.test/api/pricing/olist/customer-lookup", {
      method: "POST", body: JSON.stringify({ mode: "cpfCnpj", nome: "Angelita" })
    }));
    expect(response.status).toBe(400);
    expect(olistRequest).not.toHaveBeenCalled();
  });
});
