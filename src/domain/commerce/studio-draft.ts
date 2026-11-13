import { z } from "zod";
import type { StudioArtwork } from "./studio-artwork";
export const STUDIO_DRAFT_TTL = 24 * 60 * 60 * 1000;
const color = z.string().regex(/^#[a-f\d]{6}$/i);
const asset = z.object({
  dataUrl: z.string().max(4200000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
  fileName: z.string().max(180), width: z.number().int().positive().max(10000), height: z.number().int().positive().max(10000),
  library: z.object({ id: z.string().uuid(), version: z.string().max(120) }).optional(),
}).refine(value => value.width * value.height <= 25_000_000);
const artwork = z.object({
  text: z.string().max(140), mode: z.enum(["centered", "circle", "spiral"]), font: z.enum(["modern", "bold", "editorial", "handwritten"]),
  textColor: color, colors: z.array(color).min(1).max(4), gradient: z.enum(["solid", "horizontal", "diagonal", "radial", "spiral"]),
  showText: z.boolean().optional(), backgroundType: z.enum(["color", "image"]).optional(),
  backgroundImage: z.object({ asset, scale: z.number().finite().min(.0001).max(3), offsetX: z.number().finite().min(-1).max(1), offsetY: z.number().finite().min(-1).max(1), fillColor: color }).optional(),
});
const schema = z.object({ version: z.literal(1), updatedAt: z.number().finite().nonnegative(), productId: z.string().min(1).max(128), artwork });
export type StudioDraft = { version: 1; updatedAt: number; productId: string; artwork: StudioArtwork };
export function parseStudioDraft(value: unknown, now = Date.now()): StudioDraft | null {
  const result = schema.safeParse(value);
  return result.success && result.data.updatedAt <= now + 300000 && now - result.data.updatedAt < STUDIO_DRAFT_TTL ? result.data : null;
}
