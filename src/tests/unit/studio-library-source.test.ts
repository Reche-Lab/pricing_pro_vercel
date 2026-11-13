// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { studioLibrarySelection } from "@/services/commerce/library";
import { librarySource } from "@/repositories/commerce-library";
import { commerceProducts } from "@/repositories/commerce";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query }) }));
vi.mock("@/repositories/commerce", () => ({ commerceProducts: vi.fn(), commerceTransaction: vi.fn(), geometryHash: vi.fn() }));
vi.mock("@/repositories/commerce-library", () => ({ librarySource: vi.fn(), auditLibrary: vi.fn(), lockLibrary: vi.fn(), saveLibraryLinks: vi.fn() }));
vi.mock("@/services/storage/artwork-storage", () => ({ downloadArtworkObject: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]) })), uploadArtworkObject: vi.fn(), deleteArtworkObject: vi.fn(), encodeDataUrl: (mime: string, bytes: Uint8Array) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}` }));
const art = { editable: true, file_name: "arte.webp", storage_path: "private/source", title: "Campanha", version: "v1", content_hash: createHash("sha256").update(new Uint8Array([1, 2, 3])).digest("hex") };
beforeEach(() => { query.mockResolvedValue({ rows: [{ initial_crop: null }] }); vi.mocked(librarySource).mockResolvedValue(art as never); vi.mocked(commerceProducts).mockResolvedValue([{ id: "product", personalized: true, geometry: { widthMm: 35 } }] as never); });
describe("editable studio library source", () => {
  it("uses the public tenant visibility and product binding without making a buyer copy", async () => {
    expect(await studioLibrarySelection("tenant", "art", "product")).toMatchObject({ title: "Campanha", version: "v1", dataUrl: "data:image/webp;base64,AQID" });
    expect(librarySource).toHaveBeenLastCalledWith("tenant", "art", "public");
    await studioLibrarySelection("tenant", "art", "product", true);
    expect(librarySource).toHaveBeenLastCalledWith("tenant", "art", "preview");
  });
  it("rejects originals that the tenant has not released for editing", async () => {
    vi.mocked(librarySource).mockResolvedValue({ ...art, editable: false } as never);
    await expect(studioLibrarySelection("tenant", "art", "product")).rejects.toMatchObject({ status: 403 });
  });
  it("rejects an artwork not linked to the selected product", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(studioLibrarySelection("tenant", "art", "product")).rejects.toThrow(/produto escolhido/);
  });
});
