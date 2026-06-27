import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { createPlatformRule, listPlatformRules } from "@/repositories/platforms";

const platformSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .regex(/^[a-z0-9_]+$/),
  name: z.string().trim().min(2),
  commissionRate: z.number().min(0).max(0.99),
  fixedFee: z.number().min(0),
  sellerShippingCost: z.number().min(0),
  sellerShippingThreshold: z.number().min(0),
  sortOrder: z.number().int().min(1).max(10000).optional()
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const platforms = await listPlatformRules(session.userId, session.tenantId);
  return NextResponse.json({ ok: true, platforms });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = platformSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createPlatformRule(session.userId, session.tenantId, parsed.data);
  return NextResponse.json({ ok: true, result }, { status: 201 });
}
