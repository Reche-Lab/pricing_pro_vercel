import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { listProductVariants } from "@/repositories/products";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const variants = await listProductVariants(session.userId, session.tenantId);
  return NextResponse.json({ ok: true, variants });
}
