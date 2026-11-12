// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
vi.mock("@/lib/auth/session-token", () => ({ sessionCookieName: () => "session", verifySessionToken: vi.fn(async () => null) }));
beforeEach(() => { vi.stubEnv("COMMERCE_ENABLED", "true"); vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", '{"groundshop.com.br":"ground-shop","www.groundshop.com.br":"ground-shop"}'); });
afterEach(() => vi.unstubAllEnvs());
const request = (host: string, path: string, headers: Record<string, string> = {}) => new NextRequest(`https://${host}${path}`, { headers: { host, ...headers } });
describe("custom storefront host middleware", () => {
  it("rewrites the public root without changing the customer's address bar", async () => {
    const response = await middleware(request("groundshop.com.br", "/catalogo?categoria=Bottons"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://groundshop.com.br/loja/ground-shop/catalogo?categoria=Bottons");
  });
  it("keeps a single buyer-session origin for www and the old platform path", async () => {
    const alias = await middleware(request("www.groundshop.com.br", "/produto/id?source=menu"));
    expect(alias.status).toBe(308);
    expect(alias.headers.get("location")).toBe("https://groundshop.com.br/produto/id?source=menu");
    const platform = await middleware(request("panel.test", "/loja/ground-shop/carrinho"));
    expect(platform.headers.get("location")).toBe("https://groundshop.com.br/carrinho");
    const proxy = await middleware(new NextRequest("http://proxy.internal:3004/catalogo?categoria=Bottons", { headers: { host: "www.groundshop.com.br" } }));
    expect(proxy.headers.get("location")).toBe("https://groundshop.com.br/catalogo?categoria=Bottons");
  });
  it("never exposes admin or another tenant API through the storefront host", async () => {
    for (const path of ["/api/commerce/admin", "/api/store/other/cart", "/commerce/ground-shop/preview"]) expect((await middleware(request("groundshop.com.br", path))).status).toBe(404);
    expect((await middleware(request("groundshop.com.br", "/api/store/ground-shop/cart"))).headers.get("x-middleware-next")).toBe("1");
  });
  it("serves the studio bitmap on a custom domain instead of rewriting it as a store page", async () => {
    const response = await middleware(request("groundshop.com.br", "/studio/paper-v1.webp"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
  it("does not accept an invented tenant context header on the platform", async () => {
    const response = await middleware(request("panel.test", "/", { "x-commerce-custom-slug": "ground-shop" }));
    expect(response.headers.get("x-middleware-request-x-commerce-custom-slug")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
