// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/store/[slug]/artworks/[artworkId]/route";
import { CommerceError } from "@/domain/commerce/commerce";
import { calculateCommerceCart } from "@/repositories/commerce";

const fixture = vi.hoisted(() => ({
  query: vi.fn(), art: { id: "df970f73-c33b-43ca-8779-f63b7bdbef3b", product_id: "8c82b392-f45e-4c87-82d1-c0c3eea5da14", prepared_path: "prepared.png", approved_at: null as Date | null, crop: { geometryHash: "current", coverage: undefined as { warning: boolean; uncoveredPercent: number } | undefined } },
}));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query: fixture.query }) }));
vi.mock("@/repositories/commerce", () => ({
  commerceProducts: vi.fn(async () => [{ id: fixture.art.product_id, geometry: { shape: "circle" }, margins: {} }]),
  geometryHash: () => "current",
  calculateCommerceCart: vi.fn(),
  commerceTransaction: async (work: (client: unknown) => Promise<unknown>) => work({ query: fixture.query }),
}));
vi.mock("@/services/commerce/http", async original => ({
  ...await original<typeof import("@/services/commerce/http")>(),
  buyerContext: vi.fn(async () => ({ store: { tenant_id: "tenant-a" }, session: { id: "buyer-session" } })),
}));
vi.mock("@/lib/security/public-rate-limit", () => ({ enforcePublicRateLimit: vi.fn(async () => null) }));
vi.mock("@/services/storage/artwork-storage", () => ({ downloadArtworkObject: vi.fn(), uploadArtworkObject: vi.fn(), deleteArtworkObject: vi.fn() }));
const line = { id: "c4e541eb-f70b-4e9b-b298-bd24928880bc", productId: fixture.art.product_id, artworkId: fixture.art.id, artworkName: "Arte 1", quantity: 10 };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "http://localhost:3000";
  fixture.art.approved_at = null; fixture.art.crop.geometryHash = "current";
  fixture.art.crop.coverage = undefined;
  fixture.query.mockImplementation(async (sql: string) => {
    if (sql.includes("from commerce_sessions")) return { rows: [{ id: "buyer-session", cart: [line] }] };
    if (sql.startsWith("select * from commerce_artworks")) return { rows: [fixture.art] };
    if (sql.includes("from commerce_orders")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("update commerce_artworks set approved_at")) fixture.art.approved_at = new Date();
    return { rows: [], rowCount: 1 };
  });
  vi.mocked(calculateCommerceCart).mockResolvedValue({ totalCents: 4500, baseSubtotalCents: 5000, artworkDiscountCents: 500, items: [{ id: line.id, artworkDiscountCents: 500 }] } as never);
});
async function call(extra = {}) {
  return POST(new Request("http://localhost:3000/api/store/shop/artworks/" + fixture.art.id, {
    method: "POST", headers: { origin: "http://localhost:3000" }, body: JSON.stringify({ action: "approve", ...extra }),
  }), { params: Promise.resolve({ slug: "shop", artworkId: fixture.art.id }) });
}
describe("authoritative artwork approval reward", () => {
  it("requires and records confirmation for the specific crop when print coverage is incomplete", async () => {
    fixture.art.crop.coverage = { warning: true, uncoveredPercent: 17 };
    expect((await call()).status).toBe(409);
    expect(fixture.art.approved_at).toBeNull();
    expect((await call({ acceptUncovered: true })).status).toBe(200);
    const update = fixture.query.mock.calls.find(([sql]) => String(sql).startsWith("update commerce_artworks set approved_at"));
    expect(JSON.parse(update![1][2])).toMatchObject({ acceptedUncovered: true, coverage: { uncoveredPercent: 17 }, crop: { geometryHash: "current" } });
  });
  it("returns the capped server price for the selected artwork", async () => {
    const response = await call({ lines: [line] });
    expect(await response.json()).toMatchObject({ ok: true, newlyApproved: true, artworkDiscountCents: 500 });
    expect(calculateCommerceCart).toHaveBeenCalledWith("tenant-a", "buyer-session", [line], expect.any(Array), expect.any(Object));
  });
  it("makes retries idempotent and falls back to the persisted buyer cart", async () => {
    expect(await (await call()).json()).toMatchObject({ newlyApproved: true });
    expect(await (await call()).json()).toMatchObject({ newlyApproved: false, artworkDiscountCents: 500 });
    expect(fixture.query.mock.calls.filter(([sql]) => String(sql).startsWith("update commerce_artworks set approved_at"))).toHaveLength(1);
  });
  it("preserves approval without claiming a benefit when the cart needs revision", async () => {
    vi.mocked(calculateCommerceCart).mockRejectedValue(new CommerceError("Produto indisponível", 409));
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ newlyApproved: true, artworkDiscountCents: null });
    expect(fixture.art.approved_at).not.toBeNull();
  });
  it("rejects stale geometry and client supplied reward amounts", async () => {
    fixture.art.crop.geometryHash = "outdated";
    expect((await call()).status).toBe(409);
    fixture.art.crop.geometryHash = "current";
    expect((await call({ artworkDiscountCents: 99999 })).status).toBe(400);
    expect(fixture.art.approved_at).toBeNull();
  });
});
