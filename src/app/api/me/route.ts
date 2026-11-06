import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getSessionProfile } from "@/repositories/users";
import { getCommerceOrderAccess } from "@/services/commerce/order-access";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const profile = await getSessionProfile(session.userId, session.tenantId);
  if (!profile) return NextResponse.json({ ok: false }, { status: 401 });

  return NextResponse.json({ ok: true, profile, commerce: await getCommerceOrderAccess(profile) }, { headers: { "cache-control": "private, no-store" } });
}
