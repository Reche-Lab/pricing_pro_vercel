import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { isSuperAdmin, listSuperadminUsers } from "@/repositories/superadmin";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await isSuperAdmin(session.userId))) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const users = await listSuperadminUsers();
  return NextResponse.json({ ok: true, users });
}
