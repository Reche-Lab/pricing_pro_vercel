import { NextResponse } from "next/server";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { previewFinancialIndicator } from "@/repositories/finance";
import { indicatorPreviewSchema } from "../_schema";

export async function POST(request: Request) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const parsed = indicatorPreviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const preview = await previewFinancialIndicator(
      auth.session.userId,
      auth.session.tenantId,
      parsed.data.competence,
      parsed.data.unit,
      parsed.data.formula,
      parsed.data.indicatorId
    );
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    return financeError(error, "indicators.preview");
  }
}
