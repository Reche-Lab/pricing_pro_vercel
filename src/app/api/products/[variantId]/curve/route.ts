import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { createVariantPricingCurveVersion, updateVariantAnchors } from "@/repositories/products";

const pointSchema = z.object({
  quantity: z.number().int().min(1).max(50000),
  unitPrice: z.number().nonnegative()
});

const curveSchema = z.object({
  mode: z.enum(["interpolated", "step"]).default("interpolated"),
  points: z.array(pointSchema).min(1).max(50),
  platformRuleId: z.string().uuid().nullable().optional()
});

const anchorsSchema = z.object({
  1: z.number().nonnegative(),
  10: z.number().nonnegative(),
  50: z.number().nonnegative(),
  100: z.number().nonnegative(),
  500: z.number().nonnegative(),
  1000: z.number().nonnegative()
});

export async function PATCH(request: Request, context: { params: Promise<{ variantId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { variantId } = await context.params;
  const params = z.string().uuid().safeParse(variantId);
  if (!params.success) {
    return NextResponse.json({ ok: false, error: "Invalid variant id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseCurvePayload(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await updateVariantAnchors(session.userId, session.tenantId, variantId, parsed.data);
  return NextResponse.json({ ok: true, result });
}

export async function POST(request: Request, context: { params: Promise<{ variantId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { variantId } = await context.params;
  const params = z.string().uuid().safeParse(variantId);
  if (!params.success) {
    return NextResponse.json({ ok: false, error: "Invalid variant id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseCurvePayload(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createVariantPricingCurveVersion(session.userId, session.tenantId, variantId, parsed.data);
  return NextResponse.json({ ok: true, result }, { status: 201 });
}

function parseCurvePayload(body: unknown) {
  const payload = body as { curve?: unknown; anchors?: unknown; platformRuleId?: string | null };
  if (payload?.curve) return curveSchema.safeParse(payload.curve);

  const parsedAnchors = anchorsSchema.safeParse(payload?.anchors);
  if (!parsedAnchors.success) return parsedAnchors;

  return curveSchema.safeParse({
    mode: "interpolated",
    platformRuleId: payload.platformRuleId,
    points: Object.entries(parsedAnchors.data).map(([quantity, unitPrice]) => ({
      quantity: Number(quantity),
      unitPrice
    }))
  });
}
