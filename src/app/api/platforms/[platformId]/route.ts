import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { updatePlatformRule } from "@/repositories/platforms";

const platformSchema = z.object({
  name: z.string().trim().min(2),
  commissionRate: z.number().min(0).max(0.99),
  fixedFee: z.number().min(0),
  sellerShippingCost: z.number().min(0),
  sellerShippingThreshold: z.number().min(0),
  defaultPricingMode: z.enum(["interpolated", "step"]).optional(),
  sortOrder: z.number().int().min(1).max(10000).optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ platformId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const { platformId } = await context.params;
  const params = z.string().uuid().safeParse(platformId);
  if (!params.success) {
    return NextResponse.json({ ok: false, error: "Invalid platform id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = platformSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await updatePlatformRule(session.userId, session.tenantId, platformId, parsed.data);
  return NextResponse.json({ ok: true, result });
}
