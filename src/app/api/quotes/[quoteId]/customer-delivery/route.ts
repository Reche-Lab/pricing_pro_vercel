import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { isValidCpfOrCnpj } from "@/lib/validation/documents";
import { updateQuoteCustomerDelivery } from "@/repositories/quotes";

const schema = z.object({
  name: z.string().trim().min(2).max(180),
  document: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(32).optional().nullable(),
  postalCode: z.string().trim().max(16).optional().nullable(),
  addressLine: z.string().trim().max(180).optional().nullable(),
  addressNumber: z.string().trim().max(40).optional().nullable(),
  addressComplement: z.string().trim().max(120).optional().nullable(),
  district: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(2).optional().nullable(),
  attentionTo: z.string().trim().max(120).optional().nullable()
}).superRefine((value, context) => {
  if (value.document && !isValidCpfOrCnpj(value.document)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["document"],
      message: "Informe um CPF ou CNPJ válido."
    });
  }

  const phoneDigits = value.phone?.replace(/\D/g, "") ?? "";
  if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 13)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["phone"],
      message: "Informe um telefone com DDD válido."
    });
  }
});

export async function PATCH(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  const { quoteId } = await context.params;
  if (!z.string().uuid().safeParse(quoteId).success) {
    return NextResponse.json({ ok: false, error: "Orçamento inválido." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Revise os dados do cliente.", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const result = await updateQuoteCustomerDelivery(
      session.userId,
      session.tenantId,
      quoteId,
      parsed.data
    );
    if (!result) return NextResponse.json({ ok: false, error: "Orçamento não encontrado." }, { status: 404 });

    console.info("Quote customer delivery updated.", {
      quoteId,
      customerId: result.customer.id,
      customerExternalOlistId: result.customer.external_olist_id,
      hasPhone: Boolean(result.customer.phone),
      hasAttentionTo: Boolean(result.deliveryAttentionTo)
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Quote customer delivery update failed.", {
      quoteId,
      message: error instanceof Error ? error.message : "Erro desconhecido",
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Não foi possível atualizar os dados." },
      { status: 409 }
    );
  }
}
