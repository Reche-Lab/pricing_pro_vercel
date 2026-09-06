// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/commerce/[slug]/preview/artworks/route";
import { requireCommercePreview } from "@/services/commerce/preview";
import { commerceProducts } from "@/repositories/commerce";
import { CommerceError } from "@/domain/commerce/commerce";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";

vi.mock("@/services/commerce/preview", () => ({
  requireCommercePreview: vi.fn(),
}));
vi.mock("@/repositories/commerce", () => ({ commerceProducts: vi.fn() }));
vi.mock("@/lib/security/public-rate-limit", () => ({
  enforcePublicRateLimit: vi.fn(),
}));
const id = "8c82b392-f45e-4c87-82d1-c0c3eea5da14";
const crop = { scale: 0.75, offsetX: 0.2, offsetY: -0.1, rotationDegrees: 15 };
beforeEach(() => {
  vi.resetAllMocks();
  process.env.APP_URL = "http://localhost:3000";
  vi.mocked(requireCommercePreview).mockResolvedValue({
    tenant_id: "tenant-a",
  } as never);
  vi.mocked(commerceProducts).mockResolvedValue([
    {
      id,
      personalized: true,
      geometry: {
        shape: "circle",
        widthMm: 35,
        heightMm: 35,
        cornerRadiusMm: 0,
      },
      margins: { bleedMm: 2, safeMarginMm: 2 },
    },
  ] as never);
  vi.mocked(enforcePublicRateLimit).mockResolvedValue(null);
});
async function call(
  extra: Record<string, unknown> = {},
  origin = "http://localhost:3000",
) {
  const bytes = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#147d63" },
  })
    .png()
    .toBuffer();
  return POST(
    new Request("http://localhost:3000/api/commerce/test/preview/artworks", {
      method: "POST",
      headers: { origin },
      body: JSON.stringify({
        productId: id,
        dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
        mimeType: "image/png",
        fileName: "arte.png",
        fileSize: bytes.length,
        ...extra,
      }),
    }),
    { params: Promise.resolve({ slug: "test" }) },
  );
}
describe("private preview artwork processing", () => {
  it("requires admin authentication before reading product data", async () => {
    vi.mocked(requireCommercePreview).mockRejectedValue(
      new CommerceError("Entre na conta", 401),
    );
    expect((await call()).status).toBe(401);
    expect(commerceProducts).not.toHaveBeenCalled();
  });
  it("rejects foreign origins and products outside the active tenant", async () => {
    expect((await call({}, "https://foreign.test")).status).toBe(403);
    expect(requireCommercePreview).not.toHaveBeenCalled();
    expect(
      (await call({ productId: "00000000-0000-4000-8000-000000000000" }))
        .status,
    ).toBe(409);
    expect(commerceProducts).toHaveBeenCalledWith("tenant-a");
  });
  it("normalizes a temporary upload and prepares it with the product geometry", async () => {
    const upload = await call();
    expect(upload.status).toBe(200);
    expect(upload.headers.get("cache-control")).toBe("no-store");
    const source = await upload.json();
    expect(source.mimeType).toBe("image/webp");
    const prepared = await call({ ...source, crop });
    expect(prepared.status).toBe(200);
    const result = await prepared.json();
    const metadata = await sharp(
      Buffer.from(result.dataUrl.split(",")[1], "base64"),
    ).metadata();
    expect(metadata.width).toBeGreaterThan(350);
    expect(metadata.width).toBe(metadata.height);
  });
  it("rejects corrupt images, oversized input and invalid crop controls", async () => {
    expect(
      (await call({ dataUrl: "data:image/png;base64,YmFk", fileSize: 3 }))
        .status,
    ).toBe(422);
    expect((await call({ fileSize: 4000000 })).status).toBe(400);
    expect((await call({ crop: { ...crop, scale: 10 } })).status).toBe(400);
  });
  it("honors the preview processing rate limit before reading images", async () => {
    vi.mocked(enforcePublicRateLimit).mockResolvedValue(
      NextResponse.json(
        { ok: false, error: "Limite atingido" },
        { status: 429 },
      ),
    );
    expect((await call()).status).toBe(429);
    expect(commerceProducts).not.toHaveBeenCalled();
  });
});
