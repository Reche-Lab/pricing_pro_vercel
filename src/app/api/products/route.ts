import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { createProductWithVariant, listProductVariants } from "@/repositories/products";

const pointSchema = z.object({
  quantity: z.number().int().min(1).max(50000),
  unitPrice: z.number().nonnegative()
});

const curveSchema = z.object({
  mode: z.enum(["interpolated", "step"]).default("interpolated"),
  points: z.array(pointSchema).min(1).max(50)
});

const anchorsSchema = z.object({
  1: z.number().nonnegative(),
  10: z.number().nonnegative(),
  50: z.number().nonnegative(),
  100: z.number().nonnegative(),
  500: z.number().nonnegative(),
  1000: z.number().nonnegative()
});

const createProductSchema = z.object({
  productName: z.string().trim().min(2),
  category: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  variantName: z.string().trim().min(1),
  sku: z.string().trim().optional().nullable(),
  externalOlistProductId: z.string().trim().optional().nullable(),
  unitCost: z.number().min(0),
  unitWeightKg: z.number().min(0),
  heightCm: z.number().min(0).optional().nullable(),
  widthCm: z.number().min(0).optional().nullable(),
  lengthCm: z.number().min(0).optional().nullable(),
  printDiameterMm: z.number().min(10).max(300).optional().nullable(),
  printShape: z.enum(["circle", "square", "rectangle", "triangle", "hexagon"]).default("circle"),
  printWidthMm: z.number().min(5).max(1000),
  printHeightMm: z.number().min(5).max(1000),
  printCornerStyle: z.enum(["sharp", "rounded"]).default("sharp"),
  printCornerRadiusMm: z.number().min(0).max(500).default(0),
  printShapeRotationDegrees: z.number().min(-180).max(180).default(0),
  allowPrintRotation: z.boolean().default(true),
  curve: curveSchema.optional(),
  anchors: anchorsSchema.optional()
}).transform((input, context) => {
  if (input.curve) return { ...input, curve: input.curve };
  if (input.anchors) {
    return {
      ...input,
      curve: {
        mode: "interpolated" as const,
        points: Object.entries(input.anchors).map(([quantity, unitPrice]) => ({
          quantity: Number(quantity),
          unitPrice
        }))
      }
    };
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "curve or anchors is required",
    path: ["curve"]
  });
  return z.NEVER;
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const variants = await listProductVariants(session.userId, session.tenantId);
  return NextResponse.json({ ok: true, variants });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const body = await request.json().catch(() => null);
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createProductWithVariant(session.userId, session.tenantId, parsed.data);
  return NextResponse.json({ ok: true, result }, { status: 201 });
}
