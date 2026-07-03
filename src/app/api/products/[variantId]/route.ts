import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { updateProductVariant } from "@/repositories/products";

const updateProductSchema = z.object({
  productName: z.string().trim().min(2),
  category: z.string().trim().min(2),
  description: z.string().trim().optional().nullable(),
  productActive: z.boolean(),
  variantName: z.string().trim().min(1),
  sku: z.string().trim().optional().nullable(),
  externalOlistProductId: z.string().trim().optional().nullable(),
  unitCost: z.number().min(0),
  unitWeightKg: z.number().min(0),
  heightCm: z.number().min(0).optional().nullable(),
  widthCm: z.number().min(0).optional().nullable(),
  lengthCm: z.number().min(0).optional().nullable(),
  variantActive: z.boolean()
});

export async function PATCH(request: Request, context: { params: Promise<{ variantId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const { variantId } = await context.params;
  const params = z.string().uuid().safeParse(variantId);
  if (!params.success) {
    return NextResponse.json({ ok: false, error: "Invalid variant id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await updateProductVariant(session.userId, session.tenantId, variantId, parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update product." },
      { status: 409 }
    );
  }
}
