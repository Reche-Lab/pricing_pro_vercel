import { z } from "zod";

const point = z.object({ x: z.number().finite().min(0).max(20_000), y: z.number().finite().min(0).max(20_000) });
const selection = z.object({ x: z.number().finite().min(0).max(20_000), y: z.number().finite().min(0).max(20_000), width: z.number().finite().min(0).max(20_000), height: z.number().finite().min(0).max(20_000) }).nullable().optional();
const stroke = z.object({
  kind: z.literal("stroke"), tool: z.enum(["brush", "eraser"]), color: z.string().regex(/^#[0-9a-f]{6}$/i),
  width: z.number().finite().min(1).max(1_000), points: z.array(point).min(1).max(20_000), selection
});
const fill = z.object({
  kind: z.literal("fill"), point, color: z.string().regex(/^#[0-9a-f]{6}$/i),
  tolerance: z.number().int().min(0).max(255), selection
});
const shape = z.object({
  kind: z.literal("shape"), shapeType: z.enum(["circle", "square", "rectangle", "triangle"]),
  bounds: z.object({ x: z.number().finite().min(0).max(20_000), y: z.number().finite().min(0).max(20_000), width: z.number().finite().min(0).max(20_000), height: z.number().finite().min(0).max(20_000) }),
  color: z.string().regex(/^#[0-9a-f]{6}$/i), width: z.number().finite().min(1).max(1_000), selection
});

export const retouchDraftSchema = z.object({
  version: z.literal(1),
  operations: z.array(z.discriminatedUnion("kind", [stroke, fill, shape])).max(300),
  adjustments: z.object({
    brightness: z.number().int().min(50).max(150), contrast: z.number().int().min(50).max(150),
    saturation: z.number().int().min(0).max(200), sharpness: z.number().int().min(0).max(100)
  }),
  composition: z.object({
    foregroundScalePercent: z.number().int().min(25).max(250),
    backgroundEnabled: z.boolean(),
    backgroundExpansionMm: z.number().finite().min(0).max(50),
    backgroundScalePercent: z.number().int().min(50).max(250),
    backgroundBlurPx: z.number().int().min(0).max(80)
  }).optional()
});

export const retouchDraftBodySchema = z.object({ draft: retouchDraftSchema });
