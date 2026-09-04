import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { requireWritableBilling } from "@/lib/billing/guard";
import { saveArtworkProductionProfile } from "@/repositories/artwork-production";

const schema = z.object({
  pageWidthMm: z.number().min(100).max(1000),
  pageHeightMm: z.number().min(100).max(1000),
  marginMm: z.number().min(0).max(50),
  sideMarginMm: z.number().min(0).max(50),
  bottomMarginMm: z.number().min(10).max(80),
  bleedMm: z.number().min(0).max(20),
  safeMarginMm: z.number().min(0).max(20),
  gapMm: z.number().min(3).max(30),
  dpi: z.number().int().min(150).max(1200),
  layoutMode: z.enum(["auto", "grid", "hex"]),
  drawCutLines: z.boolean()
}).superRefine((profile, context) => {
  if (profile.marginMm + profile.bottomMarginMm >= profile.pageHeightMm) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["bottomMarginMm"], message: "As margens verticais precisam deixar área útil na folha." });
  }
  if (profile.sideMarginMm * 2 >= profile.pageWidthMm) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sideMarginMm"], message: "As margens laterais precisam deixar área útil na folha." });
  }
});

export async function PUT(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  const billingBlock = await requireWritableBilling(session.userId, session.tenantId);
  if (billingBlock) return billingBlock;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Revise as medidas do perfil de produção." }, { status: 400 });
  const profile = await saveArtworkProductionProfile(session.userId, session.tenantId, parsed.data);
  return NextResponse.json({ ok: true, profile });
}
