import { z } from "zod";
import { safeCommerceMediaUrl } from "./product-media";

export const mockupSideSchema = z.object({
  baseUrl: safeCommerceMediaUrl,
  maskUrl: safeCommerceMediaUrl,
  overlayUrl: safeCommerceMediaUrl,
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().min(0.05).max(1), height: z.number().min(0.05).max(1),
}).strict().refine(v => v.x + v.width <= 1.001 && v.y + v.height <= 1.001, "A região da arte precisa ficar dentro da imagem do modelo.");
export const commerceArtworkOptionsSchema = z.object({
  allowTeamPreparation: z.boolean(),
  discountFixedCents: z.number().int().min(0).max(100000),
  maxDiscountPercent: z.number().min(0).max(30),
  mockup: z.object({
    front: mockupSideSchema, back: mockupSideSchema,
    frontFaceRatio: z.number().min(0.5).max(0.99),
    backOpeningRatio: z.number().min(0.2).max(0.95),
    frontWrapFraction: z.number().min(0).max(1),
  }).strict().optional(),
}).strict();
export type CommerceArtworkOptions = z.infer<typeof commerceArtworkOptionsSchema>;
export type ProductMockup = NonNullable<CommerceArtworkOptions["mockup"]>;
export const defaultArtworkOptions = (): CommerceArtworkOptions => ({ allowTeamPreparation: false, discountFixedCents: 0, maxDiscountPercent: 10 });
export const defaultMockup = (): ProductMockup => ({
  front: { baseUrl: "", maskUrl: "", overlayUrl: "", x: 0, y: 0, width: 1, height: 1 },
  back: { baseUrl: "", maskUrl: "", overlayUrl: "", x: 0, y: 0, width: 1, height: 1 },
  frontFaceRatio: 0.9, backOpeningRatio: 0.75, frontWrapFraction: 0.35,
});

/** Coordinates in the prepared print file. Back folds continue the outer artwork band, mirrored horizontally. */
export function mockupSourcePoint(x: number, y: number, side: "front" | "back", visibleRatio: number, model: ProductMockup) {
  const radius = Math.hypot(x, y);
  if (radius > 1 || side === "back" && radius < model.backOpeningRatio) return null;
  const visible = Math.max(0.01, Math.min(1, visibleRatio));
  const join = visible + (1 - visible) * model.frontWrapFraction;
  const sourceRadius = side === "front"
    ? radius <= model.frontFaceRatio ? radius / model.frontFaceRatio * visible
      : visible + (radius - model.frontFaceRatio) / (1 - model.frontFaceRatio) * (join - visible)
    : join + (1 - radius) / (1 - model.backOpeningRatio) * (1 - join);
  if (!radius) return { x: 0.5, y: 0.5 };
  return { x: 0.5 + (side === "back" ? -x : x) / radius * sourceRadius / 2, y: 0.5 + y / radius * sourceRadius / 2 };
}
