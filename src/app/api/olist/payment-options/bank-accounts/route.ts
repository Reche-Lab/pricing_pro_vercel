import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  deactivateOlistBankAccount,
  listOlistPaymentOptions,
  upsertOlistBankAccount
} from "@/repositories/olist-payment-options";

const bankAccountSchema = z.object({
  externalId: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(160)
});

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const options = await listOlistPaymentOptions(session.userId, session.tenantId);
  return NextResponse.json({
    ok: true,
    accounts: options.filter((option) => option.kind === "payment_method" && option.group_name === "Banco")
  });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = bankAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Informe o nome e o ID Olist da conta bancária." }, { status: 400 });
  }
  await upsertOlistBankAccount(session.userId, session.tenantId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const parsed = z.object({ externalId: z.string().trim().min(1).max(80) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Conta bancária inválida." }, { status: 400 });
  await deactivateOlistBankAccount(session.userId, session.tenantId, parsed.data.externalId);
  return NextResponse.json({ ok: true });
}
