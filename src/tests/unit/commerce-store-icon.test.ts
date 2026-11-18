// @vitest-environment node
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ownedStoreIconSource, renderStoreIcon } from "@/services/commerce/store-icon";
import { getCommerceStore } from "@/repositories/commerce";
import { GET as getIcon } from "@/app/loja/[slug]/icon.png/route";
import { GET as getManifest } from "@/app/loja/[slug]/site.webmanifest/route";
import { storeWebManifest } from "@/services/commerce/store-branding";
import { discoverySettings } from "../fixtures/commerce-discovery";

vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ SUPABASE_URL: "https://storage.test", SUPABASE_SERVICE_ROLE_KEY: "must-never-be-sent" }) }));
vi.mock("@/repositories/commerce", async importOriginal => ({ ...await importOriginal<typeof import("@/repositories/commerce")>(), getCommerceStore: vi.fn() }));
const tenantId = "00000000-0000-4000-8000-000000000001";
const otherTenant = "00000000-0000-4000-8000-000000000002";
const iconUrl = `https://storage.test/storage/v1/object/public/commerce-media/${tenantId}/icon/${otherTenant}.webp`;
const settings = { ...discoverySettings, faviconUrl: iconUrl };
const context = { params: Promise.resolve({ slug: "shop" }) };
const request = new Request("https://panel.test/loja/shop/icon.png");
beforeEach(() => { vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", "{}"); vi.stubEnv("APP_URL", "https://panel.test"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("tenant favicon processing", () => {
  it("only fetches uploaded imagery owned by this tenant, without credentials or redirects", async () => {
    const bytes = await sharp({ create: { width: 300, height: 150, channels: 4, background: "red" } }).webp().toBuffer();
    const fetch = vi.fn(async () => new Response(new Uint8Array(bytes)));
    vi.stubGlobal("fetch", fetch);
    const result = await renderStoreIcon(tenantId, settings);
    expect(await sharp(result!).metadata()).toMatchObject({ format: "png", width: 512, height: 512, hasAlpha: true });
    expect(fetch).toHaveBeenCalledWith(iconUrl, { redirect: "error", signal: expect.any(AbortSignal) });
    expect(JSON.stringify(fetch.mock.calls)).not.toContain("must-never-be-sent");
  });
  it.each([
    "http://127.0.0.1/private", "https://evil.test/a.webp",
    iconUrl.replace(tenantId, otherTenant), iconUrl.replace("/icon/", "/product/"),
    `${iconUrl}?redirect=internal`, `${iconUrl}#part`, iconUrl.replace("https://", "https://user:pass@"),
    iconUrl.replace(".webp", ".svg"),
  ])("rejects untrusted or cross-tenant source %s", async value => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(ownedStoreIconSource(tenantId, { ...discoverySettings, faviconUrl: value }, "https://storage.test")).toBeNull();
    expect(await renderStoreIcon(tenantId, { ...discoverySettings, faviconUrl: value })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("can reuse an owned full logo when no separate icon exists", () => {
    const logo = iconUrl.replace("/icon/", "/logo/");
    expect(ownedStoreIconSource(tenantId, { ...discoverySettings, logoUrl: logo }, "https://storage.test")).toBe(logo);
  });
  it("bounds response size even when the remote server omits Content-Length", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1))));
    await expect(renderStoreIcon(tenantId, settings)).rejects.toThrow("size limit");
  });
  it("rejects non-images even from the trusted bucket", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<svg/>")));
    await expect(renderStoreIcon(tenantId, settings)).rejects.toThrow();
  });
});

describe("public store brand routes", () => {
  it("serves PNG and a tenant-scoped manifest, not the platform identity", async () => {
    vi.mocked(getCommerceStore).mockResolvedValue({ tenant_id: tenantId, settings } as never);
    const bytes = await sharp({ create: { width: 100, height: 100, channels: 3, background: "red" } }).webp().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes))));
    const icon = await getIcon(request, context);
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toBe("image/png");
    expect(icon.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await sharp(Buffer.from(await icon.arrayBuffer())).metadata()).toMatchObject({ width: 512, height: 512 });
    const manifest = await getManifest(request, context);
    expect(manifest.headers.get("content-type")).toContain("manifest+json");
    expect(await manifest.json()).toMatchObject({ name: "Ground Shop", start_url: "/loja/shop/", scope: "/loja/shop/", icons: [{ src: expect.stringContaining("/loja/shop/icon.png?v=") }] });
    expect(getCommerceStore).toHaveBeenCalledWith("shop", true);
  });
  it("does not expose a draft/disabled/nonexistent store or fall back to the platform icon", async () => {
    vi.mocked(getCommerceStore).mockResolvedValue(null);
    for (const handler of [getIcon, getManifest]) {
      const response = await handler(request, context);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("returns a noncached failure rather than caching a broken icon after storage/DB errors", async () => {
    vi.mocked(getCommerceStore).mockRejectedValue(new Error("Private database details"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const handler of [getIcon, getManifest]) {
      const response = await handler(request, context);
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-debug-id")).toBeTruthy();
      expect(await response.text()).not.toContain("Private");
    }
  });
  it("uses root URLs for a verified custom domain", () => {
    vi.stubEnv("COMMERCE_CUSTOM_DOMAINS", '{"shop.test":"shop"}');
    expect(storeWebManifest("shop", settings)).toMatchObject({ id: "/", start_url: "/", scope: "/", icons: [{ src: expect.stringContaining("https://shop.test/icon.png?v=") }] });
  });
});
