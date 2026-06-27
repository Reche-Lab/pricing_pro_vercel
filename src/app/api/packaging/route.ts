import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { createPackagingBox, listPackagingBoxes } from "@/repositories/packaging";

const packagingSchema = z.object({
  name: z.string().trim().min(2),
  heightCm: z.number().positive(),
  widthCm: z.number().positive(),
  lengthCm: z.number().positive(),
  weightKg: z.number().min(0),
  capacities: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        capacity: z.number().int().min(0)
      })
    )
    .default([])
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const boxes = await listPackagingBoxes(session.userId, session.tenantId);
  return NextResponse.json({ ok: true, boxes });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = packagingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createPackagingBox(session.userId, session.tenantId, parsed.data);
  return NextResponse.json({ ok: true, result }, { status: 201 });
}
