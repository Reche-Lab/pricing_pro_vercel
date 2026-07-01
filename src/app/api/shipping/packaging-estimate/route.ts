import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { estimatePackaging } from "@/repositories/packaging";

const estimateSchema = z.object({
  productVariantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(50000).optional(),
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        quantity: z.number().int().min(1).max(50000)
      })
    )
    .min(1)
    .max(50)
    .optional(),
  selectedBoxId: z.string().uuid().optional().nullable(),
  splitByProduct: z.boolean().optional(),
  clearanceCm: z.number().min(0).max(5).optional()
}).refine((input) => Boolean(input.items?.length || (input.productVariantId && input.quantity)), {
  message: "Provide productVariantId and quantity or items.",
  path: ["items"]
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = estimateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const estimate = await estimatePackaging(session.userId, session.tenantId, parsed.data);
  if (!estimate) {
    return NextResponse.json({ ok: false, error: "No compatible packaging found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, estimate });
}
