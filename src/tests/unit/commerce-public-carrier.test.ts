// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db/client";
import { estimatePackagingWithClient } from "@/repositories/packaging";
import { carrierDelivery } from "@/services/commerce/preview-delivery";
import { publicCarrierDelivery } from "@/services/commerce/carrier-delivery";
vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/repositories/packaging", () => ({ estimatePackagingWithClient: vi.fn() }));
vi.mock("@/services/commerce/preview-delivery", () => ({ carrierDelivery: vi.fn() }));
const query = vi.fn();
const connection = { id: "connection", provider: "melhor_envio", status: "active", settings: {}, credentials_encrypted: "private", postal_code: "01001000" };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getPool).mockReturnValue({ query } as never); query.mockResolvedValue({ rows: [connection] }); });
describe("public carrier tenant boundary", () => {
  it("requires a published opted-in store and scopes both integration and packaging to its tenant", async () => {
    vi.mocked(carrierDelivery).mockImplementation(async (_connection, _origin, _destination, _lines, _products, packagingFor) => { await packagingFor([{ productVariantId: "variant", quantity: 5 }]); return { options: [] }; });
    expect(await publicCarrierDelivery("tenant-a", "04026090", [], [], 1800)).toEqual({ options: [] });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("s.tenant_id=$1 and s.enabled and s.status='published'"), ["tenant-a"]);
    expect(query.mock.calls[0][0]).toContain("s.settings->>'carrierEnabled'='true'");
    expect(estimatePackagingWithClient).toHaveBeenCalledWith(expect.anything(), "tenant-a", { items: [{ productVariantId: "variant", quantity: 5 }] });
    expect(vi.mocked(carrierDelivery).mock.calls[0][6]).toBe(1800);
  });
  it("does not use a disabled/unpublished/unconfigured tenant as an arbitrary integration proxy", async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(publicCarrierDelivery("tenant-a", "04026090", [], [])).rejects.toMatchObject({ status: 409 });
    expect(carrierDelivery).not.toHaveBeenCalled();
  });
  it("does not expose sandbox rates or arbitrary configured HTTP endpoints to public buyers", async () => {
    for (const settings of [{ environment: "sandbox" }, { api_base_url: "http://127.0.0.1:1234/api/v2" }]) {
      query.mockResolvedValue({ rows: [{ ...connection, settings }] });
      await expect(publicCarrierDelivery("tenant-a", "04026090", [], [])).rejects.toMatchObject({ status: 409 });
    }
    expect(carrierDelivery).not.toHaveBeenCalled();
  });
});
