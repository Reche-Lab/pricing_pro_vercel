import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { createProductWithVariant, listProductVariants } from "@/repositories/products";

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
  unitCost: z.number().min(0),
  unitWeightKg: z.number().min(0),
  anchors: anchorsSchema
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

  const body = await request.json().catch(() => null);
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createProductWithVariant(session.userId, session.tenantId, parsed.data);
  return NextResponse.json({ ok: true, result }, { status: 201 });
}
