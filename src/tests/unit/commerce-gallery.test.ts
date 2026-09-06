import { describe, expect, it } from "vitest";
import { publicationSchema } from "@/domain/commerce/schemas";
import {
  commerceVideoInputSchema,
  getProductMedia,
} from "@/domain/commerce/product-media";
const image = (index: number) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  kind: "image",
  url: `https://example.test/${index}.webp`,
});
const video = (index: number) => ({
  ...image(index),
  kind: "video",
  url: `https://example.test/${index}.mp4`,
});
const product = {
  variantId: image(1).id,
  name: "Botton",
  description: "",
  category: "Bottons",
  imageUrl: image(1).url,
  active: true,
  minQuantity: 1,
  maxQuantity: 100,
  maxArtworks: 1,
  personalized: false,
  pricingRule: "total",
};
describe("commerce product media limits", () => {
  it("accepts ten images or eight images and two videos, counting the cover", () => {
    expect(
      publicationSchema.safeParse({
        ...product,
        media: Array.from({ length: 10 }, (_, i) => image(i + 1)),
      }).success,
    ).toBe(true);
    expect(
      publicationSchema.safeParse({
        ...product,
        media: [
          ...Array.from({ length: 8 }, (_, i) => image(i + 1)),
          video(9),
          video(10),
        ],
      }).success,
    ).toBe(true);
    expect(
      publicationSchema.safeParse({
        ...product,
        media: Array.from({ length: 11 }, (_, i) => image(i + 1)),
      }).success,
    ).toBe(false);
    expect(
      publicationSchema.safeParse({
        ...product,
        media: [image(1), video(2), video(3), video(4)],
      }).success,
    ).toBe(false);
  });
  it("requires an image cover and rejects duplicates and unsafe media", () => {
    for (const media of [
      [video(1)],
      [image(1), image(1)],
      [{ ...image(1), url: "javascript:alert(1)" }],
      [image(2)],
    ]) {
      expect(publicationSchema.safeParse({ ...product, media }).success).toBe(
        false,
      );
    }
  });
  it("preserves old products with one image and caps videos at 20 MB", () => {
    expect(publicationSchema.safeParse(product).success).toBe(true);
    expect(
      getProductMedia(undefined, product.imageUrl, product.variantId),
    ).toEqual([image(1)]);
    const input = {
      fileName: "demo.mp4",
      mimeType: "video/mp4",
      fileSize: 20 * 1024 * 1024,
    };
    expect(commerceVideoInputSchema.safeParse(input).success).toBe(true);
    expect(
      commerceVideoInputSchema.safeParse({
        ...input,
        fileSize: input.fileSize + 1,
      }).success,
    ).toBe(false);
    expect(
      commerceVideoInputSchema.safeParse({
        ...input,
        mimeType: "image/svg+xml",
      }).success,
    ).toBe(false);
    expect(
      commerceVideoInputSchema.safeParse({
        ...input,
        tenantId: product.variantId,
      }).success,
    ).toBe(false);
  });
});
