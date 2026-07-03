import { NextResponse } from "next/server";
import { z } from "zod";
import { updateCustomerExternalOlistId } from "@/repositories/customers";
import { loadQuoteOlistContext } from "../../_shared";

const useCustomerSchema = z.object({
  externalId: z.string().trim().min(1)
});

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await context.params;
  const loaded = await loadQuoteOlistContext(quoteId, "olist");
  if ("error" in loaded && loaded.error) return NextResponse.json(loaded.error.body, { status: loaded.error.status });

  const body = await request.json().catch(() => ({}));
  const parsed = useCustomerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });

  const customerId = loaded.detail.quote.customer_id;
  if (!customerId) return NextResponse.json({ ok: false, error: "Quote has no customer." }, { status: 409 });

  await updateCustomerExternalOlistId(
    loaded.session.userId,
    loaded.session.tenantId,
    customerId,
    parsed.data.externalId
  );

  return NextResponse.json({
    ok: true,
    externalId: parsed.data.externalId,
    message: `Cliente Olist vinculado ao orçamento. ID: ${parsed.data.externalId}.`
  });
}
