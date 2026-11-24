// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "@/app/api/commerce/admin/blog/route";
import { requireCommerceAdmin } from "@/services/commerce/http";
import { blogAdminStore, readBlogAdmin, saveBlog } from "@/repositories/commerce-blog";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";
import { articleContent } from "@/domain/commerce/blog-settings";
import { groundShopArticles } from "@/content/ground-shop-blog";
import { CommerceError } from "@/domain/commerce/commerce";

vi.mock("@/services/commerce/http", async original => ({ ...await original<typeof import("@/services/commerce/http")>(), requireCommerceAdmin: vi.fn() }));
vi.mock("@/repositories/commerce-blog", () => ({ blogAdminStore: vi.fn(), readBlogAdmin: vi.fn(), saveBlog: vi.fn(), blogMigrationMissing: (error: { code?: string }) => error?.code === "42P01" }));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn() }));
const input = { action: "article", slug: groundShopArticles[0].slug, revision: 0, status: "published", content: articleContent(groundShopArticles[0]) };
const request = (body: unknown = input, origin = "https://panel.test") => new Request("https://panel.test/api/commerce/admin/blog", { method: "PUT", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_URL", "https://panel.test");
  vi.mocked(requireCommerceAdmin).mockResolvedValue({ session: { tenantId: "session-tenant", userId: "session-user" } } as never);
  vi.mocked(blogAdminStore).mockResolvedValue({ slug: "ground-shop", name: "Ground Shop" });
  vi.mocked(enforcePublicRateLimit).mockResolvedValue(null);
  vi.mocked(saveBlog).mockResolvedValue({ posts: [] } as never); vi.mocked(readBlogAdmin).mockResolvedValue({ posts: [] } as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("blog admin API boundaries", () => {
  it("requires an administrator and checks origin and throttling before saving", async () => {
    vi.mocked(requireCommerceAdmin).mockRejectedValueOnce(new CommerceError("Entre na conta administrativa.", 401));
    expect((await GET()).status).toBe(401);
    expect((await PUT(request(input, "https://attacker.test"))).status).toBe(403);
    vi.mocked(enforcePublicRateLimit).mockResolvedValueOnce(Response.json({ error: "Aguarde" }, { status: 429 }) as never);
    expect((await PUT(request())).status).toBe(429); expect(saveBlog).not.toHaveBeenCalled();
  });
  it("uses only the authenticated tenant and rejects untrusted ownership fields", async () => {
    expect((await PUT(request({ ...input, tenantId: "other" }))).status).toBe(400);
    expect(saveBlog).not.toHaveBeenCalled();
    const response = await PUT(request()); expect(response.status).toBe(200);
    expect(saveBlog).toHaveBeenCalledWith("session-user", "session-tenant", "ground-shop", "Ground Shop", input);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).message).toContain("publicado");
  });
  it("returns an actionable migration error and logs a traceable operation", async () => {
    vi.mocked(saveBlog).mockRejectedValueOnce({ code: "42P01" });
    const response = await PUT(request()), body = await response.json();
    expect(response.status).toBe(503); expect(body.error).toContain("0086_commerce_blog.sql"); expect(body.debugId).toBeTruthy();
    expect(console.error).toHaveBeenCalledWith("Commerce operation failed.", expect.objectContaining({ operation: "admin.blog.save" }));
  });
});
