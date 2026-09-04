import { NextResponse } from "next/server";
import { z } from "zod";
import { financeError, requireFinancePermission } from "@/app/api/finance/_shared";
import { requireWritableBilling } from "@/lib/billing/guard";
import { deactivateFinancialIndicator, updateFinancialIndicator } from "@/repositories/finance";
import { indicatorInputSchema } from "../_schema";

const paramsSchema = z.object({ indicatorId: z.string().uuid() });

export async function PATCH(request: Request, context: { params: Promise<{ indicatorId: string }> }) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const [params, body] = await Promise.all([context.params, request.json().catch(() => null)]);
  const parsedParams = paramsSchema.safeParse(params);
  const parsedBody = indicatorInputSchema.safeParse(body);
  if (!parsedParams.success || !parsedBody.success) {
    return NextResponse.json({ ok: false, error: "Dados do indicador inválidos." }, { status: 400 });
  }
  try {
    const indicator = await updateFinancialIndicator(
      auth.session.userId,
      auth.session.tenantId,
      parsedParams.data.indicatorId,
      parsedBody.data
    );
    return NextResponse.json({ ok: true, indicator });
  } catch (error) {
    return financeError(error, "indicators.update");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ indicatorId: string }> }) {
  const auth = await requireFinancePermission("finance:manage");
  if ("response" in auth) return auth.response;
  const blocked = await requireWritableBilling(auth.session.userId, auth.session.tenantId);
  if (blocked) return blocked;
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Indicador inválido." }, { status: 400 });
  try {
    const result = await deactivateFinancialIndicator(auth.session.userId, auth.session.tenantId, parsed.data.indicatorId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return financeError(error, "indicators.delete");
  }
}
