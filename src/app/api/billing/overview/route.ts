import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getBillingOverview } from "@/repositories/billing";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const billing = await getBillingOverview(session.userId, session.tenantId);
  return NextResponse.json({ ok: true, billing });
}
