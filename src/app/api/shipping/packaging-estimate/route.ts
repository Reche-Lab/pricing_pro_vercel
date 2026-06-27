import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { estimatePackaging } from "@/repositories/packaging";

const estimateSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50000)
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
