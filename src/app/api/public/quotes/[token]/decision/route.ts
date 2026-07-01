import { NextResponse } from "next/server";
import { z } from "zod";
import { decidePublicQuote } from "@/repositories/quotes";

const decisionSchema = z.object({
  decision: z.enum(["accepted", "rejected"]),
  note: z.string().trim().max(1000).optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || token.length < 20) {
    return NextResponse.json({ ok: false, error: "Link inválido." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await decidePublicQuote(token, parsed.data.decision, parsed.data.note);
  if (!result) {
    return NextResponse.json(
      { ok: false, error: "Este orçamento não está mais disponível para decisão." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, result });
}
