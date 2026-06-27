import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { updateVariantAnchors } from "@/repositories/products";

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
  const parsed = anchorsSchema.safeParse(body?.anchors);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await updateVariantAnchors(session.userId, session.tenantId, variantId, parsed.data);
  return NextResponse.json({ ok: true, result });
}
