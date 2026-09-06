// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { requireCommercePreview } from "@/services/commerce/preview";
import { requireCommerceAdmin } from "@/services/commerce/http";
import { getPool } from "@/lib/db/client";
import { CommerceError } from "@/domain/commerce/commerce";
vi.mock("@/services/commerce/http", () => ({ requireCommerceAdmin: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
afterEach(() => vi.resetAllMocks());
describe("private store preview", () => {
  it("requires administrative authentication before reading a draft", async () => {
    vi.mocked(requireCommerceAdmin).mockRejectedValue(
      new CommerceError("Entre na conta.", 401),
    );
    await expect(requireCommercePreview("ground-shop")).rejects.toMatchObject({
      status: 401,
    });
    expect(getPool).not.toHaveBeenCalled();
  });
  it("scopes the URL to the active tenant and allows a saved disabled draft", async () => {
    vi.mocked(requireCommerceAdmin).mockResolvedValue({
      session: { tenantId: "tenant-a" },
    } as never);
    const draft = {
      tenant_id: "tenant-a",
      slug: "ground-shop",
      status: "draft",
      enabled: false,
    };
    const query = vi.fn().mockResolvedValue({ rows: [draft] });
    vi.mocked(getPool).mockReturnValue({ query } as never);
    expect(await requireCommercePreview("ground-shop")).toEqual(draft);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("s.tenant_id=$1"),
      ["tenant-a", "ground-shop"],
    );
    query.mockResolvedValue({ rows: [] });
    await expect(requireCommercePreview("other-store")).rejects.toMatchObject({
      status: 404,
    });
    expect(query).toHaveBeenLastCalledWith(expect.any(String), [
      "tenant-a",
      "other-store",
    ]);
  });
});
