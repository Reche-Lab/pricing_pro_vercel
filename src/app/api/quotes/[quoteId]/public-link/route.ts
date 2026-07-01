import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { getServerEnv } from "@/lib/env/server";
import { createPublicQuoteLink } from "@/repositories/quotes";

const publicLinkSchema = z.object({
  validDays: z.number().int().min(1).max(90).optional()
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;

  const { quoteId } = await context.params;
  const quoteIdParsed = z.string().uuid().safeParse(quoteId);
  if (!quoteIdParsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid quote id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = publicLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await createPublicQuoteLink(
      session.userId,
      session.tenantId,
      quoteId,
      parsed.data.validDays ?? 15
    );
    const url = `${getServerEnv().APP_URL.replace(/\/$/, "")}/q/${result.token}`;
    return NextResponse.json({ ok: true, url, expiresAt: result.expiresAt });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to create public quote link." },
      { status: 409 }
    );
  }
}
