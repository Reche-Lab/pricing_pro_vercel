// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/loja/[slug]/produtos.xml/route";
import { GET as robots } from "@/app/loja/[slug]/robots.txt/route";
import { commerceProducts, getCommerceStore } from "@/repositories/commerce";
import { discoverySource, discoverySettings } from "../fixtures/commerce-discovery";
import { commerceDomainRoute } from "@/domain/commerce/domains";
vi.mock("@/repositories/commerce", async original => ({ ...await original<typeof import("@/repositories/commerce")>(), commerceProducts: vi.fn(), getCommerceStore: vi.fn() }));
const args = { params: Promise.resolve({ slug: "shop" }) }, request = new Request("https://platform.example.test/loja/shop/produtos.xml");
beforeEach(() => {
  vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", "");
  vi.mocked(getCommerceStore).mockResolvedValue({ tenant_id: "tenant-a", status: "published", settings: discoverySettings } as Awaited<ReturnType<typeof getCommerceStore>>);
  vi.mocked(commerceProducts).mockResolvedValue([{ ...discoverySource, merchant: { enabled: true, identifiersAbsent: true, brand: "", gtin: "", mpn: "" } }]);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("public catalog tenant boundaries", () => {
  it("is a stateless read of only the published tenant's active public catalog", async () => {
    const response = await GET(request, args);
    expect(response.status).toBe(200); expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(commerceProducts).toHaveBeenCalledOnce(); expect(commerceProducts).toHaveBeenCalledWith("tenant-a");
    const xml = await response.text(); expect(xml).toContain("<g:price>50.00 BRL</g:price>");
    expect(xml).not.toContain("tenant-a");
  });
  it.each([null, "paused", "draft"])("refuses unpublished stores (%s), with no cache or product read", async status => {
    vi.mocked(getCommerceStore).mockResolvedValue(status ? { tenant_id: "tenant-a", status, settings: discoverySettings } as Awaited<ReturnType<typeof getCommerceStore>> : null);
    const response = await GET(request, args);
    expect(response.status).toBe(404); expect(response.headers.get("cache-control")).toBe("no-store"); expect(commerceProducts).not.toHaveBeenCalled();
  });
  it("returns an empty valid catalog on opt-out, without silently opting other products in", async () => {
    vi.mocked(commerceProducts).mockResolvedValue([discoverySource]);
    const response = await GET(request, args); expect(response.status).toBe(200); expect(await response.text()).not.toContain("<item>");
  });
  it("logs failures with a reference but does not expose SQL/provider details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.mocked(commerceProducts).mockRejectedValueOnce(new Error("database internal detail"));
      const response = await GET(request, args); expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).not.toContain("database internal");
      expect(spy).toHaveBeenCalledWith("Commerce merchant feed failed.", expect.objectContaining({ slug: "shop", debugId: expect.any(String) }));
    } finally { spy.mockRestore(); }
  });
  it("is accessible on custom domains without exposing the platform's private APIs", () => {
    const domains = { "shop.example.test": "shop" };
    expect(commerceDomainRoute("shop.example.test", "/produtos.xml", domains)).toMatchObject({ type: "rewrite", path: "/loja/shop/produtos.xml" });
    expect(commerceDomainRoute("shop.example.test", "/api/commerce/admin", domains)).toMatchObject({ type: "reject" });
    expect(commerceDomainRoute("shop.example.test", "/loja/other/produtos.xml", domains)).toMatchObject({ type: "reject" });
  });
  it("blocks both automatic search bots from private flows on the store domain", async () => {
    const response = await robots(request, args), text = await response.text();
    for (const group of text.split("\n\n")) { expect(group).toContain("Disallow: /api/"); expect(group).toContain("Disallow: /orcamentos"); }
    expect(text).toContain("User-agent: OAI-SearchBot");
  });
});
