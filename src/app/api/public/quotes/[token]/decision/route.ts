import { NextResponse } from "next/server";
import { z } from "zod";
import { decidePublicQuote } from "@/repositories/quotes";
import { enforcePublicRateLimit } from "@/lib/security/public-rate-limit";

const decisionSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  note: z.string().trim().max(1000).optional().nullable(),
  acceptArtworkAsIs: z.boolean().optional().default(false),
  otpCode: z.string().trim().regex(/^\d{6}$/).optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length < 20) {
    return NextResponse.json({ ok: false, error: "Link inválido." }, { status: 400 });
  }
  const limited = await enforcePublicRateLimit(request, token, { action: "quote-decision", limit: 10, windowSeconds: 3600 });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await decidePublicQuote(token, parsed.data.decision, parsed.data.note, {
      acceptArtworkAsIs: parsed.data.acceptArtworkAsIs,
      otpCode: parsed.data.otpCode
    });
    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Este orçamento não está mais disponível para decisão." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Não foi possível registrar a decisão." }, { status: 409 });
  }
}
